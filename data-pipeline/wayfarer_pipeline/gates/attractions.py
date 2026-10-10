"""Gate for a city's attractions (data/attractions/<slug>.json)."""

from __future__ import annotations

from .findings import Finding, GuardResult
from .limits import MAX_PLACES_DROP, MAX_PLACES_GONE
from .shares import restored_share_block
from .text import TextKind, text_problem

DATASET = "attractions"
TEXT_FIELDS: dict[str, TextKind] = {
    "name_en": "name",
    "name_pt": "name",
    "description_en": "description",
    "description_pt": "description",
}
# A photo travels with its credit: restored as a group, never mixed with a new author/licence.
IMAGE_FIELDS = ("image_url", "image_author", "image_license", "image_license_url", "image_page_url")


def _restore_texts(subject: str, new: dict, old: dict) -> list[Finding]:
    findings = []
    for field, kind in TEXT_FIELDS.items():
        problem = text_problem(new.get(field), kind)
        if problem and old.get(field) and not text_problem(old[field], kind):
            new[field] = old[field]
            findings.append(Finding(DATASET, subject, field, "restored", problem))
    return findings


def _restore_image(subject: str, new: dict, old: dict) -> list[Finding]:
    if new.get("image_url") or not old.get("image_url"):
        return []
    new.update({field: old.get(field) for field in IMAGE_FIELDS})
    return [Finding(DATASET, subject, "image", "restored", "photo and credit disappeared")]


def _size_blocks(slug: str, new_ids: set[str], old_ids: set[str]) -> list[Finding]:
    """Blocks when the city lost too many places, or most of its places were replaced."""
    findings = []
    before, after = len(old_ids), len(new_ids)
    if after < before * (1 - MAX_PLACES_DROP):
        drop = f"-{round((before - after) / before * 100)}%, limit -{int(MAX_PLACES_DROP * 100)}%"
        detail = f"places dropped from {before} to {after} ({drop})"
        findings.append(Finding(DATASET, slug, "places", "blocked", detail))
    gone = len(old_ids - new_ids)
    if gone > before * MAX_PLACES_GONE:
        share = f"{round(gone / before * 100)}%, limit {int(MAX_PLACES_GONE * 100)}%"
        detail = f"{gone} of {before} previous places are gone ({share})"
        findings.append(Finding(DATASET, slug, "places", "blocked", detail))
    return findings


def guard(slug: str, new: dict, old: dict | None) -> GuardResult:
    """Restores lost texts and photos of places that are still there; blocks big losses.

    >>> guard("amsterdam", fetched, committed).findings  # [Finding(... 'restored' ...)]
    """
    places = [dict(p) for p in new.get("attractions", [])]
    data = {**new, "attractions": places}
    if old is None:
        return GuardResult(data)
    previous = {p["wikidata_id"]: p for p in old.get("attractions", [])}
    findings: list[Finding] = []
    for place in places:
        if (before := previous.get(place["wikidata_id"])) is not None:
            subject = f"{slug}/{place['wikidata_id']}"
            findings += _restore_texts(subject, place, before) + _restore_image(
                subject, place, before
            )
    findings += _size_blocks(slug, {p["wikidata_id"] for p in places}, set(previous))
    kept = sum(1 for p in places if p["wikidata_id"] in previous)
    restored = sum(1 for f in findings if f.action == "restored" and f.field != "image")
    block = restored_share_block(DATASET, slug, restored, kept * len(TEXT_FIELDS))
    return GuardResult(data, findings + ([block] if block else []))
