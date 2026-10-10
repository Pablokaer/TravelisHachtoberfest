"""Connects the on-demand city service to the real pipeline stages, database and Ollama."""

from __future__ import annotations

import argparse
import threading
from typing import Any

from .. import attraction_texts, city_summaries, countries
from ..attractions import pipeline as attractions_pipeline
from ..config import CitiesConfig, City
from ..http import HttpClient
from ..routes.model import RoutePlanner
from ..routes.ollama import RequestsOllamaTransport
from .build import BuildDeps, CityBuilder
from .database import choose_database
from .identity import load_zone_coords
from .jobs import JobBoard
from .names import WikidataNames
from .places import NominatimGeocoder
from .planning import choose_planner
from .search import CitySearch
from .service import CityService
from .store import LocalStore


def _summary(client: HttpClient, city: City) -> dict[str, str | None]:
    config = CitiesConfig(version=1, cities=[city])
    return city_summaries.build(client, config, [city])[city.slug]


def build_service(args: argparse.Namespace) -> CityService:
    """The service with real collaborators; ``args`` has ``db_url``, ``planner``, ``model`` and
    ``ollama_url`` (see ``serve --help``)."""
    client = HttpClient()
    db = choose_database(args.db_url)
    # Ingestion shares one disk cache of Wikidata class roots: one city at a time writes it.
    ingest_lock = threading.Lock()

    def ingest(city: City) -> dict[str, Any]:
        with ingest_lock:
            return attractions_pipeline.ingest_city(client, city)

    def planner() -> RoutePlanner:
        return choose_planner(args.planner, args.model, args.ollama_url, RequestsOllamaTransport())

    deps = BuildDeps(
        names=WikidataNames(client),
        db=db,
        store=LocalStore(),
        ingest=ingest,
        texts=lambda doc: attraction_texts.build_city(client, doc),
        summaries=lambda city: _summary(client, city),
        planner=planner,
        countries=countries.load(),
        zone_coords=load_zone_coords(),
    )
    return CityService(
        NominatimGeocoder(client), db, CityBuilder(deps), JobBoard(), CitySearch(client)
    )
