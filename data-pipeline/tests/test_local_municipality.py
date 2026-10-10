"""Resolving a point to the city, not the prefecture around it (D-079 bug: Nagasaki)."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import pytest
from local_fakes import FakeGeocoder, FakeSearcher, ScriptedNominatim, make_builder
from test_local_service import Api

from wayfarer_pipeline.local.jobs import JobBoard
from wayfarer_pipeline.local.places import (
    CITY_WINDOW_DEG,
    MAX_CITY_SPAN_DEG,
    NominatimGeocoder,
)
from wayfarer_pipeline.local.server import make_server
from wayfarer_pipeline.local.service import CityService


def doc(
    name: str,
    kind: str,
    qid: str | None,
    box: tuple[float, float, float, float],
    rank: int = 16,
    code: str = "jp",
    **address: str,
) -> dict[str, Any]:
    """A Nominatim result; ``box`` = (south, north, west, east), centre in its middle."""
    south, north, west, east = box
    return {
        "name": name,
        "category": "boundary",
        "type": "administrative",
        "addresstype": kind,
        "place_rank": rank,
        "lat": str((south + north) / 2),
        "lon": str((west + east) / 2),
        "boundingbox": [str(v) for v in box],
        "extratags": {"wikidata": qid} if qid else {},
        "namedetails": {"name": name},
        "address": {"country_code": code, **address},
    }


NAGASAKI_BOX = (32.18, 32.97, 129.32, 130.03)
NAGASAKI = doc("Nagasaki", "city", "Q38234", NAGASAKI_BOX, city="Nagasaki")
PREFECTURE = doc("Nagasaki Prefecture", "province", "Q169376", (31.78, 34.89, 127.87, 130.48), 8)
POINT = (32.7501, 129.8781)  # the centre the search endpoint returns for Nagasaki


def geocoder(reverse_doc: dict[str, Any], search: list[dict[str, Any]], **zooms: Any):
    client = ScriptedNominatim(
        {10: reverse_doc, **{int(k[1:]): v for k, v in zooms.items()}}, search
    )
    return NominatimGeocoder(client), client


@pytest.mark.parametrize("hint", [(None, None), ("Nagasaki", "JP")])
def test_nagasaki_resolves_to_the_city_not_the_prefecture(
    hint: tuple[str | None, str | None],
) -> None:
    """Regression: the search listed the prefecture first and resolve took it ('spans 3.1°')."""
    geo, _ = geocoder(NAGASAKI, [PREFECTURE, NAGASAKI])
    place = geo.reverse(*POINT, *hint)
    assert place is not None
    assert (place.name_en, place.wikidata_id) == ("Nagasaki", "Q38234")
    assert place.bbox == (32.18, 129.32, 32.97, 130.03)


def test_the_name_hint_picks_the_city_the_traveller_chose() -> None:
    """The reverse hit at the point is Chiyoda; the traveller picked Tokyo."""
    chiyoda = doc("Chiyoda", "city", "Q214051", (35.67, 35.72, 139.73, 139.78), city="Chiyoda")
    tokyo = doc("Tokyo", "city", "Q1490", (24.0, 45.5, 122.9, 154.0), rank=8)
    geo, client = geocoder(chiyoda, [tokyo])
    place = geo.reverse(35.6768, 139.7638, "Tokyo", "JP")
    assert place is not None and (place.name_en, place.wikidata_id) == ("Tokyo", "Q1490")
    # Nothing bigger than a walkable city can be built: its window is cut around its centre.
    south, west, north, east = place.bbox
    assert max(north - south, east - west) <= CITY_WINDOW_DEG + 1e-9
    assert south <= place.lat <= north and west <= place.lng <= east
    endpoint, params = client.requests[1]
    assert endpoint == "search" and params["q"] == "Tokyo" and params["countrycodes"] == "jp"


def test_without_the_hint_a_metropolis_is_not_a_municipality() -> None:
    chiyoda = doc("Chiyoda", "city", "Q214051", (35.67, 35.72, 139.73, 139.78), city="Chiyoda")
    tokyo = doc("Tokyo", "city", "Q1490", (24.0, 45.5, 122.9, 154.0), rank=8)
    geo, _ = geocoder(chiyoda, [tokyo, chiyoda])
    place = geo.reverse(35.6768, 139.7638)
    assert place is not None and place.wikidata_id == "Q214051"


def test_the_name_hint_ignores_case_and_diacritics() -> None:
    valparaiso = doc("Valparaíso", "city", "Q33986", (-33.2, -32.9, -71.8, -71.5), code="cl")
    other = doc("Cabildo", "town", "Q3668", (-32.5, -32.3, -71.2, -71.0), code="cl", town="Cabildo")
    geo, _ = geocoder(other, [valparaiso])
    place = geo.reverse(-33.045, -71.62, "valparaiso", "CL")
    assert place is not None and place.wikidata_id == "Q33986"


def test_a_name_hint_that_matches_nothing_falls_back_to_the_default() -> None:
    geo, _ = geocoder(NAGASAKI, [PREFECTURE, NAGASAKI])
    place = geo.reverse(*POINT, "Atlantis", "JP")
    assert place is not None and place.wikidata_id == "Q38234"


def test_a_named_city_near_the_point_counts_but_a_far_one_does_not() -> None:
    cusco = doc("Cuzco", "city", "Q5582862", (-13.70, -13.33, -72.10, -71.80), code="pe")
    district = doc(
        "Distrito de Cusco", "city", "Q2723621", (-13.55, -13.45, -72.0, -71.9), code="pe"
    )
    geo, _ = geocoder(district, [cusco])
    near = geo.reverse(-13.30, -71.97, "Cuzco", "PE")  # 3 km north of the box
    assert near is not None and near.wikidata_id == "Q5582862"
    far = geo.reverse(-12.0, -71.97, "Cuzco", "PE")  # 170 km away
    assert far is not None and far.wikidata_id != "Q5582862"


def test_the_largest_municipality_around_the_point_wins_without_a_hint() -> None:
    """Sintra: the parish, the town and the municipality all hold the point."""
    parish = doc(
        "Sintra (Santa Maria e São Miguel)",
        "city",
        "Q25444964",
        (38.73, 38.83, -9.45, -9.34),
        municipality="Sintra",
        code="pt",
    )
    town = doc("Sintra", "town", "Q33716124", (38.75, 38.83, -9.42, -9.34), code="pt")
    municipality = doc("Sintra", "municipality", "Q190187", (38.73, 38.93, -9.50, -9.22), code="pt")
    geo, _ = geocoder(parish, [parish, town, municipality])
    place = geo.reverse(38.7977, -9.3869)
    assert place is not None and place.wikidata_id == "Q190187"


def test_counties_provinces_and_regions_are_never_the_city() -> None:
    county = doc("Lisbon", "county", "Q207199", (38.67, 39.31, -9.50, -8.78), 12, "pt")
    parish = doc(
        "Santa Maria Maior",
        "suburb",
        "Q1",
        (38.70, 38.72, -9.14, -9.12),
        20,
        "pt",
        municipality="Lisbon",
    )
    lisbon = doc("Lisbon", "city", "Q597", (38.69, 38.80, -9.23, -9.09), code="pt")
    geo, _ = geocoder(parish, [county, lisbon])
    place = geo.reverse(38.7139, -9.1334)
    assert place is not None and place.wikidata_id == "Q597"


def test_walks_down_to_the_municipality_when_the_hit_is_a_province() -> None:
    province = doc("Some Province", "province", "Q9", (30.0, 33.0, 128.0, 131.0), 8, "jp")
    town = doc("Kasuga", "town", "Q10", (32.0, 32.1, 129.0, 129.1), 16, "jp")
    geo, client = geocoder(province, [], z12=town)
    place = geo.reverse(32.05, 129.05)
    assert place is not None and place.wikidata_id == "Q10"
    assert [p["zoom"] for e, p in client.requests if e == "reverse"] == [10, 12]


def test_when_nothing_smaller_exists_the_reverse_hit_is_kept() -> None:
    """The area guard of the builder is then the one to refuse it."""
    province = doc("Some Province", "province", "Q9", (30.0, 33.0, 128.0, 131.0), 8, "jp")
    geo, _ = geocoder(province, [])
    place = geo.reverse(32.05, 129.05)
    assert place is not None and place.wikidata_id == "Q9"
    assert max(place.bbox[2] - place.bbox[0], place.bbox[3] - place.bbox[1]) > MAX_CITY_SPAN_DEG


def test_a_city_inside_the_guard_is_not_clipped() -> None:
    geo, _ = geocoder(NAGASAKI, [NAGASAKI])
    place = geo.reverse(*POINT)
    assert place is not None and place.bbox == (32.18, 129.32, 32.97, 130.03)


class ResolveRig:
    """The service over HTTP; its geocoder records the traveller's hint."""

    def __init__(self, tmp_path: Path) -> None:
        builder, db, _, _ = make_builder(tmp_path)
        self.geocoder = FakeGeocoder()
        service = CityService(self.geocoder, db, builder, JobBoard(), FakeSearcher())
        self.server = make_server("127.0.0.1", 0, service)
        self.api = Api(self.server.server_address[1])
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


def test_resolve_passes_the_name_and_country_hint_to_the_geocoder(tmp_path: Path) -> None:
    rig = ResolveRig(tmp_path)
    try:
        body = {"lat": 38.8, "lng": -9.38, "name": " Sintra ", "country_code": "pt"}
        status = rig.api.call("POST", "/places/resolve", body)[0]
        assert status == 202 and rig.geocoder.hints == [("Sintra", "PT")]
        rig.api.call("POST", "/places/resolve", {"lat": 38.8, "lng": -9.38})
        assert rig.geocoder.hints[-1] == (None, None)  # the hint is optional
    finally:
        rig.server.shutdown()


@pytest.mark.parametrize(
    ("extra", "needle"),
    [
        ({"name": 5}, "5"),
        ({"name": "   "}, "name"),
        ({"name": "x" * 101}, "1 to 100"),
        ({"country_code": "PRT"}, "'PRT'"),
        ({"country_code": 7}, "7"),
    ],
)
def test_a_bad_hint_is_400_naming_the_value(tmp_path: Path, extra: dict, needle: str) -> None:
    rig = ResolveRig(tmp_path)
    try:
        status, body, _ = rig.api.call("POST", "/places/resolve", {"lat": 1, "lng": 1, **extra})
        assert status == 400 and needle in body["message"]
        assert rig.geocoder.calls == 0
    finally:
        rig.server.shutdown()
