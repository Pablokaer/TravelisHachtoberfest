"""What a gate found, and the report the refresh pull request carries."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Action = Literal["restored", "review", "unrepaired", "blocked"]
ACTIONS: tuple[Action, ...] = ("restored", "review", "unrepaired", "blocked")
DATASETS = ("countries", "visa", "city-summaries", "attractions")
MAX_LINES_PER_SECTION = 40

TITLES = {
    "blocked": "⛔ Blocked",
    "restored": "♻️ Restored from the previous data",
    "unrepaired": "⚠️ Broken with nothing to restore (new rows)",
    "review": "👀 Changed — please review",
}


@dataclass(frozen=True)
class Finding:
    """One thing a gate did or saw.

    >>> Finding("city-summaries", "amsterdam", "summary_en", "restored", "disambiguation")
    """

    dataset: str
    subject: str
    field: str
    action: Action
    detail: str

    def line(self) -> str:
        return f"- `{self.subject}` · {self.field} — {self.detail}"


@dataclass
class GuardResult:
    """A dataset after its guard: the (repaired) data and the findings."""

    data: object
    findings: list[Finding] = field(default_factory=list)


@dataclass
class GateReport:
    findings: list[Finding]
    changed_datasets: list[str]

    @property
    def blocked(self) -> bool:
        return any(f.action == "blocked" for f in self.findings)

    def count(self, dataset: str, action: Action) -> int:
        return sum(1 for f in self.findings if f.dataset == dataset and f.action == action)

    def markdown(self) -> str:
        """The report as Markdown (pull request body / job summary)."""
        status = "⛔ Blocked — not published" if self.blocked else "✅ Passed"
        changed = ", ".join(self.changed_datasets) or "none"
        parts = [f"## Data gate: {status}", "", f"Changed datasets: {changed}", "", *self._table()]
        for action in ("blocked", "restored", "unrepaired", "review"):
            parts += self._section(action)
        return "\n".join(parts) + "\n"

    def _table(self) -> list[str]:
        rows = [
            "| Dataset | Restored | Review | Unrepaired | Blocked |",
            "| --- | --- | --- | --- | --- |",
        ]
        for dataset in DATASETS:
            counts = [
                self.count(dataset, a) for a in ("restored", "review", "unrepaired", "blocked")
            ]
            rows.append(f"| {dataset} | " + " | ".join(map(str, counts)) + " |")
        return rows

    def _section(self, action: Action) -> list[str]:
        found = [f for f in self.findings if f.action == action]
        if not found:
            return []
        shown = _capped_lines(found)
        lines = ["", f"### {TITLES[action]} ({len(found)})", "", *shown]
        if len(shown) < len(found):
            lines.append(f"- … and {len(found) - len(shown)} more")
        return lines


def _capped_lines(found: list[Finding]) -> list[str]:
    """Report lines grouped by dataset, at most MAX_LINES_PER_SECTION per dataset."""
    lines: list[str] = []
    for dataset in DATASETS:
        lines += [f.line() for f in found if f.dataset == dataset][:MAX_LINES_PER_SECTION]
    return lines
