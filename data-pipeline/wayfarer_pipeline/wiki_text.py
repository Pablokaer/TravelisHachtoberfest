"""Wikipedia article text for city and attraction pages (D-070): the introduction and an excerpt
of the History section, as plain text, verbatim (CC BY-SA 4.0 — the app shows the attribution
and a link to the full article).

One MediaWiki ``prop=extracts`` request per article returns the whole page as plain text with
``== Heading ==`` lines; the introduction is what comes before the first heading.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Protocol

from .gates.text import MARKUP

# Section titles that hold a place's history in each language.
HISTORY_HEADINGS = {"en": ("History",), "pt": ("História", "Histórico")}
SUMMARY_LIMIT = 3000  # characters: a big city's whole introduction fits
HISTORY_LIMIT = 1500  # characters: a short story; the link leads to the rest

HEADING = re.compile(r"^(=+) (.+?) =+$", re.MULTILINE)
SENTENCE_END = re.compile(r"(?<=[.!?])\s")


class WikiClient(Protocol):
    def request(self, method: str, url: str, **kwargs: object) -> tuple[int, str]: ...


@dataclass(frozen=True)
class ArticleText:
    summary: str | None
    history: str | None


def _paragraphs(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def clip(text: str, limit: int) -> str:
    """Whole paragraphs up to ``limit`` characters; a longer first one is cut at a sentence end.

    >>> clip("a" * 600 + "\\n" + "b" * 600, limit=700)  # only the first paragraph
    """
    kept: list[str] = []
    for paragraph in _paragraphs(text):
        if len("\n".join([*kept, paragraph])) > limit:
            break
        kept.append(paragraph)
    if kept:
        return "\n".join(kept)
    return _clip_sentences(_paragraphs(text)[0], limit) if text.strip() else ""


def _clip_sentences(paragraph: str, limit: int) -> str:
    out = ""
    for sentence in SENTENCE_END.split(paragraph):
        candidate = f"{out} {sentence}".strip()
        if len(candidate) > limit:
            break
        out = candidate
    return out or paragraph[:limit].rstrip()


def _fit(text: str) -> str | None:
    """``None`` for an empty text or one with leftover wikitext (``[[…]]``, ``{{…}}``, tags)."""
    return text if text and not MARKUP.search(text) else None


def intro(article: str) -> str | None:
    """The text before the first heading, or ``None`` when there is none.

    >>> intro("Lisbon is the capital.\\n\\n== History ==\\n…")  # 'Lisbon is the capital.'
    """
    first = HEADING.search(article)
    text = article[: first.start()] if first else article
    return _fit(clip(text, SUMMARY_LIMIT))


def _section_body(article: str, start: re.Match[str]) -> str:
    """The section's text up to the next heading of the same or a higher level."""
    level = len(start.group(1))
    for heading in HEADING.finditer(article, start.end()):
        if len(heading.group(1)) <= level:
            return article[start.end() : heading.start()]
    return article[start.end() :]


def history(article: str, language: str) -> str | None:
    """The History section's paragraphs (subheadings dropped), clipped; ``None`` without one.

    >>> history("Intro.\\n\\n== History ==\\nFounded in 1147.", "en")  # 'Founded in 1147.'
    """
    titles = HISTORY_HEADINGS.get(language, ())
    start = next((h for h in HEADING.finditer(article) if h.group(2) in titles), None)
    if start is None:
        return None
    body = HEADING.sub("", _section_body(article, start))
    return _fit(clip(body, HISTORY_LIMIT))


def _page(client: WikiClient, language: str, title: str) -> dict[str, object]:
    params = {
        "action": "query",
        "prop": "extracts|pageprops",
        "ppprop": "disambiguation",
        "explaintext": 1,
        "exsectionformat": "wiki",
        "redirects": 1,
        "format": "json",
        "formatversion": 2,
        "titles": title,
    }
    url = f"https://{language}.wikipedia.org/w/api.php"
    _, body = client.request("GET", url, namespace="wiki-extract", params=params)
    return json.loads(body)["query"]["pages"][0]


def article_text(client: WikiClient, language: str, title: str) -> ArticleText | None:
    """Introduction and History excerpt of an article; ``None`` for missing or disambiguation
    pages.

    >>> article_text(client, "en", "Jerónimos Monastery").history  # 'The monastery replaced…'
    """
    page = _page(client, language, title)
    if page.get("missing") or "disambiguation" in (page.get("pageprops") or {}):
        return None
    article = str(page.get("extract") or "")
    return ArticleText(summary=intro(article), history=history(article, language))
