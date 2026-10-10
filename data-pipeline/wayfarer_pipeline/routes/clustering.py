"""Group a city's places into outings: compact sets that fit one walk."""

from __future__ import annotations

from collections.abc import Sequence

from .constants import (
    CLUSTER_RADIUS_M,
    MAX_ROUTES_PER_CITY,
    ROUTE_MAX_STOPS,
    ROUTE_MAX_WALK_M,
    ROUTE_MIN_STOPS,
)
from .geometry import path_m, straight_m
from .model import Candidate


def _ranked(places: Sequence[Candidate]) -> list[Candidate]:
    return sorted(places, key=lambda c: (-c.popularity, int(c.qid[1:])))


def _fits_a_walk(group: Sequence[Candidate]) -> bool:
    """Whether the group can be walked within the limit; a nearest-neighbour walk bounds it
    from above, which is cheap and stable (the exact order is computed once routes are built)."""
    remaining, walk = list(group[1:]), [group[0]]
    while remaining:
        walk.append(min(remaining, key=lambda c: straight_m(walk[-1], c)))
        remaining.remove(walk[-1])
    return path_m(walk) <= ROUTE_MAX_WALK_M


def _group_around(seed: Candidate, free: Sequence[Candidate]) -> list[Candidate]:
    """The seed plus its nearest free places, while the group stays one walkable outing."""
    near = sorted(
        (c for c in free if c is not seed and straight_m(seed, c) <= CLUSTER_RADIUS_M),
        key=lambda c: (straight_m(seed, c), int(c.qid[1:])),
    )
    group = [seed]
    for place in near:
        if len(group) == ROUTE_MAX_STOPS:
            break
        if _fits_a_walk([*group, place]):
            group.append(place)
    return group


def _score(group: Sequence[Candidate]) -> tuple[int, int]:
    return (-sum(c.popularity for c in group), int(group[0].qid[1:]))


def cluster(places: Sequence[Candidate]) -> list[list[Candidate]]:
    """Disjoint groups of 3–8 nearby places, the most popular groups first (at most 8 groups).

    Greedy and deterministic: the most popular free place seeds a group of its nearest free
    neighbours; a seed that finds too few neighbours is left out and the next one is tried.

    >>> [len(g) for g in cluster(select_candidates(doc))]  # [8, 8, 6, 5, …]
    """
    free, groups = _ranked(places), []
    while free:
        group = _group_around(free[0], free)
        if len(group) >= ROUTE_MIN_STOPS:
            groups.append(group)
        taken = {c.qid for c in group} if len(group) >= ROUTE_MIN_STOPS else {free[0].qid}
        free = [c for c in free if c.qid not in taken]
    return sorted(groups, key=_score)[:MAX_ROUTES_PER_CITY]
