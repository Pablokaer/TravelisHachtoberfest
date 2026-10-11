"""Estimated everyday prices of a city (D-088): open data in, euros per item out, no network."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from test_climate import city

from wayfarer_pipeline import prices, seed_city_data

BIG_MAC_CSV = """date,iso_a3,currency_code,name,local_price,dollar_ex,dollar_price
2025-07-01,USA,USD,United States,5.79,1,5.79
2026-01-01,USA,USD,United States,6.00,1,6.00
2026-01-01,EUZ,EUR,Euro area,5.40,0.9,6.00
2026-01-01,JPN,JPY,Japan,480,150,3.20
2026-01-01,TWN,TWD,Taiwan,75,30,2.50
"""


def worldbank(rows: list[tuple[str, str, float | None]]) -> str:
    items = [{"countryiso3code": c, "date": d, "value": v} for c, d, v in rows]
    return json.dumps([{"page": 1}, items])


PPP = worldbank(
    [("PRT", "2024", 0.55), ("PRT", "2023", 0.5), ("USA", "2024", 1.0), ("JPN", "2024", 90.0)]
)
FX = worldbank(
    [("PRT", "2024", 0.92), ("PRT", "2023", 0.9), ("USA", "2024", 1.0), ("JPN", "2024", 150.0)]
)
COUNTRIES = json.dumps(
    [
        {"page": 1},
        [
            {"id": "PRT", "iso2Code": "PT"},
            {"id": "USA", "iso2Code": "US"},
            {"id": "JPN", "iso2Code": "JP"},
            {"id": "TWN", "iso2Code": "TW"},
            {"id": "ESP", "iso2Code": "ES"},
            {"id": "ZZZ", "iso2Code": "ZZ"},
        ],
    ]
)
USD_EUR = json.dumps({"amount": 1.0, "base": "USD", "date": "2026-10-09", "rates": {"EUR": 0.9}})


class FakeSources:
    """Answers each public source by a part of its URL; remembers what was asked."""

    def __init__(self) -> None:
        self.urls: list[str] = []

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        self.urls.append(url)
        for part, body in (
            ("big-mac-full-index", BIG_MAC_CSV),
            ("PA.NUS.PRVT.PP", PPP),
            ("PA.NUS.FCRF", FX),
            ("api.worldbank.org/v2/country?", COUNTRIES),
            ("frankfurter", USD_EUR),
        ):
            if part in url:
                return 200, body
        return 404, "not found"


def sources() -> prices.Sources:
    return prices.fetch_sources(FakeSources())


def city_in(slug: str, country: str) -> Any:
    return city(slug).model_copy(update={"country_code": country})


def basket() -> prices.Basket:
    return prices.Basket(
        items_usd={k: 10.0 for k in prices.ITEMS if k != "big_mac"},
        euro_area=frozenset({"PT", "ES"}),
        proxies={"AD": "PT"},
    )


def test_the_latest_big_mac_price_of_each_country_is_read() -> None:
    parsed = prices.parse_big_mac(BIG_MAC_CSV)
    assert parsed["USA"] == 6.0
    assert parsed["JPN"] == 3.2


def test_the_price_level_is_ppp_over_the_exchange_rate_of_the_latest_year_with_both() -> None:
    levels = prices.parse_price_levels(PPP, FX)
    assert levels["USA"] == pytest.approx(1.0)
    assert levels["PRT"] == pytest.approx(0.55 / 0.92)
    assert levels["JPN"] == pytest.approx(0.6)


def test_a_year_missing_one_of_the_two_values_is_skipped() -> None:
    ppp = worldbank([("PRT", "2024", None), ("PRT", "2023", 0.5)])
    fx = worldbank([("PRT", "2024", 0.92), ("PRT", "2023", 0.9)])
    assert prices.parse_price_levels(ppp, fx)["PRT"] == pytest.approx(0.5 / 0.9)


def test_country_codes_map_two_letters_to_three() -> None:
    assert prices.parse_country_codes(COUNTRIES)["PT"] == "PRT"


def test_the_euro_rate_is_read_from_the_exchange_answer() -> None:
    assert prices.parse_usd_eur(USD_EUR) == 0.9


def test_a_euro_country_uses_the_euro_area_big_mac_and_its_own_price_level() -> None:
    basis = prices.country_basis("PT", basket(), sources())
    assert basis.big_mac_usd == 6.0
    assert basis.big_mac_is_real is True
    assert basis.price_level == pytest.approx(0.55 / 0.92)


def test_a_country_without_a_price_level_is_estimated_like_its_proxy() -> None:
    assert prices.country_basis("AD", basket(), sources()) == prices.country_basis(
        "PT", basket(), sources()
    )


def test_without_a_price_level_the_big_mac_tells_how_expensive_the_country_is() -> None:
    basis = prices.country_basis("TW", basket(), sources())
    assert basis.price_level == pytest.approx(2.5 / 6.0)
    assert basis.big_mac_usd == 2.5


def test_taiwan_is_found_by_its_own_code_when_the_world_bank_list_lacks_it() -> None:
    no_taiwan = prices.Sources(
        big_mac={"USA": 6.0, "TWN": 2.5}, levels={}, codes={"US": "USA"}, usd_eur=0.9
    )
    assert prices.country_basis("TW", basket(), no_taiwan).big_mac_usd == 2.5


def test_a_country_with_no_data_at_all_is_an_error_naming_it() -> None:
    with pytest.raises(prices.PricesError, match="ZZ"):
        prices.country_basis("ZZ", basket(), sources())


def test_a_city_price_is_the_basket_times_the_level_in_euros() -> None:
    doc = prices.build_city(city("lisbon"), basket(), sources(), date(2026, 10, 11))
    level = 0.55 / 0.92
    assert doc["prices"]["beer"] == pytest.approx(10.0 * level * 0.9, abs=0.01)
    assert doc["currency"] == "EUR"
    assert doc["retrieved"] == "2026-10-11"
    assert doc["price_level"] == pytest.approx(level, abs=0.001)


def test_the_big_mac_is_the_real_price_in_euros_when_the_index_has_the_country() -> None:
    doc = prices.build_city(city_in("tokyo", "JP"), basket(), sources())
    assert doc["prices"]["big_mac"] == pytest.approx(3.2 * 0.9, abs=0.01)
    assert doc["big_mac_is_real"] is True


def test_every_item_is_priced_and_positive() -> None:
    doc = prices.build_city(city("lisbon"), basket(), sources())
    assert set(doc["prices"]) == set(prices.ITEMS)
    assert all(value > 0 for value in doc["prices"].values())


def test_the_sources_are_named_in_the_snapshot() -> None:
    doc = prices.build_city(city("lisbon"), basket(), sources())
    assert any("Big Mac" in s for s in doc["sources"])
    assert any("World Bank" in s for s in doc["sources"])


def test_snapshots_are_saved_and_loaded_back_by_city(tmp_path: Path) -> None:
    doc = prices.build_city(city("lisbon"), basket(), sources())
    prices.save(doc, tmp_path, format_json=False)
    assert prices.load_all(tmp_path)["lisbon"]["prices"] == doc["prices"]


def test_the_summary_counts_the_cities_and_the_real_big_macs() -> None:
    docs = {
        "lisbon": prices.build_city(city("lisbon"), basket(), sources()),
        "tokyo": prices.build_city(city_in("tokyo", "JP"), basket(), sources()),
    }
    assert prices.summary_line(docs) == "2 cities: 2 with a real Big Mac price"


def test_the_seed_upserts_one_row_per_city_sorted_by_slug() -> None:
    docs = {
        "porto": prices.build_city(city("porto"), basket(), sources()),
        "lisbon": prices.build_city(city("lisbon"), basket(), sources()),
    }
    sql = seed_city_data.prices_sql(docs)
    assert "public.city_prices" in sql
    assert sql.index("'lisbon'") < sql.index("'porto'")
    assert "on conflict (city_slug) do update" in sql.lower()


def test_a_failing_source_is_reported_with_its_address() -> None:
    class Down:
        def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
            return 503, "busy"

    with pytest.raises(prices.PricesError, match="503"):
        prices.fetch_sources(Down())
