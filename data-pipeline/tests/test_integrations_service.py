"""The optional integrations over HTTP (D-084): web tips, narration, semantic search, history.

Each endpoint answers 503 with the variable to set while its integration is off, so the app can
hide the feature instead of failing.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from local_fakes import FakeGeocoder, make_builder
from test_local_service import Api

from wayfarer_pipeline.integrations.errors import IntegrationError
from wayfarer_pipeline.integrations.extras import Extras, ExtrasApi
from wayfarer_pipeline.integrations.memory import history_entry
from wayfarer_pipeline.local.jobs import JobBoard
from wayfarer_pipeline.local.server import make_server
from wayfarer_pipeline.local.service import CityService


class FakeWeb:
    def __init__(self) -> None:
        self.queries: list[tuple[str, int]] = []

    def search(self, query: str, limit: int) -> list[dict[str, str]]:
        self.queries.append((query, limit))
        return [{"title": "Sintra", "link": "https://a.example", "snippet": "Palaces."}]


class FakeVoice:
    def narrate(self, text: str) -> bytes:
        if text == "boom":
            raise IntegrationError("ElevenLabs refused")
        return b"ID3-" + text.encode()


class FakeSemantic:
    def search(self, query: str, city_slug: str | None, limit: int) -> list[dict[str, Any]]:
        return [{"name_en": f"{query}|{city_slug}|{limit}"}]


class FakeHistory:
    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []

    def record(self, entry: dict[str, Any]) -> None:
        self.entries.append(entry)

    def recent(self, limit: int) -> list[dict[str, Any]]:
        return self.entries[:limit]


class ExtrasRig:
    """The service over HTTP with the given integrations behind it."""

    def __init__(self, tmp_path: Path, extras: Extras) -> None:
        builder, db, _, _ = make_builder(tmp_path)
        service = CityService(FakeGeocoder(), db, builder, JobBoard(), extras=ExtrasApi(extras))
        self.server = make_server("127.0.0.1", 0, service)
        self.api = Api(self.server.server_address[1])
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


def test_web_tips_return_the_hits_for_a_city_query(tmp_path: Path) -> None:
    web = FakeWeb()
    rig = ExtrasRig(tmp_path, Extras(web=web))
    try:
        status, body, _ = rig.api.call(
            "GET", "/places/web?q=things%20to%20do%20in%20Sintra&limit=3"
        )
        assert status == 200 and body["results"][0]["link"] == "https://a.example"
        assert web.queries == [("things to do in Sintra", 3)]
    finally:
        rig.server.shutdown()


def test_every_endpoint_is_503_naming_the_variable_while_its_integration_is_off(
    tmp_path: Path,
) -> None:
    rig = ExtrasRig(tmp_path, Extras())
    try:
        expected = {
            "/places/web?q=sintra": "SERPAPI_API_KEY",
            "/search/attractions?q=garden": "embedding",
            "/plan/history": "MONGODB_URI",
        }
        for path, hint in expected.items():
            status, body, _ = rig.api.call("GET", path)
            assert status == 503 and hint in body["message"], path
        status, body, _ = rig.api.call("POST", "/narrate", {"text": "Hello"})
        assert status == 503 and "ELEVENLABS_API_KEY" in body["message"]
    finally:
        rig.server.shutdown()


def test_narration_comes_back_as_mpeg_audio(tmp_path: Path) -> None:
    rig = ExtrasRig(tmp_path, Extras(voice=FakeVoice()))
    try:
        import urllib.request

        request = urllib.request.Request(
            rig.api.base + "/narrate", data=b'{"text": "Hello"}', method="POST"
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            assert response.headers["Content-Type"] == "audio/mpeg"
            assert response.read() == b"ID3-Hello"
    finally:
        rig.server.shutdown()


def test_a_partner_failure_is_a_502_and_a_bad_body_is_a_400(tmp_path: Path) -> None:
    rig = ExtrasRig(tmp_path, Extras(voice=FakeVoice()))
    try:
        status, body, _ = rig.api.call("POST", "/narrate", {"text": "boom"})
        assert status == 502 and "ElevenLabs refused" in body["message"]
        status, body, _ = rig.api.call("POST", "/narrate", {"words": "x"})
        assert status == 400 and "text" in body["message"]
    finally:
        rig.server.shutdown()


def test_semantic_search_passes_the_query_the_city_and_the_limit(tmp_path: Path) -> None:
    rig = ExtrasRig(tmp_path, Extras(semantic=FakeSemantic()))
    try:
        path = "/search/attractions?q=quiet%20garden&city=sintra&limit=4"
        status, body, _ = rig.api.call("GET", path)
        assert status == 200 and body["results"] == [{"name_en": "quiet garden|sintra|4"}]
        status, body, _ = rig.api.call("GET", "/search/attractions?q=garden&city=Not%20A%20Slug")
        assert status == 400 and "city" in body["message"]
    finally:
        rig.server.shutdown()


def test_history_lists_what_was_remembered(tmp_path: Path) -> None:
    history = FakeHistory()
    history.record(history_entry("en", [], ["sintra"]))
    rig = ExtrasRig(tmp_path, Extras(history=history))
    try:
        status, body, _ = rig.api.call("GET", "/plan/history?limit=5")
        assert status == 200 and body["entries"][0]["picks"] == ["sintra"]
    finally:
        rig.server.shutdown()


def test_remember_stores_the_ranked_picks_and_never_raises() -> None:
    history = FakeHistory()
    api = ExtrasApi(Extras(history=history))
    api.remember("pt", [{"id": "month", "question": "Quando?", "answer": "Maio"}], ["sintra"])
    assert history.entries[0]["picks"] == ["sintra"]
    ExtrasApi(Extras()).remember("en", [], ["x"])  # off: silently nothing
