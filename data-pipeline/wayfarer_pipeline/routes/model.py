"""Plain types shared by the route modules."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Candidate:
    """A historic place a route may visit (one entry of ``data/attractions/<city>.json``)."""

    qid: str
    name_en: str
    name_pt: str | None
    category: str
    lat: float
    lng: float
    popularity: int
    avg_visit_minutes: int
    description_en: str | None


@dataclass(frozen=True)
class Proposal:
    """What a planner suggests for one group: a theme, bilingual titles and the stops to keep."""

    theme: str
    title_en: str
    title_pt: str
    stops: tuple[str, ...]


@dataclass(frozen=True)
class PlannerContext:
    """Language hints for a planner: the city's names."""

    city_en: str
    city_pt: str


class PlannerError(RuntimeError):
    """A planner could not answer (server down, not JSON, fields missing)."""


class InvalidProposal(ValueError):
    """A proposal broke a rule of ``validation`` (unknown id, too few stops, too long a walk…)."""


class RoutePlanner(Protocol):
    """Turns a geographic group of places into route proposals."""

    name: str

    def propose(self, group: Sequence[Candidate], context: PlannerContext) -> list[Proposal]: ...
