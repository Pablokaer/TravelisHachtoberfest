"""Pick the historic places a city's routes are drawn from."""

from __future__ import annotations

from typing import Any

from .constants import HISTORIC_CATEGORIES, MAX_CANDIDATES
from .model import Candidate


def _is_historic(item: dict[str, Any]) -> bool:
    # A UNESCO site stays whatever its category: a park or "other" listed by UNESCO is a sight.
    return item["category"] in HISTORIC_CATEGORIES or bool(item.get("is_unesco"))


def _candidate(item: dict[str, Any]) -> Candidate:
    return Candidate(
        qid=item["wikidata_id"],
        name_en=item["name_en"],
        name_pt=item.get("name_pt"),
        category=item["category"],
        lat=float(item["lat"]),
        lng=float(item["lng"]),
        popularity=int(item["popularity"]),
        avg_visit_minutes=int(item["avg_visit_minutes"]),
        description_en=item.get("description_en"),
    )


def select_candidates(doc: dict[str, Any]) -> list[Candidate]:
    """The city's most popular historic places, best first (ties by wikidata id).

    >>> select_candidates(json.load(open("data/attractions/lisbon.json")))[0].qid
    """
    picked = [_candidate(i) for i in doc["attractions"] if _is_historic(i)]
    picked.sort(key=lambda c: (-c.popularity, int(c.qid[1:])))
    return picked[:MAX_CANDIDATES]
