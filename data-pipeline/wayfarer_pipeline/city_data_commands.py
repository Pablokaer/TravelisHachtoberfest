"""The ``climate`` and ``facts`` commands (D-081): fetch each city's data one at a time.

A run keeps the snapshots it already has (so an interrupted ``--all`` resumes where it stopped;
``--refresh`` fetches again) and reports a city that fails instead of stopping the rest.
``--local`` works on the cities built on demand by ``serve`` (``data/local``) and loads their
rows into the database, since the committed seeds do not include them.
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from . import climate, countries, facts, regions, seed_city_data
from .config import CitiesConfig, City, load_cities
from .local.database import Database, choose_database
from .local.store import LocalStore
from .paths import CLIMATE_DIR, FACTS_DIR, LOCAL_DIR, prettier


@dataclass
class RunResult:
    written: list[str] = field(default_factory=list)
    kept: list[str] = field(default_factory=list)
    failed: list[tuple[str, str]] = field(default_factory=list)

    def line(self, label: str) -> str:
        """``climate: 190 written, 8 kept, 0 failed`` for the CLI."""
        counts = f"{len(self.written)} written, {len(self.kept)} kept, {len(self.failed)} failed"
        return f"{label}: {counts}"


def _describe(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"


def _pending(cities: list[City], directory: Path, refresh: bool, result: RunResult) -> list[City]:
    """The cities to fetch: those without a snapshot (all of them with ``refresh``)."""
    todo = []
    for city in cities:
        if not refresh and (directory / f"{city.slug}.json").exists():
            result.kept.append(city.slug)
        else:
            todo.append(city)
    return todo


QUOTA_USED_UP = "Daily API request limit exceeded"
# The hourly quota (5,000 weighted calls) clears by itself: wait for it, five minutes at a time.
HOURLY_QUOTA = "Hourly API request limit exceeded"
QUOTA_WAIT_SECONDS = 300.0
QUOTA_MAX_WAITS = 13


def _with_quota_waits(work: Callable[[City], Path], city: City, sleep: Callable[[float], None]):
    """``work(city)``, waiting out an hourly quota (up to an hour and five minutes)."""
    for waited in range(QUOTA_MAX_WAITS + 1):
        try:
            return work(city)
        except Exception as exc:
            if HOURLY_QUOTA not in str(exc) or waited == QUOTA_MAX_WAITS:
                raise
            print(f"  hourly quota used up; waiting {QUOTA_WAIT_SECONDS:.0f}s", flush=True)
            sleep(QUOTA_WAIT_SECONDS)


def _each(
    todo: list[City],
    work: Callable[[City], Path],
    result: RunResult,
    label: str,
    sleep: Callable[[float], None] = time.sleep,
) -> list[Path]:
    """Runs ``work`` per city. A used-up daily quota stops the run: the rest would only fail,
    and the kept snapshots let tomorrow's run resume."""
    paths = []
    for city in todo:
        try:
            paths.append(_with_quota_waits(work, city, sleep))
            result.written.append(city.slug)
            print(f"  {label} {city.slug}: ok", flush=True)
        except Exception as exc:  # noqa: BLE001 - one city failing must not stop the others
            result.failed.append((city.slug, _describe(exc)))
            print(f"  {label} {city.slug}: FAILED {_describe(exc)}", flush=True)
            if QUOTA_USED_UP in str(exc):
                print("  daily quota used up; run the command again tomorrow to resume")
                break
    return paths


def run_climate(
    client: Any,
    cities: list[City],
    directory: Path = CLIMATE_DIR,
    refresh: bool = False,
    today: date | None = None,
    format_json: bool = False,
    first_year: int = climate.FIRST_YEAR,
    sleep: Callable[[float], None] = time.sleep,
) -> RunResult:
    """Climate snapshots for ``cities`` in ``directory``."""
    result = RunResult()

    def one(city: City) -> Path:
        doc = climate.fetch_city(client, city, today, first_year=first_year)
        return climate.save(doc, directory, False)

    paths = _each(_pending(cities, directory, refresh, result), one, result, "climate", sleep)
    if format_json and paths:
        prettier(*paths)
    return result


def run_facts(
    wikidata: Any,
    overpass_client: Any,
    cities: list[City],
    directory: Path = FACTS_DIR,
    refresh: bool = False,
    today: date | None = None,
    format_json: bool = False,
) -> RunResult:
    """Facts snapshots for ``cities``: one Wikidata query for the batch, Overpass per city."""
    result = RunResult()
    todo = _pending(cities, directory, refresh, result)
    found = facts.fetch_wikidata(wikidata, [c.wikidata_id for c in todo]) if todo else {}

    def one(city: City) -> Path:
        doc = facts.build_city(overpass_client, city, found[city.wikidata_id], today)
        return facts.save(doc, directory, False)

    paths = _each(todo, one, result, "facts")
    if format_json and paths:
        prettier(*paths)
    return result


def load_into_database(
    db: Database, climate_docs: dict[str, Any], facts_docs: dict[str, Any]
) -> None:
    """Upserts the given snapshots into the database in one transaction (nothing: no call)."""
    scripts = []
    if climate_docs:
        scripts.append(seed_city_data.climate_sql(climate_docs))
    if facts_docs:
        scripts.append(seed_city_data.facts_sql(facts_docs))
    if scripts:
        db.apply("\n".join(scripts))


def targets(args: argparse.Namespace) -> tuple[list[City], Path]:
    """The cities the command was asked for and the folder holding its snapshot folders: the
    committed ``data/`` or, with ``--local``, ``data/local``."""
    if args.local:
        store = LocalStore()
        if not store.cities_file.exists():
            raise SystemExit(f"no local cities: {store.cities_file} does not exist")
        config, base = load_cities(store.cities_file), LOCAL_DIR
    else:
        config, base = load_cities(args.config), CLIMATE_DIR.parent
    return _selected(args, config), base


def shard(cities: list[City], spec: str | None) -> list[City]:
    """``"2/3"`` → the 2nd of 3 interleaved shares of ``cities`` (every 3rd city), so several
    processes can work at once, each on its own host connection; ``None`` → all of them."""
    if spec is None:
        return cities
    part, _, total = spec.partition("/")
    if not (part.isdigit() and total.isdigit() and 1 <= int(part) <= int(total)):
        raise SystemExit(f"shard {spec!r} is not valid; expected K/N with 1 <= K <= N, like 2/3")
    return cities[int(part) - 1 :: int(total)]


def _selected(args: argparse.Namespace, config: CitiesConfig) -> list[City]:
    picked = regions.select(config, countries.load(), region=args.region, city=args.city)
    return shard(picked, args.shard)


def cmd_climate(args: argparse.Namespace, client: Any) -> int:
    cities, base = targets(args)
    folder = base / "climate"
    result = run_climate(
        client, cities, folder, args.refresh, format_json=not args.local, first_year=args.first_year
    )
    print(result.line("climate"))
    if args.local:
        load_into_database(choose_database(args.db_url), climate.load_all(folder), {})
    return 1 if result.failed else 0


def cmd_facts(args: argparse.Namespace, client: Any) -> int:
    cities, base = targets(args)
    folder = base / "facts"
    result = run_facts(client, client, cities, folder, args.refresh, format_json=not args.local)
    print(result.line("facts"))
    if args.local:
        load_into_database(choose_database(args.db_url), {}, facts.load_all(folder))
    return 1 if result.failed else 0
