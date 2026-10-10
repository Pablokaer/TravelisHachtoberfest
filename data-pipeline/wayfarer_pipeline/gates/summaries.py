"""Gate for city "About" texts (data/city_summaries.json, D-036)."""

from __future__ import annotations

from .findings import Finding, GuardResult
from .shares import restored_share_block
from .text import summary_problem

DATASET = "city-summaries"
LANGUAGES = ("en", "pt")

CitySummaries = dict[str, dict[str, str | None]]


def _guard_language(slug: str, lang: str, new: dict, old: dict | None) -> Finding | None:
    """Restores one language's text and its article title (the attribution links it), in place."""
    field = f"summary_{lang}"
    previous = (old or {}).get(field)
    if old is not None and new.get(field) == previous:
        return None  # unchanged is never a regression (e.g. a city with no Portuguese article)
    problem = summary_problem(new.get(field), previous)
    if not problem:
        return None
    if previous and not summary_problem(previous, None):
        new[field], new[f"wikipedia_{lang}"] = previous, (old or {}).get(f"wikipedia_{lang}")
        return Finding(DATASET, slug, field, "restored", problem)
    return Finding(DATASET, slug, field, "unrepaired", problem)


def guard(new: CitySummaries, old: CitySummaries) -> GuardResult:
    """Restores every summary that got worse than the committed one.

    >>> guard(fetched, committed).data["amsterdam"]["summary_en"]  # the committed text if broken
    """
    data = {slug: dict(summary) for slug, summary in new.items()}
    findings = [
        finding
        for slug, summary in data.items()
        for lang in LANGUAGES
        if (finding := _guard_language(slug, lang, summary, old.get(slug)))
    ]
    restored = sum(1 for f in findings if f.action == "restored")
    checked = sum(1 for slug in data if slug in old) * len(LANGUAGES)
    block = restored_share_block(DATASET, "all cities", restored, checked)
    return GuardResult(data, findings + ([block] if block else []))
