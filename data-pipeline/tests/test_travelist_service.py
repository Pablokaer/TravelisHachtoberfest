"""The packaged service entry point must not die on a console that cannot encode its output."""

from __future__ import annotations

import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from travelist_service import use_utf8  # noqa: E402


def test_a_cp1252_stream_can_print_an_arrow_after_use_utf8() -> None:
    raw = io.BytesIO()
    stream = io.TextIOWrapper(raw, encoding="cp1252")
    use_utf8(stream)
    stream.write("city → plan")
    stream.flush()
    assert raw.getvalue().decode("utf-8") == "city → plan"


def test_a_missing_stream_is_ignored() -> None:
    use_utf8(None)
