"""Gate for countries (data/countries.json): plugs, voltage, emergency numbers, currency…"""

from __future__ import annotations

from .findings import Finding, GuardResult
from .text import text_problem

DATASET = "countries"
NAME_FIELDS = ("name_en", "name_pt")
# Facts shown in the pre-trip checklist: a value that vanished is restored; one that changed is
# listed for review (a wrong emergency number or plug type misleads travellers).
FACT_FIELDS = (
    "currency_codes",
    "plug_types",
    "voltage",
    "frequency_hz",
    "driving_side",
    "calling_code",
    "emergency_number",
    "police_number",
    "ambulance_number",
    "fire_number",
    "languages",
    "timezones",
)
REVIEW_FIELDS = set(FACT_FIELDS) - {"languages", "timezones", "driving_side"}


def _empty(value: object) -> bool:
    return value is None or value == "" or value == []


def _fact_findings(code: str, new: dict, old: dict) -> list[Finding]:
    findings = []
    for field in FACT_FIELDS:
        before, after = old.get(field), new.get(field)
        if _empty(before) or after == before:
            continue
        if _empty(after):
            new[field] = before
            findings.append(Finding(DATASET, code, field, "restored", f"{before!r} disappeared"))
        elif field in REVIEW_FIELDS:
            findings.append(Finding(DATASET, code, field, "review", f"{before!r} → {after!r}"))
    return findings


def _name_findings(code: str, new: dict, old: dict) -> list[Finding]:
    findings = []
    for field in NAME_FIELDS:
        problem = text_problem(new.get(field), "name")
        if problem and not text_problem(old.get(field), "name"):
            new[field] = old[field]
            findings.append(Finding(DATASET, code, field, "restored", problem))
    return findings


def guard(new: list[dict], old: list[dict]) -> GuardResult:
    """Restores vanished names and facts, flags changed facts, blocks missing countries.

    >>> guard(fetched, committed).data  # countries with vanished facts restored
    """
    data = [dict(c) for c in new]
    previous = {c["code"]: c for c in old}
    findings: list[Finding] = []
    for country in data:
        if (before := previous.get(country["code"])) is not None:
            findings += _name_findings(country["code"], country, before)
            findings += _fact_findings(country["code"], country, before)
    missing = sorted(set(previous) - {c["code"] for c in data})
    findings += [
        Finding(DATASET, code, "country", "blocked", "missing from the new data")
        for code in missing
    ]
    return GuardResult(data, findings)
