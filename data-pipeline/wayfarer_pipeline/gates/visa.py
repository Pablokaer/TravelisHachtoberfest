"""Gate for visa rules (data/visa.csv). No repair: an old rule may be wrong today, so losses and
waves of changes block and a human decides."""

from __future__ import annotations

from .findings import Finding
from .limits import MAX_VISA_CHANGED, MAX_VISA_REVIEW_ROWS, MAX_VISA_ROWS_DROP

DATASET = "visa"
Rule = dict[str, str]


def _key(rule: Rule) -> str:
    return f"{rule['passport']}→{rule['destination']}"


def _describe(rule: Rule) -> str:
    days = rule.get("max_stay_days")
    return f"{rule['requirement']} {days} days" if days else rule["requirement"]


def _changed(new: list[Rule], old: list[Rule]) -> list[tuple[str, Rule, Rule]]:
    previous = {_key(r): r for r in old}
    return [
        (_key(rule), previous[_key(rule)], rule)
        for rule in new
        if _key(rule) in previous and _describe(previous[_key(rule)]) != _describe(rule)
    ]


def _row_drop_block(new: list[Rule], old: list[Rule]) -> list[Finding]:
    if not old or len(new) >= len(old) * (1 - MAX_VISA_ROWS_DROP):
        return []
    drop = f"-{(len(old) - len(new)) / len(old) * 100:.1f}%, limit -{MAX_VISA_ROWS_DROP:.0%}"
    detail = f"rules dropped from {len(old)} to {len(new)} ({drop})"
    return [Finding(DATASET, "all rules", "rows", "blocked", detail)]


def check(new: list[Rule], old: list[Rule]) -> list[Finding]:
    """Blocks lost rules or a wave of changes; lists changed rules for review.

    >>> check(fetched_rows, committed_rows)  # [Finding('visa', 'BR→NL', ..., 'review', ...)]
    """
    changed = _changed(new, old)
    findings = [
        Finding(DATASET, key, "requirement", "review", f"{_describe(before)} → {_describe(after)}")
        for key, before, after in changed[:MAX_VISA_REVIEW_ROWS]
    ]
    if old and len(changed) > len(old) * MAX_VISA_CHANGED:
        share = f"{len(changed) / len(old) * 100:.1f}%, limit {MAX_VISA_CHANGED:.0%}"
        detail = f"{len(changed)} of {len(old)} rules changed ({share})"
        findings.append(Finding(DATASET, "all rules", "rows", "blocked", detail))
    return findings + _row_drop_block(new, old)
