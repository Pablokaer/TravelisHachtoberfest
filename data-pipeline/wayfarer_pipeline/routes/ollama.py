"""The language-model planner: a local Ollama server asked for structured JSON.

The model only ever sees ids, names, categories and short descriptions (no coordinates, no
links) and its answer is constrained by a JSON schema whose stop ids are an enum of the group's
ids, so it cannot name a place that does not exist. Code still validates the answer
(``validation``) and orders and measures the route: the model curates, it never computes.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any, Protocol

import requests

from .constants import ROUTE_MAX_STOPS, ROUTE_MIN_STOPS, THEME_MAX_CHARS
from .model import Candidate, PlannerContext, PlannerError, Proposal

DEFAULT_URL = "http://localhost:11434"
DEFAULT_MODEL = "qwen2.5:7b"
# Low: the same group should keep getting the same kind of route when the pipeline is re-run.
TEMPERATURE = 0.2
DESCRIPTION_CHARS = 120
REQUEST_FIELDS = ("theme", "title_en", "title_pt", "stops")

SYSTEM_PROMPT = (
    "You design short historic walking routes for visitors. From the list of places, pick "
    f"between {ROUTE_MIN_STOPS} and {ROUTE_MAX_STOPS} that go together by theme, period or "
    "story. Answer only with ids from the list. Give a short theme (1-3 lowercase words), "
    "a title in English and a title in Portuguese (each under 60 characters). Never invent "
    "places, facts or dates."
)


class OllamaTransport(Protocol):
    """The HTTP layer, owned by the project so tests can replace it with a named fake."""

    def get_json(self, url: str) -> dict[str, Any]: ...

    def post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]: ...


class RequestsOllamaTransport:
    """``requests`` against a local server; any failure surfaces as a ``PlannerError``."""

    def __init__(self, timeout: float = 300.0) -> None:
        self.timeout = timeout

    def get_json(self, url: str) -> dict[str, Any]:
        return self._send("GET", url)

    def post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._send("POST", url, json=payload)

    def _send(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = requests.request(method, url, timeout=self.timeout, **kwargs)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            raise PlannerError(f"{method} {url} failed: {exc}; expected a running Ollama") from exc


def _schema(group: Sequence[Candidate]) -> dict[str, Any]:
    text = {"type": "string"}
    ids = {"type": "array", "items": {"type": "string", "enum": [c.qid for c in group]}}
    return {
        "type": "object",
        "properties": {
            "theme": {"type": "string", "maxLength": THEME_MAX_CHARS},
            "title_en": text,
            "title_pt": text,
            "stops": {**ids, "minItems": ROUTE_MIN_STOPS, "maxItems": ROUTE_MAX_STOPS},
        },
        "required": list(REQUEST_FIELDS),
    }


def _describe(group: Sequence[Candidate], context: PlannerContext) -> str:
    places = [
        {
            "id": c.qid,
            "name": c.name_en,
            "category": c.category,
            "description": (c.description_en or "")[:DESCRIPTION_CHARS],
        }
        for c in group
    ]
    return f"City: {context.city_en} ({context.city_pt}).\nPlaces:\n{json.dumps(places)}"


def _parse(content: str) -> Proposal:
    try:
        answer = json.loads(content)
    except json.JSONDecodeError as exc:
        raise PlannerError(f"answer is not valid JSON: {content[:80]!r}") from exc
    missing = [f for f in REQUEST_FIELDS if not isinstance(answer, dict) or f not in answer]
    if missing:
        raise PlannerError(f"answer lacks {missing}; expected fields {list(REQUEST_FIELDS)}")
    return Proposal(
        theme=str(answer["theme"]),
        title_en=str(answer["title_en"]),
        title_pt=str(answer["title_pt"]),
        stops=tuple(str(s) for s in answer["stops"]),
    )


class OllamaRoutePlanner:
    """Asks an Ollama model to curate one route from a group of places.

    >>> OllamaRoutePlanner("qwen2.5:7b").propose(group, context)[0].stops  # ('Q2', 'Q1', 'Q3')
    """

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_URL,
        transport: OllamaTransport | None = None,
    ) -> None:
        self.name = model
        self.base_url = base_url.rstrip("/")
        self.transport = transport or RequestsOllamaTransport()

    def check_reachable(self) -> None:
        """Raises ``PlannerError`` naming the URL when the server does not answer."""
        self.transport.get_json(f"{self.base_url}/api/tags")

    def propose(self, group: Sequence[Candidate], context: PlannerContext) -> list[Proposal]:
        payload = {
            "model": self.name,
            "stream": False,
            "format": _schema(group),
            "options": {"temperature": TEMPERATURE},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _describe(group, context)},
            ],
        }
        reply = self.transport.post_json(f"{self.base_url}/api/chat", payload)
        return [_parse(str(reply.get("message", {}).get("content", "")))]
