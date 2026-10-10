"""The local Supabase Postgres, reached through ``psql`` (no database driver dependency).

``psql`` is the host's when installed, else the one inside the Supabase Docker container, so the
service needs nothing beyond what ``supabase start`` already provides.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from collections.abc import Callable, Sequence
from typing import Any, Protocol

DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DEFAULT_CONTAINER = "supabase_db_wayfarer"
Row = dict[str, Any]
Runner = Callable[[Sequence[str], str], str]


class DatabaseError(RuntimeError):
    """The database refused a statement or could not be reached."""


class Database(Protocol):
    def rows(self, select: str) -> list[Row]:
        """The rows of a ``select`` as dicts."""
        ...

    def apply(self, sql: str) -> None:
        """Runs ``sql`` in one transaction: all of it, or none."""
        ...


def run_process(command: Sequence[str], stdin: str) -> str:
    """Runs a command with ``stdin``; its stdout, or a ``DatabaseError`` with its stderr."""
    try:
        done = subprocess.run(
            list(command), input=stdin, capture_output=True, text=True, encoding="utf-8"
        )
    except OSError as exc:
        raise DatabaseError(f"cannot run {command[0]!r}: {exc}; expected psql or docker") from exc
    if done.returncode != 0:
        raise DatabaseError(f"{command[0]} exited {done.returncode}: {done.stderr.strip()[:500]}")
    return done.stdout


class PsqlDatabase:
    """``psql`` as ``program`` (``["psql"]`` or a ``docker exec`` line) plus the ``connection``
    arguments. Options go between them: psql on Windows ignores any that follow the URL."""

    def __init__(
        self, program: Sequence[str], connection: Sequence[str], runner: Runner = run_process
    ) -> None:
        self.program, self.connection, self.runner = list(program), list(connection), runner

    def rows(self, select: str) -> list[Row]:
        wrapped = f"select coalesce(json_agg(t), '[]'::json) from ({select.rstrip('; ')}) t;"
        out = self.runner(self._command("-A", "-t"), wrapped)
        return json.loads(out.strip() or "[]")

    def apply(self, sql: str) -> None:
        self.runner(self._command("-q", "--single-transaction"), sql)

    def _command(self, *options: str) -> list[str]:
        stop_on_error = ["-X", "-v", "ON_ERROR_STOP=1", *options]
        return [*self.program, *stop_on_error, *self.connection]


def choose_database(
    db_url: str = DEFAULT_DB_URL,
    container: str = DEFAULT_CONTAINER,
    which: Callable[[str], str | None] = shutil.which,
) -> PsqlDatabase:
    """The host's ``psql`` when there is one, else ``docker exec`` into the Supabase container."""
    if which("psql"):
        return PsqlDatabase(["psql"], [db_url])
    return PsqlDatabase(["docker", "exec", "-i", container, "psql"], ["-U", "postgres"])
