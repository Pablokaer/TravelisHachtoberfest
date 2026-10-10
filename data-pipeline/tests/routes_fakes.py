"""Named fakes and builders shared by the suggested-routes tests (no network, no Ollama)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from wayfarer_pipeline.routes.model import (
    Candidate,
    PlannerContext,
    PlannerError,
    Proposal,
)

CONTEXT = PlannerContext(city_en="Lisbon", city_pt="Lisboa")


def make_candidate(qid: str, lat: float, lng: float, **kw: Any) -> Candidate:
    base: dict[str, Any] = {
        "name_en": f"Place {qid}",
        "name_pt": None,
        "category": "church",
        "popularity": 50,
        "avg_visit_minutes": 30,
        "description_en": "a place",
    }
    return Candidate(qid=qid, lat=lat, lng=lng, **{**base, **kw})


def attraction_json(qid: str, lat: float, lng: float, **kw: Any) -> dict[str, Any]:
    """One entry of ``data/attractions/<city>.json`` (only the fields routes read)."""
    base: dict[str, Any] = {
        "wikidata_id": qid,
        "name_en": f"Place {qid}",
        "name_pt": None,
        "description_en": "a place",
        "category": "church",
        "lat": lat,
        "lng": lng,
        "is_unesco": False,
        "avg_visit_minutes": 30,
        "popularity": 50,
    }
    return {**base, **kw}


def line_of_places(count: int, step_deg: float = 0.002) -> list[Candidate]:
    """``count`` places ~220 m apart along a meridian: a compact, walkable group."""
    return [
        make_candidate(f"Q{i + 1}", 38.70 + i * step_deg, -9.14, popularity=90 - i)
        for i in range(count)
    ]


class FakeOllamaTransport:
    """Stands in for the HTTP layer; records every request and replays scripted answers."""

    def __init__(self, replies: Sequence[dict[str, Any] | Exception], reachable: bool = True):
        self.replies = list(replies)
        self.reachable = reachable
        self.posts: list[tuple[str, dict[str, Any]]] = []

    def get_json(self, url: str) -> dict[str, Any]:
        if not self.reachable:
            raise PlannerError(f"cannot reach {url}; expected a running Ollama server")
        return {"models": []}

    def post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.posts.append((url, payload))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class ScriptedPlanner:
    """A planner that answers with fixed proposals, one list per call, then repeats the last."""

    def __init__(self, name: str, answers: Sequence[list[Proposal] | Exception]):
        self.name = name
        self.answers = list(answers)
        self.calls = 0

    def propose(self, group: Sequence[Candidate], context: PlannerContext) -> list[Proposal]:
        answer = self.answers[min(self.calls, len(self.answers) - 1)]
        self.calls += 1
        if isinstance(answer, Exception):
            raise answer
        return answer
