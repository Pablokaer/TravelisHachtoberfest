"""The planner's long-term memory in MongoDB Atlas (D-084): optional, best effort, bounded."""

from __future__ import annotations

from typing import Any

import pytest

from wayfarer_pipeline.integrations.errors import NotConfigured
from wayfarer_pipeline.integrations.memory import (
    MAX_ANSWERS,
    MAX_RECENT,
    MongoPlanHistory,
    history_entry,
    mongo_history_or_none,
    resolve_mongo_uri,
)


class FakeCursor:
    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self.docs = docs

    def sort(self, key: str, direction: int) -> FakeCursor:
        return FakeCursor(sorted(self.docs, key=lambda d: d[key], reverse=direction < 0))

    def limit(self, count: int) -> FakeCursor:
        return FakeCursor(self.docs[:count])

    def __iter__(self):
        return iter(self.docs)


class FakeCollection:
    """The two pymongo collection calls the history uses, over a list."""

    def __init__(self) -> None:
        self.docs: list[dict[str, Any]] = []

    def insert_one(self, doc: dict[str, Any]) -> None:
        self.docs.append({**doc, "_id": len(self.docs)})

    def find(self, query: dict[str, Any]) -> FakeCursor:
        return FakeCursor([dict(d) for d in self.docs])


class BrokenCollection:
    def insert_one(self, doc: dict[str, Any]) -> None:
        raise ConnectionError("atlas unreachable")


def test_an_entry_keeps_the_language_the_answers_and_the_picked_slugs() -> None:
    entry = history_entry("pt", [{"id": "month", "question": "When?", "answer": "May"}], ["sintra"])
    assert entry["language"] == "pt"
    assert entry["picks"] == ["sintra"]
    assert entry["answers"] == [{"id": "month", "question": "When?", "answer": "May"}]
    assert "at" in entry


def test_an_entry_is_bounded_so_the_collection_cannot_grow_without_limit() -> None:
    answers = [{"id": str(i), "question": "q", "answer": "a" * 900} for i in range(MAX_ANSWERS + 5)]
    entry = history_entry("en", answers, ["x"] * 99)
    assert len(entry["answers"]) == MAX_ANSWERS
    assert all(len(a["answer"]) <= 300 for a in entry["answers"])
    assert len(entry["picks"]) <= 10


def test_recording_then_reading_returns_the_newest_first_without_mongo_ids() -> None:
    history = MongoPlanHistory(FakeCollection())
    older = {**history_entry("en", [], ["a"]), "at": "2026-10-01T10:00:00+00:00"}
    newer = {**history_entry("en", [], ["b"]), "at": "2026-10-02T10:00:00+00:00"}
    history.record(older)
    history.record(newer)
    recent = history.recent(5)
    assert [e["picks"] for e in recent] == [["b"], ["a"]]
    assert all("_id" not in e for e in recent)


def test_recent_never_returns_more_than_the_cap() -> None:
    history = MongoPlanHistory(FakeCollection())
    for _ in range(MAX_RECENT + 3):
        history.record(history_entry("en", [], ["a"]))
    assert len(history.recent(10_000)) == MAX_RECENT


def test_a_write_that_fails_is_swallowed_because_memory_is_never_required() -> None:
    MongoPlanHistory(BrokenCollection()).record(history_entry("en", [], ["a"]))


def test_without_a_uri_the_history_is_off() -> None:
    assert mongo_history_or_none({}) is None


def test_the_error_for_a_missing_driver_names_the_package(monkeypatch: pytest.MonkeyPatch) -> None:
    import builtins

    real_import = builtins.__import__

    def refuse_pymongo(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "pymongo":
            raise ImportError("no pymongo")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", refuse_pymongo)
    with pytest.raises(NotConfigured, match="pymongo"):
        mongo_history_or_none({"MONGODB_URI": "mongodb+srv://u:p@c.mongodb.net"})


ATLAS = "mongodb+srv://ann:<db_password>@cluster0.abc.mongodb.net/?appName=Cluster0"


def test_the_password_variable_replaces_the_placeholder_left_by_atlas() -> None:
    uri = resolve_mongo_uri({"MONGODB_URI": ATLAS, "MONGODB_PASSWORD": "s3cret"})
    assert uri == "mongodb+srv://ann:s3cret@cluster0.abc.mongodb.net/?appName=Cluster0"


def test_a_password_with_special_characters_is_percent_encoded() -> None:
    uri = resolve_mongo_uri({"MONGODB_URI": ATLAS, "MONGODB_PASSWORD": "p@ss:w/rd#1"})
    assert uri == "mongodb+srv://ann:p%40ss%3Aw%2Frd%231@cluster0.abc.mongodb.net/?appName=Cluster0"


def test_the_user_variable_replaces_the_user_of_the_uri() -> None:
    uri = resolve_mongo_uri({"MONGODB_URI": ATLAS, "MONGODB_USER": "bob", "MONGODB_PASSWORD": "pw"})
    assert uri.startswith("mongodb+srv://bob:pw@cluster0.abc.mongodb.net")


def test_a_host_only_uri_gets_the_user_and_password_variables() -> None:
    uri = resolve_mongo_uri(
        {
            "MONGODB_URI": "mongodb+srv://cluster0.abc.mongodb.net/?appName=Cluster0",
            "MONGODB_USER": "bob",
            "MONGODB_PASSWORD": "pw",
        }
    )
    assert uri == "mongodb+srv://bob:pw@cluster0.abc.mongodb.net/?appName=Cluster0"


def test_a_complete_uri_is_left_alone_and_so_is_an_absent_one() -> None:
    complete = "mongodb+srv://ann:real@cluster0.abc.mongodb.net/"
    assert resolve_mongo_uri({"MONGODB_URI": complete}) == complete
    assert resolve_mongo_uri({}) == ""


def test_a_placeholder_with_no_password_variable_is_reported_not_sent() -> None:
    with pytest.raises(NotConfigured, match="MONGODB_PASSWORD"):
        resolve_mongo_uri({"MONGODB_URI": ATLAS})
