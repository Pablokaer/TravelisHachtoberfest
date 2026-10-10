"""Wikidata queries for a city's notable people (D-071).

Two cheap queries find who was born (P19) or died (P20) in the city, with their sitelink count
as fame; one query per batch then reads the details of the best known. A single query joining
both relations timed out on the Query Service for big cities.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote

from .. import sparql
from ..attractions.wikidata import commons_filename
from ..sparql import WikidataClient

MIN_SITELINKS = 20  # Wikipedia editions with an article: keeps the list to well-known people
# Small cities (Paraty, Olinda, even Florianópolis) have almost nobody that famous; below
# ENOUGH_PEOPLE the bar drops to SMALL_CITY_SITELINKS.
ENOUGH_PEOPLE = 12
SMALL_CITY_SITELINKS = 8

CONNECTED_QUERY = """
SELECT ?p ?l WHERE {{
  ?p wdt:{relation} wd:{city} ; wikibase:sitelinks ?l .
  FILTER(?l >= {min_sitelinks})
}}
"""

DETAILS_QUERY = """
SELECT ?p ?en ?mul ?pt ?den ?dpt ?birth ?death ?image ?wen ?wpt
       (GROUP_CONCAT(DISTINCT ?occ) AS ?occs) WHERE {{
  VALUES ?p {{ {people} }}
  ?p wdt:P31 wd:Q5 .
  OPTIONAL {{ ?p wdt:P106 ?occ }}
  OPTIONAL {{ ?p rdfs:label ?en FILTER(LANG(?en) = "en") }}
  OPTIONAL {{ ?p rdfs:label ?mul FILTER(LANG(?mul) = "mul") }}
  OPTIONAL {{ ?p rdfs:label ?pt FILTER(LANG(?pt) = "pt") }}
  OPTIONAL {{ ?p schema:description ?den FILTER(LANG(?den) = "en") }}
  OPTIONAL {{ ?p schema:description ?dpt FILTER(LANG(?dpt) = "pt") }}
  OPTIONAL {{ ?p wdt:P569 ?birth }}
  OPTIONAL {{ ?p wdt:P570 ?death }}
  OPTIONAL {{ ?p wdt:P18 ?image }}
  OPTIONAL {{ ?wen schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }}
  OPTIONAL {{ ?wpt schema:about ?p ; schema:isPartOf <https://pt.wikipedia.org/> }}
}} GROUP BY ?p ?en ?mul ?pt ?den ?dpt ?birth ?death ?image ?wen ?wpt
"""


@dataclass(frozen=True)
class Connection:
    sitelinks: int
    born_here: bool
    died_here: bool


def _relation_rows(
    client: WikidataClient, relation: str, city_qid: str, min_sitelinks: int
) -> dict[str, int]:
    query = CONNECTED_QUERY.format(relation=relation, city=city_qid, min_sitelinks=min_sitelinks)
    return {row["p"]: int(row["l"]) for row in sparql.run(client, query)}


def _connected_at(
    client: WikidataClient, city_qid: str, min_sitelinks: int
) -> dict[str, Connection]:
    born = _relation_rows(client, "P19", city_qid, min_sitelinks)
    died = _relation_rows(client, "P20", city_qid, min_sitelinks)
    return {
        qid: Connection(born.get(qid) or died[qid], qid in born, qid in died)
        for qid in sorted(born.keys() | died.keys())
    }


def connected_people(client: WikidataClient, city_qid: str) -> dict[str, Connection]:
    """``{qid: Connection}`` for well-known people born or died in the city; a city with fewer
    than ``ENOUGH_PEOPLE`` at ``MIN_SITELINKS`` is asked again with the lower bar.

    >>> connected_people(client, "Q597")["Q187019"]  # Pessoa: born and died in Lisbon
    """
    people = _connected_at(client, city_qid, MIN_SITELINKS)
    if len(people) >= ENOUGH_PEOPLE:
        return people
    return _connected_at(client, city_qid, SMALL_CITY_SITELINKS)


def year(value: str | None) -> int | None:
    """``"1888-06-13T00:00:00Z"`` → 1888; ``"-0500-01-01T…"`` → -500; unknown → ``None``."""
    if not value:
        return None
    sign, digits = (-1, value[1:]) if value.startswith("-") else (1, value)
    head = digits.split("-", 1)[0]
    return sign * int(head) if head.isdigit() else None


def _title(url: str | None) -> str | None:
    return unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ") if url else None


def _person(row: dict[str, str]) -> dict[str, Any]:
    return {
        "name_en": row.get("en") or row.get("mul"),
        "name_pt": row.get("pt"),
        "description_en": row.get("den"),
        "description_pt": row.get("dpt"),
        "birth_year": year(row.get("birth")),
        "death_year": year(row.get("death")),
        "image_file": commons_filename(row.get("image")),
        "wikipedia_en": _title(row.get("wen")),
        "wikipedia_pt": _title(row.get("wpt")),
        "occupations": sorted(o.rsplit("/", 1)[1] for o in row.get("occs", "").split()),
    }


def person_details(client: WikidataClient, qids: list[str]) -> dict[str, dict[str, Any]]:
    """``{qid: details}``; the first row wins when a person has several (two birth dates…).

    >>> person_details(client, ["Q187019"])["Q187019"]["name_en"]  # 'Fernando Pessoa'
    """
    details: dict[str, dict[str, Any]] = {}
    for batch in sparql.chunks(qids, 100):
        for row in sparql.run(client, DETAILS_QUERY.format(people=sparql.values(batch))):
            details.setdefault(row["p"], _person(row))
    return details
