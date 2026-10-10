"""Where a position is: the city around a GPS point, from Nominatim (OpenStreetMap).

Nominatim answers with whatever boundary is nearest in its hierarchy: a parish (Sintra), a
district (Cusco), a whole prefecture (Nagasaki) or a metropolis made of wards (Tokyo). The
service wants the *municipality*: a place typed city/town/village/municipality, of municipal
rank, with a Wikidata item, that holds the point. Bigger boundaries are never taken.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace
from typing import Any, Protocol

from ..attractions.pipeline import haversine_m, normalize_name

# Zoom 10 is the "city" level; 12 is one step smaller (the walk-down when 10 gave too much).
CITY_ZOOM = 10
SMALLER_ZOOM = 12
# What a hit can be called, most specific municipality first ("municipality" is the real city
# even when the hit is one of its parishes, whose own name is a long list of districts).
ADDRESS_NAME_KEYS = ("municipality", "city", "town", "village", "county")
# What can be built as a city: not suburbs, neighbourhoods, streets, counties or provinces.
CITY_KINDS = {"city", "town", "village", "municipality"}
# Nominatim place_rank: 8 province, 12 county, 16 city/municipality, 18+ town and smaller.
MIN_MUNICIPAL_RANK = 14
SEARCH_LIMIT = 10
# A city has to be walkable and ingestible: a bigger boundary is cut to a window around its
# centre (Tokyo's metropolis spans 18°, Valparaíso's commune 8.7°) and the builder refuses
# what is still bigger than MAX_CITY_SPAN_DEG (a prefecture nobody could shrink).
MAX_CITY_SPAN_DEG = 1.0
CITY_WINDOW_DEG = 0.5
# A hinted city whose box misses the point still counts when its centre is this close.
NEAR_NAMED_METERS = 30_000.0

Box = tuple[float, float, float, float]


@dataclass(frozen=True)
class Place:
    """The city a position falls in. ``bbox`` is ``(south, west, north, east)``."""

    name_en: str
    name_pt: str | None
    country_code: str
    lat: float
    lng: float
    bbox: Box
    wikidata_id: str | None


class Geocoder(Protocol):
    def reverse(
        self, lat: float, lng: float, name: str | None = None, country_code: str | None = None
    ) -> Place | None:
        """The city around the point, or ``None`` (ocean, nothing known). ``name`` and
        ``country_code`` are what the traveller picked in the search: the answer is the city
        called that when there is one near the point."""
        ...


class NominatimClient(Protocol):
    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]: ...


def clean_name(name: str) -> str:
    """``Sintra (Santa Maria e São Miguel, …)`` → ``Sintra``: parish lists are not city names."""
    return re.sub(r"\s*\(.*\)\s*$", "", name).strip()


def same_name(a: str, b: str) -> bool:
    """Equal ignoring case, diacritics and punctuation: ``Valparaíso`` == ``valparaiso``."""
    return normalize_name(clean_name(a)) == normalize_name(clean_name(b))


def _name_of(doc: dict[str, Any]) -> str | None:
    details = doc.get("namedetails") or {}
    address = doc.get("address") or {}
    named = details.get("name:en") or details.get("name") or doc.get("name")
    named = named or next((address[k] for k in ADDRESS_NAME_KEYS if address.get(k)), None)
    return clean_name(named) if named else None


def _city_hint(doc: dict[str, Any]) -> str | None:
    address = doc.get("address") or {}
    name = next((address[k] for k in ADDRESS_NAME_KEYS if address.get(k)), None)
    return clean_name(name) if name else None


def _bbox_of(doc: dict[str, Any]) -> Box:
    south, north, west, east = (float(v) for v in doc["boundingbox"])
    return south, west, north, east


def parse_reverse(doc: dict[str, Any]) -> Place | None:
    """A ``Place`` from a Nominatim ``jsonv2`` answer; ``None`` when it names no city.

    >>> parse_reverse({"error": "Unable to geocode"}) is None
    True
    """
    name = _name_of(doc)
    code = ((doc.get("address") or {}).get("country_code") or "").upper()
    if "error" in doc or not name or len(code) != 2 or "boundingbox" not in doc:
        return None
    details = doc.get("namedetails") or {}
    return Place(
        name_en=name,
        name_pt=details.get("name:pt"),
        country_code=code,
        lat=float(doc["lat"]),
        lng=float(doc["lon"]),
        bbox=_bbox_of(doc),
        wikidata_id=(doc.get("extratags") or {}).get("wikidata"),
    )


def _contains(place: Place, lat: float, lng: float) -> bool:
    south, west, north, east = place.bbox
    return south <= lat <= north and west <= lng <= east


def _area(place: Place) -> float:
    south, west, north, east = place.bbox
    return (north - south) * (east - west)


def clip_to_city(place: Place) -> Place:
    """``place`` with its box cut to a ``CITY_WINDOW_DEG`` window around its centre when it is
    bigger than ``MAX_CITY_SPAN_DEG``; a box that fits is returned as it is."""
    south, west, north, east = place.bbox
    if max(north - south, east - west) <= MAX_CITY_SPAN_DEG:
        return place
    half = CITY_WINDOW_DEG / 2
    clipped = (
        max(south, place.lat - half),
        max(west, place.lng - half),
        min(north, place.lat + half),
        min(east, place.lng + half),
    )
    return replace(place, bbox=clipped)


def _city_place(doc: dict[str, Any], min_rank: int) -> Place | None:
    """The doc as a city place: city-like type, enough rank, a Wikidata item."""
    place = parse_reverse(doc)
    kind = doc.get("addresstype") or doc.get("type")
    if place is None or not place.wikidata_id or kind not in CITY_KINDS:
        return None
    rank = doc.get("place_rank")  # Nominatim always sends it; an answer without one is let through
    return place if rank is None or int(rank) >= min_rank else None


def largest_municipality(docs: list[dict[str, Any]], lat: float, lng: float) -> Place | None:
    """Of the municipal-level places holding the point, the biggest (a parish and a town hold
    the point of Sintra too, but the municipality is the city)."""
    places = [_city_place(d, MIN_MUNICIPAL_RANK) for d in docs]
    holding = [p for p in places if p is not None and _contains(p, lat, lng)]
    return clip_to_city(max(holding, key=_area)) if holding else None


def named_city(docs: list[dict[str, Any]], name: str, lat: float, lng: float) -> Place | None:
    """The city-like place called ``name`` that holds the point, else the nearest one within
    ``NEAR_NAMED_METERS``; ``None`` when no result carries that name."""
    places = [_city_place(d, 0) for d in docs]
    called = [p for p in places if p is not None and same_name(p.name_en, name)]
    called.sort(key=lambda p: (not _contains(p, lat, lng), haversine_m(lat, lng, p.lat, p.lng)))
    if not called:
        return None
    best = called[0]
    near = haversine_m(lat, lng, best.lat, best.lng) <= NEAR_NAMED_METERS
    return clip_to_city(best) if _contains(best, lat, lng) or near else None


class NominatimGeocoder:
    """Reverse geocoding through the pipeline's polite HTTP client (one request per second).

    The reverse hit at city zoom is only the starting point. The place is chosen among it and
    the search results for its name (or for the ``name`` the traveller picked): the one called
    that, else the biggest municipality holding the point. When none qualifies the point is
    reverse-geocoded one zoom smaller, and the first hit is the last resort.
    """

    def __init__(self, client: NominatimClient) -> None:
        self.client = client

    def reverse(
        self, lat: float, lng: float, name: str | None = None, country_code: str | None = None
    ) -> Place | None:
        doc = self._reverse(lat, lng, CITY_ZOOM)
        hit = parse_reverse(doc)
        if hit is None:
            return None
        pool = [doc, *self._search(name or _city_hint(doc), country_code or hit.country_code)]
        chosen = named_city(pool, name, lat, lng) if name else None
        chosen = chosen or largest_municipality(pool, lat, lng)
        return chosen or self._walk_down(lat, lng) or hit

    def _walk_down(self, lat: float, lng: float) -> Place | None:
        place = _city_place(self._reverse(lat, lng, SMALLER_ZOOM), MIN_MUNICIPAL_RANK)
        return clip_to_city(place) if place else None

    def _reverse(self, lat: float, lng: float, zoom: int) -> dict[str, Any]:
        return self._get("reverse", {"lat": f"{lat:.5f}", "lon": f"{lng:.5f}", "zoom": zoom})

    def _search(self, query: str | None, country_code: str) -> list[dict[str, Any]]:
        if not query:
            return []
        params = {"q": query, "countrycodes": country_code.lower(), "limit": SEARCH_LIMIT}
        return self._get("search", params)

    def _get(self, endpoint: str, params: dict[str, Any]) -> Any:
        _, text = self.client.request(
            "GET",
            f"https://nominatim.openstreetmap.org/{endpoint}",
            namespace="nominatim",
            params={
                "format": "jsonv2",
                "extratags": 1,
                "namedetails": 1,
                "addressdetails": 1,
                "accept-language": "en",
                **params,
            },
        )
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Nominatim {endpoint} answered {text[:80]!r}; expected JSON") from exc
