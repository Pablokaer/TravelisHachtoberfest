"""Order a route's stops for the shortest walk (exact, Held-Karp over at most 8 places)."""

from __future__ import annotations

from collections.abc import Sequence

from .constants import ROUTE_MAX_STOPS
from .geometry import leg_m
from .model import Candidate

# best[(visited bitmask, last place)] = (walk so far, previous place)
_Table = dict[tuple[int, int], tuple[float, int]]


def _distances(stops: Sequence[Candidate]) -> list[list[float]]:
    return [[leg_m(a, b) for b in stops] for a in stops]


def _best_paths(dist: list[list[float]]) -> _Table:
    n = len(dist)
    best: _Table = {(1 << i, i): (0.0, -1) for i in range(n)}
    for mask in range(1, 1 << n):
        for last in range(n):
            if (mask, last) not in best:
                continue
            for nxt in range(n):
                if mask & (1 << nxt):
                    continue
                cost = best[(mask, last)][0] + dist[last][nxt]
                key = (mask | 1 << nxt, nxt)
                if key not in best or cost < best[key][0]:
                    best[key] = (cost, last)
    return best


def _rebuild(best: _Table, n: int) -> list[int]:
    full = (1 << n) - 1
    last = min(range(n), key=lambda i: best[(full, i)][0])
    path, mask = [], full
    while last >= 0:
        path.append(last)
        mask, last = mask & ~(1 << last), best[(mask, last)][1]
    return path[::-1]


def order_for_shortest_walk(stops: Sequence[Candidate]) -> list[Candidate]:
    """The open walk through every stop with the least distance, whatever its start.

    Deterministic: input is sorted by wikidata id first and the first best path wins, so
    re-running the pipeline never reshuffles a route.

    >>> [c.qid for c in order_for_shortest_walk(shuffled_line)]  # ['Q1', 'Q2', 'Q3']
    """
    if len(stops) > ROUTE_MAX_STOPS:
        raise ValueError(f"{len(stops)} stops; expected at most {ROUTE_MAX_STOPS}")
    ranked = sorted(stops, key=lambda c: int(c.qid[1:]))
    if len(ranked) < 2:
        return ranked
    best = _best_paths(_distances(ranked))
    return [ranked[i] for i in _rebuild(best, len(ranked))]
