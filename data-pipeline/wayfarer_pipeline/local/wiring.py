"""Connects the on-demand city service to the real pipeline stages, database and Ollama."""

from __future__ import annotations

import argparse
import threading
from collections.abc import Callable
from typing import Any

from .. import attraction_texts, city_summaries, climate, countries, facts
from ..attractions import pipeline as attractions_pipeline
from ..config import CitiesConfig, City
from ..http import HttpClient
from ..routes.model import RoutePlanner
from ..routes.ollama import RequestsOllamaTransport
from .build import BuildDeps, CityBuilder
from .database import Database, choose_database
from .identity import load_zone_coords
from .jobs import JobBoard
from .names import WikidataNames
from .places import NominatimGeocoder
from .plan import PlanAssistant
from .planning import choose_planner
from .search import CitySearch
from .service import CityService
from .store import LocalStore


def _summary(client: HttpClient, city: City) -> dict[str, str | None]:
    config = CitiesConfig(version=1, cities=[city])
    return city_summaries.build(client, config, [city])[city.slug]


def _ingester(client: HttpClient) -> Callable[[City], dict[str, Any]]:
    """Attractions ingestion, one city at a time: it shares one disk cache of Wikidata classes."""
    lock = threading.Lock()

    def ingest(city: City) -> dict[str, Any]:
        with lock:
            return attractions_pipeline.ingest_city(client, city)

    return ingest


def _city_facts(client: HttpClient, city: City) -> dict[str, Any]:
    wikidata = facts.fetch_wikidata(client, [city.wikidata_id])[city.wikidata_id]
    return facts.build_city(client, city, wikidata)


def _deps(args: argparse.Namespace, client: HttpClient, db: Database) -> BuildDeps:
    def planner() -> RoutePlanner:
        return choose_planner(args.planner, args.model, args.ollama_url, RequestsOllamaTransport())

    return BuildDeps(
        names=WikidataNames(client),
        db=db,
        store=LocalStore(),
        ingest=_ingester(client),
        texts=lambda doc: attraction_texts.build_city(client, doc),
        summaries=lambda city: _summary(client, city),
        planner=planner,
        climate=lambda city: climate.fetch_city(client, city, first_year=args.climate_first_year),
        facts=lambda city: _city_facts(client, city),
        countries=countries.load(),
        zone_coords=load_zone_coords(),
    )


def build_service(args: argparse.Namespace) -> CityService:
    """The service with real collaborators; ``args`` has ``db_url``, ``planner``, ``model``,
    ``ollama_url`` and ``climate_first_year`` (see ``serve --help``)."""
    client = HttpClient()
    db = choose_database(args.db_url)
    wizard = PlanAssistant(
        RequestsOllamaTransport(), args.model, args.ollama_url, enabled=args.planner != "rules"
    )
    builder = CityBuilder(_deps(args, client, db))
    return CityService(
        NominatimGeocoder(client), db, builder, JobBoard(), CitySearch(client), wizard
    )
