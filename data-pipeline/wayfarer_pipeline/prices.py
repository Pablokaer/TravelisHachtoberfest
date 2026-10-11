"""Estimated everyday prices of a city (D-088): drinks, meals, McDonald's, transport and a ride.

No free source publishes the price of a beer in every city, so the estimate is *modelled* and says
so: a reference basket (``data/price_basket.yaml``, assumptions) scaled by the country's price
level (World Bank: household-consumption PPP over the exchange rate) and converted to euros with
the day's rate. The one measured figure is McDonald's, the Big Mac price of The Economist's index.
One file per city: ``data/prices/<slug>.json``.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Protocol

import yaml

from .config import City
from .paths import DATA_DIR, PRICES_DIR, prettier

BASKET_FILE = DATA_DIR / "price_basket.yaml"
ITEMS = (
    "beer",
    "soft_drink",
    "cocktail",
    "coffee",
    "meal_cheap",
    "meal_mid",
    "local_dish",
    "big_mac",
    "transport_ticket",
    "taxi_5km",
)
BIG_MAC_URL = (
    "https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/"
    "output-data/big-mac-full-index.csv"
)
WORLD_BANK = "https://api.worldbank.org/v2"
PPP_INDICATOR = "PA.NUS.PRVT.PP"  # LCU per international $, households' final consumption
FX_INDICATOR = "PA.NUS.FCRF"  # LCU per US$, official, period average
LEVEL_YEARS = "2019:2025"
RATE_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR"
EURO_AREA_BIG_MAC = "EUZ"
# The World Bank country list has no Taiwan, but the Big Mac index does.
EXTRA_CODES = {"TW": "TWN"}
UNITED_STATES = "USA"
SOURCES = [
    "The Economist, Big Mac index (McDonald's price per country)",
    "World Bank, PPP conversion factor of household consumption and official exchange rate",
    "Frankfurter (ECB reference rates), USD to EUR",
    "Reference basket: assumptions in data-pipeline/data/price_basket.yaml",
]


class PricesError(RuntimeError):
    """A source did not answer or a country cannot be priced; the message names which."""


class PriceClient(Protocol):
    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]: ...


@dataclass(frozen=True)
class Basket:
    """The reference basket: USD prices at price level 1.00, the euro area, and proxy countries."""

    items_usd: dict[str, float]
    euro_area: frozenset[str]
    proxies: dict[str, str]


@dataclass(frozen=True)
class Sources:
    """What the public sources said: Big Mac USD by ISO-3, price levels, codes and the rate."""

    big_mac: dict[str, float]
    levels: dict[str, float]
    codes: dict[str, str]
    usd_eur: float


@dataclass(frozen=True)
class CountryBasis:
    """How expensive a country is: its price level and its Big Mac (real or modelled)."""

    price_level: float
    big_mac_usd: float
    big_mac_is_real: bool


def load_basket(path: Path = BASKET_FILE) -> Basket:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    missing = [item for item in ITEMS if item != "big_mac" and item not in raw["items_usd"]]
    if missing:
        raise PricesError(f"{path} lacks {missing}; expected a USD price for each of {ITEMS}")
    return Basket(
        items_usd={k: float(v) for k, v in raw["items_usd"].items()},
        euro_area=frozenset(raw["euro_area"]),
        proxies=dict(raw.get("proxies", {})),
    )


def parse_big_mac(text: str) -> dict[str, float]:
    """``{iso3: USD price}`` of the latest row of each country (``EUZ`` is the euro area).

    >>> parse_big_mac(csv_text)["USA"]  # 6.0
    """
    latest: dict[str, tuple[str, float]] = {}
    for row in csv.DictReader(io.StringIO(text)):
        iso3, when = row["iso_a3"], row["date"]
        if iso3 not in latest or when >= latest[iso3][0]:
            latest[iso3] = (when, float(row["dollar_price"]))
    return {iso3: price for iso3, (_, price) in latest.items()}


def _by_year(text: str) -> dict[str, dict[str, float]]:
    """``{iso3: {year: value}}`` of a World Bank indicator answer, without the empty years."""
    series: dict[str, dict[str, float]] = {}
    for row in json.loads(text)[1] or []:
        if row.get("value") is not None:
            series.setdefault(row["countryiso3code"], {})[row["date"]] = float(row["value"])
    return series


def parse_price_levels(ppp: str, fx: str) -> dict[str, float]:
    """``{iso3: price level}``: PPP over the exchange rate in the latest year that has both
    (the United States is 1.0; Italy 0.68 means 32 % cheaper)."""
    ppp_by_year, fx_by_year = _by_year(ppp), _by_year(fx)
    levels: dict[str, float] = {}
    for iso3, years in ppp_by_year.items():
        shared = sorted(set(years) & set(fx_by_year.get(iso3, {})))
        if shared:
            levels[iso3] = years[shared[-1]] / fx_by_year[iso3][shared[-1]]
    return levels


def parse_country_codes(text: str) -> dict[str, str]:
    """``{ISO-2: ISO-3}`` from the World Bank country list."""
    return {row["iso2Code"]: row["id"] for row in json.loads(text)[1]}


def parse_usd_eur(text: str) -> float:
    return float(json.loads(text)["rates"]["EUR"])


def _get(client: PriceClient, url: str) -> str:
    status, body = client.request("GET", url, namespace="prices")
    if status != 200:
        raise PricesError(f"GET {url} answered {status}; expected 200")
    return body


def fetch_sources(client: PriceClient) -> Sources:
    """Reads the four public sources once for the whole run.

    >>> fetch_sources(HttpClient()).usd_eur  # 0.89
    """
    wb = f"{WORLD_BANK}/country/all/indicator"
    query = f"format=json&per_page=20000&date={LEVEL_YEARS}"
    return Sources(
        big_mac=parse_big_mac(_get(client, BIG_MAC_URL)),
        levels=parse_price_levels(
            _get(client, f"{wb}/{PPP_INDICATOR}?{query}"),
            _get(client, f"{wb}/{FX_INDICATOR}?{query}"),
        ),
        codes=parse_country_codes(_get(client, f"{WORLD_BANK}/country?format=json&per_page=400")),
        usd_eur=parse_usd_eur(_get(client, RATE_URL)),
    )


def _big_mac_of(country: str, iso3: str | None, basket: Basket, sources: Sources) -> float | None:
    key = EURO_AREA_BIG_MAC if country in basket.euro_area else iso3
    return sources.big_mac.get(key) if key else None


def country_basis(country: str, basket: Basket, sources: Sources) -> CountryBasis:
    """The price level and Big Mac of a country (ISO-2): its own data, else a proxy country's,
    else the level the Big Mac implies against the United States; ``PricesError`` when none.

    >>> country_basis("PT", basket, sources).price_level  # 0.6
    """
    if country in basket.proxies:
        return country_basis(basket.proxies[country], basket, sources)
    iso3 = sources.codes.get(country) or EXTRA_CODES.get(country)
    big_mac = _big_mac_of(country, iso3, basket, sources)
    level = sources.levels.get(iso3) if iso3 else None
    if level is None and big_mac is not None and UNITED_STATES in sources.big_mac:
        level = big_mac / sources.big_mac[UNITED_STATES]
    if level is None:
        raise PricesError(
            f"no price level for country {country!r}: the World Bank and the Big Mac index have "
            f"none; expected one, or a proxy in {BASKET_FILE.name}"
        )
    if big_mac is not None:
        return CountryBasis(level, big_mac, True)
    return CountryBasis(level, sources.big_mac[UNITED_STATES] * level, False)


def build_city(
    city: City, basket: Basket, sources: Sources, today: date | None = None
) -> dict[str, Any]:
    """The city's snapshot: each item in euros (two decimals) and how it was worked out."""
    basis = country_basis(city.country_code, basket, sources)
    euros = {k: v * basis.price_level * sources.usd_eur for k, v in basket.items_usd.items()}
    euros["big_mac"] = basis.big_mac_usd * sources.usd_eur
    return {
        "city": city.slug,
        "country": city.country_code,
        "retrieved": (today or date.today()).isoformat(),
        "currency": "EUR",
        "price_level": round(basis.price_level, 3),
        "usd_eur": sources.usd_eur,
        "big_mac_is_real": basis.big_mac_is_real,
        "prices": {item: round(euros[item], 2) for item in ITEMS},
        "sources": SOURCES,
    }


def save(doc: dict[str, Any], directory: Path = PRICES_DIR, format_json: bool = True) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{doc['city']}.json"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    if format_json:
        prettier(path)
    return path


def load_all(directory: Path = PRICES_DIR) -> dict[str, dict[str, Any]]:
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json"))
    }


def summary_line(docs: dict[str, dict[str, Any]]) -> str:
    """``"198 cities: 120 with a real Big Mac price"``."""
    real = sum(1 for d in docs.values() if d.get("big_mac_is_real"))
    return f"{len(docs)} cities: {real} with a real Big Mac price"
