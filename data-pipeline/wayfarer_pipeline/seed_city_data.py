"""Seed SQL for the trip wizard's city data (D-081): climate normals and city facts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from . import climate as climate_mod
from . import facts as facts_mod
from .paths import SEED_DIR
from .seed import _write
from .sql import upsert

CLIMATE_COLUMNS = [
    "city_slug",
    "month",
    "temp_mean_c",
    "temp_max_c",
    "precip_mm",
    "snowfall_cm",
    "sunshine_hours",
]
FACTS_COLUMNS = ["city_slug", "population", "inception_year", "beach_count"]


def climate_sql(docs: dict[str, dict[str, Any]]) -> str:
    """Climate upsert, sorted by city then month so reseeding makes minimal diffs."""
    rows = [
        [
            slug,
            m["month"],
            m["temp_mean_c"],
            m["temp_max_c"],
            m["precip_mm"],
            m["snowfall_cm"],
            m["sunshine_hours"],
        ]
        for slug in sorted(docs)
        for m in sorted(docs[slug]["months"], key=lambda m: m["month"])
    ]
    return upsert(
        "public.city_climate",
        CLIMATE_COLUMNS,
        rows,
        conflict=["city_slug", "month"],
        touch_updated_at=False,
    )


def facts_sql(docs: dict[str, dict[str, Any]]) -> str:
    """City facts upsert (population, founding year, beaches), sorted by city."""
    rows = [
        [
            slug,
            docs[slug].get("population"),
            docs[slug].get("inception_year"),
            docs[slug]["beach_count"],
        ]
        for slug in sorted(docs)
    ]
    return upsert(
        "public.city_facts", FACTS_COLUMNS, rows, conflict=["city_slug"], touch_updated_at=False
    )


def write_climate(seed_dir: Path = SEED_DIR) -> Path:
    return _write(seed_dir / "70_city_climate.sql", "climate", climate_sql(climate_mod.load_all()))


def write_facts(seed_dir: Path = SEED_DIR) -> Path:
    return _write(seed_dir / "80_city_facts.sql", "facts", facts_sql(facts_mod.load_all()))
