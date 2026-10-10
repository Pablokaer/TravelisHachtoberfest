"""Overpass API: OSM elements with a ``wikidata`` tag inside a city bbox (opening hours, fee)."""

from __future__ import annotations

import json
from typing import Any

from ..http import HttpClient

ENDPOINT = "https://overpass-api.de/api/interpreter"

FILTERS = (
    '["tourism"]',
    '["historic"]',
    '["amenity"~"^(place_of_worship|theatre|arts_centre|fountain|marketplace|monastery)$"]',
    '["leisure"~"^(park|garden|nature_reserve|stadium|water_park)$"]',
    '["building"~"^(cathedral|church|chapel|mosque|synagogue|temple|palace|castle|tower)$"]',
    '["man_made"~"^(tower|bridge|lighthouse|obelisk)$"]',
    '["bridge"]["name"]',
    '["place"="square"]',
)

TYPE_ORDER = {"relation": 0, "way": 1, "node": 2}


def build_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    box = f"({s},{w},{n},{e})"
    body = "".join(f'nwr["wikidata"]{f}{box};' for f in FILTERS)
    return f"[out:json][timeout:300];({body});out tags center;"


def fetch(client: HttpClient, bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    _, text = client.request(
        "POST", ENDPOINT, namespace="overpass", data={"data": build_query(bbox)}, validate=_ok
    )
    return json.loads(text).get("elements", [])


def _ok(text: str) -> bool:
    """Overpass reports timeouts/out-of-memory as HTTP 200 with a ``remark``."""
    try:
        doc = json.loads(text)
    except json.JSONDecodeError:
        return False
    remark = (doc.get("remark") or "").lower()
    return "error" not in remark and "timed out" not in remark


def _score(el: dict[str, Any]) -> tuple:
    tags = el.get("tags", {})
    return (
        "opening_hours" not in tags,
        "fee" not in tags,
        TYPE_ORDER.get(el["type"], 9),
        el["id"],
    )


def index_by_wikidata(elements: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """wikidata QID → the best matching OSM element's useful tags."""
    by_qid: dict[str, list[dict[str, Any]]] = {}
    for el in elements:
        for qid in el.get("tags", {}).get("wikidata", "").split(";"):
            qid = qid.strip()
            if qid.startswith("Q"):
                by_qid.setdefault(qid, []).append(el)
    out: dict[str, dict[str, Any]] = {}
    for qid, els in by_qid.items():
        best = min(els, key=_score)
        tags = best.get("tags", {})
        out[qid] = {
            "osm_id": f"{best['type']}/{best['id']}",
            "opening_hours": tags.get("opening_hours"),
            "fee": tags.get("fee") or tags.get("charge"),
            "website": tags.get("website") or tags.get("contact:website"),
            "name_pt": tags.get("name:pt"),
        }
    return out
