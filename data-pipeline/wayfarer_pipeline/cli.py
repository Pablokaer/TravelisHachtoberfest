"""Command-line entry point.

python -m wayfarer_pipeline validate-config
python -m wayfarer_pipeline countries          # Wikidata → data/countries.json → 10_countries.sql
python -m wayfarer_pipeline cities             # cities.yaml → 20_cities.sql
python -m wayfarer_pipeline city-summaries [--region europe | --city lisbon]  # Wikipedia intro +
                                               # history → data/city_summaries.json → 20
python -m wayfarer_pipeline attraction-texts --region europe | --city lisbon | --all  # D-070
                                               # → data/attraction_texts → 40
python -m wayfarer_pipeline people --region europe | --city lisbon | --all  # D-071
                                               # → data/people → 50_people.sql
python -m wayfarer_pipeline suggest-routes --city lisbon | --region europe | --all  # D-077
                                               # [--planner rules|ollama --model qwen2.5:7b
                                               #  --ollama-url http://localhost:11434]
                                               # → data/suggested_routes → 60_suggested_routes.sql
python -m wayfarer_pipeline serve [--port 8787] [--planner auto|rules|ollama]  # D-079
                                               # local HTTP service: builds the user's own city
                                               # from a GPS position and writes it to Supabase
python -m wayfarer_pipeline visa               # passport-index → data/visa.csv → 30_visa.sql
python -m wayfarer_pipeline ingest --city lisbon | --all [--jobs 3]  # → data/attractions → 40
python -m wayfarer_pipeline report             # quality report from committed attraction files
python -m wayfarer_pipeline seed               # regenerate every seed file, no network
python -m wayfarer_pipeline cities-doc [--check]   # docs/CITIES.md (ingest/seed/cities rewrite it)
python -m wayfarer_pipeline gate --base origin/main [--fix] [--report r.md] [--changelog]  # D-042
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from . import attraction_texts, city_summaries, countries, coverage, regions, seed, visa
from .attractions import pipeline
from .config import DEFAULT_CITIES_FILE, CitiesConfig, load_cities
from .gates.baseline import GitBaseline
from .gates.changelog import add_data_entry, refresh_line
from .gates.run import run_gates
from .http import HttpClient
from .local.database import DEFAULT_DB_URL
from .paths import DATA_DIR, REPO_ROOT
from .people import categories as people_categories
from .people import pipeline as people
from .routes import pipeline as routes_pipeline
from .routes.model import PlannerContext, PlannerError, RoutePlanner
from .routes.ollama import (
    DEFAULT_MODEL,
    DEFAULT_URL,
    OllamaRoutePlanner,
    OllamaTransport,
    RequestsOllamaTransport,
)
from .routes.rules import RuleBasedRoutePlanner


def _client(args: argparse.Namespace) -> HttpClient:
    return HttpClient(use_cache=not args.no_cache)


def _coverage(config: CitiesConfig) -> str:
    return coverage.render(config, pipeline.load_all(), countries.load())


def _write_coverage(config: CitiesConfig) -> None:
    print(f"wrote {coverage.write(_coverage(config))}")


def _cmd_validate(args: argparse.Namespace) -> int:
    config = load_cities(args.config)
    print(f"OK: {len(config.cities)} cities in {args.config}")
    for c in config.cities:
        flag = "" if c.is_active else " (inactive)"
        print(f"  - {c.slug:<10} {c.name.en:<12} {c.country_code}  {c.wikidata_id}{flag}")
    return 0


def _cmd_countries(args: argparse.Namespace) -> int:
    data = countries.build(_client(args))
    countries.save(data)
    print(countries.summary(data))
    print(f"wrote {seed.write_countries()}")
    return 0


def _cmd_cities(args: argparse.Namespace) -> int:
    config = load_cities(args.config)
    known = countries.load()
    missing = sorted({c.country_code for c in config.cities} - set(known))
    if missing:
        print(f"ERROR: city countries missing from countries.json: {missing}", file=sys.stderr)
        return 1
    print(f"wrote {seed.write_cities(config)} ({len(config.cities)} cities)")
    _write_coverage(config)
    return 0


def _selected(args: argparse.Namespace, config: CitiesConfig) -> list:
    return regions.select(config, countries.load(), region=args.region, city=args.city)


def _cmd_city_summaries(args: argparse.Namespace) -> int:
    config = load_cities(args.config)
    cities = _selected(args, config)
    summaries = city_summaries.build(_client(args), config, cities, city_summaries.load())
    city_summaries.save(summaries)
    print(city_summaries.summary_line(summaries))
    print(f"wrote {seed.write_cities(config)}")
    return 0


def _cmd_attraction_texts(args: argparse.Namespace) -> int:
    config = load_cities(args.config)
    docs = pipeline.load_all()
    client = _client(args)
    for city in _selected(args, config):
        if city.slug not in docs:
            print(f"  {city.slug}: no attractions file; skipped")
            continue
        texts = attraction_texts.build_city(client, docs[city.slug])
        print(
            f"  wrote {attraction_texts.save(city.slug, texts)} ({len(texts)} places)", flush=True
        )
    print(attraction_texts.summary_line(attraction_texts.load_all()))
    path, _ = seed.write_attractions()
    print(f"wrote {path}")
    print(f"http: {client.stats['network']} network requests, {client.stats['cache']} cached")
    return 0


def _cmd_people(args: argparse.Namespace) -> int:
    config = load_cities(args.config)
    client = _client(args)
    lookup = people_categories.OccupationLookup(client)
    for city in _selected(args, config):
        doc = people.build_city(client, city, lookup)
        print(f"  wrote {people.save(doc)} ({len(doc['people'])} people)", flush=True)
    print(people.summary_line(people.load_all()))
    print(f"wrote {seed.write_people()}")
    print(f"http: {client.stats['network']} network requests, {client.stats['cache']} cached")
    return 0


def make_ollama_transport() -> OllamaTransport:
    return RequestsOllamaTransport()


def make_route_planner(args: argparse.Namespace) -> RoutePlanner:
    """The planner chosen by ``--planner``: the model-free rules (default) or a local Ollama."""
    if args.planner == "ollama":
        return OllamaRoutePlanner(args.model, args.ollama_url, make_ollama_transport())
    return RuleBasedRoutePlanner()


def _cmd_suggest_routes(args: argparse.Namespace) -> int:
    planner = make_route_planner(args)
    if isinstance(planner, OllamaRoutePlanner):
        try:
            planner.check_reachable()
        except PlannerError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
    docs, today = pipeline.load_all(), datetime.now(UTC).date()
    for city in _selected(args, load_cities(args.config)):
        if city.slug not in docs:
            print(f"  {city.slug}: no attractions file; skipped")
            continue
        context = PlannerContext(city_en=city.name.en, city_pt=city.name.pt)
        doc = routes_pipeline.build_city(
            docs[city.slug], context, planner, RuleBasedRoutePlanner(), today
        )
        print(f"  wrote {routes_pipeline.save(doc)} ({len(doc['routes'])} routes)", flush=True)
    print(routes_pipeline.summary_line(routes_pipeline.load_all()))
    path, warnings = seed.write_suggested_routes()
    for w in warnings:
        print(f"WARNING: {w}")
    print(f"wrote {path}")
    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    from .local.server import make_server
    from .local.wiring import build_service

    server = make_server(args.host, args.port, build_service(args))
    host, port = server.server_address[:2]
    print(f"serving on http://{host}:{port}  (Ctrl+C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("stopped")
    return 0


def _cmd_visa(args: argparse.Namespace) -> int:
    raw, meta = visa.fetch(_client(args))
    rows, skipped = visa.normalize(raw, set(countries.load()))
    visa.save(rows, meta)
    if skipped:
        print(f"skipped codes not in countries: {sorted(skipped)}")
    print(
        f"{len(rows)} visa rows from {meta['source']} @ {meta['commit'][:7]} "
        f"({meta['commit_date']})"
    )
    print(f"wrote {seed.write_visa()}")
    return 0


def _cmd_ingest(args: argparse.Namespace) -> int:
    config = load_cities(args.config)
    cities = config.cities if args.all else [config.get(args.city)]
    client = _client(args)
    print(f"== {len(cities)} cities, {args.jobs} at a time", flush=True)
    results = pipeline.ingest_cities(client, cities, jobs=args.jobs)
    for _, written in results:
        print(f"  wrote {written}")
    reports = [pipeline.quality_report(doc) for doc, _ in results]
    path, warnings = seed.write_attractions()
    for w in warnings:
        print(f"WARNING: {w}")
    print(f"wrote {path} (all cities in data/attractions)")
    print(f"http: {client.stats['network']} network requests, {client.stats['cache']} cached")
    _write_coverage(config)
    print("\nQuality report\n" + "\n".join(reports))
    return 0


def _cmd_report(args: argparse.Namespace) -> int:
    for doc in pipeline.load_all().values():
        print(pipeline.quality_report(doc))
    return 0


def _cmd_seed(args: argparse.Namespace) -> int:
    config = load_cities(args.config)
    paths = [
        seed.write_readme(),
        seed.write_countries(),
        seed.write_cities(config),
        seed.write_visa(),
    ]
    path, warnings = seed.write_attractions()
    paths.extend([path, seed.write_people()])
    routes_path, route_warnings = seed.write_suggested_routes()
    paths.append(routes_path)
    for w in [*warnings, *route_warnings]:
        print(f"WARNING: {w}")
    for p in paths:
        print(f"wrote {p}")
    _write_coverage(config)
    return 0


def _cmd_cities_doc(args: argparse.Namespace) -> int:
    content = _coverage(load_cities(args.config))
    if args.check:
        if coverage.is_current(content):
            print(f"OK: {coverage.CITIES_DOC} is up to date")
            return 0
        print(
            f"ERROR: {coverage.CITIES_DOC} is stale; run `python -m wayfarer_pipeline cities-doc`",
            file=sys.stderr,
        )
        return 1
    print(f"wrote {coverage.write(content)}")
    return 0


def _record_refresh(report) -> None:
    changelog = REPO_ROOT / "CHANGELOG.md"
    line = refresh_line(report, datetime.now(UTC).date())
    changelog.write_text(
        add_data_entry(changelog.read_text(encoding="utf-8"), line), encoding="utf-8"
    )
    print(f"wrote {changelog}: {line}")


def _cmd_gate(args: argparse.Namespace) -> int:
    city_slugs = {c.slug for c in load_cities(args.config).cities}
    report = run_gates(DATA_DIR, GitBaseline(args.base), city_slugs, fix=args.fix)
    if args.report:
        args.report.write_text(report.markdown(), encoding="utf-8")
    print(report.markdown())
    if args.changelog and report.changed_datasets and not report.blocked:
        _record_refresh(report)
    return 1 if report.blocked else 0


def _add_city_selection(command: argparse.ArgumentParser, required: bool) -> None:
    """``--city`` / ``--region`` (/ ``--all`` when a choice is required); none means all cities."""
    target = command.add_mutually_exclusive_group(required=required)
    target.add_argument("--city", help="city slug from cities.yaml")
    target.add_argument("--region", choices=sorted(regions.REGION_TIMEZONE_PREFIXES))
    if required:
        target.add_argument("--all", action="store_true", help="all cities")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="wayfarer-pipeline")
    parser.add_argument("--config", type=Path, default=DEFAULT_CITIES_FILE)
    parser.add_argument(
        "--no-cache", action="store_true", help="ignore the .cache/ directory (re-fetch)"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("validate-config", help="validate cities.yaml").set_defaults(func=_cmd_validate)
    sub.add_parser("countries", help="fetch countries → 10_countries.sql").set_defaults(
        func=_cmd_countries
    )
    sub.add_parser("cities", help="cities.yaml → 20_cities.sql").set_defaults(func=_cmd_cities)
    summaries = sub.add_parser(
        "city-summaries", help="fetch Wikipedia city texts → data/city_summaries.json"
    )
    _add_city_selection(summaries, required=False)
    summaries.set_defaults(func=_cmd_city_summaries)
    texts = sub.add_parser(
        "attraction-texts", help="fetch Wikipedia attraction texts → data/attraction_texts"
    )
    _add_city_selection(texts, required=True)
    texts.set_defaults(func=_cmd_attraction_texts)
    people_cmd = sub.add_parser("people", help="fetch notable people → data/people")
    _add_city_selection(people_cmd, required=True)
    people_cmd.set_defaults(func=_cmd_people)
    routes_cmd = sub.add_parser(
        "suggest-routes", help="propose themed walking routes → data/suggested_routes → 60"
    )
    _add_city_selection(routes_cmd, required=True)
    routes_cmd.add_argument("--planner", choices=["rules", "ollama"], default="rules")
    routes_cmd.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model tag")
    routes_cmd.add_argument("--ollama-url", default=DEFAULT_URL, help="Ollama server")
    routes_cmd.set_defaults(func=_cmd_suggest_routes)
    serve = sub.add_parser("serve", help="local service that builds a city from a position")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8787)
    serve.add_argument("--db-url", default=DEFAULT_DB_URL, help="local Supabase Postgres")
    serve.add_argument("--planner", choices=["auto", "rules", "ollama"], default="auto")
    serve.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model tag")
    serve.add_argument("--ollama-url", default=DEFAULT_URL, help="Ollama server")
    serve.set_defaults(func=_cmd_serve)
    sub.add_parser("visa", help="fetch visa rules → 30_visa.sql").set_defaults(func=_cmd_visa)

    ingest = sub.add_parser("ingest", help="ingest attractions for one or all cities")
    target = ingest.add_mutually_exclusive_group(required=True)
    target.add_argument("--city", help="city slug from cities.yaml")
    target.add_argument("--all", action="store_true", help="all cities")
    ingest.add_argument(
        "--jobs",
        type=int,
        default=1,
        help="cities ingested at once (each API keeps its own rate limit; D-060)",
    )
    ingest.set_defaults(func=_cmd_ingest)

    sub.add_parser("report", help="attraction quality report").set_defaults(func=_cmd_report)
    sub.add_parser("seed", help="regenerate all seed SQL offline").set_defaults(func=_cmd_seed)

    gate = sub.add_parser("gate", help="compare data/ with a git ref: restore or block (D-042)")
    gate.add_argument("--base", default="origin/main", help="git ref with the trusted data")
    gate.add_argument("--fix", action="store_true", help="restore values that got worse")
    gate.add_argument("--report", type=Path, help="write the Markdown report to this file")
    gate.add_argument(
        "--changelog", action="store_true", help="record a passing refresh in CHANGELOG.md"
    )
    gate.set_defaults(func=_cmd_gate)

    doc = sub.add_parser("cities-doc", help="write docs/CITIES.md (city coverage)")
    doc.add_argument("--check", action="store_true", help="exit 1 when docs/CITIES.md is stale")
    doc.set_defaults(func=_cmd_cities_doc)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
