"""The HTTP contract of the on-demand city service, through a real server on a free port."""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from local_fakes import (
    LISBON_ROW,
    FakeDatabase,
    FakeGeocoder,
    FakeIngester,
    FakeNames,
    make_builder,
)

from wayfarer_pipeline.local.jobs import JobBoard
from wayfarer_pipeline.local.server import make_server
from wayfarer_pipeline.local.service import CityService


class Api:
    """A tiny JSON client for the server under test."""

    def __init__(self, port: int) -> None:
        self.base = f"http://127.0.0.1:{port}"

    def call(self, method: str, path: str, body: Any = None) -> tuple[int, Any, dict[str, str]]:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.base + path, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, _json(response.read()), dict(response.headers)
        except urllib.error.HTTPError as err:
            return err.code, _json(err.read()), dict(err.headers)

    def wait_done(self, job_id: str) -> dict[str, Any]:
        for _ in range(200):
            _, job, _ = self.call("GET", f"/jobs/{job_id}")
            if job["status"] != "building":
                return job
            time.sleep(0.02)
        raise AssertionError(f"job {job_id} still building")


def _json(raw: bytes) -> Any:
    return json.loads(raw) if raw else None


class Rig:
    """The service with its fakes, served on an ephemeral port for one test."""

    def __init__(self, tmp_path: Path, geocoder: FakeGeocoder, **fakes: Any) -> None:
        self.builder, self.db, self.ingester, _ = make_builder(tmp_path, **fakes)
        self.geocoder = geocoder
        service = CityService(geocoder, self.db, self.builder, JobBoard())
        self.server = make_server("127.0.0.1", 0, service)
        self.api = Api(self.server.server_address[1])
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


@pytest.fixture
def rig(tmp_path: Path) -> Iterator[Rig]:
    made = Rig(tmp_path, FakeGeocoder())
    yield made
    made.server.shutdown()
    made.server.server_close()


def test_health(rig: Rig) -> None:
    assert rig.api.call("GET", "/health")[:2] == (200, {"ok": True})


def test_a_new_city_is_built_in_the_background_then_ready(rig: Rig) -> None:
    status, body, _ = rig.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})
    assert status == 202
    assert body["status"] == "building" and body["stage"] == "locating"
    job = rig.api.wait_done(body["job_id"])
    assert job == {
        "status": "ready", "stage": "saving", "city_slug": "sintra", "message": None,
        "attractions": 4, "routes": 1,
    }  # fmt: skip
    assert len(rig.db.applied) == 1


def test_a_city_already_in_the_database_is_ready_at_once(tmp_path: Path) -> None:
    covered = FakeGeocoder(place=None)
    covered.place = type(FakeGeocoder().place)(
        **{**FakeGeocoder().place.__dict__, "wikidata_id": "Q597", "name_en": "Lisbon"}
    )
    made = Rig(tmp_path, covered)
    try:
        status, body, _ = made.api.call("POST", "/places/resolve", {"lat": 38.72, "lng": -9.14})
        assert (status, body) == (200, {"status": "ready", "city_slug": "lisbon"})
        assert made.ingester.cities == []
    finally:
        made.server.shutdown()


def test_two_requests_for_the_same_city_share_one_job(tmp_path: Path) -> None:
    ingester = FakeIngester()
    ingester.gate = threading.Event()
    made = Rig(tmp_path, FakeGeocoder(), ingester=ingester)
    try:
        first = made.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})[1]
        second = made.api.call("POST", "/places/resolve", {"lat": 38.81, "lng": -9.39})[1]
        assert first["job_id"] == second["job_id"]
        ingester.gate.set()
        made.api.wait_done(first["job_id"])
        assert len(ingester.cities) == 1
    finally:
        made.server.shutdown()


def test_the_job_reports_its_stage_while_it_builds(tmp_path: Path) -> None:
    ingester = FakeIngester()
    ingester.gate = threading.Event()
    made = Rig(tmp_path, FakeGeocoder(), ingester=ingester)
    try:
        job_id = made.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})[1]["job_id"]
        for _ in range(100):
            job = made.api.call("GET", f"/jobs/{job_id}")[1]
            if job["stage"] == "attractions":
                break
            time.sleep(0.02)
        assert (job["status"], job["stage"], job["city_slug"]) == (
            "building",
            "attractions",
            "sintra",
        )
        ingester.gate.set()
    finally:
        made.server.shutdown()


def test_a_failed_build_says_why(tmp_path: Path) -> None:
    ingester = FakeIngester()
    ingester.error = RuntimeError("Overpass answered HTTP 504")
    made = Rig(tmp_path, FakeGeocoder(), ingester=ingester)
    try:
        job_id = made.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})[1]["job_id"]
        job = made.api.wait_done(job_id)
        assert job["status"] == "failed" and "Overpass answered HTTP 504" in job["message"]
        assert made.db.applied == []
    finally:
        made.server.shutdown()


def test_a_failed_city_can_be_asked_for_again(tmp_path: Path) -> None:
    ingester = FakeIngester()
    ingester.error = RuntimeError("boom")
    made = Rig(tmp_path, FakeGeocoder(), ingester=ingester)
    try:
        first = made.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})[1]["job_id"]
        made.api.wait_done(first)
        ingester.error = None
        second = made.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})[1]["job_id"]
        assert second != first and made.api.wait_done(second)["status"] == "ready"
    finally:
        made.server.shutdown()


def test_a_position_with_no_city_is_422(tmp_path: Path) -> None:
    made = Rig(tmp_path, FakeGeocoder(place=None))
    try:
        status, body, _ = made.api.call("POST", "/places/resolve", {"lat": 0.0, "lng": -30.0})
        assert status == 422 and body["status"] == "failed" and "city" in body["message"]
    finally:
        made.server.shutdown()


def test_a_city_without_a_wikidata_item_is_422(tmp_path: Path) -> None:
    place = FakeGeocoder().place
    nameless = type(place)(**{**place.__dict__, "wikidata_id": None})
    made = Rig(tmp_path, FakeGeocoder(nameless), names=FakeNames(found=None))
    try:
        status, body, _ = made.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})
        assert status == 422 and "Wikidata" in body["message"]
    finally:
        made.server.shutdown()


def test_an_offline_geocoder_falls_back_to_a_covered_citys_bbox(tmp_path: Path) -> None:
    made = Rig(tmp_path, FakeGeocoder(error=ConnectionError("offline")))
    try:
        lat, lng = 38.75, -9.15  # inside Lisbon's box
        assert made.api.call("POST", "/places/resolve", {"lat": lat, "lng": lng})[:2] == (
            200,
            {"status": "ready", "city_slug": LISBON_ROW["slug"]},
        )
        status, body, _ = made.api.call("POST", "/places/resolve", {"lat": 10.0, "lng": 10.0})
        assert status == 502 and "offline" in body["message"]
    finally:
        made.server.shutdown()


@pytest.mark.parametrize(
    ("body", "needle"),
    [
        ({"lat": 91, "lng": 0}, "91"),
        ({"lat": 0, "lng": -181.5}, "-181.5"),
        ({"lat": "north", "lng": 0}, "north"),
        ({"lng": 0}, "lat"),
        ([1, 2], "object"),
    ],
)
def test_bad_coordinates_are_400_with_the_offending_value(rig: Rig, body: Any, needle: str) -> None:
    status, answer, _ = rig.api.call("POST", "/places/resolve", body)
    assert status == 400 and needle in answer["message"]
    assert rig.geocoder.calls == 0


def test_unknown_routes_and_jobs_are_json_404s(rig: Rig) -> None:
    assert rig.api.call("GET", "/nope")[0] == 404
    status, body, _ = rig.api.call("GET", "/jobs/missing")
    assert status == 404 and "missing" in body["message"]


def test_cors_headers_and_preflight(rig: Rig) -> None:
    status, _, headers = rig.api.call("OPTIONS", "/places/resolve")
    assert status == 204
    assert headers["Access-Control-Allow-Origin"] == "*"
    assert "POST" in headers["Access-Control-Allow-Methods"]
    assert "Content-Type" in headers["Access-Control-Allow-Headers"]
    assert rig.api.call("GET", "/health")[2]["Access-Control-Allow-Origin"] == "*"


def test_a_restart_with_the_city_in_the_database_resolves_ready(tmp_path: Path) -> None:
    db = FakeDatabase()
    db.cities.append({"slug": "sintra", "wikidata_id": "Q131526", "bbox": [38.7, -9.5, 38.9, -9.2]})
    made = Rig(tmp_path, FakeGeocoder(), db=db)
    try:
        status, body, _ = made.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})
        assert (status, body) == (200, {"status": "ready", "city_slug": "sintra"})
    finally:
        made.server.shutdown()
