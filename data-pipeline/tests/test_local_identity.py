"""A city nobody ingested yet gets its slug, names and time zone from a geocoder hit (D-079)."""

from __future__ import annotations

import pytest

from wayfarer_pipeline.local.identity import (
    ZoneCoords,
    new_city,
    parse_iso6709,
    parse_zone_coords,
    pick_timezone,
    unique_city_slug,
)
from wayfarer_pipeline.local.places import Place

SINTRA = Place(
    name_en="Sintra",
    name_pt=None,
    country_code="PT",
    lat=38.8,
    lng=-9.38,
    bbox=(38.7, -9.5, 38.9, -9.2),
    wikidata_id="Q131526",
)


def test_slug_is_kebab_ascii_from_the_english_name() -> None:
    assert unique_city_slug("São Paulo", "BR", set()) == "sao-paulo"
    assert unique_city_slug("Kraków", "PL", set()) == "krakow"


def test_a_taken_slug_gets_the_country_then_a_number() -> None:
    assert unique_city_slug("Valencia", "VE", {"valencia"}) == "valencia-ve"
    assert unique_city_slug("Valencia", "VE", {"valencia", "valencia-ve"}) == "valencia-ve-2"


def test_a_name_without_letters_cannot_make_a_slug() -> None:
    with pytest.raises(ValueError, match="'!!!'"):
        unique_city_slug("!!!", "PT", set())


def test_iso6709_coordinates() -> None:
    assert parse_iso6709("+3843+00908") == pytest.approx((38.7167, 9.1333), abs=1e-3)
    assert parse_iso6709("-3352+15113") == pytest.approx((-33.8667, 151.2167), abs=1e-3)
    assert parse_iso6709("+404251-0740023") == pytest.approx((40.7142, -74.0064), abs=1e-3)


def test_zone_tab_lines_become_coordinates() -> None:
    text = "# comment\nPT\t+3843-00908\tEurope/Lisbon\nPT\t+3744-02540\tAtlantic/Azores\tAzores\n"
    coords = parse_zone_coords(text)
    assert set(coords) == {"Europe/Lisbon", "Atlantic/Azores"}


def test_timezone_is_the_countrys_only_zone() -> None:
    assert pick_timezone(["Europe/Andorra"], 42.5, 1.5, {}) == "Europe/Andorra"


def test_timezone_of_a_big_country_is_the_nearest_zone() -> None:
    coords: ZoneCoords = {"Europe/Lisbon": (38.7, -9.1), "Atlantic/Azores": (37.7, -25.7)}
    zones = list(coords)
    assert pick_timezone(zones, 37.74, -25.67, coords) == "Atlantic/Azores"
    assert pick_timezone(zones, 38.8, -9.4, coords) == "Europe/Lisbon"


def test_timezone_is_unknown_when_zones_cannot_be_told_apart() -> None:
    assert pick_timezone(["Europe/Lisbon", "Atlantic/Azores"], 38.8, -9.4, {}) is None
    assert pick_timezone([], 38.8, -9.4, {}) is None


def test_new_city_uses_wikidata_names_and_falls_back_to_english() -> None:
    city = new_city(SINTRA, ("Sintra", None), {"lisbon"}, "Europe/Lisbon")
    assert (city.slug, city.name.en, city.name.pt) == ("sintra", "Sintra", "Sintra")
    assert city.wikidata_id == "Q131526" and city.timezone == "Europe/Lisbon"
    assert city.is_active and city.bbox == (38.7, -9.5, 38.9, -9.2)


def test_new_city_centre_outside_the_bbox_moves_to_the_bbox_middle() -> None:
    off = Place(**{**SINTRA.__dict__, "lat": 40.0})
    city = new_city(off, ("Sintra", "Sintra"), set(), None)
    assert city.center == pytest.approx((38.8, -9.35))


def test_new_city_refuses_a_place_without_wikidata() -> None:
    nameless = Place(**{**SINTRA.__dict__, "wikidata_id": None})
    with pytest.raises(ValueError, match="Sintra"):
        new_city(nameless, ("Sintra", None), set(), None)
