import json

from wayfarer_pipeline.config import load_cities
from wayfarer_pipeline.people import categories, pipeline, wikidata


def _uri(qid: str) -> dict:
    return {"type": "uri", "value": f"http://www.wikidata.org/entity/{qid}"}


def _lit(value: str) -> dict:
    return {"type": "literal", "value": value}


class FakeWikidataPeople:
    """Answers the people queries (born, died, details, occupation roots) and Commons from canned
    bindings, chosen by a marker each query carries."""

    def __init__(self, answers: dict[str, list[dict]]):
        self.answers = answers
        self.queries: list[str] = []

    def request(self, method: str, url: str, **kwargs) -> tuple[int, str]:
        if "commons.wikimedia.org" in url:
            return 200, json.dumps({"query": {"pages": []}})
        query = kwargs["data"]["query"]
        self.queries.append(query)
        marker = next(m for m in self.answers if m in query)
        return 200, json.dumps({"results": {"bindings": self.answers[marker]}})


PESSOA = {
    "p": _uri("Q1"),
    "en": _lit("Fernando Pessoa"),
    "pt": _lit("Fernando Pessoa"),
    "den": _lit("Portuguese poet (1888–1935)"),
    "dpt": _lit("poeta português"),
    "birth": _lit("1888-06-13T00:00:00Z"),
    "death": _lit("1935-11-30T00:00:00Z"),
    "image": _lit("http://commons.wikimedia.org/wiki/Special:FilePath/Pessoa%20chapeu.jpg"),
    "wen": {"type": "uri", "value": "https://en.wikipedia.org/wiki/Fernando_Pessoa"},
    "occs": _lit("http://www.wikidata.org/entity/Q49757 http://www.wikidata.org/entity/Q4964182"),
}
# Camões has a "mul" label but none in English; the details query returns two rows (two
# recorded birth dates) for him.
CAMOES = {
    "p": _uri("Q2"),
    "mul": _lit("Luís de Camões"),
    "den": _lit("16th-century Portuguese poet"),
    "birth": _lit("1524-01-01T00:00:00Z"),
    "death": _lit("1580-06-10T00:00:00Z"),
    "occs": _lit("http://www.wikidata.org/entity/Q49757"),
}
EUSEBIO = {
    "p": _uri("Q3"),
    "en": _lit("Eusébio"),
    "occs": _lit("http://www.wikidata.org/entity/Q937857"),
}
ANTHONY = {
    "p": _uri("Q4"),
    "en": _lit("Anthony of Padua"),
    "birth": _lit("-0500-01-01T00:00:00Z"),
    "occs": _lit("http://www.wikidata.org/entity/Q250867"),
}


def _answers() -> dict[str, list[dict]]:
    return {
        "wdt:P19": [
            {"p": _uri("Q1"), "l": _lit("106")},
            {"p": _uri("Q2"), "l": _lit("113")},
            {"p": _uri("Q4"), "l": _lit("82")},
        ],
        "wdt:P20": [{"p": _uri("Q1"), "l": _lit("106")}, {"p": _uri("Q3"), "l": _lit("95")}],
        "GROUP_CONCAT": [
            PESSOA,
            CAMOES,
            {**CAMOES, "birth": _lit("1525-01-01T00:00:00Z")},
            EUSEBIO,
            ANTHONY,
        ],
        "wdt:P279*": [
            {"occ": _uri("Q49757"), "root": _uri("Q36180")},
            {"occ": _uri("Q4964182"), "root": _uri("Q4964182")},
            {"occ": _uri("Q250867"), "root": _uri("Q250867")},
        ],
    }


def test_connected_people_merges_born_and_died_here():
    people = wikidata.connected_people(FakeWikidataPeople(_answers()), "Q597")
    assert people["Q1"] == wikidata.Connection(sitelinks=106, born_here=True, died_here=True)
    assert people["Q3"] == wikidata.Connection(sitelinks=95, born_here=False, died_here=True)


def test_details_dedupe_rows_and_fall_back_to_the_mul_label():
    details = wikidata.person_details(FakeWikidataPeople(_answers()), ["Q1", "Q2", "Q4"])
    assert details["Q2"]["name_en"] == "Luís de Camões"
    assert details["Q2"]["birth_year"] == 1524
    assert details["Q1"]["image_file"] == "Pessoa chapeu.jpg"
    assert details["Q1"]["wikipedia_en"] == "Fernando Pessoa"
    assert details["Q1"]["occupations"] == ["Q4964182", "Q49757"]
    assert details["Q4"]["birth_year"] == -500  # BCE dates keep their sign


def test_a_person_belongs_to_every_category_their_occupations_reach():
    roots = {"Q49757": {"Q36180"}, "Q4964182": {"Q4964182"}}
    assert categories.categories_for(["Q49757", "Q4964182"], roots) == ["history", "writer"]
    assert categories.categories_for(["Q937857"], roots) == []  # footballer: no category


def test_select_keeps_the_best_known_per_category_up_to_the_cap():
    people = [
        {"wikidata_id": f"Q{i}", "sitelinks": 100 - i, "categories": ["writer"]} for i in range(20)
    ] + [{"wikidata_id": "Q99", "sitelinks": 1, "categories": ["music"]}]
    picked = pipeline.select(people, per_category=5, max_total=8)
    assert [p["wikidata_id"] for p in picked] == ["Q0", "Q1", "Q2", "Q3", "Q4", "Q99"]


def test_build_city_lists_people_with_a_category_best_known_first():
    city = load_cities().get("lisbon")
    doc = pipeline.build_city(FakeWikidataPeople(_answers()), city)
    assert doc["city"] == "lisbon"
    assert [p["name_en"] for p in doc["people"]] == [
        "Luís de Camões",
        "Fernando Pessoa",
        "Anthony of Padua",
    ]
    pessoa = doc["people"][1]
    assert pessoa["categories"] == ["history", "writer"]
    assert (pessoa["born_here"], pessoa["died_here"]) == (True, True)
    assert pessoa["image_url"] is None  # Commons did not license the file


def test_save_and_load_round_trip(tmp_path):
    doc = {"city": "lisbon", "people": []}
    pipeline.save(doc, directory=tmp_path, format_json=False)
    assert pipeline.load_all(tmp_path) == {"lisbon": doc}


def test_people_seed_lists_each_city_person_with_their_categories():
    from wayfarer_pipeline import seed

    person = {
        "wikidata_id": "Q1",
        "name_en": "Fernando Pessoa",
        "name_pt": None,
        "description_en": "Portuguese poet",
        "description_pt": None,
        "categories": ["history", "writer"],
        "birth_year": 1888,
        "death_year": 1935,
        "born_here": True,
        "died_here": True,
        "image_url": None,
        "image_author": None,
        "image_license": None,
        "image_license_url": None,
        "image_page_url": None,
        "wikipedia_en": "Fernando Pessoa",
        "wikipedia_pt": None,
        "sitelinks": 106,
    }
    sql = seed.people_sql({"lisbon": {"city": "lisbon", "people": [person]}})
    assert "insert into public.notable_people" in sql
    assert "on conflict (city_slug, wikidata_id) do update" in sql
    assert "'lisbon', 'Q1', 'Fernando Pessoa'" in sql
    assert "array['history','writer']::text[]" in sql
    # Cities re-fetched with fewer people must not keep the old ones.
    assert sql.startswith("delete from public.notable_people;")


def test_occupation_roots_are_asked_once_across_cities():
    client = FakeWikidataPeople(_answers())
    lookup = categories.OccupationLookup(client)
    assert lookup.roots(["Q49757", "Q250867"])["Q49757"] == {"Q36180"}
    lookup.roots(["Q49757", "Q250867"])  # both known: no query
    assert len([q for q in client.queries if "wdt:P279*" in q]) == 1


class FakeSmallTownWikidata(FakeWikidataPeople):
    """Nobody reaches 20 sitelinks; with the lower bar, one person is found."""

    def request(self, method: str, url: str, **kwargs) -> tuple[int, str]:
        query = kwargs.get("data", {}).get("query", "")
        if "wdt:P19" in query and ">= 20" in query:
            self.queries.append(query)
            return 200, json.dumps({"results": {"bindings": []}})
        return super().request(method, url, **kwargs)


def test_a_small_city_with_few_well_known_people_lowers_the_bar():
    client = FakeSmallTownWikidata(_answers())
    people = wikidata.connected_people(client, "Q25444")
    assert "Q2" in people  # found with the lower bar
    assert any(">= 8" in q for q in client.queries)
