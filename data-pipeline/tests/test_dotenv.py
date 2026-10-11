"""The pipeline reads the root .env (D-084): keys and OLLAMA_MODEL set there reach the service."""

from __future__ import annotations

from pathlib import Path

from wayfarer_pipeline.dotenv import load_env_file, parse_env


def test_lines_become_variables_and_comments_and_blanks_are_skipped() -> None:
    text = "# a comment\n\nSERPAPI_API_KEY=abc123\nOLLAMA_MODEL=gemma3:4b\n"
    assert parse_env(text) == {"SERPAPI_API_KEY": "abc123", "OLLAMA_MODEL": "gemma3:4b"}


def test_quotes_around_a_value_are_removed_and_an_equals_sign_inside_is_kept() -> None:
    text = 'EMAIL_FROM="Travelist <hello@x.test>"\nMONGODB_URI=mongodb+srv://u:p@c.net/?a=b\n'
    parsed = parse_env(text)
    assert parsed["EMAIL_FROM"] == "Travelist <hello@x.test>"
    assert parsed["MONGODB_URI"] == "mongodb+srv://u:p@c.net/?a=b"


def test_windows_line_endings_leave_no_carriage_return_in_a_value() -> None:
    assert parse_env("KEY=value\r\nOTHER=2\r\n") == {"KEY": "value", "OTHER": "2"}


def test_a_line_that_is_not_a_variable_is_ignored() -> None:
    assert parse_env("not a variable\n=novalue\nGOOD=1\n") == {"GOOD": "1"}


def test_an_empty_value_is_kept_as_empty() -> None:
    assert parse_env("SERPAPI_API_KEY=\n") == {"SERPAPI_API_KEY": ""}


def test_loading_fills_what_is_missing_and_never_overrides_the_environment(tmp_path: Path) -> None:
    file = tmp_path / ".env"
    file.write_text("OLLAMA_MODEL=gemma3:4b\nSERPAPI_API_KEY=from-file\n", encoding="utf-8")
    environ = {"SERPAPI_API_KEY": "from-shell"}
    loaded = load_env_file(file, environ)
    assert environ == {"SERPAPI_API_KEY": "from-shell", "OLLAMA_MODEL": "gemma3:4b"}
    assert loaded == ["OLLAMA_MODEL"]


def test_an_empty_variable_in_the_environment_is_filled_from_the_file(tmp_path: Path) -> None:
    file = tmp_path / ".env"
    file.write_text("SENTRY_DSN=https://k@o.ingest.sentry.io/1\n", encoding="utf-8")
    environ = {"SENTRY_DSN": ""}
    load_env_file(file, environ)
    assert environ["SENTRY_DSN"] == "https://k@o.ingest.sentry.io/1"


def test_a_missing_file_is_not_an_error(tmp_path: Path) -> None:
    assert load_env_file(tmp_path / "nope.env", {}) == []
