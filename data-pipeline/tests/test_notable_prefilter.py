"""Notability pre-filter (D-064): items with fewer than 3 sitelinks are only notable with an en/pt
Wikipedia article, so a cheap article check runs first and full details are fetched only for the
items that can still make the cut. The notable items must come out exactly as before."""

from __future__ import annotations

import json
import re
from typing import Any

from wayfarer_pipeline.attractions import wikidata
from wayfarer_pipeline.attractions.pipeline import (
    _build_item,
    _notable_items,
    is_notable,
    valid_name,
)


class FakeWikidataClient:
    """Stands in for HttpClient against WDQS: answers the article check, details and fallback
    label queries from an in-memory table, and records which items each kind of query asked for."""

    def __init__(self, table: dict[str, dict[str, Any]]):
        self.table = table
        self.asked: dict[str, list[list[str]]] = {"articles": [], "details": [], "labels": []}

    def request(self, method: str, url: str, *, data: dict[str, str], **kwargs: Any) -> tuple:
        query = data["query"]
        qids = re.findall(r"wd:(Q\d+)", query.split("VALUES ?item {", 1)[1].split("}", 1)[0])
        kind = self._kind(query)
        self.asked[kind].append(qids)
        rows = [row for q in qids for row in self._rows(kind, q)]
        return 200, json.dumps({"results": {"bindings": rows}})

    @staticmethod
    def _kind(query: str) -> str:
        if "GROUP BY ?item" in query:
            return "details"
        return "labels" if "rdfs:label ?label" in query else "articles"

    def _rows(self, kind: str, qid: str) -> list[dict[str, Any]]:
        entry = self.table.get(qid, {})
        cells = {"item": f"http://www.wikidata.org/entity/{qid}"}
        if kind == "articles":
            return [_binding(cells)] if entry.get("enwiki") or entry.get("ptwiki") else []
        if kind == "labels":
            return []
        return [_binding({**cells, **entry})]


def _binding(cells: dict[str, str]) -> dict[str, dict[str, str]]:
    return {k: {"type": "uri" if k == "item" else "literal", "value": v} for k, v in cells.items()}


# sitelinks → what Wikidata knows about the item
TABLE = {
    "Q10": {"en": "Big Museum", "img": "Big.jpg"},  # 5 sitelinks, no article: notable
    "Q11": {"en": "Small Chapel", "enwiki": "Small Chapel"},  # 2 sitelinks + en article
    "Q12": {"en": "Fonte", "pt": "Fonte", "ptwiki": "Fonte"},  # 1 sitelink + pt article
    "Q13": {"en": "Bench"},  # 1 sitelink, no article: dropped
    "Q14": {"en": "Kiosk", "den": "a kiosk"},  # 2 sitelinks, no article: dropped
    "Q15": {"enwiki": "Q15"},  # 4 sitelinks, no name: dropped by valid_name
}
CLASSIFIED = {
    qid: {"qid": qid, "sitelinks": sl, "category": "museum", "lat": 38.7, "lng": -9.1}
    for qid, sl in (("Q14", 2), ("Q10", 5), ("Q13", 1), ("Q12", 1), ("Q11", 2), ("Q15", 4))
}


def test_article_check_returns_the_items_with_an_en_or_pt_article():
    client = FakeWikidataClient(TABLE)
    assert wikidata.with_en_pt_article(client, ["Q13", "Q11", "Q12", "Q14"]) == {"Q11", "Q12"}


def test_article_check_asks_500_items_per_query_and_nothing_when_empty():
    client = FakeWikidataClient({})
    wikidata.with_en_pt_article(client, [f"Q{n}" for n in range(1, 502)])
    wikidata.with_en_pt_article(client, [])
    assert [len(chunk) for chunk in client.asked["articles"]] == [500, 1]


def test_items_without_3_sitelinks_or_an_article_never_reach_the_details_query():
    client = FakeWikidataClient(TABLE)
    _notable_items(client, CLASSIFIED)
    assert client.asked["articles"] == [["Q11", "Q12", "Q13", "Q14"]]
    assert client.asked["details"] == [["Q10", "Q11", "Q12", "Q15"]]


def test_notable_items_are_identical_to_fetching_details_for_every_item():
    full = wikidata.fetch_details(FakeWikidataClient(TABLE), sorted(CLASSIFIED))
    every = [_build_item(qid, c, full.get(qid, {})) for qid, c in CLASSIFIED.items()]
    before = [i for i in every if is_notable(i) and valid_name(i["name_en"], i["wikidata_id"])]
    after = _notable_items(FakeWikidataClient(TABLE), CLASSIFIED)
    assert after == before
    assert [i["wikidata_id"] for i in after] == ["Q10", "Q12", "Q11"]
