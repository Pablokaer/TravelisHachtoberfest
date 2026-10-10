"""Reading the trip wizard's request bodies: ``BadRequest`` names the offending value."""

from __future__ import annotations

from typing import Any

from .errors import BadRequest

LANGUAGES = ("en", "pt")
MAX_ANSWERS = 30
MAX_CANDIDATES = 30
MAX_TEXT_CHARS = 500
DEFAULT_LIMIT = 6
MAX_LIMIT = 10


Answer = dict[str, str]  # {id, question, answer}: one answered question


def _object(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise BadRequest(f"body {payload!r} is not an object; expected a JSON object")
    return payload


def parse_language(payload: dict[str, Any]) -> str:
    language = payload.get("language")
    if language not in LANGUAGES:
        raise BadRequest(f"language {language!r} is not supported; expected 'en' or 'pt'")
    return str(language)


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or len(value) > MAX_TEXT_CHARS:
        raise BadRequest(
            f"{where} {value!r} is not text; expected up to {MAX_TEXT_CHARS} characters"
        )
    return value


def parse_answers(payload: dict[str, Any]) -> list[Answer]:
    raw = payload.get("answers")
    if not isinstance(raw, list) or len(raw) > MAX_ANSWERS:
        raise BadRequest(f"answers {raw!r} is not a list; expected at most {MAX_ANSWERS} entries")
    answers = []
    for i, item in enumerate(raw):
        entry = item if isinstance(item, dict) else {}
        for key in ("id", "question", "answer"):
            if key not in entry:
                raise BadRequest(f"answers[{i}] lacks {key!r}; expected id, question and answer")
        answers.append(
            {k: _text(entry[k], f"answers[{i}].{k}") for k in ("id", "question", "answer")}
        )
    return answers


def parse_limit(payload: dict[str, Any]) -> int:
    limit = payload.get("limit", DEFAULT_LIMIT)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= MAX_LIMIT:
        raise BadRequest(f"limit {limit!r} is not valid; expected an integer from 1 to {MAX_LIMIT}")
    return limit


def _candidate(item: Any, index: int) -> dict[str, Any]:
    entry = item if isinstance(item, dict) else {}
    for key in ("slug", "name"):
        if not isinstance(entry.get(key), str) or not entry[key].strip():
            raise BadRequest(f"candidates[{index}] lacks a text {key!r}; got {entry.get(key)!r}")
    distance = entry.get("distance_km")
    if distance is not None and (
        isinstance(distance, bool) or not isinstance(distance, int | float)
    ):
        raise BadRequest(f"candidates[{index}].distance_km {distance!r} is not a number")
    facts = entry.get("facts") or {}
    if not isinstance(facts, dict):
        raise BadRequest(f"candidates[{index}].facts {facts!r} is not an object")
    return {
        "slug": entry["slug"].strip(),
        "name": entry["name"].strip(),
        "country": str(entry.get("country") or ""),
        "distance_km": distance,
        "facts": {k: v for k, v in facts.items() if v is not None},
    }


def parse_candidates(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("candidates")
    count = len(raw) if isinstance(raw, list) else 0
    if not 1 <= count <= MAX_CANDIDATES:
        raise BadRequest(f"candidates has {count} entries; expected 1 to {MAX_CANDIDATES}")
    candidates = [_candidate(item, i) for i, item in enumerate(raw)]
    slugs = [c["slug"] for c in candidates]
    for slug in slugs:
        if slugs.count(slug) > 1:
            raise BadRequest(f"duplicate candidate slug {slug!r}; expected each city once")
    return candidates


def question_request(payload: Any) -> tuple[str, list[Answer]]:
    body = _object(payload)
    return parse_language(body), parse_answers(body)


def rank_request(payload: Any) -> tuple[str, int, list[Answer], list[dict[str, Any]]]:
    body = _object(payload)
    language, answers = parse_language(body), parse_answers(body)
    return language, parse_limit(body), answers, parse_candidates(body)
