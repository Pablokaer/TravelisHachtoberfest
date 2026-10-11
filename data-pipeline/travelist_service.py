"""Entry point of the packaged service (D-093): PyInstaller builds this file into the
`travelist-service` executable that the desktop app starts. It is the same command line as
`python -m wayfarer_pipeline`, e.g. `travelist-service serve --port 8787`."""

import sys
from typing import TextIO

from wayfarer_pipeline.cli import main


def use_utf8(*streams: TextIO | None) -> None:
    """Make output survive a piped Windows console (cp1252), where `→` in the help text raised
    UnicodeEncodeError and killed the service (found by the desktop `--smoke` check)."""
    for stream in streams:
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


if __name__ == "__main__":
    use_utf8(sys.stdout, sys.stderr)
    raise SystemExit(main())
