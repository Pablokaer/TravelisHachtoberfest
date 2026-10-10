"""Monthly climate normals per city from Open-Meteo's historical archive (D-081)."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from wayfarer_pipeline import climate, seed_city_data
from wayfarer_pipeline.config import City, LocalizedName
from wayfarer_pipeline.http import POLICIES


def city(slug: str = "lisbon") -> City:
    return City(
        slug=slug,
        name=LocalizedName(en="Lisbon", pt="Lisboa"),
        country_code="PT",
        wikidata_id="Q597",
        center=(38.72, -9.14),
        bbox=(38.6, -9.3, 38.8, -9.0),
    )


def archive(
    years: tuple[int, ...] = (2015, 2016),
    day: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """An Open-Meteo answer with one value per day, the same every day unless ``day`` says."""
    base = {
        "temperature_2m_mean": 10.0,
        "temperature_2m_max": 14.0,
        "precipitation_sum": 2.0,
        "snowfall_sum": 0.5,
        "sunshine_duration": 18000.0,
    }
    base.update(day or {})
    days = []
    for year in years:
        cursor = date(year, 1, 1)
        while cursor.year == year:
            days.append(cursor)
            cursor += timedelta(days=1)
    daily: dict[str, Any] = {"time": [d.isoformat() for d in days]}
    for name, value in base.items():
        daily[name] = [value] * len(days)
    return {"daily": daily}


class FakeOpenMeteo:
    """Records the request and answers with one canned document."""

    def __init__(self, doc: dict[str, Any]) -> None:
        self.doc, self.requests = doc, []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        self.requests.append((url, kwargs["params"]))
        return 200, json.dumps(self.doc)


def test_a_constant_climate_gives_twelve_identical_months() -> None:
    months = climate.monthly_normals(archive())
    assert [m["month"] for m in months] == list(range(1, 13))
    assert months[0] == {
        "month": 1,
        "temp_mean_c": 10.0,
        "temp_max_c": 14.0,
        "precip_mm": 62.0,  # 2 mm a day over January's 31 days
        "snowfall_cm": 15.5,
        "sunshine_hours": 5.0,  # 18000 s a day
    }


def test_precipitation_is_the_mean_monthly_total_not_the_mean_day() -> None:
    doc = archive((2015,))
    doc["daily"]["precipitation_sum"] = [
        10.0 if t.startswith("2015-02") else 0.0 for t in doc["daily"]["time"]
    ]
    feb = climate.monthly_normals(doc)[1]
    assert feb["precip_mm"] == 280.0  # ten millimetres on each of February's 28 days


def test_totals_average_over_the_years() -> None:
    doc = archive((2015, 2016))
    rain = [1.0 if t.startswith("2015") else 3.0 for t in doc["daily"]["time"]]
    doc["daily"]["precipitation_sum"] = rain
    assert climate.monthly_normals(doc)[0]["precip_mm"] == 62.0  # mean of 31 mm and 93 mm


def test_days_without_a_reading_are_skipped_and_a_month_with_none_is_an_error() -> None:
    doc = archive((2015,))
    doc["daily"]["temperature_2m_mean"][0] = None
    assert climate.monthly_normals(doc)[0]["temp_mean_c"] == 10.0
    doc["daily"]["temperature_2m_mean"] = [None] * len(doc["daily"]["time"])
    with pytest.raises(ValueError, match="temperature_2m_mean.*month 1"):
        climate.monthly_normals(doc)


def test_fetch_asks_for_ten_years_of_daily_values_at_the_city_centre() -> None:
    client = FakeOpenMeteo(archive())
    doc = climate.fetch_city(client, city(), today=date(2026, 10, 10))
    url, params = client.requests[0]
    assert url == "https://archive-api.open-meteo.com/v1/archive"
    assert (params["latitude"], params["longitude"]) == (38.72, -9.14)
    assert (params["start_date"], params["end_date"]) == ("2015-01-01", "2024-12-31")
    assert params["daily"] == (
        "temperature_2m_mean,temperature_2m_max,precipitation_sum,snowfall_sum,sunshine_duration"
    )
    assert doc["city"] == "lisbon" and doc["retrieved"] == "2026-10-10"
    assert doc["source"] == "open-meteo-archive" and len(doc["months"]) == 12


def test_an_answer_without_daily_values_names_the_city() -> None:
    with pytest.raises(ValueError, match="lisbon"):
        climate.fetch_city(FakeOpenMeteo({"reason": "limit"}), city())


def test_snapshots_round_trip(tmp_path: Path) -> None:
    doc = climate.fetch_city(FakeOpenMeteo(archive()), city(), today=date(2026, 1, 1))
    climate.save(doc, tmp_path, format_json=False)
    assert climate.load_all(tmp_path) == {"lisbon": doc}


def test_open_meteo_gets_a_polite_policy() -> None:
    assert POLICIES["archive-api.open-meteo.com"].min_interval >= 1.0


def test_climate_seed_is_an_idempotent_upsert_in_city_and_month_order() -> None:
    doc = climate.fetch_city(FakeOpenMeteo(archive()), city(), today=date(2026, 1, 1))
    sql = seed_city_data.climate_sql({"lisbon": doc, "aachen": {**doc, "city": "aachen"}})
    assert "insert into public.city_climate (" in sql
    assert "on conflict (city_slug, month) do update set" in sql
    assert sql.index("'aachen', 1,") < sql.index("'lisbon', 1,") < sql.index("'lisbon', 2,")
    assert "('lisbon', 12, 10.0, 14.0, 62.0, 15.5, 5.0)" in sql
    assert "updated_at" not in sql  # the table has no such column


def test_the_year_window_can_be_shortened_to_fit_the_free_quota() -> None:
    """Open-Meteo weighs a request by its days: ten years cost ~130 calls of a 10,000/day quota."""
    client = FakeOpenMeteo(archive((2022, 2023, 2024)))
    doc = climate.fetch_city(client, city(), first_year=2022)
    params = client.requests[0][1]
    assert (params["start_date"], params["end_date"]) == ("2022-01-01", "2024-12-31")
    assert doc["period"] == "2022-2024"
