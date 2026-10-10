"""Wikidata class roots → ``public.attraction_category`` enum.

An item belongs to a category when one of its P31 classes is (a subclass of) a root, via
``wdt:P279*``. When several categories match, the first in ``PRIORITY`` wins.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

CATEGORIES = (
    "museum",
    "monument",
    "church",
    "castle",
    "viewpoint",
    "landmark",
    "park",
    "nature",
    "palace",
    "other",
)

# Most specific / most useful for visitors first.
PRIORITY = (
    "castle",
    "palace",
    "church",
    "museum",
    "viewpoint",
    "park",
    "monument",
    "landmark",
    # Nearly last (D-068): natural features also carry memorials, cave temples and
    # archaeological sites (Batu Caves, the Pnyx, Minsk's Island of Tears), which are visited
    # for those; and a city park that is also a nature reserve (Richmond Park) stays a park.
    # National parks still come out as nature: see _class_roots.
    "nature",
    "other",
)

ROOTS: dict[str, str] = {
    # museum
    "Q33506": "museum",  # museum
    "Q207694": "museum",  # art museum
    # monument
    "Q4989906": "monument",  # monument
    "Q5003624": "monument",  # memorial
    "Q179700": "monument",  # statue
    "Q483453": "monument",  # fountain
    "Q860861": "monument",  # sculpture (e.g. The Little Mermaid)
    # church (Christian buildings only; other places of worship are landmarks)
    "Q16970": "church",  # church building
    "Q2977": "church",  # cathedral
    "Q163687": "church",  # basilica
    "Q108325": "church",  # chapel
    "Q44613": "church",  # monastery
    "Q160742": "church",  # abbey
    # castle
    "Q23413": "castle",  # castle
    "Q57821": "castle",  # fortification
    "Q88291": "castle",  # citadel
    # viewpoint
    "Q6017969": "viewpoint",  # scenic viewpoint
    "Q1440300": "viewpoint",  # observation tower
    # park
    "Q22698": "park",  # park
    "Q1107656": "park",  # garden
    "Q167346": "park",  # botanical garden
    # nature (D-068). Not protected area (Q473972): it also covers UK conservation areas,
    # Dutch heritage districts and US historic sites, i.e. whole neighbourhoods. Not rivers,
    # bays or seas either: their coordinates are an arbitrary point of a large shape.
    "Q40080": "nature",  # beach
    "Q34038": "nature",  # waterfall
    "Q46169": "nature",  # national park
    "Q179049": "nature",  # nature reserve
    "Q728904": "nature",  # nature park
    "Q1761072": "nature",  # state park (e.g. Brazil's parques estaduais)
    "Q23790": "nature",  # natural monument
    "Q1367500": "nature",  # marine protected area
    "Q1324355": "nature",  # geopark
    "Q35509": "nature",  # cave
    "Q23442": "nature",  # island
    "Q23397": "nature",  # lake
    "Q187223": "nature",  # lagoon (already a lake on Wikidata; kept explicit)
    "Q25391": "nature",  # dune
    "Q8502": "nature",  # mountain (volcanoes too, e.g. Sugarloaf, Corcovado, Mount Batur)
    "Q54050": "nature",  # hill
    "Q150784": "nature",  # canyon
    "Q177380": "nature",  # hot spring
    "Q954501": "nature",  # natural arch
    # palace
    "Q16560": "palace",  # palace
    # landmark
    "Q570116": "landmark",  # tourist attraction
    "Q2319498": "landmark",  # architectural landmark
    "Q174782": "landmark",  # square
    "Q12280": "landmark",  # bridge
    "Q12518": "landmark",  # tower
    "Q839954": "landmark",  # archaeological site
    "Q1081138": "landmark",  # historic site
    "Q1370598": "landmark",  # structure of worship (mosques, synagogues, temples, …)
    "Q32815": "landmark",  # mosque
    "Q34627": "landmark",  # synagogue
    "Q44539": "landmark",  # temple
    "Q39614": "landmark",  # cemetery
    "Q7138926": "landmark",  # parliament building (e.g. Hungarian Parliament)
    "Q25550691": "landmark",  # city hall (e.g. Stockholm, Oslo, Vienna, Belfast)
    "Q88372": "landmark",  # promenade (e.g. Promenade des Anglais)
    # Heritage missing from the Asia/Morocco batch (2026-10-03). Mausoleums and tombs already
    # reach memorial (monument), city gates fortification (castle), and pagodas, stupas,
    # Buddhist temples and Shinto shrines structure of worship. Not historic district
    # (Q15243209): it sweeps in plain neighbourhoods (e.g. Istanbul's Zincirlikuyu).
    "Q132834": "landmark",  # madrasa (Ben Youssef, Bou Inania; no separate building class).
    # Indonesia's madrasah schools are subclasses, but rarely pass the notability filter.
    "Q676050": "landmark",  # old town (Vilnius, Tallinn, Kraków; Fes el Bali)
    "Q1128906": "landmark",  # medina quarter (Medina of Marrakesh, Medina of Fez)
    # other
    "Q43501": "other",  # zoo
    "Q2281788": "other",  # public aquarium
    "Q194195": "other",  # amusement park
    "Q153562": "other",  # opera house
    "Q1060829": "other",  # concert hall (e.g. Elbphilharmonie)
    "Q24354": "other",  # theatre building
    "Q37654": "other",  # market
}

# Items under these classes are never attractions (they no longer exist)...
EXCLUDED_ROOTS = frozenset({"Q19860854"})  # destroyed building or structure
# ...unless they are visitable ruins (e.g. the Parthenon is a "former temple" and an
# archaeological site).
EXCLUSION_OVERRIDES = frozenset({"Q839954"})  # archaeological site

AVG_VISIT_MINUTES: dict[str, int] = {
    "museum": 90,
    "monument": 20,
    "church": 30,
    "castle": 90,
    "viewpoint": 15,
    "landmark": 20,
    "park": 45,
    "nature": 90,  # a beach, a trail or a waterfall takes longer than a city park
    "palace": 75,
    "other": 30,
}

assert set(ROOTS.values()) <= set(CATEGORIES) == set(PRIORITY) == set(AVG_VISIT_MINUTES)


def _class_roots(roots: Iterable[str]) -> set[str]:
    """One class's roots, minus park when the class is a kind of nature area.

    Wikidata files national, nature and state parks under park (Q46169 P279 Q22698), which
    outranks nature; a class that reaches a nature root is a nature area, not a city park.
    An item that is separately a park and a nature reserve keeps both (two classes).

    >>> sorted(_class_roots(["Q46169", "Q22698"]))  # national park
    ['Q46169']
    """
    roots = set(roots)
    if not any(ROOTS.get(root) == "nature" for root in roots):
        return roots
    return {root for root in roots if ROOTS.get(root) != "park"}


def classify(types: Iterable[str], type_roots: Mapping[str, Iterable[str]]) -> str | None:
    """Category for an item given its P31 classes and the roots each class falls under.

    Returns ``None`` when no class reaches a root (the item is not an attraction)."""
    roots = {root for t in types for root in _class_roots(type_roots.get(t, ()))}
    if roots & EXCLUDED_ROOTS and not roots & EXCLUSION_OVERRIDES:
        return None
    found = {ROOTS[root] for root in roots if root in ROOTS}
    for category in PRIORITY:
        if category in found:
            return category
    return None
