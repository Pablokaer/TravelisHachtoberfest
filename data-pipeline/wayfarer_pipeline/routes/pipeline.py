"""Build, save and load a city's suggested routes (``data/suggested_routes/<city>.json``)."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Sequence
from datetime import date
from pathlib import Path
from typing import Any

from ..paths import SUGGESTED_ROUTES_DIR, prettier
from . import candidates, clustering, geometry, ordering, validation
from .constants import PLANNER_RETRIES, ROUTE_MAX_WALK_M
from .model import Candidate, InvalidProposal, PlannerContext, PlannerError, Proposal, RoutePlanner

Route = dict[str, Any]


def route_from_proposal(
    proposal: Proposal, group: Sequence[Candidate], generated_by: str, slug: str
) -> Route:
    """A route row: the proposal's stops in shortest-walk order, with distance and times.

    Raises ``InvalidProposal`` when the walk is longer than the limit.

    >>> route_from_proposal(proposal, group, "rules", "old-town")["stops"]  # ['Q1', 'Q2', 'Q3']
    """
    by_id = {c.qid: c for c in group}
    ordered = ordering.order_for_shortest_walk([by_id[q] for q in proposal.stops])
    meters = round(geometry.path_m(ordered))
    if meters > ROUTE_MAX_WALK_M:
        raise InvalidProposal(f"walk of {meters} m; expected at most {ROUTE_MAX_WALK_M} m")
    return {
        "slug": slug,
        "theme": proposal.theme,
        "title_en": proposal.title_en,
        "title_pt": proposal.title_pt,
        "generated_by": generated_by,
        "stops": [c.qid for c in ordered],
        "distance_m": meters,
        "walking_seconds": geometry.walking_seconds(meters),
        "visit_minutes": sum(c.avg_visit_minutes for c in ordered),
    }


def _routes_from(
    planner: RoutePlanner, group: Sequence[Candidate], context: PlannerContext
) -> list[Route]:
    """One planner call, fully checked: every proposal validated, ordered and measured."""
    proposals = planner.propose(group, context)
    if not proposals:
        raise PlannerError(f"{planner.name} proposed no route; expected at least one")
    checked = [validation.validate_proposal(p, group) for p in proposals]
    return [
        route_from_proposal(p, group, planner.name, validation.slugify(p.title_en)) for p in checked
    ]


def _routes_for_group(
    group: Sequence[Candidate],
    context: PlannerContext,
    planner: RoutePlanner,
    fallback: RoutePlanner,
    retries: int,
) -> list[Route]:
    """The planner's routes for ``group``; after ``retries`` failed re-asks, the fallback's."""
    for _ in range(retries + 1):
        try:
            return _routes_from(planner, group, context)
        except (PlannerError, InvalidProposal):
            continue
    try:
        return _routes_from(fallback, group, context)
    except (PlannerError, InvalidProposal):
        return []


def build_city(
    doc: dict[str, Any],
    context: PlannerContext,
    planner: RoutePlanner,
    fallback: RoutePlanner,
    today: date,
    retries: int = PLANNER_RETRIES,
) -> dict[str, Any]:
    """The city's snapshot: groups of nearby historic places, each turned into route(s).

    >>> build_city(attractions_doc, context, OllamaRoutePlanner(), RuleBasedRoutePlanner(), today)
    """
    if retries < 0:
        raise ValueError(f"retries must be >= 0; got {retries}")
    groups = clustering.cluster(candidates.select_candidates(doc))
    routes = [r for g in groups for r in _routes_for_group(g, context, planner, fallback, retries)]
    taken: set[str] = set()
    for route in routes:
        route["slug"] = validation.unique_slug(route["title_en"], taken)
    return {"city": doc["city"], "generated": today.isoformat(), "routes": routes}


def save(
    doc: dict[str, Any], directory: Path = SUGGESTED_ROUTES_DIR, format_json: bool = True
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{doc['city']}.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if format_json:
        prettier(path)
    return path


def load_all(directory: Path = SUGGESTED_ROUTES_DIR) -> dict[str, dict[str, Any]]:
    """``{slug: doc}`` for every committed city file (empty when there is none)."""
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))
    }


def summary_line(docs: dict[str, dict[str, Any]]) -> str:
    """``"105 cities, 640 routes (rules 600, qwen2.5:7b 40)"`` for the CLI."""
    made = Counter(r["generated_by"] for d in docs.values() for r in d["routes"])
    by_planner = ", ".join(f"{name} {count}" for name, count in sorted(made.items()))
    total = f"{len(docs)} cities, {sum(made.values())} routes"
    return f"{total} ({by_planner})" if by_planner else total
