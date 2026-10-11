"""Command-line side of the integrations: traced model transport and ``embed`` (D-084)."""

from __future__ import annotations

import argparse
import os
import sys

from ..local.database import choose_database
from ..routes.model import PlannerError
from ..routes.ollama import OllamaTransport, RequestsOllamaTransport
from .errors import IntegrationError
from .semantic import OllamaEmbedder, embed_missing
from .tracing import TracedTransport, default_spans

ROUND_SIZE = 200  # attractions embedded per round: progress is visible and a crash loses little


def traced_ollama_transport() -> OllamaTransport:
    """The Ollama transport with a span per model call (stderr JSON lines, Sentry if configured)."""
    return TracedTransport(RequestsOllamaTransport(), default_spans(os.environ))


def cmd_embed(args: argparse.Namespace) -> int:
    """Embeds attractions that have no vector yet, round by round, until none is left (or
    ``--limit`` is reached).

    >>> python -m wayfarer_pipeline embed --limit 1000
    """
    embedder = OllamaEmbedder(args.model, args.ollama_url, traced_ollama_transport())
    db = choose_database(args.db_url)
    done = 0
    try:
        while not args.limit or done < args.limit:
            room = ROUND_SIZE if not args.limit else min(ROUND_SIZE, args.limit - done)
            written = embed_missing(db, embedder, room)
            if written == 0:
                break
            done += written
            print(f"  embedded {done} attractions", flush=True)
    except (IntegrationError, PlannerError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"embedded {done} attractions with {args.model}")
    return 0
