"""Named fakes for the on-demand city service tests (D-079): no network, no database, no model."""

from __future__ import annotations

import threading
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

from wayfarer_pipeline.config import City
from wayfarer_pipeline.local.build import BuildDeps, CityBuilder
from wayfarer_pipeline.local.database import Row
from wayfarer_pipeline.local.places import Place
from wayfarer_pipeline.local.store import LocalStore
from wayfarer_pipeline.routes.model import PlannerError
from wayfarer_pipeline.routes.rules import RuleBasedRoutePlanner

SINTRA = Place(
    name_en="Sintra",
    name_pt=None,
    country_code="PT",
    lat=38.8,
    lng=-9.38,
    bbox=(38.7, -9.5, 38.9, -9.2),
    wikidata_id="Q131526",
)
LISBON_ROW: Row = {"slug": "lisbon", "wikidata_id": "Q597", "bbox": [38.69, -9.23, 38.80, -9.09]}


class FakeGeocoder:
    """Answers with a fixed place (or none), or fails like an offline Nominatim."""

    def __init__(self, place: Place | None = SINTRA, error: Exception | None = None) -> None:
        self.place, self.error, self.calls = place, error, 0
        self.hints: list[tuple[str | None, str | None]] = []

    def reverse(
        self, lat: float, lng: float, name: str | None = None, country_code: str | None = None
    ) -> Place | None:
        self.calls += 1
        self.hints.append((name, country_code))
        if self.error:
            raise self.error
        return self.place


class FakeNames:
    """Wikidata labels and name lookups from dictionaries."""

    def __init__(
        self,
        labels: dict[str, tuple[str | None, str | None]] | None = None,
        found: str | None = None,
    ) -> None:
        self._labels = labels if labels is not None else {"Q131526": ("Sintra", "Sintra")}
        self.found = found

    def labels(self, qid: str) -> tuple[str | None, str | None]:
        return self._labels.get(qid, (None, None))

    def find_city(self, name: str, country_code: str) -> str | None:
        return self.found


class FakeDatabase:
    """Answers the service's selects from tables held in memory; keeps every applied script."""

    def __init__(
        self, cities: Sequence[Row] = (LISBON_ROW,), owners: dict[str, str] | None = None
    ) -> None:
        self.cities = [dict(c) for c in cities]
        self.owners = owners or {}
        self.countries = {"PT"}
        self.applied: list[str] = []
        self.fail_apply: Exception | None = None

    def rows(self, select: str) -> list[Row]:
        if "from public.cities" in select:
            return [dict(c) for c in self.cities]
        if "from public.attractions" in select:
            return [
                {"wikidata_id": q, "city_slug": s} for q, s in self.owners.items() if q in select
            ]
        if "from public.countries" in select:
            return [{"code": c} for c in self.countries if f"'{c}'" in select]
        raise AssertionError(f"unexpected select: {select}")

    def apply(self, sql: str) -> None:
        if self.fail_apply:
            raise self.fail_apply
        self.applied.append(sql)
        if "insert into public.cities" in sql:
            self.cities.append({"slug": "sintra", "wikidata_id": "Q131526", "bbox": [0, 0, 1, 1]})


def attraction(qid: str, lat: float, lng: float, name: str | None = None) -> dict[str, Any]:
    """One entry of an attractions document, with every field the seed writes."""
    return {
        "wikidata_id": qid, "osm_id": None, "name_en": name or f"Place {qid}", "name_pt": None,
        "description_en": "a place", "description_pt": None, "category": "church",
        "lat": lat, "lng": lng, "image_url": None, "image_author": None, "image_license": None,
        "image_license_url": None, "image_page_url": None, "is_unesco": False, "website": None,
        "wikipedia_en": None, "wikipedia_pt": None, "opening_hours": None, "fee": None,
        "avg_visit_minutes": 30, "popularity": 50, "sitelinks": 5, "pageviews": 100,
    }  # fmt: skip


def town_doc(slug: str = "sintra", count: int = 4) -> dict[str, Any]:
    """``count`` churches ~220 m apart: one walkable group, so the rules planner makes a route."""
    places = [attraction(f"Q{i + 1}", 38.80 + i * 0.002, -9.38) for i in range(count)]
    return {"city": slug, "retrieved": "2026-10-10", "sources": ["wikidata"], "attractions": places}


class FakeIngester:
    """Stands in for the Wikidata/OSM ingestion; records the cities it was asked for."""

    def __init__(self, doc_for: Callable[[City], dict[str, Any]] | None = None) -> None:
        self.cities: list[City] = []
        self.gate: threading.Event | None = None
        self.error: Exception | None = None
        self._doc_for = doc_for or (lambda city: town_doc(city.slug))

    def __call__(self, city: City) -> dict[str, Any]:
        self.cities.append(city)
        if self.gate:
            self.gate.wait(10)
        if self.error:
            raise self.error
        return self._doc_for(city)


def fake_texts(doc: dict[str, Any]) -> dict[str, dict[str, str | None]]:
    return {a["wikidata_id"]: {"summary_en": f"About {a['name_en']}"} for a in doc["attractions"]}


def fake_summary(city: City) -> dict[str, str | None]:
    return {"summary_en": f"{city.name.en} is a town.", "wikipedia_en": city.name.en}


COUNTRY_PT: dict[str, Any] = {
    "code": "PT", "wikidata_id": "Q45", "name_en": "Portugal", "name_pt": "Portugal",
    "currency_codes": ["EUR"], "plug_types": ["F"], "voltage": 230, "frequency_hz": 50,
    "driving_side": "right", "calling_code": "+351", "emergency_number": "112",
    "police_number": None, "ambulance_number": None, "fire_number": None, "languages": ["pt"],
    "timezones": ["Europe/Lisbon", "Atlantic/Azores"], "is_eu": True, "is_schengen": True,
}  # fmt: skip


def fake_climate(city: City) -> dict[str, Any]:
    months = [
        {
            "month": m,
            "temp_mean_c": 15.1,
            "temp_max_c": 18.0,
            "precip_mm": 95.0,
            "snowfall_cm": 0.0,
            "sunshine_hours": 5.2,
        }
        for m in range(1, 13)
    ]
    return {"city": city.slug, "months": months}


def fake_facts(city: City) -> dict[str, Any]:
    return {"city": city.slug, "population": 385000, "inception_year": None, "beach_count": 3}


def fake_prices(city: City) -> dict[str, Any]:
    items = [
        "beer",
        "soft_drink",
        "cocktail",
        "coffee",
        "meal_cheap",
        "meal_mid",
        "local_dish",
        "big_mac",
        "transport_ticket",
        "taxi_5km",
    ]
    return {
        "city": city.slug,
        "country": "PT",
        "retrieved": "2026-10-11",
        "currency": "EUR",
        "price_level": 0.6,
        "big_mac_is_real": True,
        "prices": {item: 3.0 for item in items},
    }


def make_builder(
    tmp_path: Path,
    db: FakeDatabase | None = None,
    ingester: FakeIngester | None = None,
    names: FakeNames | None = None,
) -> tuple[CityBuilder, FakeDatabase, FakeIngester, LocalStore]:
    """A builder wired to fakes; returns it with the fakes so a test can look inside."""
    db, ingester = db or FakeDatabase(), ingester or FakeIngester()
    store = LocalStore(tmp_path / "local")
    deps = BuildDeps(
        names=names or FakeNames(),
        db=db,
        store=store,
        ingest=ingester,
        texts=fake_texts,
        summaries=fake_summary,
        planner=lambda: RuleBasedRoutePlanner(),
        climate=fake_climate,
        facts=fake_facts,
        prices=fake_prices,
        countries={"PT": COUNTRY_PT},
        zone_coords={"Europe/Lisbon": (38.7, -9.1), "Atlantic/Azores": (37.7, -25.7)},
    )
    return CityBuilder(deps), db, ingester, store


class FakeSearcher:
    """Stands in for the city search: canned hits, or a failure like an offline Nominatim."""

    def __init__(self, hits: list[Any] | None = None, error: Exception | None = None) -> None:
        self.hits, self.error = hits or [], error
        self.asked: list[tuple[str, int]] = []

    def search(self, query: str, limit: int) -> list[Any]:
        self.asked.append((query, limit))
        if self.error:
            raise self.error
        return self.hits[:limit]


class ScriptedNominatim:
    """``/reverse`` by zoom and ``/search`` as scripted lists; records every request."""

    def __init__(
        self,
        reverse: dict[int, dict[str, Any]],
        search: list[dict[str, Any]] | None = None,
    ) -> None:
        self.reverse, self.search = reverse, search or []
        self.requests: list[tuple[str, dict[str, Any]]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        import json

        endpoint = url.rsplit("/", 1)[1]
        params = kwargs["params"]
        self.requests.append((endpoint, params))
        if endpoint == "search":
            return 200, json.dumps(self.search)
        return 200, json.dumps(
            self.reverse.get(int(params["zoom"]), {"error": "Unable to geocode"})
        )


class FakeOllama:
    """An Ollama chat endpoint for the trip-wizard tests: scripted answers, recorded requests.

    ``contents`` are the texts the model "writes" (a failure is an Exception); the last one
    repeats. ``models`` is what ``/api/tags`` lists, ``reachable=False`` is a server that is off.
    """

    def __init__(
        self,
        contents: list[Any],
        models: list[str] | None = None,
        reachable: bool = True,
    ) -> None:
        self.contents = list(contents)
        self.models = ["qwen2.5:7b"] if models is None else models
        self.reachable = reachable
        self.posts: list[dict[str, Any]] = []

    def get_json(self, url: str) -> dict[str, Any]:
        if not self.reachable:
            raise PlannerError(f"cannot reach {url}; expected a running Ollama")
        return {"models": [{"name": m} for m in self.models]}

    def post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.posts.append(payload)
        index = min(len(self.posts), len(self.contents)) - 1
        content = self.contents[index]
        if isinstance(content, Exception):
            raise content
        return {"message": {"content": content}}
