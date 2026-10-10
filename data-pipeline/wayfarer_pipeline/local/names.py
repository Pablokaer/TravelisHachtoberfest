"""A city's Wikidata identity: its English/Portuguese labels, or its item found by name."""

from __future__ import annotations

from typing import Protocol

from .. import sparql

LABELS_QUERY = """
SELECT ?en ?pt WHERE {{
  OPTIONAL {{ wd:{qid} rdfs:label ?en FILTER(lang(?en) = "en") }}
  OPTIONAL {{ wd:{qid} rdfs:label ?pt FILTER(lang(?pt) = "pt") }}
}}
"""

# Q486972 = human settlement; P17 = country, P297 = its ISO 3166-1 alpha-2 code.
FIND_QUERY = """
SELECT ?item WHERE {{
  ?item rdfs:label "{name}"@en; wdt:P17 ?country; wdt:P31/wdt:P279* wd:Q486972 .
  ?country wdt:P297 "{country}" .
}} LIMIT 1
"""


class NameSource(Protocol):
    def labels(self, qid: str) -> tuple[str | None, str | None]:
        """``(English label, Portuguese label)``; ``None`` for a missing one."""
        ...

    def find_city(self, name: str, country_code: str) -> str | None:
        """The Wikidata id of the settlement called ``name`` in that country, if any."""
        ...


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


class WikidataNames:
    """:class:`NameSource` over the Wikidata Query Service.

    >>> WikidataNames(HttpClient()).labels("Q131526")  # ("Sintra", "Sintra")
    """

    def __init__(self, client: sparql.WikidataClient) -> None:
        self.client = client

    def labels(self, qid: str) -> tuple[str | None, str | None]:
        rows = sparql.run(self.client, LABELS_QUERY.format(qid=qid))
        row = rows[0] if rows else {}
        return row.get("en"), row.get("pt")

    def find_city(self, name: str, country_code: str) -> str | None:
        query = FIND_QUERY.format(name=_escape(name), country=country_code)
        rows = sparql.run(self.client, query)
        return rows[0]["item"] if rows else None
