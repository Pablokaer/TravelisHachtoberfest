"""Monthly climate normals per city (D-081): Open-Meteo's historical archive (ERA5, CC BY 4.0).

Ten years of daily values (2015–2024) at the city centre, averaged per calendar month:
mean of the daily mean / maximum temperature, **mean monthly total** of rain and snow, and mean
**daily** sunshine hours. One file per city: ``data/climate/<slug>.json``.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any, Protocol

from .config import City
from .paths import CLIMATE_DIR, prettier

ENDPOINT = "https://archive-api.open-meteo.com/v1/archive"
FIRST_YEAR, LAST_YEAR = 2015, 2024
DAILY = (
    "temperature_2m_mean",
    "temperature_2m_max",
    "precipitation_sum",
    "snowfall_sum",
    "sunshine_duration",
)
SECONDS_PER_HOUR = 3600.0

Month = dict[str, float | int]


class ClimateClient(Protocol):
    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]: ...


def _readings(daily: dict[str, Any], name: str, indices: list[int]) -> list[float]:
    return [daily[name][i] for i in indices if daily[name][i] is not None]


def _mean_of(daily: dict[str, Any], name: str, indices: list[int], month: int) -> float:
    values = _readings(daily, name, indices)
    if not values:
        raise ValueError(f"no readings of {name} in month {month}; expected daily values")
    return sum(values) / len(values)


def _mean_total(daily: dict[str, Any], name: str, indices: list[int], month: int) -> float:
    """Mean over the years of the month's total (a year's days summed)."""
    if not _readings(daily, name, indices):
        raise ValueError(f"no readings of {name} in month {month}; expected daily values")
    by_year: dict[str, list[int]] = {}
    for i in indices:
        by_year.setdefault(daily["time"][i][:4], []).append(i)
    totals = [sum(_readings(daily, name, days)) for days in by_year.values()]
    return sum(totals) / len(totals)


def monthly_normals(archive: dict[str, Any]) -> list[Month]:
    """Twelve rows from an Open-Meteo ``daily`` block (one value per day).

    >>> monthly_normals(archive)[11]["temp_mean_c"]  # December's mean daily temperature
    """
    daily = archive["daily"]
    months: list[Month] = []
    for month in range(1, 13):
        days = [i for i, t in enumerate(daily["time"]) if int(t[5:7]) == month]
        months.append(
            {
                "month": month,
                "temp_mean_c": round(_mean_of(daily, DAILY[0], days, month), 1),
                "temp_max_c": round(_mean_of(daily, DAILY[1], days, month), 1),
                "precip_mm": round(_mean_total(daily, DAILY[2], days, month), 1),
                "snowfall_cm": round(_mean_total(daily, DAILY[3], days, month), 1),
                "sunshine_hours": round(
                    _mean_of(daily, DAILY[4], days, month) / SECONDS_PER_HOUR, 1
                ),
            }
        )
    return months


def fetch_city(
    client: ClimateClient,
    city: City,
    today: date | None = None,
    first_year: int = FIRST_YEAR,
    last_year: int = LAST_YEAR,
) -> dict[str, Any]:
    """The city's climate snapshot, from one archive request at its centre.

    Open-Meteo weighs a request by its days (ten years ≈ 130 of the free tier's 10,000 calls a
    day), so ``first_year`` can shorten the window; the snapshot records the ``period`` it used.
    """
    lat, lng = city.center
    _, text = client.request(
        "GET",
        ENDPOINT,
        namespace="open-meteo",
        params={
            "latitude": lat,
            "longitude": lng,
            "start_date": f"{first_year}-01-01",
            "end_date": f"{last_year}-12-31",
            "daily": ",".join(DAILY),
            "timezone": "GMT",
        },
    )
    archive = json.loads(text)
    if "daily" not in archive:
        raise ValueError(f"Open-Meteo gave no daily values for {city.slug}: {text[:120]!r}")
    return {
        "city": city.slug,
        "retrieved": (today or date.today()).isoformat(),
        "source": "open-meteo-archive",
        "period": f"{first_year}-{last_year}",
        "latitude": lat,
        "longitude": lng,
        "months": monthly_normals(archive),
    }


def save(doc: dict[str, Any], directory: Path = CLIMATE_DIR, format_json: bool = True) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{doc['city']}.json"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    if format_json:
        prettier(path)
    return path


def load_all(directory: Path = CLIMATE_DIR) -> dict[str, dict[str, Any]]:
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))
    }


def summary_line(docs: dict[str, dict[str, Any]]) -> str:
    """``"198 cities, 198 with all 12 months"`` for the CLI."""
    full = sum(1 for d in docs.values() if len(d["months"]) == 12)
    return f"{len(docs)} cities, {full} with all 12 months"
