"""Where the pipeline keeps its files (D-093): next to the code by default, in a writable folder
of the user's when the desktop app asks (an AppImage or a Program Files install is read-only)."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from wayfarer_pipeline import dotenv, paths


@pytest.fixture(autouse=True)
def restore_modules():
    yield
    importlib.reload(paths)
    importlib.reload(dotenv)


def test_by_default_the_state_lives_beside_the_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TRAVELIST_STATE_DIR", raising=False)
    reloaded = importlib.reload(paths)
    assert reloaded.LOCAL_DIR == reloaded.DATA_DIR / "local"
    assert reloaded.CACHE_DIR == reloaded.PIPELINE_DIR / ".cache"


def test_a_state_folder_takes_the_cities_built_on_demand_and_the_http_cache(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("TRAVELIST_STATE_DIR", str(tmp_path))
    reloaded = importlib.reload(paths)
    assert tmp_path / "local" == reloaded.LOCAL_DIR
    assert tmp_path / "cache" == reloaded.CACHE_DIR
    # The committed data is read where it is: only what is written moves.
    assert reloaded.DATA_DIR == reloaded.PIPELINE_DIR / "data"


def test_an_empty_state_variable_is_the_same_as_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRAVELIST_STATE_DIR", "  ")
    reloaded = importlib.reload(paths)
    assert reloaded.LOCAL_DIR == reloaded.DATA_DIR / "local"


def test_the_env_file_can_be_pointed_elsewhere(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    target = tmp_path / "keys.env"
    monkeypatch.setenv("TRAVELIST_ENV_FILE", str(target))
    assert target == importlib.reload(dotenv).ENV_FILE


def test_the_env_file_is_the_root_one_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TRAVELIST_ENV_FILE", raising=False)
    assert importlib.reload(dotenv).ENV_FILE == importlib.reload(paths).REPO_ROOT / ".env"
