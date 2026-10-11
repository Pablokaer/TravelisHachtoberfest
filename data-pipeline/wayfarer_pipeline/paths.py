"""Well-known locations inside the repository."""

from __future__ import annotations

import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PIPELINE_DIR.parent
DATA_DIR = PIPELINE_DIR / "data"
ATTRACTIONS_DIR = DATA_DIR / "attractions"
ATTRACTION_TEXTS_DIR = DATA_DIR / "attraction_texts"
PEOPLE_DIR = DATA_DIR / "people"
SUGGESTED_ROUTES_DIR = DATA_DIR / "suggested_routes"
CLIMATE_DIR = DATA_DIR / "climate"
FACTS_DIR = DATA_DIR / "facts"
PRICES_DIR = DATA_DIR / "prices"
# What the service writes: the cities built on demand for one install (D-079; never committed,
# data-pipeline/.gitignore) and the HTTP cache. By default beside the code; the desktop app (D-093)
# sets TRAVELIST_STATE_DIR to a folder of the user's, because its install folder is read-only.
_STATE = os.environ.get("TRAVELIST_STATE_DIR", "").strip()
STATE_DIR = Path(_STATE) if _STATE else None
LOCAL_DIR = STATE_DIR / "local" if STATE_DIR else DATA_DIR / "local"
CACHE_DIR = STATE_DIR / "cache" if STATE_DIR else PIPELINE_DIR / ".cache"
SEED_DIR = REPO_ROOT / "supabase" / "seed"

COUNTRIES_JSON = DATA_DIR / "countries.json"
COUNTRY_OVERRIDES = DATA_DIR / "country_overrides.yaml"
VISA_CSV = DATA_DIR / "visa.csv"
VISA_META = DATA_DIR / "visa_source.json"
CITY_SUMMARIES_JSON = DATA_DIR / "city_summaries.json"
# Run through node: the .bin shim is a shell script on Linux/macOS and a .CMD on Windows, which
# cmd.exe cannot start from a path with parentheses such as "travelist-main(1)".
PRETTIER = REPO_ROOT / "node_modules" / "prettier" / "bin" / "prettier.cjs"


def prettier(*paths: Path) -> None:
    """Format committed JSON/YAML snapshots with the repo's prettier (``pnpm format:check``
    covers data-pipeline/data). Skipped with a warning when node_modules is not installed."""
    import subprocess

    if not PRETTIER.exists():
        print(f"WARNING: {PRETTIER} not found; run `pnpm install` then `pnpm format`")
        return
    subprocess.run(
        ["node", str(PRETTIER), "--log-level", "warn", "--write", *map(str, paths)],
        cwd=REPO_ROOT,
        check=True,
    )
