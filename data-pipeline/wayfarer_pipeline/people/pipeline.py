"""A city's notable people (D-071): Wikidata → ``data/people/<slug>.json`` → ``50_people.sql``.

The best known people born or died in the city (by Wikipedia sitelinks), at most
``PER_CATEGORY`` per category and ``MAX_PER_CITY`` in all, each with a Commons photo and its
credit when the file is freely licensed.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..attractions import commons
from ..config import City
from ..paths import PEOPLE_DIR, prettier
from ..sparql import WikidataClient
from . import categories, wikidata

PER_CATEGORY = 12
MAX_PER_CITY = 40
CANDIDATES = 200  # best known connected people whose details are read

IMAGE_FIELDS = ("image_url", "image_author", "image_license", "image_license_url", "image_page_url")
FIELDS = (
    "wikidata_id",
    "name_en",
    "name_pt",
    "description_en",
    "description_pt",
    "categories",
    "birth_year",
    "death_year",
    "born_here",
    "died_here",
    *IMAGE_FIELDS,
    "wikipedia_en",
    "wikipedia_pt",
    "sitelinks",
)

Person = dict[str, Any]


def select(people: list[Person], per_category: int, max_total: int) -> list[Person]:
    """Best known first; a person is kept while one of their categories still has room.

    >>> select(people, per_category=12, max_total=40)
    """
    room = dict.fromkeys(categories.CATEGORIES, per_category)
    picked: list[Person] = []
    for person in sorted(people, key=lambda p: -p["sitelinks"]):
        if len(picked) == max_total:
            break
        if any(room.get(cat, 0) > 0 for cat in person["categories"]):
            picked.append(person)
            for cat in person["categories"]:
                room[cat] = room.get(cat, 0) - 1
    return picked


def _candidates(
    client: WikidataClient, city: City, lookup: categories.OccupationLookup
) -> list[Person]:
    connected = wikidata.connected_people(client, city.wikidata_id)
    best = sorted(connected, key=lambda q: -connected[q].sitelinks)[:CANDIDATES]
    details = wikidata.person_details(client, best)
    roots = lookup.roots({o for d in details.values() for o in d["occupations"]})
    return [
        {
            "wikidata_id": qid,
            **details[qid],
            "categories": categories.categories_for(details[qid]["occupations"], roots),
            "sitelinks": connected[qid].sitelinks,
            "born_here": connected[qid].born_here,
            "died_here": connected[qid].died_here,
        }
        for qid in best
        if qid in details and details[qid]["name_en"]
    ]


def _with_images(client: WikidataClient, people: list[Person]) -> list[Person]:
    images = commons.fetch(client, [p["image_file"] for p in people if p["image_file"]])
    for person in people:
        meta = images.get(person["image_file"] or "") or {}
        person.update({key: meta.get(key) for key in IMAGE_FIELDS})
    return people


def build_city(
    client: WikidataClient, city: City, lookup: categories.OccupationLookup | None = None
) -> dict[str, Any]:
    """``{"city", "retrieved", "people": [...]}``, best known first.

    >>> build_city(client, config.get("lisbon"))["people"][0]["name_en"]  # 'Luís de Camões'
    """
    lookup = lookup or categories.OccupationLookup(client)
    picked = select(_candidates(client, city, lookup), PER_CATEGORY, MAX_PER_CITY)
    people = _with_images(client, picked)
    return {
        "city": city.slug,
        "retrieved": datetime.now(UTC).date().isoformat(),
        "sources": ["wikidata", "wikimedia-commons"],
        "people": [{k: p.get(k) for k in FIELDS} for p in people],
    }


def save(doc: dict[str, Any], directory: Path = PEOPLE_DIR, format_json: bool = True) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{doc['city']}.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if format_json:
        prettier(path)
    return path


def load_all(directory: Path = PEOPLE_DIR) -> dict[str, dict[str, Any]]:
    """``{slug: doc}`` for every committed city file (empty when there is none)."""
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))
    }


def summary_line(docs: dict[str, dict[str, Any]]) -> str:
    """``"105 cities, 3,120 people: history 1,200, writer 800, …"`` for the CLI."""
    people = [p for doc in docs.values() for p in doc["people"]]
    counts = ", ".join(
        f"{cat} {sum(1 for p in people if cat in p['categories']):,}"
        for cat in categories.CATEGORIES
    )
    return f"{len(docs)} cities, {len(people):,} people: {counts}"
