"""The committed snapshots a refresh is compared with: ``data-pipeline/data`` at a git ref."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Protocol

from ..paths import REPO_ROOT

DATA_PREFIX = "data-pipeline/data"


class Baseline(Protocol):
    def read_text(self, relative: str) -> str | None: ...
    def list_attraction_files(self) -> list[str]: ...


class GitBaseline:
    """Reads ``data-pipeline/data/<relative>`` as committed at ``ref``.

    >>> GitBaseline("origin/main").read_text("city_summaries.json")  # '{ "amsterdam": … }'
    """

    def __init__(self, ref: str, repo_root: Path = REPO_ROOT):
        self.ref = ref
        self.repo_root = repo_root
        if self._git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}") is None:
            raise ValueError(f"git ref {ref!r} not found (expected a branch, tag or commit)")

    def _git(self, *args: str) -> str | None:
        done = subprocess.run(
            ["git", *args], cwd=self.repo_root, capture_output=True, text=True, check=False
        )
        return done.stdout if done.returncode == 0 else None

    def read_text(self, relative: str) -> str | None:
        """The file's committed content, or ``None`` when it did not exist at the ref."""
        return self._git("show", f"{self.ref}:{DATA_PREFIX}/{relative}")

    def list_attraction_files(self) -> list[str]:
        listing = self._git("ls-tree", "--name-only", self.ref, f"{DATA_PREFIX}/attractions/")
        return sorted(Path(p).name for p in (listing or "").splitlines() if p.endswith(".json"))
