"""The gate command end to end: candidate snapshots on disk vs the committed baseline."""

import csv
import io
import json
from pathlib import Path

from wayfarer_pipeline.gates.changelog import add_data_entry
from wayfarer_pipeline.gates.findings import Finding, GateReport
from wayfarer_pipeline.gates.run import run_gates

LEAD = (
    "Amsterdam is the capital and largest city of the Netherlands. It is colloquially referred "
    "to as the Venice of the North, for its large number of canals."
)


class FakeBaseline:
    """The committed snapshots (what `git show <ref>:<path>` returns), by path under data/."""

    def __init__(self, files: dict[str, str]):
        self.files = files

    def read_text(self, relative: str) -> str | None:
        return self.files.get(relative)

    def list_attraction_files(self) -> list[str]:
        return sorted(p.split("/")[-1] for p in self.files if p.startswith("attractions/"))


class FakeFormatter:
    """Stands in for prettier: records which files the gate rewrote."""

    def __init__(self):
        self.formatted: list[Path] = []

    def __call__(self, *paths: Path) -> None:
        self.formatted.extend(paths)


def _summaries(en: str | None) -> str:
    body = {
        "amsterdam": {
            "wikipedia_en": "Amsterdam",
            "summary_en": en,
            "wikipedia_pt": None,
            "summary_pt": None,
        }
    }
    return json.dumps(body, ensure_ascii=False, indent=2) + "\n"


def _visa_csv(rows: int) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["passport", "destination", "requirement", "max_stay_days"])
    for i in range(rows):
        writer.writerow([f"P{i}", "NL", "visa_free", "90"])
    return out.getvalue()


def _data_dir(tmp_path: Path, summaries: str, visa_rows: int = 100) -> Path:
    data = tmp_path / "data"
    (data / "attractions").mkdir(parents=True)
    (data / "city_summaries.json").write_text(summaries, encoding="utf-8")
    (data / "countries.json").write_text("[]\n", encoding="utf-8")
    (data / "visa.csv").write_text(_visa_csv(visa_rows), encoding="utf-8")
    return data


def _baseline(summaries: str, visa_rows: int = 100) -> FakeBaseline:
    return FakeBaseline(
        {
            "city_summaries.json": summaries,
            "countries.json": "[]\n",
            "visa.csv": _visa_csv(visa_rows),
        }
    )


def test_fix_mode_restores_the_previous_text_on_disk_and_passes(tmp_path):
    data = _data_dir(tmp_path, _summaries(None))
    formatter = FakeFormatter()
    report = run_gates(
        data, _baseline(_summaries(LEAD)), {"amsterdam"}, fix=True, format_files=formatter
    )
    assert not report.blocked
    saved = json.loads((data / "city_summaries.json").read_text(encoding="utf-8"))
    assert saved["amsterdam"]["summary_en"] == LEAD
    assert formatter.formatted == [data / "city_summaries.json"]
    # After the restore the data equals the committed one: nothing to publish.
    assert report.changed_datasets == []


def test_check_mode_blocks_a_text_regression_and_changes_nothing(tmp_path):
    data = _data_dir(tmp_path, _summaries(None))
    report = run_gates(data, _baseline(_summaries(LEAD)), {"amsterdam"}, fix=False)
    assert report.blocked
    assert [f.action for f in report.findings] == ["blocked"]
    assert "run `gate --fix`" in report.findings[0].detail
    assert json.loads((data / "city_summaries.json").read_text())["amsterdam"]["summary_en"] is None


def test_unchanged_data_passes_without_changes(tmp_path):
    data = _data_dir(tmp_path, _summaries(LEAD))
    report = run_gates(
        data, _baseline(_summaries(LEAD)), {"amsterdam"}, fix=True, format_files=FakeFormatter()
    )
    assert not report.blocked
    assert report.findings == []
    assert report.changed_datasets == []


def test_a_blocking_dataset_blocks_the_whole_refresh(tmp_path):
    data = _data_dir(tmp_path, _summaries(LEAD), visa_rows=50)
    report = run_gates(
        data, _baseline(_summaries(LEAD)), {"amsterdam"}, fix=True, format_files=FakeFormatter()
    )
    assert report.blocked
    assert report.changed_datasets == ["visa"]


def test_a_city_file_that_disappeared_is_blocked_unless_the_city_was_removed(tmp_path):
    data = _data_dir(tmp_path, _summaries(LEAD))
    baseline = _baseline(_summaries(LEAD))
    baseline.files["attractions/porto.json"] = json.dumps({"city": "porto", "attractions": []})
    assert run_gates(data, baseline, {"amsterdam", "porto"}, fix=False).blocked
    assert not run_gates(data, baseline, {"amsterdam"}, fix=False).blocked


def test_the_report_lists_what_the_gate_did():
    report = GateReport(
        findings=[
            Finding("city-summaries", "amsterdam", "summary_en", "restored", "disambiguation"),
            Finding("visa", "P0→NL", "requirement", "review", "visa_free 90 days → visa_required"),
        ],
        changed_datasets=["city-summaries", "visa"],
    )
    text = report.markdown()
    assert "✅ Passed" in text
    assert "| city-summaries | 1 | 0 | 0 | 0 |" in text
    assert "- `amsterdam` · summary_en — disambiguation" in text
    assert "- `P0→NL` · requirement — visa_free 90 days → visa_required" in text


def test_the_changelog_gets_one_data_line_under_unreleased():
    changelog = (
        "# Changelog\n\n## Unreleased\n\n### Added\n\n- Something.\n\n"
        "## 2026-09-01\n\n### Data\n\n- Old.\n"
    )
    updated = add_data_entry(changelog, "- Scheduled data refresh.")
    assert updated == (
        "# Changelog\n\n## Unreleased\n\n### Added\n\n- Something.\n\n### Data\n\n"
        "- Scheduled data refresh.\n\n## 2026-09-01\n\n### Data\n\n- Old.\n"
    )
    again = add_data_entry(updated, "- Second refresh.")
    assert "### Data\n\n- Second refresh.\n- Scheduled data refresh.\n" in again


def test_the_refresh_changelog_line_says_what_changed_and_what_the_gate_did():
    from datetime import date

    from wayfarer_pipeline.gates.changelog import refresh_line

    report = GateReport(
        findings=[
            Finding("city-summaries", "amsterdam", "summary_en", "restored", "disambiguation"),
            Finding("countries", "NL", "police_number", "review", "'112' → '0900-8844'"),
            Finding("countries", "NL", "plug_types", "restored", "['C', 'F'] disappeared"),
        ],
        changed_datasets=["countries", "attractions"],
    )
    assert refresh_line(report, date(2026, 11, 1)) == (
        "- Scheduled data refresh (2026-11-01, D-042): countries, attractions updated from their "
        "sources; the data gate restored 2 value(s) that got worse and flagged 1 change(s) "
        "for review."
    )
