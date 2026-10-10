"""Attraction page texts (D-070): the introduction and History excerpt of each attraction's
Wikipedia article, in English and Portuguese, via :mod:`wiki_text`.

Kept apart from ``data/attractions`` so ingesting places and fetching texts run independently;
``seed`` joins them by Wikidata id. One file per city: ``data/attraction_texts/<slug>.json``.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from .paths import ATTRACTION_TEXTS_DIR, prettier
from .wiki_text import WikiClient, article_text

LANGUAGES = ("en", "pt")
FIELDS = ("summary_en", "history_en", "summary_pt", "history_pt")
# Articles fetched at once; each Wikipedia host keeps its own rate limit (http.POLICIES).
WORKERS = 4

AttractionText = dict[str, str | None]


def _place_text(client: WikiClient, place: dict[str, Any]) -> AttractionText:
    out: AttractionText = {}
    for language in LANGUAGES:
        title = place.get(f"wikipedia_{language}")
        text = article_text(client, language, title) if title else None
        out[f"summary_{language}"] = text.summary if text else None
        out[f"history_{language}"] = text.history if text else None
    return out


def build_city(client: WikiClient, doc: dict[str, Any]) -> dict[str, AttractionText]:
    """``{qid: {summary_en, history_en, summary_pt, history_pt}}`` for places with an article.

    >>> build_city(client, pipeline.load_all()["lisbon"])["Q193563"]["history_en"]
    """
    places = [p for p in doc["attractions"] if p.get("wikipedia_en") or p.get("wikipedia_pt")]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        texts = list(pool.map(lambda p: _place_text(client, p), places))
    return {p["wikidata_id"]: t for p, t in zip(places, texts, strict=True) if any(t.values())}


def save(
    slug: str,
    texts: dict[str, AttractionText],
    directory: Path = ATTRACTION_TEXTS_DIR,
    format_json: bool = True,
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{slug}.json"
    ordered = dict(sorted(texts.items(), key=lambda kv: int(kv[0][1:])))
    path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if format_json:
        prettier(path)
    return path


def load_all(directory: Path = ATTRACTION_TEXTS_DIR) -> dict[str, dict[str, AttractionText]]:
    """``{slug: {qid: texts}}`` for every committed city file (empty when there is none)."""
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))
    }


def summary_line(texts: dict[str, dict[str, AttractionText]]) -> str:
    """``"2 attractions: 2 English and 1 Portuguese introductions, …"`` for the CLI."""
    places = [t for city in texts.values() for t in city.values()]

    def count(field: str) -> int:
        return sum(1 for t in places if t.get(field))

    return (
        f"{len(places)} attractions: {count('summary_en')} English and {count('summary_pt')}"
        f" Portuguese introductions, {count('history_en')} English and {count('history_pt')}"
        " Portuguese histories"
    )
