"""Country reference data: Wikidata SPARQL + IANA zone.tab + curated overrides.

Output: ``data/countries.json`` (committed snapshot) → ``supabase/seed/10_countries.sql``.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import yaml

from . import sparql
from .http import HttpClient
from .paths import COUNTRIES_JSON, COUNTRY_OVERRIDES, prettier


def _codes(text: str) -> frozenset[str]:
    return frozenset(text.split())


EU = _codes("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE")
SCHENGEN = _codes(
    "AT BE BG HR CZ DK EE FI FR DE GR HU IS IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH"
)
# EU + EEA + Switzerland: freedom of movement for citizens between these states.
FREE_MOVEMENT = EU | {"IS", "LI", "NO", "CH"}

assert len(EU) == 27 and len(SCHENGEN) == 29

# Wikidata item (P2853 value) → IEC plug letter. Verified against item labels 2026-09-27.
PLUG_QIDS: dict[str, str] = {
    "Q24288454": "A",  # NEMA 1-15
    "Q24288456": "B",  # NEMA 5-15
    "Q1378312": "C",  # Europlug
    "Q1383497": "D",  # BS 546 (5 A = type D; the 15 A variant is type M)
    "Q2335536": "E",  # Type E
    "Q1123613": "F",  # Schuko
    "Q1528507": "G",  # BS 1363
    "Q1266396": "H",  # Type H (SI 32)
    "Q2335539": "I",  # AS/NZS 3112
    "Q2335530": "J",  # SN 441011 (SEV 1011)
    "Q1502017": "K",  # Type K (Section 107-2-D1)
    "Q1520890": "L",  # Type L (CEI 23-50)
    "Q1653438": "N",  # IEC 60906-1
    # Q60740126 "AC power plugs and sockets: British and related types" is ambiguous (D/G/M).
}
# Fallback on labels for items not in PLUG_QIDS.
PLUG_LABELS: dict[str, str] = {
    "nema 1-15": "A",
    "type a": "A",
    "nema 5-15": "B",
    "type b": "B",
    "europlug": "C",
    "type c": "C",
    "bs 546": "D",
    "type d": "D",
    "type e": "E",
    "schuko": "F",
    "type f": "F",
    "bs 1363": "G",
    "type g": "G",
    "si 32": "H",
    "type h": "H",
    "as/nzs 3112": "I",
    "type i": "I",
    "sev 1011": "J",
    "sn 441011": "J",
    "type j": "J",
    "section 107-2-d1": "K",
    "type k": "K",
    "cei 23-50": "L",
    "type l": "L",
    "type m": "M",
    "iec 60906-1": "N",
    "nbr 14136": "N",
    "type n": "N",
}

DRIVING_SIDE = {"Q11920728": "left", "Q14565199": "right"}

# P366 ("has use") qualifier on P2852 (emergency phone number) statements.
POLICE_USES = {"Q35535"}  # police (not Q1758690 municipal police)
AMBULANCE_USES = {"Q860447"}  # emergency medical services
FIRE_USES = {"Q6498663", "Q107711"}  # fire department, firefighter
GENERAL_NUMBERS = ("999", "911", "000", "111", "119", "112")  # preference order

ZONE_TAB_URL = "https://raw.githubusercontent.com/eggert/tz/main/zone.tab"

# ISO 3166-1 "exceptionally reserved" / non-country codes that Wikidata also tags with P297.
NON_COUNTRY_CODES = frozenset(["AC", "CP", "CQ", "DG", "EA", "EU", "EZ", "IC", "TA", "UK", "UN"])

RANK_ORDER = {"PreferredRank": 0, "NormalRank": 1}


def plug_letter(qid: str, label: str | None) -> str | None:
    if qid in PLUG_QIDS:
        return PLUG_QIDS[qid]
    if label:
        return PLUG_LABELS.get(label.strip().lower())
    return None


def _rank(value: str) -> int:
    return RANK_ORDER.get(value.rsplit("#", 1)[-1], 9)


# ----------------------------------------------------------------------------------------
# SPARQL
# ----------------------------------------------------------------------------------------
BASE_QUERY = """
SELECT ?item ?code ?en ?pt ?sl ?isCountry ?isSov WHERE {
  ?item p:P297 ?st. ?st ps:P297 ?code; wikibase:rank ?r.
  FILTER(?r != wikibase:DeprecatedRank)
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
  ?item wikibase:sitelinks ?sl.
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?pt FILTER(lang(?pt) = "pt") }
  BIND(EXISTS { ?item wdt:P31 wd:Q6256 } AS ?isCountry)
  BIND(EXISTS { ?item wdt:P31 wd:Q3624078 } AS ?isSov)
}
"""

# Each detail query binds ?item from VALUES and a current (no end time), non-deprecated
# statement ?st of the given property.
_STMT = """
  VALUES ?item {{ {items} }}
  ?item p:{prop} ?st. ?st ps:{prop} ?v; wikibase:rank ?rank.
  FILTER(?rank != wikibase:DeprecatedRank)
  FILTER NOT EXISTS {{ ?st pq:P582 ?end }}
"""

DETAIL_QUERIES: dict[str, tuple[str, str]] = {
    "currency": ("P38", "SELECT ?item ?rank ?iso WHERE {{ {stmt} ?v wdt:P498 ?iso. }}"),
    "plug": (
        "P2853",
        "SELECT ?item ?v ?label WHERE {{ {stmt} OPTIONAL {{ ?v rdfs:label ?label "
        'FILTER(lang(?label) = "en") }} }}',
    ),
    "voltage": (
        "P2884",
        "SELECT ?item ?rank ?amount ?hz WHERE {{ {stmt} ?st psv:P2884 ?node. "
        "?node wikibase:quantityAmount ?amount. OPTIONAL {{ ?st pq:P2144 ?hz }} }}",
    ),
    "driving": ("P1622", "SELECT ?item ?rank ?v WHERE {{ {stmt} }}"),
    "calling": ("P474", "SELECT ?item ?rank ?v WHERE {{ {stmt} }}"),
    "emergency": (
        "P2852",
        "SELECT ?item ?st ?rank ?v ?num ?label ?use WHERE {{ {stmt} "
        "OPTIONAL {{ ?v wdt:P1329 ?num }} "
        'OPTIONAL {{ ?v rdfs:label ?label FILTER(lang(?label) = "en") }} '
        "OPTIONAL {{ ?st pq:P366 ?use }} }}",
    ),
    "language": ("P37", "SELECT ?item ?rank ?iso WHERE {{ {stmt} ?v wdt:P218 ?iso. }}"),
}


def fetch_raw(client: HttpClient) -> dict[str, Any]:
    base = sparql.run(client, BASE_QUERY)
    items = sorted({r["item"] for r in base})
    details: dict[str, list[dict[str, str]]] = {}
    for name, (prop, template) in DETAIL_QUERIES.items():
        rows: list[dict[str, str]] = []
        for chunk in sparql.chunks(items, 150):
            stmt = _STMT.format(items=sparql.values(chunk), prop=prop)
            rows.extend(sparql.run(client, template.format(stmt=stmt)))
        details[name] = rows
        print(f"  wikidata {name}: {len(rows)} rows")
    _, zone_tab = client.request("GET", ZONE_TAB_URL, namespace="iana")
    return {"base": base, "details": details, "zone_tab": zone_tab}


# ----------------------------------------------------------------------------------------
# Normalisation (pure functions, unit-tested)
# ----------------------------------------------------------------------------------------
def pick_items(base: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    """One Wikidata item per ISO code: prefer items that are an instance of country (Q6256) or
    sovereign state (Q3624078), then most sitelinks (e.g. Netherlands Q55 over the Kingdom of
    the Netherlands Q29999), then lowest QID (for determinism)."""
    by_code: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in base:
        code = row["code"].strip().upper()
        if re.fullmatch(r"[A-Z]{2}", code) and code not in NON_COUNTRY_CODES:
            by_code[code].append(row)

    def score(r: dict[str, str]) -> tuple:
        return (
            r.get("isCountry") != "true" and r.get("isSov") != "true",
            -int(r.get("sl", "0")),
            int(r["item"][1:]),
        )

    return {code: min(rows, key=score) for code, rows in by_code.items()}


def parse_zone_tab(text: str) -> dict[str, list[str]]:
    zones: dict[str, list[str]] = defaultdict(list)
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 3:
            for code in parts[0].split(","):
                zones[code.strip()].append(parts[2].strip())
    return dict(zones)


def normalize_number(label: str | None, num: str | None) -> str | None:
    for candidate in (label, num):
        if candidate:
            cleaned = candidate.strip()
            if re.fullmatch(r"\d{2,4}", cleaned):
                return cleaned
    if num:  # "+34-091" → "091"
        digits = re.sub(r"^\+\d+[-\s]", "", num.strip())
        if re.fullmatch(r"\d{2,4}", digits):
            return digits
    return None


def pick_emergency(rows: list[dict[str, str]]) -> dict[str, str | None]:
    """rows: one per (statement, use) with keys st, v, num, label, use."""
    statements: dict[str, dict[str, Any]] = {}
    for r in rows:
        st = statements.setdefault(
            r.get("st", r["v"]),
            {"number": normalize_number(r.get("label"), r.get("num")), "uses": set()},
        )
        if r.get("use"):
            st["uses"].add(r["use"])
    general: list[str] = []
    special: dict[str, list[str]] = {"police": [], "ambulance": [], "fire": []}
    for st in statements.values():
        number, uses = st["number"], st["uses"]
        if not number:
            continue
        if len(uses) == 1:
            use = next(iter(uses))
            if use in POLICE_USES:
                special["police"].append(number)
            elif use in AMBULANCE_USES:
                special["ambulance"].append(number)
            elif use in FIRE_USES:
                special["fire"].append(number)
        elif number in GENERAL_NUMBERS:
            general.append(number)

    def best_general() -> str | None:
        for candidate in GENERAL_NUMBERS:
            if candidate in general:
                return candidate
        return None

    return {
        "emergency_number": best_general(),
        "police_number": min(special["police"], default=None),
        "ambulance_number": min(special["ambulance"], default=None),
        "fire_number": min(special["fire"], default=None),
    }


def pick_voltage(rows: list[dict[str, str]]) -> tuple[int | None, int | None]:
    """Household voltage: best rank, then highest value within 100–240 V."""
    candidates = []
    for r in rows:
        try:
            volts = round(float(r["amount"]))
        except (KeyError, ValueError):
            continue
        if 100 <= volts <= 240:
            hz = round(float(r["hz"])) if r.get("hz") else None
            candidates.append((_rank(r.get("rank", "")), -volts, hz is None, volts, hz))
    if not candidates:
        return None, None
    best = min(candidates)
    return best[3], best[4]


def pick_calling_code(rows: list[dict[str, str]]) -> str | None:
    codes = []
    for r in rows:
        digits = re.sub(r"[^\d]", "", r.get("v", ""))
        if digits:
            codes.append((_rank(r.get("rank", "")), len(digits), digits))
    return f"+{min(codes)[2]}" if codes else None


def normalize(raw: dict[str, Any]) -> dict[str, dict[str, Any]]:
    chosen = pick_items(raw["base"])
    item_to_code = {row["item"]: code for code, row in chosen.items()}
    grouped: dict[str, dict[str, list[dict[str, str]]]] = defaultdict(lambda: defaultdict(list))
    for name, rows in raw["details"].items():
        for r in rows:
            code = item_to_code.get(r["item"])
            if code:
                grouped[code][name].append(r)
    zones = parse_zone_tab(raw["zone_tab"])

    countries: dict[str, dict[str, Any]] = {}
    for code, row in sorted(chosen.items()):
        g = grouped[code]
        name_en = row.get("en") or code
        voltage, hz = pick_voltage(g["voltage"])
        driving = sorted(
            (_rank(r["rank"]), DRIVING_SIDE[r["v"]]) for r in g["driving"] if r["v"] in DRIVING_SIDE
        )
        best_currency_rank = min((_rank(r["rank"]) for r in g["currency"]), default=9)
        currencies = sorted(
            {
                r["iso"].upper()
                for r in g["currency"]
                if _rank(r["rank"]) == best_currency_rank and re.fullmatch(r"[A-Za-z]{3}", r["iso"])
            }
        )
        plugs = sorted(
            {p for r in g["plug"] if (p := plug_letter(r["v"], r.get("label"))) is not None}
        )
        languages = sorted({r["iso"].lower() for r in g["language"] if len(r["iso"]) == 2})
        countries[code] = {
            "code": code,
            "wikidata_id": row["item"],
            "name_en": name_en,
            "name_pt": row.get("pt") or name_en,
            "currency_codes": currencies,
            "plug_types": plugs,
            "voltage": voltage,
            "frequency_hz": hz,
            "driving_side": driving[0][1] if driving else None,
            "calling_code": pick_calling_code(g["calling"]),
            **pick_emergency(g["emergency"]),
            "languages": languages,
            "timezones": zones.get(code, []),
            "is_eu": code in EU,
            "is_schengen": code in SCHENGEN,
        }
    return countries


FIELDS = (
    "name_en",
    "name_pt",
    "currency_codes",
    "plug_types",
    "voltage",
    "frequency_hz",
    "driving_side",
    "calling_code",
    "emergency_number",
    "police_number",
    "ambulance_number",
    "fire_number",
    "languages",
    "timezones",
)


def apply_overrides(
    countries: dict[str, dict[str, Any]], overrides: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """Overrides replace individual fields. Unknown codes create new rows (needs names)."""
    out = {code: dict(row) for code, row in countries.items()}
    for code, patch in sorted(overrides.items()):
        patch = {k: v for k, v in patch.items() if k != "source"}
        unknown = set(patch) - set(FIELDS) - {"wikidata_id"}
        if unknown:
            raise ValueError(f"override {code}: unknown fields {sorted(unknown)}")
        if code not in out:
            if "name_en" not in patch:
                raise ValueError(f"override {code} adds a new country but has no name_en")
            out[code] = {
                "code": code,
                "wikidata_id": None,
                **{f: None for f in FIELDS},
                "currency_codes": [],
                "plug_types": [],
                "languages": [],
                "timezones": [],
                "name_pt": patch.get("name_pt", patch["name_en"]),
            }
        out[code].update(patch)
        out[code]["is_eu"] = code in EU
        out[code]["is_schengen"] = code in SCHENGEN
    return dict(sorted(out.items()))


def load_overrides(path: Path = COUNTRY_OVERRIDES) -> dict[str, dict[str, Any]]:
    with open(path, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    for code, patch in raw.items():
        if not isinstance(code, str) or not re.fullmatch(r"[A-Z]{2}", code):
            raise ValueError(f"override key {code!r} is not an ISO code (quote NO/ON/YES keys)")
        if not patch.get("source"):
            raise ValueError(f"override {code} must cite a source")
    return raw


def build(client: HttpClient) -> dict[str, dict[str, Any]]:
    raw = fetch_raw(client)
    countries = normalize(raw)
    return apply_overrides(countries, load_overrides())


def save(countries: dict[str, dict[str, Any]], path: Path = COUNTRIES_JSON) -> None:
    rows = [countries[c] for c in sorted(countries)]
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    prettier(path)


def load(path: Path = COUNTRIES_JSON) -> dict[str, dict[str, Any]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {r["code"]: r for r in rows}


def summary(countries: dict[str, dict[str, Any]]) -> str:
    total = len(countries)
    counts: Counter[str] = Counter()
    for row in countries.values():
        for f in FIELDS:
            if row.get(f) not in (None, [], ""):
                counts[f] += 1
    lines = [f"{total} countries"]
    lines += [f"  {f:<17} {counts[f]:>4}/{total}" for f in FIELDS]
    return "\n".join(lines)
