"""The identity of a new city: slug, names, centre and time zone, before anything is ingested."""

from __future__ import annotations

import re
from importlib import resources

from ..attractions.pipeline import haversine_m
from ..config import City, LocalizedName
from ..routes.validation import slugify
from .places import Place

ZoneCoords = dict[str, tuple[float, float]]
_ISO6709 = re.compile(r"^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$")


def unique_city_slug(name_en: str, country_code: str, taken: set[str]) -> str:
    """``Valencia`` → ``valencia``, then ``valencia-ve``, ``valencia-ve-2``… until free.

    >>> unique_city_slug("São Paulo", "BR", set())
    'sao-paulo'
    """
    base = slugify(name_en)
    if base == "route" and "route" not in name_en.lower():  # slugify's answer for no letters
        raise ValueError(f"city name {name_en!r} has no letters; expected a name with a-z")
    with_country = f"{base}-{country_code.lower()}"
    for candidate in (base, with_country):
        if candidate not in taken:
            return candidate
    number = 2
    while f"{with_country}-{number}" in taken:
        number += 1
    return f"{with_country}-{number}"


def parse_iso6709(text: str) -> tuple[float, float]:
    """``+3843+00908`` (or with seconds) → ``(lat, lng)`` in degrees."""
    m = _ISO6709.match(text)
    if not m:
        raise ValueError(f"coordinates {text!r} are not ISO 6709 like '+3843+00908'")
    lat = int(m[2]) + int(m[3]) / 60 + int(m[4] or 0) / 3600
    lng = int(m[6]) + int(m[7]) / 60 + int(m[8] or 0) / 3600
    return (-lat if m[1] == "-" else lat, -lng if m[5] == "-" else lng)


def parse_zone_coords(zone_tab: str) -> ZoneCoords:
    """``{zone: (lat, lng)}`` from the text of IANA's ``zone.tab``."""
    coords: ZoneCoords = {}
    for line in zone_tab.splitlines():
        parts = line.split("\t")
        if line.startswith("#") or len(parts) < 3:
            continue
        coords[parts[2]] = parse_iso6709(parts[1])
    return coords


def load_zone_coords() -> ZoneCoords:
    """Zone coordinates from the ``tzdata`` package; empty when it is not installed."""
    try:
        text = (resources.files("tzdata.zoneinfo") / "zone.tab").read_text(encoding="utf-8")
    except (ModuleNotFoundError, FileNotFoundError):
        return {}
    return parse_zone_coords(text)


def pick_timezone(zones: list[str], lat: float, lng: float, coords: ZoneCoords) -> str | None:
    """The country's only zone, else the nearest of its zones; ``None`` when that cannot be told
    (the app then falls back to its default zone, as for a city with no ``timezone``)."""
    if len(zones) == 1:
        return zones[0]
    known = [z for z in zones if z in coords]
    if not known:
        return None
    return min(known, key=lambda z: haversine_m(lat, lng, *coords[z]))


def _centre_inside(place: Place) -> tuple[float, float]:
    south, west, north, east = place.bbox
    if south <= place.lat <= north and west <= place.lng <= east:
        return place.lat, place.lng
    return (south + north) / 2, (west + east) / 2


def new_city(
    place: Place, names: tuple[str, str | None], taken: set[str], timezone: str | None
) -> City:
    """The ``City`` entry for a geocoded place; names are Wikidata's ``(en, pt)`` labels.

    Raises ``ValueError`` naming the place when it has no Wikidata item.
    """
    if not place.wikidata_id:
        raise ValueError(f"{place.name_en!r} has no Wikidata item; expected one to ingest it")
    en = names[0]
    return City(
        slug=unique_city_slug(en, place.country_code, taken),
        name=LocalizedName(en=en, pt=names[1] or en),
        country_code=place.country_code,
        wikidata_id=place.wikidata_id,
        center=_centre_inside(place),
        bbox=place.bbox,
        timezone=timezone,
        is_active=True,
    )
