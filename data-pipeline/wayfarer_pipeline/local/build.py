"""Builds one city nobody ingested yet and writes it to the local database (D-079).

Stages, reported through ``progress``: ``locating`` (names, slug, time zone, country),
``attractions`` (Wikidata/OSM ingestion), ``texts`` (Wikipedia), ``routes`` (the route planner),
``saving`` (one SQL transaction). The ingestion, text and planner stages are the pipeline's own
modules, injected so tests run without a network.
"""

from __future__ import annotations

import json
import sys
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .. import seed, seed_city_data
from ..config import CitiesConfig, City
from ..routes import pipeline as routes_pipeline
from ..routes.model import PlannerContext, RoutePlanner
from ..routes.rules import RuleBasedRoutePlanner
from ..sql import quote
from .database import Database
from .identity import ZoneCoords, new_city, pick_timezone
from .names import NameSource
from .places import MAX_CITY_SPAN_DEG, Place
from .store import LocalStore

Progress = Callable[..., None]
Doc = dict[str, Any]


class BuildError(RuntimeError):
    """A city cannot be built; the message names the offending value and what was expected."""


@dataclass(frozen=True)
class BuildDeps:
    names: NameSource
    db: Database
    store: LocalStore
    ingest: Callable[[City], Doc]
    texts: Callable[[Doc], dict[str, dict[str, str | None]]]
    summaries: Callable[[City], dict[str, str | None]]
    planner: Callable[[], RoutePlanner]
    climate: Callable[[City], Doc]
    facts: Callable[[City], Doc]
    countries: dict[str, dict[str, Any]]
    zone_coords: ZoneCoords


@dataclass(frozen=True)
class BuildResult:
    slug: str
    attractions: int
    routes: int


def city_script(
    city: City,
    summary: dict[str, str | None],
    doc: Doc,
    texts: dict[str, dict[str, str | None]],
    routes: Doc,
    country: dict[str, Any] | None,
    extras: dict[str, Doc] | None = None,
) -> str:
    """The SQL that adds the city: its country (when missing), the city, its places with their
    texts and its routes. Routes are replaced for this city only; everything is an upsert."""
    config = CitiesConfig(version=1, cities=[city])
    parts = [seed.countries_sql({city.country_code: country})] if country else []
    parts.append(seed.cities_sql(config, {city.slug: summary}))
    parts.append(seed.attractions_sql({city.slug: doc}, {city.slug: texts})[0])
    known = {a["wikidata_id"] for a in doc["attractions"]}
    parts.append(seed.suggested_routes_sql({city.slug: routes}, known, only_city=city.slug)[0])
    extras = extras or {}
    if "climate" in extras:
        parts.append(seed_city_data.climate_sql({city.slug: extras["climate"]}))
    if "facts" in extras:
        parts.append(seed_city_data.facts_sql({city.slug: extras["facts"]}))
    return "\n".join(parts)


class CityBuilder:
    """Turns a geocoded place into a city in the database.

    >>> CityBuilder(deps).build(place, lambda stage, **counts: print(stage)).slug  # "sintra"
    """

    def __init__(self, deps: BuildDeps) -> None:
        self.deps = deps
        self._slugs = threading.Lock()  # two new cities must not pick the same slug

    def identify(self, place: Place) -> Place | None:
        """``place`` with its Wikidata id (looked up by name when OSM had none), or ``None``."""
        if place.wikidata_id:
            return place
        qid = self.deps.names.find_city(place.name_en, place.country_code)
        return Place(**{**place.__dict__, "wikidata_id": qid}) if qid else None

    def build(self, place: Place, progress: Progress) -> BuildResult:
        progress("locating")
        city, country = self._locate(place)
        progress("attractions", city_slug=city.slug)
        doc = self._attractions(city)
        progress("texts", attractions=len(doc["attractions"]))
        summary, texts = self.deps.summaries(city), self.deps.texts(doc)
        progress("routes")
        routes = self._routes(city, doc)
        progress("climate")
        extras = self._extras(city)
        progress("saving", routes=len(routes["routes"]))
        script = city_script(city, summary, doc, texts, routes, country, extras)
        self.deps.db.apply(script)
        return BuildResult(city.slug, len(doc["attractions"]), len(routes["routes"]))

    def _extras(self, city: City) -> dict[str, Doc]:
        """Climate and facts (D-081). Each is optional: Open-Meteo or Overpass can throttle, and
        a city without them is still worth building; the failure is logged, not raised."""
        found: dict[str, Doc] = {}
        for name, fetch in (("climate", self.deps.climate), ("facts", self.deps.facts)):
            try:
                found[name] = fetch(city)
                self.deps.store.save_doc(city.slug, name, found[name])
            except Exception as exc:  # noqa: BLE001 - logged below, the build goes on
                failure = {"event": "city_data_skipped", "city": city.slug, "stage": name}
                error = f"{type(exc).__name__}: {exc}"
                print(json.dumps({**failure, "error": error}), file=sys.stderr, flush=True)
        return found

    def _locate(self, place: Place) -> tuple[City, dict[str, Any] | None]:
        identified = self.identify(place)
        if identified is None:
            raise BuildError(f"{place.name_en!r} has no Wikidata item; expected one to ingest it")
        _check_area(identified)
        country = self._missing_country(identified.country_code)
        with self._slugs:
            city = self._new_city(identified)
            self.deps.store.add_city(city)
        return city, country

    def _new_city(self, place: Place) -> City:
        known = self._known_cities()
        mine = next((slug for slug, qid in known if qid == place.wikidata_id), None)
        taken = {slug for slug, qid in known if qid != place.wikidata_id}
        names = self.deps.names.labels(place.wikidata_id or "")
        label = (names[0] or place.name_en, names[1] or place.name_pt)
        zones = self.deps.countries.get(place.country_code, {}).get("timezones", [])
        zone = pick_timezone(zones, place.lat, place.lng, self.deps.zone_coords)
        city = new_city(place, label, taken, zone)
        return city.model_copy(update={"slug": mine}) if mine else city

    def _known_cities(self) -> list[tuple[str, str]]:
        db_rows = self.deps.db.rows("select slug, wikidata_id from public.cities")
        local = [(c.slug, c.wikidata_id) for c in self.deps.store.cities()]
        return [*((r["slug"], r["wikidata_id"]) for r in db_rows), *local]

    def _missing_country(self, code: str) -> dict[str, Any] | None:
        """The country row to insert, or ``None`` when the database already has it."""
        present = self.deps.db.rows(f"select code from public.countries where code = {quote(code)}")
        if present:
            return None
        row = self.deps.countries.get(code)
        if row is None:
            raise BuildError(
                f"country {code!r} is unknown; expected an ISO 3166-1 code in countries.json"
            )
        return row

    def _attractions(self, city: City) -> Doc:
        doc = self.deps.ingest(city)
        owners = self._owners([a["wikidata_id"] for a in doc["attractions"]])
        mine = [
            a for a in doc["attractions"] if owners.get(a["wikidata_id"], city.slug) == city.slug
        ]
        if not mine:
            raise BuildError(f"no notable attractions found in {city.name.en}; expected at least 1")
        doc = {**doc, "attractions": mine}
        self.deps.store.save_doc(city.slug, "attractions", doc)
        return doc

    def _owners(self, qids: list[str]) -> dict[str, str]:
        """``{qid: city}`` for places the database already holds (``wikidata_id`` is unique)."""
        listed = ", ".join(quote(q) for q in qids)
        sql = (
            f"select wikidata_id, city_slug from public.attractions where wikidata_id in ({listed})"
        )
        return {r["wikidata_id"]: r["city_slug"] for r in self.deps.db.rows(sql)} if qids else {}

    def _routes(self, city: City, doc: Doc) -> Doc:
        context = PlannerContext(city_en=city.name.en, city_pt=city.name.pt)
        today = datetime.now(UTC).date()
        routes = routes_pipeline.build_city(
            doc, context, self.deps.planner(), RuleBasedRoutePlanner(), today
        )
        self.deps.store.save_doc(city.slug, "routes", routes)
        return routes


def _check_area(place: Place) -> None:
    south, west, north, east = place.bbox
    span = max(north - south, east - west)
    if span > MAX_CITY_SPAN_DEG:
        raise BuildError(
            f"{place.name_en!r} spans {span:.1f} degrees; expected a city of at most "
            f"{MAX_CITY_SPAN_DEG:.1f}"
        )
