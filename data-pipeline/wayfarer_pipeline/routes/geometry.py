"""Distances and walking time of a route, with the app's walking model."""

from __future__ import annotations

import math
from collections.abc import Sequence

from .constants import WALKING_DETOUR_FACTOR, WALKING_SPEED_M_PER_S
from .model import Candidate

EARTH_RADIUS_M = 6_371_008.8


def haversine_m(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
    """Great-circle distance in metres.

    >>> round(haversine_m(0, 0, 0, 0.01))
    1112
    """
    d_lat, d_lng = math.radians(lat_b - lat_a), math.radians(lng_b - lng_a)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat_a)) * math.cos(math.radians(lat_b)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def straight_m(a: Candidate, b: Candidate) -> float:
    return haversine_m(a.lat, a.lng, b.lat, b.lng)


def leg_m(a: Candidate, b: Candidate) -> float:
    """Estimated walk between two places: straight line × the street detour factor."""
    return straight_m(a, b) * WALKING_DETOUR_FACTOR


def path_m(stops: Sequence[Candidate]) -> float:
    """Estimated walk through ``stops`` in the given order (0 for one place).

    >>> path_m([a, b, c])  # leg a→b + leg b→c
    """
    return sum(leg_m(a, b) for a, b in zip(stops, stops[1:], strict=False))


def walking_seconds(meters: float) -> int:
    return round(meters / WALKING_SPEED_M_PER_S)
