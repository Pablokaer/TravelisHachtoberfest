"""Groups of cities for commands run region by region (D-070: Europe first)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from .config import CitiesConfig, City

# A city is in a region when its country has a timezone with one of these IANA prefixes.
REGION_TIMEZONE_PREFIXES = {"europe": ("Europe/",)}


def cities_in_region(
    cities: Iterable[City], countries: Mapping[str, Mapping[str, Any]], region: str
) -> list[City]:
    """The cities of ``region``, in config order.

    >>> cities_in_region(config.cities, countries.load(), "europe")  # [lisbon, porto, …]
    """
    if region not in REGION_TIMEZONE_PREFIXES:
        known = ", ".join(sorted(REGION_TIMEZONE_PREFIXES))
        raise ValueError(f"unknown region {region!r}; expected one of: {known}")
    prefixes = REGION_TIMEZONE_PREFIXES[region]
    return [c for c in cities if _has_prefix(countries.get(c.country_code, {}), prefixes)]


def _has_prefix(country: Mapping[str, Any], prefixes: tuple[str, ...]) -> bool:
    return any(tz.startswith(prefixes) for tz in country.get("timezones") or [])


def select(
    config: CitiesConfig,
    countries: Mapping[str, Mapping[str, Any]],
    region: str | None = None,
    city: str | None = None,
) -> list[City]:
    """One city (``city``), one region (``region``) or, with neither, every city.

    >>> select(config, countries.load(), region="europe")
    """
    if city:
        return [config.get(city)]
    if region:
        return cities_in_region(config.cities, countries, region)
    return list(config.cities)
