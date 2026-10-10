"""City facts for the trip wizard (D-081): population and founding year from Wikidata, and the
number of OpenStreetMap beaches inside the city box. One file per city: ``data/facts/<slug>.json``.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any, Protocol

from . import sparql
from .attractions import overpass
from .config import City
from .paths import FACTS_DIR, prettier

BATCH = 50
SOURCES = ["wikidata", "openstreetmap"]

# P1082 population (statements dated by P585 point in time), P571 inception.
QUERY = """
SELECT ?item ?pop ?time ?inc WHERE {{
  VALUES ?item {{ {cities} }}
  OPTIONAL {{ ?item p:P1082 ?st . ?st ps:P1082 ?pop . OPTIONAL {{ ?st pq:P585 ?time }} }}
  OPTIONAL {{ ?item wdt:P571 ?inc }}
}}
"""
_YEAR = re.compile(r"^([+-]?)(\d{1,6})-")

CityFacts = dict[str, int | None]


class FactsClient(Protocol):
    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]: ...


def year_of(timestamp: str) -> int | None:
    """``1147-01-01T00:00:00Z`` → 1147, ``-0753-…`` → -753; ``None`` when it is no timestamp."""
    match = _YEAR.match(timestamp)
    if not match:
        return None
    year = int(match.group(2))
    return -year if match.group(1) == "-" else year


def pick_population(rows: list[dict[str, str]]) -> int | None:
    """The most recent dated statement (an undated one only when nothing is dated)."""
    stated = [r for r in rows if r.get("pop")]
    if not stated:
        return None
    latest = max(stated, key=lambda r: (r.get("time", ""), float(r["pop"])))
    return int(float(latest["pop"]))


def pick_inception(rows: list[dict[str, str]]) -> int | None:
    """The earliest inception claim: the founding rather than a later refoundation."""
    years = [y for r in rows if r.get("inc") and (y := year_of(r["inc"])) is not None]
    return min(years) if years else None


def fetch_wikidata(client: FactsClient, qids: list[str]) -> dict[str, CityFacts]:
    """``{qid: {population, inception_year}}`` for each id, ``None`` for a missing value.

    >>> fetch_wikidata(client, ["Q597"])  # {"Q597": {"population": 545796, "inception_year": ...}}
    """
    rows_by_qid: dict[str, list[dict[str, str]]] = {q: [] for q in qids}
    for batch in sparql.chunks(qids, BATCH):
        query = QUERY.format(cities=sparql.values(batch))
        for row in sparql.run(client, query):
            rows_by_qid[row["item"]].append(row)
    return {
        q: {"population": pick_population(rows), "inception_year": pick_inception(rows)}
        for q, rows in rows_by_qid.items()
    }


def build_city(
    client: FactsClient, city: City, wikidata: CityFacts, today: date | None = None
) -> dict[str, Any]:
    """The city's snapshot: Wikidata's facts (from ``fetch_wikidata``) plus its OSM beaches."""
    return {
        "city": city.slug,
        "retrieved": (today or date.today()).isoformat(),
        "sources": SOURCES,
        "population": wikidata.get("population"),
        "inception_year": wikidata.get("inception_year"),
        "beach_count": overpass.fetch_beach_count(client, city.bbox),
    }


def save(doc: dict[str, Any], directory: Path = FACTS_DIR, format_json: bool = True) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{doc['city']}.json"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    if format_json:
        prettier(path)
    return path


def load_all(directory: Path = FACTS_DIR) -> dict[str, dict[str, Any]]:
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))
    }


def summary_line(docs: dict[str, dict[str, Any]]) -> str:
    """``"198 cities: 190 with population, 150 with a founding year, 90 with beaches"``."""
    n = len(docs)
    pop = sum(1 for d in docs.values() if d.get("population") is not None)
    inc = sum(1 for d in docs.values() if d.get("inception_year") is not None)
    beaches = sum(1 for d in docs.values() if d.get("beach_count"))
    return f"{n} cities: {pop} with population, {inc} with a founding year, {beaches} with beaches"
