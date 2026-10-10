"""Is a text fit to show? Catches what a source outage or a bad edit upstream leaves behind."""

from __future__ import annotations

import re
from typing import Literal

from .limits import MIN_CHARS, SUMMARY_MIN_KEPT_RATIO

TextKind = Literal["name", "description", "summary"]

MARKUP = re.compile(r"\{\{|\}\}|\[\[|\]\]|<[a-zA-Z/][^>]*>|&[a-z]+;")
DISAMBIGUATION = re.compile(
    r"\b(may refer to|can refer to|pode referir-se a|pode se referir a)\b", re.IGNORECASE
)
RAW_QID = re.compile(r"^Q\d+$")


def text_problem(value: str | None, kind: TextKind) -> str | None:
    """Why the text should not be shown, or ``None`` when it is fine.

    >>> text_problem("Q165366", "name")  # 'raw Wikidata id'
    """
    text = (value or "").strip()
    if not text:
        return "missing"
    if RAW_QID.match(text):
        return "raw Wikidata id"
    if "�" in text:
        return "broken encoding"
    if MARKUP.search(text):
        return "markup"
    if kind == "summary" and DISAMBIGUATION.search(text):
        return "disambiguation"
    if len(text) < MIN_CHARS[kind]:
        return f"too short ({len(text)} < {MIN_CHARS[kind]} characters)"
    return None


def summary_problem(value: str | None, previous: str | None) -> str | None:
    """``text_problem`` for a city summary, plus: it must not lose most of the previous text.

    >>> summary_problem(first_sentence_only, full_lead)  # 'shrank to 18% of the previous text'
    """
    problem = text_problem(value, "summary")
    if problem or not previous:
        return problem
    ratio = len((value or "").strip()) / len(previous.strip())
    if ratio < SUMMARY_MIN_KEPT_RATIO:
        return f"shrank to {int(ratio * 100)}% of the previous text"
    return None
