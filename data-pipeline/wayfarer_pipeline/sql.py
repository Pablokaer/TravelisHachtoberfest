"""Tiny, tested SQL literal writer for the generated seed files.

Seeds are plain SQL (no psql meta-commands) so they run under ``supabase db reset`` and
``supabase db push --include-seed``. Postgres runs with ``standard_conforming_strings = on``
so the only escape needed inside ``'...'`` is doubling single quotes.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

BATCH_SIZE = 500


@dataclass(frozen=True)
class Raw:
    """A SQL fragment emitted verbatim (e.g. a function call)."""

    sql: str


def quote(text: str) -> str:
    if "\x00" in text:
        raise ValueError("NUL bytes cannot be stored in Postgres text")
    return "'" + text.replace("'", "''") + "'"


def literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, Raw):
        return value.sql
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"non-finite float {value!r}")
        return repr(value)
    if isinstance(value, str):
        return quote(value)
    if isinstance(value, list | tuple):
        return array(value)
    raise TypeError(f"unsupported SQL literal type {type(value).__name__}")


def array(items: Sequence[Any], sql_type: str | None = None) -> str:
    """``array['a','b']`` / ``array[1.5,2.0]``; empty arrays need an explicit type."""
    if not items:
        return f"'{{}}'::{sql_type or 'text[]'}"
    body = "array[" + ",".join(literal(v) for v in items) + "]"
    return f"{body}::{sql_type}" if sql_type else body


def geography_point(lat: float, lng: float) -> Raw:
    return Raw(
        "extensions.st_setsrid(extensions.st_makepoint("
        f"{literal(float(lng))}, {literal(float(lat))}), 4326)::extensions.geography"
    )


def upsert(
    table: str,
    columns: Sequence[str],
    rows: Iterable[Sequence[Any]],
    conflict: Sequence[str],
    batch_size: int = BATCH_SIZE,
    touch_updated_at: bool = True,
) -> str:
    """Multi-row ``insert ... on conflict (...) do update`` statements, ``batch_size`` rows each."""
    rows = list(rows)
    updates = [c for c in columns if c not in conflict]
    set_clause = ",\n  ".join(f"{c} = excluded.{c}" for c in updates)
    if touch_updated_at:
        set_clause += ",\n  updated_at = now()"
    head = f"insert into {table} ({', '.join(columns)}) values\n"
    tail = f"\non conflict ({', '.join(conflict)}) do update set\n  {set_clause};\n"
    parts = []
    for start in range(0, len(rows), batch_size):
        chunk = rows[start : start + batch_size]
        for row in chunk:
            if len(row) != len(columns):
                raise ValueError(f"row has {len(row)} values, expected {len(columns)}: {row!r}")
        body = ",\n".join("  (" + ", ".join(literal(v) for v in row) + ")" for row in chunk)
        parts.append(head + body + tail)
    return "\n".join(parts)
