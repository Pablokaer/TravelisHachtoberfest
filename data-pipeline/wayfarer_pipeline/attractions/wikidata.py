"""Wikidata SPARQL: candidate items inside a city bbox, their class hierarchy and details."""

from __future__ import annotations

from collections import defaultdict
from typing import Any
from urllib.parse import unquote

from .. import sparql
from ..http import HttpClient
from .categories import EXCLUDED_ROOTS, ROOTS

# Label fallbacks when an item has no English label (multilingual first, then launch-city
# languages).
FALLBACK_LANGS = ("mul", "en-gb", "en-us", "pt", "fr", "it", "es", "ca", "cs", "nl", "de", "tr")

CANDIDATES = """
SELECT ?item ?coord ?sl ?t WHERE {{
  SERVICE wikibase:box {{
    ?item wdt:P625 ?coord.
    bd:serviceParam wikibase:cornerSouthWest "Point({w} {s})"^^geo:wktLiteral;
                    wikibase:cornerNorthEast "Point({e} {n})"^^geo:wktLiteral.
  }}
  ?item wikibase:sitelinks ?sl. FILTER(?sl >= 1)
  FILTER NOT EXISTS {{ ?item wdt:P576 ?demolished }}
  ?item wdt:P31 ?t.
}}
"""

CLASS_ROOTS = """
SELECT ?t ?root WHERE {{
  VALUES ?t {{ {types} }}
  VALUES ?root {{ {roots} }}
  ?t wdt:P279* ?root.
}}
"""

DETAILS = """
SELECT ?item (MIN(?en_) AS ?en) (MIN(?pt_) AS ?pt) (MIN(?den_) AS ?den) (MIN(?dpt_) AS ?dpt)
       (MIN(?img_) AS ?img) (MIN(?web_) AS ?web) (MIN(?node_) AS ?node) (MIN(?way_) AS ?way)
       (MIN(?rel_) AS ?rel) (MIN(?enwiki_) AS ?enwiki) (MIN(?ptwiki_) AS ?ptwiki)
       (MAX(?unesco_) AS ?unesco)
WHERE {{
  VALUES ?item {{ {items} }}
  OPTIONAL {{ ?item rdfs:label ?en_ FILTER(lang(?en_) = "en") }}
  OPTIONAL {{ ?item rdfs:label ?pt_ FILTER(lang(?pt_) = "pt") }}
  OPTIONAL {{ ?item schema:description ?den_ FILTER(lang(?den_) = "en") }}
  OPTIONAL {{ ?item schema:description ?dpt_ FILTER(lang(?dpt_) = "pt") }}
  OPTIONAL {{ ?item wdt:P18 ?img_ }}
  OPTIONAL {{ ?item wdt:P856 ?web_ }}
  OPTIONAL {{ ?item wdt:P11693 ?node_ }}
  OPTIONAL {{ ?item wdt:P10689 ?way_ }}
  OPTIONAL {{ ?item wdt:P402 ?rel_ }}
  OPTIONAL {{ ?a schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>;
               schema:name ?enwiki_ }}
  OPTIONAL {{ ?b schema:about ?item; schema:isPartOf <https://pt.wikipedia.org/>;
               schema:name ?ptwiki_ }}
  BIND(IF(EXISTS {{ ?item wdt:P1435 wd:Q9259 }} || EXISTS {{ ?item wdt:P1435 wd:Q43113623 }}
          || EXISTS {{ ?item wdt:P757 ?whs }}, 1, 0) AS ?unesco_)
}}
GROUP BY ?item
"""

# Same article pattern as DETAILS' ?enwiki/?ptwiki (schema:name included), so an item passes this
# check exactly when DETAILS would give it a wikipedia_en or wikipedia_pt (D-064).
EN_PT_ARTICLE = """
SELECT DISTINCT ?item WHERE {{
  VALUES ?item {{ {items} }}
  VALUES ?wiki {{ <https://en.wikipedia.org/> <https://pt.wikipedia.org/> }}
  ?article schema:about ?item; schema:isPartOf ?wiki; schema:name ?title.
}}
"""
ARTICLE_CHECK_BATCH = 500

FALLBACK_LABELS = """
SELECT ?item ?label (lang(?label) AS ?lang) WHERE {{
  VALUES ?item {{ {items} }}
  ?item rdfs:label ?label. FILTER(lang(?label) IN ({langs}))
}}
"""


def _tiles(bbox: tuple[float, float, float, float]) -> list[tuple[float, float, float, float]]:
    s, w, n, e = bbox
    ms, mw = (s + n) / 2, (w + e) / 2
    return [(s, w, ms, mw), (s, mw, ms, e), (ms, w, n, mw), (ms, mw, n, e)]


def fetch_candidates(
    client: HttpClient, bbox: tuple[float, float, float, float], depth: int = 0
) -> dict[str, dict[str, Any]]:
    """Items with coordinates inside ``bbox`` [s, w, n, e] and ≥ 1 sitelink.

    Splits the bbox into 4 tiles (recursively) when the query service times out."""
    s, w, n, e = bbox
    try:
        rows = sparql.run(client, CANDIDATES.format(s=s, w=w, n=n, e=e))
    except RuntimeError:
        if depth >= 3:
            raise
        print(f"    wikidata box query failed, splitting (depth {depth + 1})", flush=True)
        merged: dict[str, dict[str, Any]] = {}
        for tile in _tiles(bbox):
            for qid, item in fetch_candidates(client, tile, depth + 1).items():
                if qid in merged:
                    merged[qid]["types"] |= item["types"]
                else:
                    merged[qid] = item
        return merged

    items: dict[str, dict[str, Any]] = {}
    for r in rows:
        point = sparql.parse_point(r["coord"])
        if point is None or not r["item"].startswith("Q"):
            continue
        item = items.setdefault(
            r["item"],
            {"qid": r["item"], "coords": set(), "sitelinks": int(r["sl"]), "types": set()},
        )
        item["coords"].add(point)
        item["types"].add(r["t"])
    for item in items.values():
        # Deterministic single coordinate per item; must still be inside the bbox.
        inside = sorted(c for c in item.pop("coords") if s <= c[0] <= n and w <= c[1] <= e)
        item["lat"], item["lng"] = inside[0] if inside else (None, None)
    return {q: i for q, i in items.items() if i["lat"] is not None}


def resolve_class_roots(
    client: HttpClient, types: set[str], cache: dict[str, list[str]]
) -> dict[str, list[str]]:
    """For each class QID, the category roots it is a (transitive) subclass of. ``cache`` is
    shared between cities and updated in place."""
    todo = sorted(t for t in types if t not in cache and t.startswith("Q"))
    roots = sparql.values(sorted(set(ROOTS) | EXCLUDED_ROOTS))
    for chunk in sparql.chunks(todo, 150):
        found: dict[str, set[str]] = defaultdict(set)
        for r in sparql.run(client, CLASS_ROOTS.format(types=sparql.values(chunk), roots=roots)):
            found[r["t"]].add(r["root"])
        for t in chunk:
            cache[t] = sorted(found.get(t, ()))
    return {t: cache.get(t, []) for t in types}


def commons_filename(value: str | None) -> str | None:
    """``http://commons.wikimedia.org/wiki/Special:FilePath/Foo%20bar.jpg`` → ``Foo bar.jpg``."""
    if not value:
        return None
    name = unquote(value.rsplit("/", 1)[-1]).replace("_", " ").strip()
    return name or None


def with_en_pt_article(client: HttpClient, qids: list[str]) -> set[str]:
    """The items of ``qids`` that have an English or Portuguese Wikipedia article.

    A cheap stand-in for DETAILS when only notability is in question: ~500 items per query
    instead of 100 with a dozen OPTIONALs.

    >>> with_en_pt_article(client, ["Q215003", "Q123"])  # doctest: +SKIP
    {'Q215003'}
    """
    found: set[str] = set()
    for chunk in sparql.chunks(sorted(qids), ARTICLE_CHECK_BATCH):
        rows = sparql.run(client, EN_PT_ARTICLE.format(items=sparql.values(chunk)))
        found.update(r["item"] for r in rows)
    return found


def fetch_details(client: HttpClient, qids: list[str]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for chunk in sparql.chunks(sorted(qids), 100):
        for r in sparql.run(client, DETAILS.format(items=sparql.values(chunk))):
            osm = None
            if r.get("rel"):
                osm = f"relation/{r['rel']}"
            elif r.get("way"):
                osm = f"way/{r['way']}"
            elif r.get("node"):
                osm = f"node/{r['node']}"
            out[r["item"]] = {
                "name_en": r.get("en"),
                "name_pt": r.get("pt"),
                "description_en": r.get("den"),
                "description_pt": r.get("dpt"),
                "image_file": commons_filename(r.get("img")),
                "website": r.get("web"),
                "osm_id": osm,
                "wikipedia_en": r.get("enwiki"),
                "wikipedia_pt": r.get("ptwiki"),
                "is_unesco": r.get("unesco") == "1",
            }
    missing = sorted(q for q in qids if not (out.get(q) or {}).get("name_en"))
    langs = ", ".join(f'"{lang}"' for lang in FALLBACK_LANGS)
    for chunk in sparql.chunks(missing, 200):
        by_item: dict[str, dict[str, str]] = defaultdict(dict)
        for r in sparql.run(
            client, FALLBACK_LABELS.format(items=sparql.values(chunk), langs=langs)
        ):
            by_item[r["item"]][r["lang"]] = r["label"]
        for qid, labels in by_item.items():
            for lang in FALLBACK_LANGS:
                if labels.get(lang):
                    out.setdefault(qid, {})["name_en"] = labels[lang]
                    break
    return out
