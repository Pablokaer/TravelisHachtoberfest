"""City facts for the trip wizard: population and founding year (Wikidata), beaches (OSM)."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from test_climate import city

from wayfarer_pipeline import facts, seed_city_data
from wayfarer_pipeline.attractions import overpass


def _uri(qid: str) -> dict[str, str]:
    return {"type": "uri", "value": f"http://www.wikidata.org/entity/{qid}"}


def _lit(value: str) -> dict[str, str]:
    return {"type": "literal", "value": value}


class FakeWikidata:
    """A SPARQL endpoint answering every query with the same bindings."""

    def __init__(self, bindings: list[dict[str, Any]]) -> None:
        self.bindings, self.queries = bindings, []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        self.queries.append(kwargs["data"]["query"])
        return 200, json.dumps({"results": {"bindings": self.bindings}})


class FakeOverpass:
    """Answers the beach count query with a ``total`` (or a raw body)."""

    def __init__(self, total: int | None = 12, body: str | None = None) -> None:
        self.total, self.body, self.requests = total, body, []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        self.requests.append((url, kwargs["data"]["data"]))
        if self.body is not None:
            return 200, self.body
        count = {"type": "count", "id": 0, "tags": {"nodes": "1", "total": str(self.total)}}
        return 200, json.dumps({"elements": [count]})


def test_years_are_signed_and_read_from_wikidata_timestamps() -> None:
    assert facts.year_of("1147-01-01T00:00:00Z") == 1147
    assert facts.year_of("-0753-04-21T00:00:00Z") == -753
    assert facts.year_of("+0050-01-01T00:00:00Z") == 50
    assert facts.year_of("not a date") is None


def test_the_latest_population_statement_wins() -> None:
    rows = [
        {"item": "Q597", "pop": "500000", "time": "2011-01-01T00:00:00Z"},
        {"item": "Q597", "pop": "545000", "time": "2021-01-01T00:00:00Z"},
        {"item": "Q597", "pop": "300000"},  # undated: the oldest guess
    ]
    assert facts.pick_population(rows) == 545000
    assert facts.pick_population([{"item": "Q597"}]) is None


def test_the_earliest_inception_is_the_founding_year() -> None:
    rows = [
        {"item": "Q597", "inc": "1147-01-01T00:00:00Z"},
        {"item": "Q597", "inc": "-0800-01-01T00:00:00Z"},
    ]
    assert facts.pick_inception(rows) == -800
    assert facts.pick_inception([{"item": "Q597"}]) is None


def test_wikidata_is_asked_once_for_a_batch_of_cities() -> None:
    client = FakeWikidata(
        [
            {"item": _uri("Q597"), "pop": _lit("545000"), "time": _lit("2021-01-01T00:00:00Z")},
            {"item": _uri("Q597"), "inc": _lit("1147-01-01T00:00:00Z")},
            {"item": _uri("Q90")},
        ]
    )
    found = facts.fetch_wikidata(client, ["Q597", "Q90"])
    assert found == {
        "Q597": {"population": 545000, "inception_year": 1147},
        "Q90": {"population": None, "inception_year": None},
    }
    assert len(client.queries) == 1
    assert "wd:Q597" in client.queries[0] and "P1082" in client.queries[0]
    assert "P571" in client.queries[0]


def test_beaches_are_counted_with_overpass_inside_the_city_box() -> None:
    client = FakeOverpass(total=12)
    assert overpass.fetch_beach_count(client, (38.6, -9.3, 38.8, -9.0)) == 12
    url, query = client.requests[0]
    assert url == overpass.ENDPOINT
    assert 'nwr["natural"="beach"](38.6,-9.3,38.8,-9.0)' in query and "out count" in query


def test_an_overpass_timeout_is_an_error_not_zero_beaches() -> None:
    body = json.dumps({"elements": [], "remark": "runtime error: Query timed out"})
    with pytest.raises(ValueError, match="timed out"):
        overpass.fetch_beach_count(FakeOverpass(body=body), (0, 0, 1, 1))


def test_a_city_snapshot_joins_wikidata_and_osm() -> None:
    doc = facts.build_city(
        FakeOverpass(total=7),
        city(),
        {"population": 545000, "inception_year": None},
        today=date(2026, 10, 10),
    )
    assert doc == {
        "city": "lisbon",
        "retrieved": "2026-10-10",
        "sources": ["wikidata", "openstreetmap"],
        "population": 545000,
        "inception_year": None,
        "beach_count": 7,
    }


def test_snapshots_round_trip(tmp_path: Path) -> None:
    doc = facts.build_city(FakeOverpass(total=0), city(), {}, today=date(2026, 1, 1))
    facts.save(doc, tmp_path, format_json=False)
    assert facts.load_all(tmp_path) == {"lisbon": doc}
    assert doc["population"] is None and doc["beach_count"] == 0


def test_facts_seed_is_an_idempotent_upsert_with_nulls() -> None:
    docs = {
        "lisbon": {"population": 545000, "inception_year": -1200, "beach_count": 7},
        "aachen": {"population": None, "inception_year": None, "beach_count": 0},
    }
    sql = seed_city_data.facts_sql(docs)
    assert (
        "insert into public.city_facts (city_slug, population, inception_year, beach_count)" in sql
    )
    assert "on conflict (city_slug) do update set" in sql
    assert sql.index("('aachen', null, null, 0)") < sql.index("('lisbon', 545000, -1200, 7)")
    assert "updated_at" not in sql  # the table has no such column
