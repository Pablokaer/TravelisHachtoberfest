"""Which of the city page's people categories an occupation belongs to (D-071).

An occupation belongs to a category when it is (a subclass of) one of the category's roots in
Wikidata. A person gets every category their occupations reach — Mário Soares was a president
and wrote books — and none when no occupation matches (athletes, for instance).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from .. import sparql
from ..sparql import WikidataClient

# Display order of the filters on the city page.
CATEGORIES = ("history", "writer", "music", "art")

CATEGORY_ROOTS: dict[str, tuple[str, ...]] = {
    # politician, monarch, ruler, military personnel, explorer, religious figure, philosopher,
    # scientist
    "history": (
        "Q82955",
        "Q116",
        "Q1097498",
        "Q47064",
        "Q11900058",
        "Q250867",
        "Q4964182",
        "Q901",
    ),
    "writer": ("Q36180",),  # writer (poets, novelists, playwrights are subclasses)
    "music": ("Q639669", "Q36834", "Q177220"),  # musician, composer, singer
    # painter, sculptor, architect, visual artist, photographer, film director ("artist", Q483501,
    # also covers writers and actors, so it is not a root)
    "art": ("Q1028181", "Q1281618", "Q42973", "Q3391743", "Q33231", "Q2526255"),
}

ROOT_CATEGORY = {root: cat for cat, roots in CATEGORY_ROOTS.items() for root in roots}

ROOTS_QUERY = """
SELECT ?occ ?root WHERE {{
  VALUES ?occ {{ {occupations} }}
  VALUES ?root {{ {roots} }}
  ?occ wdt:P279* ?root .
}}
"""


def occupation_roots(client: WikidataClient, occupations: Iterable[str]) -> dict[str, set[str]]:
    """``{occupation: {category roots it reaches}}`` (occupations reaching none are absent).

    >>> occupation_roots(client, ["Q49757"])  # {"Q49757": {"Q36180"}}  poet → writer
    """
    roots: dict[str, set[str]] = {}
    for batch in sparql.chunks(sorted(set(occupations)), 200):
        query = ROOTS_QUERY.format(
            occupations=sparql.values(batch), roots=sparql.values(ROOT_CATEGORY)
        )
        for row in sparql.run(client, query):
            roots.setdefault(row["occ"], set()).add(row["root"])
    return roots


class OccupationLookup:
    """:func:`occupation_roots` that remembers answers, so a run over many cities only asks about
    occupations it has not seen (the same few hundred recur; each query took ~10 s).

    >>> lookup = OccupationLookup(client); lookup.roots(["Q49757"])  # {"Q49757": {"Q36180"}}
    """

    def __init__(self, client: WikidataClient):
        self._client = client
        self._known: dict[str, set[str]] = {}

    def roots(self, occupations: Iterable[str]) -> dict[str, set[str]]:
        wanted = set(occupations)
        new = wanted - self._known.keys()
        if new:
            found = occupation_roots(self._client, new)
            self._known.update({occ: found.get(occ, set()) for occ in new})
        return {occ: self._known[occ] for occ in wanted if self._known[occ]}


def categories_for(occupations: Iterable[str], roots: Mapping[str, set[str]]) -> list[str]:
    """The categories reached by a person's occupations, in display order.

    >>> categories_for(["Q49757"], {"Q49757": {"Q36180"}})  # ['writer']
    """
    reached = {ROOT_CATEGORY[r] for occ in occupations for r in roots.get(occ, ())}
    return [cat for cat in CATEGORIES if cat in reached]
