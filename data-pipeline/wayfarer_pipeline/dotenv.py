"""A tiny ``.env`` reader, so the keys of the optional integrations and ``OLLAMA_MODEL`` that the
README tells you to put in the root ``.env`` actually reach the pipeline (D-084).

Only what is missing (or empty) in the environment is filled: a variable you set in the shell wins.
"""

from __future__ import annotations

import os
from collections.abc import MutableMapping
from pathlib import Path

from .paths import REPO_ROOT

# TRAVELIST_ENV_FILE: the desktop app keeps the keys in a file of the user's (D-093).
ENV_FILE = Path(os.environ.get("TRAVELIST_ENV_FILE") or REPO_ROOT / ".env")


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def parse_env(text: str) -> dict[str, str]:
    """``KEY=value`` lines as a dict; comments, blank lines and anything else are skipped.

    >>> parse_env("OLLAMA_MODEL=gemma3:4b\\n# note\\n")  # {"OLLAMA_MODEL": "gemma3:4b"}
    """
    variables: dict[str, str] = {}
    for line in text.splitlines():
        key, separator, value = line.strip().partition("=")
        if not separator or not key or key.startswith("#") or " " in key:
            continue
        variables[key] = _unquote(value.strip())
    return variables


def load_env_file(
    path: Path = ENV_FILE, environ: MutableMapping[str, str] | None = None
) -> list[str]:
    """Fills ``environ`` (default: ``os.environ``) from ``path``; returns the names it set.
    A missing file is fine: most installs have no integration keys.

    >>> load_env_file(Path(".env"), {})  # ["OLLAMA_MODEL"]
    """
    target = os.environ if environ is None else environ
    if not path.exists():
        return []
    set_now = []
    for key, value in parse_env(path.read_text(encoding="utf-8")).items():
        if not target.get(key):
            target[key] = value
            set_now.append(key)
    return set_now
