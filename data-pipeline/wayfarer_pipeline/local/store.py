"""Where on-demand cities are remembered on disk: ``data/local`` (git-ignored, D-079).

``cities.yaml`` there has the same shape as the committed one, so a built city can be ingested
again with the normal commands (``--config data/local/cities.yaml``); the committed file is never
edited. Each city's attractions and routes are kept beside it as JSON for inspection.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

import yaml

from ..config import City, load_cities
from ..paths import LOCAL_DIR


class LocalStore:
    """Thread-safe: jobs for different cities add entries at the same time."""

    def __init__(self, directory: Path = LOCAL_DIR) -> None:
        self.directory = directory
        self.cities_file = directory / "cities.yaml"
        self._lock = threading.Lock()

    def cities(self) -> list[City]:
        with self._lock:
            return self._read()

    def add_city(self, city: City) -> None:
        """Adds ``city``, or replaces the entry with the same slug."""
        with self._lock:
            kept = [c for c in self._read() if c.slug != city.slug]
            self._write([*kept, city])

    def save_doc(self, slug: str, name: str, doc: dict[str, Any]) -> Path:
        """``data/local/<slug>/<name>.json``: a stage's result, for inspection."""
        path = self.directory / slug / f"{name}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        return path

    def _read(self) -> list[City]:
        if not self.cities_file.exists():
            return []
        return list(load_cities(self.cities_file).cities)

    def _write(self, cities: list[City]) -> None:
        doc = {"version": 1, "cities": [c.model_dump(mode="json") for c in cities]}
        self.directory.mkdir(parents=True, exist_ok=True)
        with open(self.cities_file, "w", encoding="utf-8", newline="") as fh:
            yaml.safe_dump(doc, fh, allow_unicode=True, sort_keys=False)
