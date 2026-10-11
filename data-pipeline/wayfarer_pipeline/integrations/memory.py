"""The trip planner's long-term memory in MongoDB Atlas (D-084).

After a shortlist is ranked, the interview's answers and the picked cities can be kept in an
Atlas collection, so the next plan can start from what the traveller liked before. It is
optional (off without ``MONGODB_URI``), best effort (a failed write never fails the plan) and
bounded (a capped number of short answers per entry, a capped read).
"""

from __future__ import annotations

import sys
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any, Protocol

from .errors import NotConfigured

DATABASE = "travelist"
COLLECTION = "plan_history"
MAX_ANSWERS = 12
MAX_ANSWER_CHARS = 300
MAX_PICKS = 10
MAX_RECENT = 20


class PlanHistory(Protocol):
    def record(self, entry: dict[str, Any]) -> None: ...

    def recent(self, limit: int) -> list[dict[str, Any]]: ...


def history_entry(
    language: str, answers: Sequence[Mapping[str, Any]], picks: Sequence[str]
) -> dict[str, Any]:
    """One bounded entry: the interview's answers (clipped) and the picked city slugs."""
    kept = [
        {
            "id": str(a.get("id", ""))[:40],
            "question": str(a.get("question", ""))[:MAX_ANSWER_CHARS],
            "answer": str(a.get("answer", ""))[:MAX_ANSWER_CHARS],
        }
        for a in answers[:MAX_ANSWERS]
    ]
    return {
        "at": datetime.now(UTC).isoformat(),
        "language": language,
        "answers": kept,
        "picks": [str(slug) for slug in picks[:MAX_PICKS]],
    }


class MongoPlanHistory:
    """A ``pymongo`` collection (or anything with ``insert_one`` and ``find``) as the history.

    >>> MongoPlanHistory(client["travelist"]["plan_history"]).recent(5)
    """

    def __init__(self, collection: Any) -> None:
        self.collection = collection

    def record(self, entry: dict[str, Any]) -> None:
        try:
            self.collection.insert_one(dict(entry))
        except Exception as exc:  # noqa: BLE001 - memory is optional: log and carry on
            print(
                f'{{"event": "plan_history_failed", "error": "{type(exc).__name__}"}}',
                file=sys.stderr,
            )

    def recent(self, limit: int) -> list[dict[str, Any]]:
        cursor = self.collection.find({}).sort("at", -1).limit(min(limit, MAX_RECENT))
        return [{k: v for k, v in doc.items() if k != "_id"} for doc in cursor]


def mongo_history_or_none(env: Mapping[str, str]) -> MongoPlanHistory | None:
    """The Atlas history when ``MONGODB_URI`` is set; ``NotConfigured`` when the driver is
    missing (so the operator is told to install it, not left with silent amnesia)."""
    uri = env.get("MONGODB_URI", "").strip()
    if not uri:
        return None
    try:
        import pymongo  # noqa: PLC0415 - optional dependency
    except ImportError as exc:
        raise NotConfigured(
            "MONGODB_URI is set but pymongo is missing; pip install pymongo"
        ) from exc
    client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=3000)
    return MongoPlanHistory(client[DATABASE][COLLECTION])
