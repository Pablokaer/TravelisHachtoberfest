"""Typing a city name: Nominatim search, filtered to places that can be a city (D-079)."""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from local_fakes import FakeGeocoder, FakeSearcher, make_builder
from test_local_service import Api

from wayfarer_pipeline.local.jobs import JobBoard
from wayfarer_pipeline.local.search import CitySearch, PlaceHit
from wayfarer_pipeline.local.server import make_server
from wayfarer_pipeline.local.service import CityService


def hit(name: str, kind: str, code: str = "pt", lat: str = "38.8", lng: str = "-9.38") -> dict:
    """A Nominatim search result whose ``addresstype`` is ``kind``."""
    return {
        "name": name,
        "display_name": f"{name}, Somewhere",
        "addresstype": kind,
        "type": "administrative",
        "category": "boundary",
        "lat": lat,
        "lon": lng,
        "address": {"country_code": code},
    }


class FakeSearchClient:
    """Answers ``/search`` from a script (one answer per call) and records the parameters."""

    def __init__(self, *answers: list[dict[str, Any]] | Exception) -> None:
        self.answers = list(answers)
        self.params: list[dict[str, Any]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        assert url.endswith("/search")
        self.params.append(kwargs["params"])
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        return 200, json.dumps(answer)


class Clock:
    """A settable time source, so cache expiry needs no sleeping."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_only_places_that_can_be_a_city_are_kept() -> None:
    kinds = ["city", "town", "village", "municipality", "suburb", "neighbourhood", "road", "shop"]
    client = FakeSearchClient([hit(f"P-{k}", k) for k in kinds])
    names = [h.name for h in CitySearch(client).search("p", 10)]
    assert names == ["P-city", "P-town", "P-village", "P-municipality"]


def test_a_hit_has_the_fields_the_app_reads() -> None:
    client = FakeSearchClient([hit("Sintra", "municipality", lat="38.80", lng="-9.38")])
    (found,) = CitySearch(client).search("sintra", 6)
    assert found == PlaceHit("Sintra", "Sintra, Somewhere", "PT", 38.8, -9.38)


def test_the_same_place_twice_is_listed_once_and_order_is_nominatims() -> None:
    answer = [
        hit("Valencia", "city", "es", "39.47", "-0.37"),
        hit("Valencia", "city", "ve", "10.16", "-68.0"),
        hit("Valencia", "city", "es", "39.4701", "-0.3699"),
    ]
    found = CitySearch(FakeSearchClient(answer)).search("valencia", 10)
    assert [h.country_code for h in found] == ["ES", "VE"]


def test_limit_cuts_the_list() -> None:
    client = FakeSearchClient([hit(f"Town{i}", "town", lat=str(i)) for i in range(8)])
    assert len(CitySearch(client).search("town", 3)) == 3


def test_cities_are_asked_for_first_then_any_place() -> None:
    client = FakeSearchClient([], [hit("Sintra", "village")])
    found = CitySearch(client).search("sintra", 6)
    assert [h.name for h in found] == ["Sintra"]
    first, second = client.params
    assert first["featuretype"] == "city" and "featuretype" not in second
    for params in (first, second):
        assert params["format"] == "jsonv2" and params["addressdetails"] == 1
        assert params["accept-language"] == "en" and params["q"] == "sintra"


def test_a_city_hit_means_no_second_request() -> None:
    client = FakeSearchClient([hit("Lisbon", "city")])
    CitySearch(client).search("lisbon", 6)
    assert len(client.params) == 1


def test_nothing_matching_is_an_empty_list() -> None:
    client = FakeSearchClient([], [hit("Rua do Sol", "road")])
    assert CitySearch(client).search("rua", 6) == []


def test_repeated_queries_are_served_from_memory_for_ten_minutes() -> None:
    client, clock = FakeSearchClient([hit("Lisbon", "city")]), Clock()
    search = CitySearch(client, clock=clock)
    search.search("Lisbon", 6)
    search.search("  lisbon ", 6)  # the same query once trimmed and lower-cased
    assert len(client.params) == 1
    clock.now += 601
    search.search("lisbon", 6)
    assert len(client.params) == 2


def test_a_failed_lookup_is_not_remembered() -> None:
    client = FakeSearchClient(ConnectionError("offline"))
    search = CitySearch(client)
    with pytest.raises(ConnectionError):
        search.search("lisbon", 6)
    client.answers = [[hit("Lisbon", "city")]]
    assert len(search.search("lisbon", 6)) == 1


def test_a_nominatim_answer_that_is_not_json_names_it() -> None:
    class Blocked:
        def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
            return 200, "<html>blocked</html>"

    with pytest.raises(ValueError, match=r"search.*blocked"):
        CitySearch(Blocked()).search("lisbon", 6)


class SearchRig:
    """The service over HTTP with a fake searcher."""

    def __init__(self, tmp_path: Path, searcher: FakeSearcher) -> None:
        builder, db, _, _ = make_builder(tmp_path)
        service = CityService(FakeGeocoder(), db, builder, JobBoard(), searcher)
        self.server = make_server("127.0.0.1", 0, service)
        self.api = Api(self.server.server_address[1])
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


SINTRA_HIT = PlaceHit("Sintra", "Sintra, Lisbon District, Portugal", "PT", 38.8, -9.38)


@pytest.fixture
def rig(tmp_path: Path) -> Iterator[tuple[SearchRig, FakeSearcher]]:
    searcher = FakeSearcher([SINTRA_HIT])
    made = SearchRig(tmp_path, searcher)
    yield made, searcher
    made.server.shutdown()
    made.server.server_close()


def test_search_endpoint_returns_the_results(rig: tuple[SearchRig, FakeSearcher]) -> None:
    made, searcher = rig
    status, body, headers = made.api.call("GET", "/places/search?q=Sin%20tra&limit=3")
    assert status == 200 and headers["Access-Control-Allow-Origin"] == "*"
    assert body == {
        "results": [
            {
                "name": "Sintra",
                "display_name": "Sintra, Lisbon District, Portugal",
                "country_code": "PT",
                "lat": 38.8,
                "lng": -9.38,
            }
        ]
    }
    assert searcher.asked == [("Sin tra", 3)]


def test_search_default_limit_is_six(rig: tuple[SearchRig, FakeSearcher]) -> None:
    made, searcher = rig
    made.api.call("GET", "/places/search?q=sintra")
    assert searcher.asked == [("sintra", 6)]


def test_no_match_is_an_empty_list(tmp_path: Path) -> None:
    made = SearchRig(tmp_path, FakeSearcher([]))
    try:
        assert made.api.call("GET", "/places/search?q=zz")[:2] == (200, {"results": []})
    finally:
        made.server.shutdown()


@pytest.mark.parametrize(
    ("query", "needle"),
    [
        ("q=a", "'a'"),
        ("q=%20%20x%20", "'x'"),
        ("", "q"),
        ("q=sintra&limit=0", "0"),
        ("q=sintra&limit=11", "11"),
        ("q=sintra&limit=many", "many"),
    ],
)
def test_bad_search_requests_are_400_naming_the_value(
    rig: tuple[SearchRig, FakeSearcher], query: str, needle: str
) -> None:
    made, searcher = rig
    status, body, _ = made.api.call("GET", f"/places/search?{query}")
    assert status == 400 and body["status"] == "failed" and needle in body["message"]
    assert searcher.asked == []


def test_a_failing_nominatim_is_502(tmp_path: Path) -> None:
    made = SearchRig(tmp_path, FakeSearcher(error=ConnectionError("offline")))
    try:
        status, body, _ = made.api.call("GET", "/places/search?q=lisbon")
        assert status == 502 and "offline" in body["message"]
    finally:
        made.server.shutdown()
