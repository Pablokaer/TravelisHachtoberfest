"""`ingest --all --jobs N` (D-060): cities are ingested side by side — each API keeps its own rate
limit, since the HTTP client's per-host gates are shared — sharing one class cache, saved as they
finish and formatted with a single prettier run."""

from __future__ import annotations

import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from wayfarer_pipeline.attractions.pipeline import ingest_cities


class FakeIngest:
    """Stands in for ingest_city: waits until `together` cities are running at once (so it only
    finishes when they really run side by side) and records the class cache each one got."""

    def __init__(self, together: int):
        self.barrier = threading.Barrier(together, timeout=5)
        self.caches: list[int] = []

    def __call__(self, client: Any, city: Any, *, class_cache: dict, cache_lock: Any) -> dict:
        self.caches.append(id(class_cache))
        self.barrier.wait()
        return {"city": city.slug, "attractions": []}


class FakeFormatter:
    """Stands in for prettier: records each call's files."""

    def __init__(self):
        self.calls: list[tuple[Path, ...]] = []

    def __call__(self, *paths: Path) -> None:
        self.calls.append(paths)


def _cities(*slugs: str) -> list[Any]:
    return [SimpleNamespace(slug=slug) for slug in slugs]


def test_cities_run_side_by_side_and_come_back_in_their_order(tmp_path: Path):
    formatter = FakeFormatter()
    results = ingest_cities(
        client=None,
        cities=_cities("lisbon", "porto", "rome"),
        jobs=3,
        ingest=FakeIngest(together=3),
        write=lambda doc: tmp_path / f"{doc['city']}.json",
        formatter=formatter,
        class_cache={},
    )
    assert [doc["city"] for doc, _ in results] == ["lisbon", "porto", "rome"]
    assert formatter.calls == [tuple(tmp_path / f"{s}.json" for s in ("lisbon", "porto", "rome"))]


def test_every_city_uses_the_same_class_cache(tmp_path: Path):
    ingest = FakeIngest(together=2)
    cache: dict[str, list[str]] = {}
    ingest_cities(
        client=None,
        cities=_cities("lisbon", "porto"),
        jobs=2,
        ingest=ingest,
        write=lambda doc: tmp_path / f"{doc['city']}.json",
        formatter=FakeFormatter(),
        class_cache=cache,
    )
    assert ingest.caches == [id(cache), id(cache)]
