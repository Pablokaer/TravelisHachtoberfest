"""Connects the on-demand city service to the real pipeline stages, database and Ollama."""

from __future__ import annotations

import argparse
import os
import threading
from collections.abc import Callable
from typing import Any

from .. import attraction_texts, city_summaries, climate, countries, facts, prices
from ..attractions import pipeline as attractions_pipeline
from ..config import CitiesConfig, City
from ..http import HttpClient
from ..integrations.commands import traced_ollama_transport
from ..integrations.extras import ExtrasApi, build_extras
from ..routes.model import RoutePlanner
from ..routes.ollama import OllamaTransport
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


def _city_prices(client: HttpClient, city: City) -> dict[str, Any]:
    return prices.build_city(city, prices.load_basket(), prices.fetch_sources(client))


def _deps(
    args: argparse.Namespace, client: HttpClient, db: Database, ollama: OllamaTransport
) -> BuildDeps:
    def planner() -> RoutePlanner:
        return choose_planner(args.planner, args.model, args.ollama_url, ollama)

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
        prices=lambda city: _city_prices(client, city),
        countries=countries.load(),
        zone_coords=load_zone_coords(),
    )


def build_service(args: argparse.Namespace) -> CityService:
    """The service with real collaborators; ``args`` has ``db_url``, ``planner``, ``model``,
    ``ollama_url`` and ``climate_first_year`` (see ``serve --help``)."""
    client = HttpClient()
    db = choose_database(args.db_url)
    ollama = traced_ollama_transport()  # a span per model call (D-084)
    wizard = PlanAssistant(ollama, args.model, args.ollama_url, enabled=args.planner != "rules")
    builder = CityBuilder(_deps(args, client, db, ollama))
    extras = ExtrasApi(build_extras(os.environ, db, args.ollama_url, ollama))
    return CityService(
        NominatimGeocoder(client), db, builder, JobBoard(), CitySearch(client), wizard, extras
    )
