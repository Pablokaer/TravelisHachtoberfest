"""Runs every dataset's gate on the snapshots in ``data_dir`` against a committed baseline."""

from __future__ import annotations

import csv
import io
import json
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path

from ..paths import prettier
from . import attractions, countries, summaries, visa
from .baseline import Baseline
from .findings import Finding, GateReport, GuardResult

FormatFiles = Callable[..., None]


@dataclass
class DatasetOutcome:
    dataset: str
    findings: list[Finding]
    changed: bool
    # Where the repaired data goes, and the data (None when nothing was repaired).
    path: Path | None = None
    repaired: object | None = None


def _json(text: str | None) -> object | None:
    return json.loads(text) if text else None


def _read_json(path: Path) -> object | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _outcome(
    dataset: str, path: Path, fetched: object, old: object, result: GuardResult
) -> DatasetOutcome:
    repaired = result.data if result.data != fetched else None
    return DatasetOutcome(dataset, result.findings, result.data != old, path, repaired)


def _countries(data_dir: Path, baseline: Baseline) -> DatasetOutcome:
    path = data_dir / "countries.json"
    fetched, old = _read_json(path) or [], _json(baseline.read_text("countries.json")) or []
    return _outcome("countries", path, fetched, old, countries.guard(fetched, old))


def _summaries(data_dir: Path, baseline: Baseline) -> DatasetOutcome:
    path = data_dir / "city_summaries.json"
    fetched, old = _read_json(path) or {}, _json(baseline.read_text("city_summaries.json")) or {}
    return _outcome("city-summaries", path, fetched, old, summaries.guard(fetched, old))


def _visa_rows(text: str | None) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text))) if text else []


def _visa(data_dir: Path, baseline: Baseline) -> DatasetOutcome:
    path = data_dir / "visa.csv"
    fetched = _visa_rows(path.read_text(encoding="utf-8") if path.exists() else None)
    old = _visa_rows(baseline.read_text("visa.csv"))
    return DatasetOutcome("visa", visa.check(fetched, old), fetched != old)


def _city(data_dir: Path, baseline: Baseline, name: str, city_slugs: set[str]) -> DatasetOutcome:
    path, slug = data_dir / "attractions" / name, name.removesuffix(".json")
    fetched, old = _read_json(path), _json(baseline.read_text(f"attractions/{name}"))
    if fetched is None:
        gone = [Finding("attractions", slug, "file", "blocked", "city file missing")]
        return DatasetOutcome("attractions", gone if slug in city_slugs else [], True)
    return _outcome("attractions", path, fetched, old, attractions.guard(slug, fetched, old))


def _cities(data_dir: Path, baseline: Baseline, city_slugs: set[str]) -> list[DatasetOutcome]:
    names = {p.name for p in (data_dir / "attractions").glob("*.json")}
    names |= set(baseline.list_attraction_files())
    return [_city(data_dir, baseline, name, city_slugs) for name in sorted(names)]


def _check_mode(finding: Finding) -> Finding:
    """Without --fix a text regression is not repaired, so it blocks."""
    if finding.action != "restored":
        return finding
    return replace(finding, action="blocked", detail=f"{finding.detail} (run `gate --fix`)")


def _write(outcomes: list[DatasetOutcome], format_files: FormatFiles) -> None:
    written = []
    for o in outcomes:
        if o.path is not None and o.repaired is not None:
            o.path.write_text(
                json.dumps(o.repaired, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            written.append(o.path)
    if written:
        format_files(*written)


def run_gates(
    data_dir: Path,
    baseline: Baseline,
    city_slugs: set[str],
    fix: bool,
    format_files: FormatFiles = prettier,
) -> GateReport:
    """Gates every dataset; with ``fix`` writes the repaired snapshots back to ``data_dir``.

    >>> run_gates(DATA_DIR, GitBaseline("HEAD"), {"amsterdam"}, fix=True).blocked  # False
    """
    outcomes = [
        _countries(data_dir, baseline),
        _visa(data_dir, baseline),
        _summaries(data_dir, baseline),
    ]
    outcomes += _cities(data_dir, baseline, city_slugs)
    if fix:
        _write(outcomes, format_files)
    findings = [f if fix else _check_mode(f) for o in outcomes for f in o.findings]
    changed = [
        d
        for d in ("countries", "visa", "city-summaries", "attractions")
        if any(o.changed for o in outcomes if o.dataset == d)
    ]
    return GateReport(findings, changed)
