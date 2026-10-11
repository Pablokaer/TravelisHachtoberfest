"""The optional partner integrations as one object the city service can hold (D-084).

Each one is off until its key is set; an endpoint of an integration that is off answers 503 with
the variable to set (``PlanUnavailable``), so the app can hide the feature. Nothing here is
required: the app, the city builder and the trip planner work without any of them.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from ..local.errors import BadRequest, PlanUnavailable
from ..routes.ollama import OllamaTransport
from .memory import PlanHistory, history_entry, mongo_history_or_none
from .semantic import DEFAULT_EMBED_MODEL, Embedder, OllamaEmbedder, SemanticSearch
from .transport import RequestsWebTransport
from .voice import ElevenLabsVoice
from .web_search import SerpApiSearch, WebSearch

MIN_QUERY_CHARS = 2
DEFAULT_LIMIT = 6
MAX_LIMIT = 10
_SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,59}")


class Voice(Protocol):
    def narrate(self, text: str) -> bytes: ...


class Semantic(Protocol):
    def search(self, query: str, city_slug: str | None, limit: int) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class Extras:
    """Whichever of the four integrations are configured; ``None`` means off."""

    web: WebSearch | None = None
    voice: Voice | None = None
    semantic: Semantic | None = None
    history: PlanHistory | None = None


def _query(params: Mapping[str, list[str]]) -> tuple[str, int]:
    query = (params.get("q") or [""])[0].strip()
    if len(query) < MIN_QUERY_CHARS:
        raise BadRequest(
            f"q {query!r} is too short; expected at least {MIN_QUERY_CHARS} characters"
        )
    return query, _limit(params)


def _limit(params: Mapping[str, list[str]]) -> int:
    text = (params.get("limit") or [str(DEFAULT_LIMIT)])[0]
    if not text.isdigit() or not 1 <= int(text) <= MAX_LIMIT:
        raise BadRequest(f"limit {text!r} is not valid; expected an integer from 1 to {MAX_LIMIT}")
    return int(text)


def _city(params: Mapping[str, list[str]]) -> str | None:
    city = (params.get("city") or [""])[0].strip()
    if city and not _SLUG.fullmatch(city):
        raise BadRequest(f"city {city!r} is not a slug; expected lowercase letters, digits, '-'")
    return city or None


def _off(feature: str, how: str) -> PlanUnavailable:
    return PlanUnavailable(f"{feature} is off; expected {how}")


class ExtrasApi:
    """What the HTTP layer asks of the integrations: parsed requests in, JSON-able answers out."""

    def __init__(self, extras: Extras | None = None) -> None:
        self.extras = extras or Extras()

    def web_tips(self, params: Mapping[str, list[str]]) -> dict[str, Any]:
        """``GET /places/web?q=&limit=``: live web results (SerpApi)."""
        if self.extras.web is None:
            raise _off("web search", "SERPAPI_API_KEY to be set")
        query, limit = _query(params)
        return {"results": self.extras.web.search(query, limit)}

    def attractions(self, params: Mapping[str, list[str]]) -> dict[str, Any]:
        """``GET /search/attractions?q=&city=&limit=``: semantic + keyword search (pgvector)."""
        if self.extras.semantic is None:
            raise _off("semantic search", "an embedding model (ollama pull nomic-embed-text)")
        query, limit = _query(params)
        return {"results": self.extras.semantic.search(query, _city(params), limit)}

    def narrate(self, payload: Any) -> bytes:
        """``POST /narrate {"text"}``: MP3 bytes (ElevenLabs)."""
        if self.extras.voice is None:
            raise _off("narration", "ELEVENLABS_API_KEY to be set")
        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str):
            raise BadRequest(f'body {payload!r} has no text; expected {{"text": "..."}}')
        return self.extras.voice.narrate(text)

    def history(self, params: Mapping[str, list[str]]) -> dict[str, Any]:
        """``GET /plan/history?limit=``: the planner's remembered interviews (MongoDB Atlas)."""
        if self.extras.history is None:
            raise _off("plan history", "MONGODB_URI to be set")
        return {"entries": self.extras.history.recent(_limit(params))}

    def remember(
        self, language: str, answers: Sequence[Mapping[str, Any]], picks: Sequence[str]
    ) -> None:
        """Keeps a ranked shortlist in the history when there is one; never raises."""
        if self.extras.history is not None:
            self.extras.history.record(history_entry(language, answers, picks))


def build_extras(
    env: Mapping[str, str], db: Any, ollama_url: str, ollama: OllamaTransport
) -> Extras:
    """The integrations the environment configures (``SERPAPI_API_KEY``, ``ELEVENLABS_API_KEY``,
    ``MONGODB_URI``) plus semantic search whenever a database is given."""
    web = RequestsWebTransport()
    embedder: Embedder = OllamaEmbedder(DEFAULT_EMBED_MODEL, ollama_url, ollama)
    return Extras(
        web=SerpApiSearch(env["SERPAPI_API_KEY"], web) if env.get("SERPAPI_API_KEY") else None,
        voice=ElevenLabsVoice.from_env(env, web) if env.get("ELEVENLABS_API_KEY") else None,
        semantic=SemanticSearch(db, embedder),
        history=mongo_history_or_none(env),
    )
