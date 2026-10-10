"""Background builds: one job per city, polled by the app while it works."""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from .build import BuildError
from .database import DatabaseError


@dataclass
class Job:
    """The state of one city build. Changed from the worker thread, read from request threads."""

    id: str
    key: str
    status: str = "building"
    stage: str = "locating"
    city_slug: str | None = None
    message: str | None = None
    attractions: int | None = None
    routes: int | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, **fields: Any) -> None:
        with self._lock:
            for name, value in fields.items():
                setattr(self, name, value)

    def snapshot(self) -> dict[str, Any]:
        """The JSON the app polls (``GET /jobs/<id>``)."""
        with self._lock:
            return {
                "status": self.status,
                "stage": self.stage,
                "city_slug": self.city_slug,
                "message": self.message,
                "attractions": self.attractions,
                "routes": self.routes,
            }


class JobBoard:
    """Starts jobs and finds them. A city being built is keyed (by Wikidata id) so that asking
    again while it builds returns the same job; a finished or failed one is built anew."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def start(self, key: str, work: Callable[[Job], None]) -> Job:
        """The running job for ``key``, or a new one running ``work(job)`` on its own thread."""
        with self._lock:
            running = next((j for j in self._jobs.values() if j.key == key and _building(j)), None)
            if running:
                return running
            job = Job(id=uuid.uuid4().hex[:12], key=key)
            self._jobs[job.id] = job
        threading.Thread(target=_run, args=(job, work), daemon=True).start()
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)


def _building(job: Job) -> bool:
    return job.snapshot()["status"] == "building"


def _run(job: Job, work: Callable[[Job], None]) -> None:
    """Runs ``work``; whatever it raises becomes the job's failure message, never a lost thread."""
    try:
        work(job)
        job.update(status="ready")
    except Exception as exc:  # noqa: BLE001 - reported to the app, with the exception's type
        job.update(status="failed", message=_describe(exc))


def _describe(exc: Exception) -> str:
    """Our own errors already say what is wrong; a library's needs its type to be understood."""
    if isinstance(exc, BuildError | DatabaseError):
        return str(exc)
    return f"{type(exc).__name__}: {exc}"
