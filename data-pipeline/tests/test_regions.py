import pytest

from wayfarer_pipeline import regions
from wayfarer_pipeline.config import load_cities

COUNTRIES = {
    "PT": {"timezones": ["Europe/Lisbon", "Atlantic/Azores"]},
    "TR": {"timezones": ["Europe/Istanbul"]},
    "JP": {"timezones": ["Asia/Tokyo"]},
}


def test_europe_is_every_city_whose_country_has_a_european_timezone():
    config = load_cities()
    cities = [config.get("lisbon"), config.get("istanbul"), config.get("tokyo")]
    picked = regions.cities_in_region(cities, COUNTRIES, "europe")
    assert [c.slug for c in picked] == ["lisbon", "istanbul"]


def test_an_unknown_region_is_rejected_with_the_known_ones():
    with pytest.raises(ValueError, match="unknown region 'mars'; expected one of: europe"):
        regions.cities_in_region([], COUNTRIES, "mars")


def test_select_picks_one_city_a_region_or_every_city():
    config = load_cities()
    assert [c.slug for c in regions.select(config, COUNTRIES, city="porto")] == ["porto"]
    assert len(regions.select(config, COUNTRIES)) == len(config.cities)
    europe = regions.select(config, COUNTRIES, region="europe")
    assert {c.country_code for c in europe} == {"PT", "TR"}
