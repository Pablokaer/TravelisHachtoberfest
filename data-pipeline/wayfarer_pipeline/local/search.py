"""Finding a city by the name a traveller types: Nominatim search, kept to real cities."""

from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Any

from .places import CITY_KINDS, NominatimClient, clean_name

SEARCH_URL = "https://nominatim.openstreetmap.org/search"
CACHE_TTL_SECONDS = 600.0
CACHE_MAX_QUERIES = 200
NOMINATIM_LIMIT = 10  # Nominatim's own maximum; the filters and the dedupe then thin it out
# One tenth of a degree (~11 km) merges a municipality with its town and parishes.
DEDUPE_DECIMALS = 1


@dataclass(frozen=True)
class PlaceHit:
    """One result: the city's names, its country (ISO alpha-2, upper case) and its centre."""

    name: str
    display_name: str
    country_code: str
    lat: float
    lng: float

    def as_json(self) -> dict[str, Any]:
        return asdict(self)


def _kind(doc: dict[str, Any]) -> str | None:
    return doc.get("addresstype") or doc.get("type")


def _hit_of(doc: dict[str, Any]) -> PlaceHit | None:
    code = ((doc.get("address") or {}).get("country_code") or "").upper()
    name = clean_name(str(doc.get("name") or ""))
    if _kind(doc) not in CITY_KINDS or not name or len(code) != 2:
        return None
    return PlaceHit(
        name=name,
        display_name=str(doc.get("display_name") or name),
        country_code=code,
        lat=float(doc["lat"]),
        lng=float(doc["lon"]),
    )


def hits_from(docs: list[dict[str, Any]]) -> list[PlaceHit]:
    """The results that can be a city, in Nominatim's order, each place once."""
    seen: set[tuple[str, str, float, float]] = set()
    hits: list[PlaceHit] = []
    for doc in docs:
        hit = _hit_of(doc)
        if hit is None:
            continue
        key = (hit.name.lower(), hit.country_code, *_cell(hit))
        if key not in seen:
            seen.add(key)
            hits.append(hit)
    return hits


def _cell(hit: PlaceHit) -> tuple[float, float]:
    return round(hit.lat, DEDUPE_DECIMALS), round(hit.lng, DEDUPE_DECIMALS)


class CitySearch:
    """Nominatim city search through the pipeline's rate-limited client, remembering answers
    for ten minutes so typing does not repeat requests.

    >>> CitySearch(HttpClient()).search("Lisbon", 6)[0].name
    'Lisbon'
    """

    def __init__(
        self, client: NominatimClient, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.client, self.clock = client, clock
        self._memory: dict[str, tuple[float, list[PlaceHit]]] = {}
        self._lock = threading.Lock()

    def search(self, query: str, limit: int) -> list[PlaceHit]:
        key = " ".join(query.lower().split())
        hits = self._remembered(key)
        if hits is None:
            hits = self._lookup(query.strip())
            self._remember(key, hits)
        return hits[:limit]

    def _lookup(self, query: str) -> list[PlaceHit]:
        """Cities first (``featuretype=city``); when that finds none, any place that fits."""
        for featuretype in ("city", None):
            hits = hits_from(self._get(query, featuretype))
            if hits:
                return hits
        return []

    def _get(self, query: str, featuretype: str | None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "format": "jsonv2",
            "q": query,
            "addressdetails": 1,
            "accept-language": "en",
            "limit": NOMINATIM_LIMIT,
        }
        if featuretype:
            params["featuretype"] = featuretype
        _, text = self.client.request("GET", SEARCH_URL, namespace="nominatim", params=params)
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Nominatim search answered {text[:80]!r}; expected JSON") from exc

    def _remembered(self, key: str) -> list[PlaceHit] | None:
        with self._lock:
            entry = self._memory.get(key)
            if entry and self.clock() - entry[0] < CACHE_TTL_SECONDS:
                return entry[1]
            return None

    def _remember(self, key: str, hits: list[PlaceHit]) -> None:
        with self._lock:
            if len(self._memory) >= CACHE_MAX_QUERIES:
                self._memory.pop(next(iter(self._memory)))
            self._memory[key] = (self.clock(), hits)
