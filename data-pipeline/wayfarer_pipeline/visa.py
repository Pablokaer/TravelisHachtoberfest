"""Visa requirements from passport-index-dataset (ilyankou, MIT).

Output: ``data/visa.csv`` (committed snapshot) + ``data/visa_source.json`` → ``30_visa.sql``.
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from .countries import FREE_MOVEMENT
from .http import HttpClient
from .paths import VISA_CSV, VISA_META, prettier

REPO = "ilyankou/passport-index-dataset"
CSV_URL = f"https://raw.githubusercontent.com/{REPO}/master/passport-index-tidy-iso2.csv"
COMMITS_URL = f"https://api.github.com/repos/{REPO}/commits"
SOURCE = "passport-index-dataset"

REQUIREMENTS = {
    "visa free": "visa_free",
    "visa on arrival": "visa_on_arrival",
    "eta": "eta",
    "e-visa": "e_visa",
    "visa required": "visa_required",
    "no admission": "no_admission",
}


def normalize_requirement(value: str) -> tuple[str, int | None] | None:
    """Map a dataset cell to ``(requirement, max_stay_days)``; ``None`` means skip the row."""
    v = value.strip().lower()
    if v == "-1":  # passport == destination
        return None
    if re.fullmatch(r"\d+", v):
        days = int(v)
        return ("visa_free", days if days > 0 else None)
    if v in REQUIREMENTS:
        return (REQUIREMENTS[v], None)
    raise ValueError(f"unknown visa requirement {value!r}")


def normalize(
    rows: Iterable[dict[str, str]], known_codes: set[str]
) -> tuple[list[dict[str, Any]], set[str]]:
    """Returns sorted rows and the set of codes skipped because they are not in ``countries``."""
    out: list[dict[str, Any]] = []
    skipped: set[str] = set()
    for r in rows:
        passport, destination = r["Passport"].strip().upper(), r["Destination"].strip().upper()
        if passport == destination:
            continue
        parsed = normalize_requirement(r["Requirement"])
        if parsed is None:
            continue
        missing = {c for c in (passport, destination) if c not in known_codes}
        if missing:
            skipped |= missing
            continue
        requirement, days = parsed
        if passport in FREE_MOVEMENT and destination in FREE_MOVEMENT:
            requirement, days = "freedom_of_movement", None
        out.append(
            {
                "passport": passport,
                "destination": destination,
                "requirement": requirement,
                "max_stay_days": days,
            }
        )
    out.sort(key=lambda r: (r["passport"], r["destination"]))
    return out, skipped


def fetch(client: HttpClient) -> tuple[list[dict[str, str]], dict[str, str]]:
    _, text = client.request("GET", CSV_URL, namespace="passport-index")
    _, commits = client.request(
        "GET",
        COMMITS_URL,
        namespace="github",
        params={"per_page": "1", "path": "passport-index-tidy-iso2.csv"},
    )
    last = json.loads(commits)[0]
    meta = {
        "source": SOURCE,
        "url": CSV_URL,
        "licence": "MIT",
        "commit": last["sha"],
        "commit_date": last["commit"]["committer"]["date"],
    }
    return list(csv.DictReader(io.StringIO(text))), meta


def save(rows: list[dict[str, Any]], meta: dict[str, str]) -> None:
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf, fieldnames=["passport", "destination", "requirement", "max_stay_days"]
    )
    writer.writeheader()
    for r in rows:
        writer.writerow(
            {**r, "max_stay_days": "" if r["max_stay_days"] is None else r["max_stay_days"]}
        )
    VISA_CSV.write_text(buf.getvalue(), encoding="utf-8")
    VISA_META.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    prettier(VISA_META)


def load(path: Path = VISA_CSV) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8", newline="") as fh:
        return [
            {
                "passport": r["passport"],
                "destination": r["destination"],
                "requirement": r["requirement"],
                "max_stay_days": int(r["max_stay_days"]) if r["max_stay_days"] else None,
            }
            for r in csv.DictReader(fh)
        ]
