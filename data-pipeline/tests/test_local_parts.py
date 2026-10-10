"""The small parts of the on-demand city service: planner choice, psql, store, geocoder, names."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pytest
from local_fakes import SINTRA
from routes_fakes import FakeOllamaTransport

from wayfarer_pipeline import cli
from wayfarer_pipeline.http import POLICIES
from wayfarer_pipeline.local.database import DatabaseError, PsqlDatabase, choose_database
from wayfarer_pipeline.local.names import WikidataNames
from wayfarer_pipeline.local.places import NominatimGeocoder, parse_reverse
from wayfarer_pipeline.local.planning import choose_planner
from wayfarer_pipeline.local.store import LocalStore
from wayfarer_pipeline.routes.model import PlannerError
from wayfarer_pipeline.routes.ollama import OllamaRoutePlanner
from wayfarer_pipeline.routes.rules import RuleBasedRoutePlanner

URL = "http://localhost:11434"


class TagsTransport(FakeOllamaTransport):
    """An Ollama that lists its installed models on ``/api/tags``."""

    def __init__(self, models: list[str], reachable: bool = True) -> None:
        super().__init__([], reachable=reachable)
        self.models = models
        self.gets: list[str] = []

    def get_json(self, url: str) -> dict[str, Any]:
        self.gets.append(url)
        super().get_json(url)
        return {"models": [{"name": m} for m in self.models]}


def test_auto_uses_ollama_when_the_model_is_installed() -> None:
    planner = choose_planner("auto", "qwen2.5:7b", URL, TagsTransport(["qwen2.5:7b"]))
    assert isinstance(planner, OllamaRoutePlanner) and planner.name == "qwen2.5:7b"


@pytest.mark.parametrize(
    "transport", [TagsTransport(["llama3:8b"]), TagsTransport([], reachable=False)]
)
def test_auto_falls_back_to_rules_without_the_model_or_the_server(
    transport: TagsTransport,
) -> None:
    assert isinstance(choose_planner("auto", "qwen2.5:7b", URL, transport), RuleBasedRoutePlanner)


def test_ollama_refuses_to_fall_back_and_names_what_is_installed() -> None:
    with pytest.raises(PlannerError, match=r"'qwen2.5:7b'.*llama3:8b"):
        choose_planner("ollama", "qwen2.5:7b", URL, TagsTransport(["llama3:8b"]))


def test_rules_never_touch_the_network() -> None:
    transport = TagsTransport(["qwen2.5:7b"])
    assert isinstance(choose_planner("rules", "qwen2.5:7b", URL, transport), RuleBasedRoutePlanner)
    assert transport.gets == []


class FakeProcess:
    """Records the commands run and replies with canned output."""

    def __init__(self, out: str = "", error: Exception | None = None) -> None:
        self.calls: list[tuple[list[str], str]] = []
        self.out, self.error = out, error

    def __call__(self, command: Sequence[str], stdin: str) -> str:
        self.calls.append((list(command), stdin))
        if self.error:
            raise self.error
        return self.out


def test_psql_rows_wrap_the_select_and_parse_json() -> None:
    process = FakeProcess('[{"slug": "lisbon"}]\n')
    rows = PsqlDatabase(["psql"], ["url"], process).rows("select slug from public.cities;")
    assert rows == [{"slug": "lisbon"}]
    command, stdin = process.calls[0]
    # Windows' psql ignores options that follow the connection string, so the URL comes last.
    assert command[0] == "psql" and command[-1] == "url" and "ON_ERROR_STOP=1" in command
    assert "json_agg" in stdin and "select slug from public.cities" in stdin


def test_psql_apply_runs_one_transaction_with_stop_on_error() -> None:
    process = FakeProcess()
    PsqlDatabase(["psql"], ["url"], process).apply("insert into x values (1);")
    command, stdin = process.calls[0]
    assert "--single-transaction" in command and "ON_ERROR_STOP=1" in command
    assert stdin == "insert into x values (1);"


def test_psql_failure_is_a_database_error() -> None:
    db = PsqlDatabase(["psql"], [], FakeProcess(error=DatabaseError("psql exited 3: nope")))
    with pytest.raises(DatabaseError, match="nope"):
        db.apply("x")


def test_database_uses_the_hosts_psql_else_the_supabase_container() -> None:
    host = choose_database("postgresql://u@h/db", which=lambda name: "/usr/bin/psql")
    assert (host.program, host.connection) == (["psql"], ["postgresql://u@h/db"])
    docker = choose_database(container="supabase_db_x", which=lambda name: None)
    assert docker.program == ["docker", "exec", "-i", "supabase_db_x", "psql"]
    assert docker.connection == ["-U", "postgres"]


def test_local_store_adds_replaces_and_survives_a_restart(tmp_path: Path) -> None:
    from local_fakes import make_builder

    builder, _, _, store = make_builder(tmp_path)
    city = builder.build(SINTRA, lambda *a, **k: None)
    assert city.slug == "sintra"
    reopened = LocalStore(store.directory)
    assert [c.slug for c in reopened.cities()] == ["sintra"]
    reopened.add_city(reopened.cities()[0])
    assert len(reopened.cities()) == 1


def test_reverse_answer_becomes_a_place() -> None:
    doc = {
        "lat": "38.8",
        "lon": "-9.38",
        "name": "Sintra",
        "boundingbox": ["38.7", "38.9", "-9.5", "-9.2"],
        "address": {"municipality": "Sintra", "country_code": "pt"},
        "extratags": {"wikidata": "Q131526"},
        "namedetails": {"name": "Sintra", "name:pt": "Sintra"},
    }
    assert parse_reverse(doc) == SINTRA.__class__(**{**SINTRA.__dict__, "name_pt": "Sintra"})


def test_reverse_answer_without_a_city_is_none() -> None:
    assert parse_reverse({"error": "Unable to geocode"}) is None
    assert parse_reverse({"lat": "0", "lon": "0", "boundingbox": ["0", "1", "0", "1"]}) is None


class FakeNominatim:
    """Records requests like ``HttpClient.request``; answers ``/reverse`` and ``/search`` apart."""

    def __init__(self, reverse: dict[str, Any], search: list[dict[str, Any]] | None = None) -> None:
        self.docs = {"reverse": reverse, "search": search or []}
        self.requests: list[tuple[str, dict[str, Any]]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        endpoint = url.rsplit("/", 1)[1]
        self.requests.append((endpoint, kwargs["params"]))
        return 200, json.dumps(self.docs[endpoint])


def _hit(name: str, kind: str, qid: str, box: list[str], **address: str) -> dict[str, Any]:
    """A Nominatim result: a parish, a municipality, a county… (``box`` = s, n, w, e)."""
    return {
        "lat": "38.8",
        "lon": "-9.38",
        "name": name,
        "category": "boundary",
        "type": "administrative",
        "addresstype": kind,
        "boundingbox": box,
        "extratags": {"wikidata": qid},
        "address": {"country_code": "pt", **address},
        "namedetails": {"name": name},
    }


PARISH = _hit(
    "Sintra (Santa Maria e São Miguel)", "city", "Q25444964", ["38.73", "38.83", "-9.45", "-9.34"],
    municipality="Sintra",
)  # fmt: skip
MUNICIPALITY = _hit("Sintra", "municipality", "Q190187", ["38.73", "38.93", "-9.50", "-9.22"])
COUNTY = _hit("Lisbon", "county", "Q207199", ["38.67", "39.31", "-9.50", "-8.78"])


def test_geocoder_asks_for_the_city_level_with_extra_tags() -> None:
    client = FakeNominatim({"error": "Unable to geocode"})
    assert NominatimGeocoder(client).reverse(38.8, -9.38) is None
    endpoint, params = client.requests[0]
    assert endpoint == "reverse" and params["zoom"] == 10
    assert params["extratags"] == 1 and params["namedetails"] == 1
    assert params["lat"] == "38.80000" and params["lon"] == "-9.38000"


def test_a_nominatim_answer_that_is_not_json_names_the_answer() -> None:
    class Blocked:
        def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
            return 200, "<html>Access blocked</html>"

    with pytest.raises(ValueError, match=r"reverse.*Access blocked"):
        NominatimGeocoder(Blocked()).reverse(38.8, -9.38)


def test_a_parish_hit_is_widened_to_the_municipality_around_the_point() -> None:
    """Nominatim's "city" level can be a parish of Sintra: the city is the municipality."""
    client = FakeNominatim(PARISH, search=[COUNTY, MUNICIPALITY])
    place = NominatimGeocoder(client).reverse(38.8, -9.38)
    assert place is not None
    assert (place.name_en, place.wikidata_id) == ("Sintra", "Q190187")
    assert place.bbox == (38.73, -9.50, 38.93, -9.22)
    endpoint, params = client.requests[1]
    assert endpoint == "search" and params["q"] == "Sintra" and params["countrycodes"] == "pt"


def test_a_municipality_must_hold_the_point_and_not_be_a_county() -> None:
    elsewhere = _hit("Sintra", "municipality", "Q1", ["10", "11", "10", "11"])
    client = FakeNominatim(PARISH, search=[COUNTY, elsewhere])
    place = NominatimGeocoder(client).reverse(38.8, -9.38)
    assert place is not None and place.wikidata_id == "Q25444964"
    assert place.name_en == "Sintra"  # the parenthesised parish names are dropped


class FakeSparql:
    """A Wikidata endpoint that answers every query with the same bindings."""

    def __init__(self, bindings: list[dict[str, Any]]) -> None:
        self.bindings, self.queries = bindings, []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        self.queries.append(kwargs["data"]["query"])
        return 200, json.dumps({"results": {"bindings": self.bindings}})


def _literal(value: str) -> dict[str, str]:
    return {"type": "literal", "value": value}


def test_labels_come_from_wikidata_and_a_missing_one_is_none() -> None:
    names = WikidataNames(FakeSparql([{"en": _literal("Sintra")}]))
    assert names.labels("Q131526") == ("Sintra", None)
    assert WikidataNames(FakeSparql([])).labels("Q1") == (None, None)


def test_find_city_escapes_the_name_and_returns_the_item() -> None:
    client = FakeSparql([{"item": {"type": "uri", "value": "http://www.wikidata.org/entity/Q9"}}])
    assert WikidataNames(client).find_city('Say "Hi"', "PT") == "Q9"
    assert 'Say \\"Hi\\"' in client.queries[0] and '"PT"' in client.queries[0]


def test_nominatim_gets_a_polite_policy() -> None:
    assert POLICIES["nominatim.openstreetmap.org"].min_interval >= 1.0


def test_serve_command_defaults() -> None:
    args = cli.build_parser().parse_args(["serve"])
    assert (args.host, args.port, args.planner, args.model) == (
        "127.0.0.1", 8787, "auto", "qwen2.5:7b",
    )  # fmt: skip
    assert args.db_url.startswith("postgresql://postgres:postgres@127.0.0.1:54322/")


def test_serve_command_options() -> None:
    argv = ["serve", "--port", "9000", "--planner", "rules", "--db-url", "postgresql://x/y"]
    args = cli.build_parser().parse_args(argv)
    assert (args.port, args.planner, args.db_url) == (9000, "rules", "postgresql://x/y")
