"""What the app asks of the service: resolve a position, then poll the build (D-079).

``resolve`` answers with an HTTP status and a JSON body, so the server layer stays a thin
translation. A city already in the database is ``ready`` at once; any other is built in the
background and the app polls its job.
"""

from __future__ import annotations

import re
from typing import Any, Protocol

from ..integrations.extras import ExtrasApi
from .build import CityBuilder
from .database import Database
from .errors import BadRequest, PlanUnavailable
from .jobs import Job, JobBoard
from .places import Geocoder, Place
from .plan import PlanAssistant
from .plan_requests import question_request, rank_request
from .search import PlaceHit

MIN_QUERY_CHARS = 2
DEFAULT_LIMIT = 6
MAX_LIMIT = 10

Answer = tuple[int, dict[str, Any]]


def parse_position(payload: Any) -> tuple[float, float]:
    """``{"lat": .., "lng": ..}`` → ``(lat, lng)``, or ``BadRequest`` naming what is wrong."""
    if not isinstance(payload, dict):
        raise BadRequest(f'body {payload!r} is not an object; expected {{"lat": .., "lng": ..}}')
    lat, lng = _coordinate(payload, "lat", 90.0), _coordinate(payload, "lng", 180.0)
    return lat, lng


def _coordinate(payload: dict[str, Any], name: str, limit: float) -> float:
    value = payload.get(name)
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise BadRequest(f"{name} {value!r} is not a number; expected -{limit:g}..{limit:g}")
    if not -limit <= value <= limit:
        raise BadRequest(f"{name} {value} is out of range; expected -{limit:g}..{limit:g}")
    return float(value)


class CitySearcher(Protocol):
    def search(self, query: str, limit: int) -> list[PlaceHit]: ...


def parse_search(params: dict[str, list[str]]) -> tuple[str, int]:
    """``?q=..&limit=..`` → ``(query, limit)``; ``BadRequest`` naming the offending value."""
    query = (params.get("q") or [""])[0].strip()
    if len(query) < MIN_QUERY_CHARS:
        raise BadRequest(
            f"q {query!r} is too short; expected at least {MIN_QUERY_CHARS} characters"
        )
    text = (params.get("limit") or [str(DEFAULT_LIMIT)])[0]
    if not text.isdigit() or not 1 <= int(text) <= MAX_LIMIT:
        raise BadRequest(f"limit {text!r} is not valid; expected an integer from 1 to {MAX_LIMIT}")
    return query, int(text)


__all__ = ["BadRequest", "CityService", "PlanUnavailable"]
MAX_NAME_CHARS = 100


def parse_hint(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    """The optional ``name`` and ``country_code`` of the search result the traveller picked."""
    name, code = payload.get("name"), payload.get("country_code")
    if name is not None:
        name = _hint_name(name)
    if code is not None:
        code = _hint_country(code)
    return name, code


def _hint_name(value: Any) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if not text or len(text) > MAX_NAME_CHARS:
        raise BadRequest(
            f"name {value!r} is not valid; expected 1 to {MAX_NAME_CHARS} characters of text"
        )
    return text


def _hint_country(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z]{2}", value.strip()):
        raise BadRequest(f"country_code {value!r} is not valid; expected 2 letters like 'PT'")
    return value.strip().upper()


def _failed(status: int, message: str) -> Answer:
    return status, {"status": "failed", "message": message}


class CityService:
    def __init__(
        self,
        geocoder: Geocoder,
        db: Database,
        builder: CityBuilder,
        board: JobBoard,
        searcher: CitySearcher | None = None,
        assistant: PlanAssistant | None = None,
        extras: ExtrasApi | None = None,
    ) -> None:
        self.geocoder, self.db, self.builder, self.board = geocoder, db, builder, board
        self.searcher = searcher
        self.assistant = assistant
        self.extras = extras or ExtrasApi()

    def plan_question(self, payload: Any) -> dict[str, Any]:
        """The wizard's next question (``POST /plan/question``); ``PlanUnavailable`` → 503."""
        language, answers = question_request(payload)
        return self._assistant().question(language, answers)

    def plan_rank(self, payload: Any) -> dict[str, Any]:
        """The wizard's shortlist with reasons (``POST /plan/rank``); ``PlanUnavailable`` → 503."""
        language, limit, answers, candidates = rank_request(payload)
        ranked = self._assistant().rank(language, limit, answers, candidates)
        self.extras.remember(language, answers, [pick["slug"] for pick in ranked["picks"]])
        return ranked

    def _assistant(self) -> PlanAssistant:
        if self.assistant is None:
            raise PlanUnavailable("no AI assistant is configured; expected one to answer")
        return self.assistant

    def search(self, params: dict[str, list[str]]) -> dict[str, Any]:
        """``{"results": [...]}`` for ``?q=<text>&limit=<1..10>``; the lookup's errors propagate."""
        if self.searcher is None:
            raise RuntimeError("city search is not configured; expected a searcher")
        query, limit = parse_search(params)
        return {"results": [hit.as_json() for hit in self.searcher.search(query, limit)]}

    def resolve(self, payload: Any) -> Answer:
        """``200 ready`` for a covered city, ``202 building`` with a job, else ``422``/``502``.
        ``name``/``country_code`` (optional) are the search result the traveller picked."""
        lat, lng = parse_position(payload)
        name, country_code = parse_hint(payload)
        try:
            place = self.geocoder.reverse(lat, lng, name, country_code)
        except Exception as exc:  # noqa: BLE001 - Nominatim down or offline
            return self._without_geocoder(lat, lng, exc)
        if place is None:
            return _failed(422, f"no city found at {lat}, {lng}; expected a point on land")
        identified = self.builder.identify(place)
        if identified is None:
            return _failed(
                422, f"{place.name_en!r} has no Wikidata item; expected one to ingest it"
            )
        return self._ready_or_build(identified)

    def job(self, job_id: str) -> dict[str, Any] | None:
        job = self.board.get(job_id)
        return job.snapshot() if job else None

    def _ready_or_build(self, place: Place) -> Answer:
        slug = self._slug_of(place.wikidata_id or "")
        if slug:
            return 200, {"status": "ready", "city_slug": slug}
        job = self.board.start(place.wikidata_id or "", lambda job: self._work(place, job))
        return 202, {"status": "building", "job_id": job.id, "stage": job.snapshot()["stage"]}

    def _work(self, place: Place, job: Job) -> None:
        def progress(stage: str, **fields: Any) -> None:
            job.update(stage=stage, **fields)

        result = self.builder.build(place, progress)
        job.update(city_slug=result.slug, attractions=result.attractions, routes=result.routes)

    def _slug_of(self, qid: str) -> str | None:
        rows = self.db.rows("select slug, wikidata_id, bbox from public.cities")
        return next((r["slug"] for r in rows if r["wikidata_id"] == qid), None)

    def _without_geocoder(self, lat: float, lng: float, exc: Exception) -> Answer:
        """Offline: a covered city whose box holds the point still answers; nothing new can."""
        for row in self.db.rows("select slug, wikidata_id, bbox from public.cities"):
            south, west, north, east = row["bbox"]
            if south <= lat <= north and west <= lng <= east:
                return 200, {"status": "ready", "city_slug": row["slug"]}
        return _failed(502, f"cannot look up ({lat}, {lng}): {type(exc).__name__}: {exc}")
