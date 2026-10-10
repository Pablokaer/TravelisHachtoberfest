"""City "About" text (D-036): the introduction of each city's Wikipedia article, in English and
Portuguese, and an excerpt of its History section (D-070).

Article titles come from the city's Wikidata sitelinks; the texts come from :mod:`wiki_text`
(CC BY-SA 4.0 — the app shows the attribution and a link). It was the REST summary's first
paragraph until D-070. The result is committed to ``data/city_summaries.json`` so ``seed`` stays
offline.
"""

from __future__ import annotations

import json
from typing import Protocol
from urllib.parse import unquote

from . import sparql
from .config import CitiesConfig, City
from .paths import CITY_SUMMARIES_JSON, prettier
from .wiki_text import article_text

LANGUAGES = ("en", "pt")

SITELINKS_QUERY = """
SELECT ?item ?en ?pt WHERE {{
  VALUES ?item {{ {values} }}
  OPTIONAL {{ ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }}
  OPTIONAL {{ ?pt schema:about ?item; schema:isPartOf <https://pt.wikipedia.org/> }}
}}
"""

CitySummary = dict[str, str | None]


class WikiClient(Protocol):
    def request(self, method: str, url: str, **kwargs: object) -> tuple[int, str]: ...


def _title(article_url: str | None) -> str | None:
    """``https://pt.wikipedia.org/wiki/Amesterd%C3%A3o`` → ``Amesterdão``."""
    if not article_url:
        return None
    return unquote(article_url.rsplit("/wiki/", 1)[1]).replace("_", " ")


def article_titles(client: WikiClient, qids: list[str]) -> dict[str, tuple[str | None, str | None]]:
    """``{qid: (English title, Portuguese title)}``; a missing article is ``None``.

    >>> article_titles(client, ["Q727"])  # {"Q727": ("Amsterdam", "Amesterdão")}
    """
    titles: dict[str, tuple[str | None, str | None]] = {q: (None, None) for q in qids}
    for batch in sparql.chunks(qids, 100):
        query = SITELINKS_QUERY.format(values=sparql.values(batch))
        for row in sparql.run(client, query):  # type: ignore[arg-type]
            titles[row["item"]] = (_title(row.get("en")), _title(row.get("pt")))
    return titles


def _city_summary(client: WikiClient, titles: tuple[str | None, str | None]) -> CitySummary:
    out: CitySummary = {}
    for language, title in zip(LANGUAGES, titles, strict=True):
        text = article_text(client, language, title) if title else None
        out[f"wikipedia_{language}"] = title
        out[f"summary_{language}"] = text.summary if text else None
        out[f"history_{language}"] = text.history if text else None
    return out


def build(
    client: WikiClient,
    config: CitiesConfig,
    cities: list[City] | None = None,
    previous: dict[str, CitySummary] | None = None,
) -> dict[str, CitySummary]:
    """``{slug: {wikipedia_*, summary_*, history_*}}``: ``cities`` (default: all) fetched again,
    every other city kept from ``previous`` (the committed file).

    >>> build(client, config, regions.cities_in_region(config.cities, countries, "europe"), load())
    """
    picked = cities if cities is not None else config.cities
    titles = article_titles(client, [c.wikidata_id for c in picked])
    fresh = {c.slug: _city_summary(client, titles[c.wikidata_id]) for c in picked}
    return {**(previous or {}), **fresh}


def save(summaries: dict[str, CitySummary]) -> None:
    body = json.dumps(dict(sorted(summaries.items())), ensure_ascii=False, indent=2)
    CITY_SUMMARIES_JSON.write_text(body + "\n", encoding="utf-8")
    prettier(CITY_SUMMARIES_JSON)


def load() -> dict[str, CitySummary]:
    if not CITY_SUMMARIES_JSON.exists():
        return {}
    return json.loads(CITY_SUMMARIES_JSON.read_text(encoding="utf-8"))


def summary_line(summaries: dict[str, CitySummary]) -> str:
    """``"80 cities: 80 English, 78 Portuguese summaries"`` for the CLI."""
    counts = {
        lang: sum(1 for s in summaries.values() if s[f"summary_{lang}"]) for lang in LANGUAGES
    }
    return f"{len(summaries)} cities: {counts['en']} English, {counts['pt']} Portuguese summaries"
