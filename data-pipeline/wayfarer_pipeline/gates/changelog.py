"""The refresh pull request records itself in CHANGELOG.md, like every change (CLAUDE.md)."""

from __future__ import annotations

from datetime import date

from .findings import GateReport

UNRELEASED = "## Unreleased\n"
DATA_HEADING = "### Data\n\n"


def add_data_entry(changelog: str, line: str) -> str:
    """Adds ``line`` first under **Unreleased → Data**, creating that section when missing.

    >>> add_data_entry(text, "- Scheduled data refresh (2026-11-01): visa updated.")
    """
    start = changelog.find(UNRELEASED)
    if start < 0:
        raise ValueError("CHANGELOG.md has no '## Unreleased' section (expected '## Unreleased')")
    end = changelog.find("\n## ", start + len(UNRELEASED))
    end = len(changelog) if end < 0 else end + 1
    section = changelog[start:end]
    heading = section.find("\n" + DATA_HEADING)
    if heading >= 0:
        at = start + heading + 1 + len(DATA_HEADING)
        return changelog[:at] + line + "\n" + changelog[at:]
    return changelog[:end] + DATA_HEADING + line + "\n\n" + changelog[end:]


def refresh_line(report: GateReport, day: date) -> str:
    """The CHANGELOG line of a scheduled refresh.

    >>> refresh_line(report, date(2026, 11, 1))  # '- Scheduled data refresh (2026-11-01, D-042): …'
    """
    restored = sum(1 for f in report.findings if f.action == "restored")
    review = sum(1 for f in report.findings if f.action == "review")
    return (
        f"- Scheduled data refresh ({day.isoformat()}, D-042): "
        f"{', '.join(report.changed_datasets)} updated from their sources; the data gate restored "
        f"{restored} value(s) that got worse and flagged {review} change(s) for review."
    )
