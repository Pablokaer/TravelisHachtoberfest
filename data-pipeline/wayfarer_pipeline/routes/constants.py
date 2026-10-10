"""Limits and walking model of suggested routes."""

from __future__ import annotations

# Mirrors WALKING_DETOUR_FACTOR / WALKING_SPEED_M_PER_S in packages/shared/src/constants/index.ts
# (straight line × 1.3 ≈ street distance; 4.5 km/h) so a route's totals match what the app shows
# for the same stops. Keep the two in step.
WALKING_DETOUR_FACTOR = 1.3
WALKING_SPEED_M_PER_S = 1.25

# One outing: 3–8 places (ordering is exact for up to 8, see ordering.py) and at most ~5 km on foot.
ROUTE_MIN_STOPS = 3
ROUTE_MAX_STOPS = 8
ROUTE_MAX_WALK_M = 5000
# A group only gathers places this close (straight line) to its most popular place.
CLUSTER_RADIUS_M = 2000

MAX_ROUTES_PER_CITY = 8
# The pool a city's routes are drawn from: its most popular historic places.
MAX_CANDIDATES = 80
HISTORIC_CATEGORIES = frozenset(
    {"monument", "church", "castle", "palace", "museum", "landmark", "viewpoint"}
)

# Column limits of public.suggested_routes (migration 20261010000100).
TITLE_MAX_CHARS = 80
THEME_MAX_CHARS = 40

# Extra tries after a failed planner answer before the rule-based planner takes over.
PLANNER_RETRIES = 2
