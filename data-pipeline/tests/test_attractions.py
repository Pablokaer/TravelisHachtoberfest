import datetime as dt
import json
from pathlib import Path

import pytest

from wayfarer_pipeline.attractions import commons, overpass, pageviews
from wayfarer_pipeline.attractions.categories import (
    AVG_VISIT_MINUTES,
    CATEGORIES,
    ROOTS,
    _class_roots,
    classify,
)
from wayfarer_pipeline.attractions.pipeline import (
    dedupe,
    is_notable,
    normalize_name,
    popularity_scores,
    similar_names,
    valid_name,
)
from wayfarer_pipeline.attractions.wikidata import commons_filename

FIXTURES = Path(__file__).parent / "fixtures"


# -- categories ---------------------------------------------------------------------------
TYPE_ROOTS = {
    "Q1": ["Q33506"],  # museum
    "Q2": ["Q16560"],  # palace
    "Q3": ["Q32815", "Q1370598"],  # mosque → landmark
    "Q4": ["Q16970", "Q1370598"],  # church building (also a structure of worship)
    "Q5": ["Q57821"],  # fortification → castle
    "Q6": [],  # e.g. office building
    "Q7": ["Q12518"],  # tower
    "Q8": ["Q1440300", "Q12518"],  # observation tower
    "Q9": ["Q16560", "Q19860854"],  # destroyed palace
    # Real classes behind landmarks that were missing (2026-09-28):
    "Q96352513": ["Q1370598", "Q19860854"],  # Parthenon: former temple (destroyed structure)
    "Q93342462": ["Q839954"],  # Parthenon: archaeological site
    "Q860861": ["Q860861"],  # sculpture (The Little Mermaid)
    "Q7138926": ["Q7138926"],  # parliament building (Hungarian Parliament)
    "Q88372": ["Q88372"],  # promenade (Promenade des Anglais)
    "Q1060829": ["Q1060829"],  # concert hall (Elbphilharmonie)
    "Q25550691": ["Q25550691"],  # city hall (Stockholm City Hall)
    # Nature (D-068). Real chain: national park is a subclass of park (and of protected
    # area), so the class reaches the park root as well as its own.
    "Q46169": ["Q46169", "Q22698"],  # national park (Tijuca Forest)
    "Q22698": ["Q22698"],  # park (Vondelpark)
    "Q167346": ["Q167346", "Q1107656"],  # botanical garden (Jardim Botânico do Rio)
    "Q40080": ["Q40080"],  # beach (Copacabana)
    "Q179049": ["Q179049"],  # nature reserve
    "Q8502": ["Q8502"],  # mountain (Sugarloaf Mountain, Corcovado)
    "Q34038": ["Q34038"],  # waterfall
    "Q35509": ["Q35509"],  # cave
    "Q23442": ["Q23442"],  # island
    "Q187223": ["Q187223", "Q23397"],  # lagoon (Rodrigo de Freitas Lagoon), a kind of lake
    "Q570116": ["Q570116"],  # tourist attraction
    "Q5003624": ["Q5003624"],  # memorial
    "Q473972": [],  # protected area itself is not a root (it also covers UK conservation areas)
    # Heritage classes checked for the Asia/Morocco batch (2026-10-03), real chains. Already
    # covered: mausoleum/tomb reach memorial + monument, city gate reaches fortification,
    # pagoda reaches tower + structure of worship.
    "Q162875": ["Q4989906", "Q5003624"],  # mausoleum (Saadian Tombs, Ho Chi Minh Mausoleum)
    "Q82117": ["Q57821", "Q860861"],  # city gate (Bab Agnaou)
    "Q199451": ["Q12518", "Q1370598"],  # pagoda
    "Q132834": ["Q132834"],  # madrasa (Ben Youssef Madrasa)
    "Q676050": ["Q676050"],  # old town (Vilnius Old Town, Fes el Bali)
    "Q1128906": ["Q1128906"],  # medina quarter (Medina of Marrakesh)
    "Q15243209": [],  # historic district: not a root (sweeps in plain neighbourhoods)
}


@pytest.mark.parametrize(
    ("types", "category"),
    [
        ({"Q1"}, "museum"),
        ({"Q1", "Q2"}, "palace"),  # palace housing a museum
        ({"Q3"}, "landmark"),
        ({"Q4"}, "church"),
        ({"Q5", "Q7"}, "castle"),
        ({"Q7"}, "landmark"),
        ({"Q8"}, "viewpoint"),
        ({"Q6"}, None),
        ({"Q9"}, None),  # no longer exists
        ({"Q96352513", "Q93342462"}, "landmark"),  # ruins that are an archaeological site stay
        ({"Q860861"}, "monument"),
        ({"Q7138926"}, "landmark"),
        ({"Q88372"}, "landmark"),
        ({"Q1060829"}, "other"),
        ({"Q25550691"}, "landmark"),
        ({"Q46169"}, "nature"),  # national park: its own park superclass does not count
        ({"Q22698"}, "park"),  # urban parks stay parks
        ({"Q167346"}, "park"),
        ({"Q22698", "Q179049"}, "park"),  # Richmond Park: a park that is also a nature reserve
        ({"Q8502"}, "nature"),  # Sugarloaf Mountain, Corcovado
        ({"Q40080"}, "nature"),
        ({"Q8502", "Q8"}, "viewpoint"),  # a summit observation tower stays a viewpoint
        ({"Q35509", "Q570116"}, "landmark"),  # Batu Caves: a cave temple, a tourist attraction
        ({"Q23442", "Q5003624"}, "monument"),  # Island of Tears (Minsk): a memorial island
        ({"Q34038"}, "nature"),
        ({"Q35509"}, "nature"),
        ({"Q23442"}, "nature"),
        ({"Q187223"}, "nature"),
        ({"Q473972"}, None),
        ({"Q162875"}, "monument"),
        ({"Q82117"}, "castle"),
        ({"Q199451"}, "landmark"),
        ({"Q132834"}, "landmark"),
        ({"Q676050"}, "landmark"),
        ({"Q1128906"}, "landmark"),
        ({"Q15243209"}, None),
        (set(), None),
    ],
)
def test_classify(types, category):
    assert classify(types, TYPE_ROOTS) == category


def test_avg_visit_minutes_defaults():
    assert AVG_VISIT_MINUTES["museum"] == 90 and AVG_VISIT_MINUTES["viewpoint"] == 15
    assert all(5 <= m <= 600 for m in AVG_VISIT_MINUTES.values())


def test_heritage_roots_for_asia_and_morocco():
    for qid in ("Q132834", "Q676050", "Q1128906"):  # madrasa, old town, medina quarter
        assert ROOTS[qid] == "landmark"
    assert "Q15243209" not in ROOTS  # historic district


def test_class_roots_drop_park_only_for_nature_areas():
    assert _class_roots(["Q46169", "Q22698"]) == {"Q46169"}  # national park
    assert _class_roots(["Q167346", "Q1107656"]) == {"Q167346", "Q1107656"}  # botanical garden
    assert _class_roots([]) == set()


def test_nature_is_a_category_with_its_own_roots():
    assert "nature" in CATEGORIES and AVG_VISIT_MINUTES["nature"] == 90
    nature_roots = {q for q, category in ROOTS.items() if category == "nature"}
    assert {"Q40080", "Q34038", "Q46169", "Q179049", "Q8502"} <= nature_roots
    # Too broad: covers urban conservation areas and heritage districts (e.g. Highgate).
    assert "Q473972" not in ROOTS


# -- popularity ---------------------------------------------------------------------------
def _item(qid, views=0, sitelinks=1, **kw):
    return {"wikidata_id": qid, "pageviews": views, "sitelinks": sitelinks, **kw}


def test_popularity_log_scaled_within_city():
    items = [
        _item("Q1", views=1_000_000),
        _item("Q2", views=10_000),
        _item("Q3", views=100),
        _item("Q4", views=0, sitelinks=50),
        _item("Q5", views=0, sitelinks=1),
    ]
    s = popularity_scores(items)
    assert s["Q1"] == 100 and s["Q3"] == 5
    assert s["Q2"] == round(5 + 95 * 0.5)  # halfway on the log scale
    assert s["Q4"] == 5 and 0 <= s["Q5"] < s["Q4"]
    assert all(0 <= v <= 100 for v in s.values())


def test_popularity_single_item_and_empty():
    assert popularity_scores([_item("Q1", views=10)]) == {"Q1": 100}
    assert popularity_scores([]) == {}


# -- dedupe -------------------------------------------------------------------------------
def _poi(qid, name, lat, lng, sitelinks, osm=None):
    return {
        "wikidata_id": qid,
        "name_en": name,
        "lat": lat,
        "lng": lng,
        "sitelinks": sitelinks,
        "osm_id": osm,
    }


def test_dedupe_by_distance_and_name():
    items = [
        _poi("Q10", "Belém Tower", 38.69157, -9.21596, 80),
        _poi("Q11", "Belem tower", 38.69170, -9.21590, 3),  # ~15 m, same name → dropped
        _poi("Q12", "Belém Palace", 38.69180, -9.21600, 40),  # close but different name
        _poi("Q13", "Belém Tower", 38.70500, -9.21596, 2),  # same name but 1.5 km away
        _poi("Q14", "Some chapel", 38.7, -9.1, 5, osm="way/1"),
        _poi("Q15", "Other name", 38.8, -9.0, 9, osm="way/1"),  # same OSM element
        _poi("Q10", "Belém Tower", 38.69157, -9.21596, 80),  # same wikidata id
    ]
    kept, dropped = dedupe(items)
    assert sorted(i["wikidata_id"] for i in kept) == ["Q10", "Q12", "Q13", "Q15"]
    assert sorted(dropped) == [("Q11", "Q10"), ("Q14", "Q15")]


def test_name_similarity():
    assert normalize_name("Mosteiro dos Jerónimos!") == "mosteiro dos jeronimos"
    assert similar_names("St Paul's Cathedral", "St. Paul’s Cathedral")
    assert not similar_names("Louvre", "Musée d'Orsay")


def test_notability_and_names():
    assert is_notable({"sitelinks": 3})
    assert is_notable({"sitelinks": 1, "wikipedia_pt": "Elevador de Santa Justa"})
    assert not is_notable({"sitelinks": 2, "wikipedia_en": None, "wikipedia_pt": None})
    assert valid_name("Colosseum", "Q10285")
    assert not valid_name("Q10285", "Q10285") and not valid_name(None, "Q1")


# -- Commons ------------------------------------------------------------------------------
def test_commons_parse_fixture():
    doc = json.loads((FIXTURES / "commons_imageinfo.json").read_text(encoding="utf-8"))
    out = commons.parse_response(doc)
    tower = out["Torre de Belém (Lisboa).jpg"]
    assert tower == {
        "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tower.jpg/800px-Tower.jpg",
        "image_author": "José Silva & Friends",
        "image_license": "CC BY-SA 4.0",
        "image_license_url": "https://creativecommons.org/licenses/by-sa/4.0",
        "image_page_url": "https://commons.wikimedia.org/wiki/File:Torre_de_Bel%C3%A9m_(Lisboa).jpg",
    }
    assert out["Missing.jpg"] is None
    assert out["NonFree.jpg"] is None
    assert out["Public domain.jpg"]["image_license_url"] is None


def test_strip_html():
    assert commons.strip_html('<a href="x">Jane</a>&nbsp;<b>Doe</b>') == "Jane Doe"
    assert commons.strip_html("<span></span>") is None
    assert len(commons.strip_html("x" * 1000)) == commons.MAX_AUTHOR_CHARS


def test_commons_filename():
    url = "http://commons.wikimedia.org/wiki/Special:FilePath/Torre%20de%20Bel%C3%A9m.jpg"
    assert commons_filename(url) == "Torre de Belém.jpg"
    assert commons_filename(None) is None


# -- Overpass / pageviews -----------------------------------------------------------------
def test_overpass_index_prefers_element_with_hours():
    elements = [
        {"type": "node", "id": 5, "tags": {"wikidata": "Q1", "name:pt": "Torre"}},
        {"type": "way", "id": 7, "tags": {"wikidata": "Q1", "opening_hours": "Tu-Su 10:00-18:00"}},
        {"type": "relation", "id": 9, "tags": {"wikidata": "Q2;Q3", "fee": "yes"}},
    ]
    idx = overpass.index_by_wikidata(elements)
    assert idx["Q1"]["osm_id"] == "way/7"
    assert idx["Q1"]["opening_hours"] == "Tu-Su 10:00-18:00"
    assert idx["Q3"] == idx["Q2"] and idx["Q2"]["fee"] == "yes"


def test_pageview_month_range_and_url():
    assert pageviews.month_range(dt.date(2026, 9, 27)) == ("2025090100", "2026083100")
    assert pageviews.month_range(dt.date(2026, 1, 5)) == ("2025010100", "2025123100")
    url = pageviews.article_url("en.wikipedia", "St Paul's Cathedral/x", "a", "b")
    assert url.endswith("/en.wikipedia/all-access/user/St_Paul%27s_Cathedral%2Fx/monthly/a/b")


def test_class_cache_is_dropped_when_roots_change(tmp_path, monkeypatch):
    from wayfarer_pipeline.attractions import categories, pipeline

    path = tmp_path / "class_roots.json"
    pipeline._save_class_cache({"Q7138926": []}, path)
    assert pipeline._load_class_cache(path) == {"Q7138926": []}
    monkeypatch.setattr(pipeline, "ROOTS", {**categories.ROOTS, "Q999": "landmark"})
    assert pipeline._load_class_cache(path) == {}  # stale: recomputed with the new roots


def test_legacy_class_cache_format_is_ignored(tmp_path):
    from wayfarer_pipeline.attractions import pipeline

    path = tmp_path / "class_roots.json"
    path.write_text('{"Q1": ["Q33506"]}', encoding="utf-8")
    assert pipeline._load_class_cache(path) == {}
