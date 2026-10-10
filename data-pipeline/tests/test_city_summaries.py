import json

from wayfarer_pipeline import city_summaries, seed
from wayfarer_pipeline.config import load_cities


class FakeWikiClient:
    """Answers the sitelinks SPARQL query and MediaWiki ``prop=extracts`` from canned articles."""

    def __init__(self, bindings: list[dict], pages: dict[tuple[str, str], dict]):
        self.bindings = bindings
        self.pages = pages

    def request(self, method: str, url: str, **kwargs) -> tuple[int, str]:
        if "query.wikidata.org" in url:
            return 200, json.dumps({"results": {"bindings": self.bindings}})
        language = url.split("//")[1].split(".")[0]
        page = self.pages.get((language, kwargs["params"]["titles"]), {"missing": True})
        return 200, json.dumps({"query": {"pages": [page]}})


def _uri(value: str) -> dict:
    return {"type": "uri", "value": value}


AMSTERDAM_EN = (
    "Amsterdam is the capital.\nIt has canals.\n\n"
    "== History ==\n=== Origins ===\nA fishing village dammed the Amstel around 1250."
)


def _client() -> FakeWikiClient:
    return FakeWikiClient(
        bindings=[
            {
                "item": _uri("http://www.wikidata.org/entity/Q727"),
                "en": _uri("https://en.wikipedia.org/wiki/Amsterdam"),
                "pt": _uri("https://pt.wikipedia.org/wiki/Amesterd%C3%A3o"),
            },
            {"item": _uri("http://www.wikidata.org/entity/Q84")},
        ],
        pages={
            ("en", "Amsterdam"): {"extract": AMSTERDAM_EN},
            ("pt", "Amesterdão"): {
                "extract": "Amesterdão pode referir-se a",
                "pageprops": {"disambiguation": ""},
            },
        },
    )


def test_article_titles_come_from_wikidata_sitelinks():
    titles = city_summaries.article_titles(_client(), ["Q727", "Q84"])
    assert titles == {"Q727": ("Amsterdam", "Amesterdão"), "Q84": (None, None)}


def test_build_keys_every_city_by_slug():
    config = load_cities()
    amsterdam = config.get("amsterdam")
    london = config.get("london")
    config.cities = [amsterdam, london]
    built = city_summaries.build(_client(), config)
    # The whole introduction (D-070), not only its first paragraph, plus the History excerpt.
    assert built["amsterdam"] == {
        "wikipedia_en": "Amsterdam",
        "wikipedia_pt": "Amesterdão",
        "summary_en": "Amsterdam is the capital.\nIt has canals.",
        "summary_pt": None,
        "history_en": "A fishing village dammed the Amstel around 1250.",
        "history_pt": None,
    }
    assert built["london"] == {
        "wikipedia_en": None,
        "wikipedia_pt": None,
        "summary_en": None,
        "summary_pt": None,
        "history_en": None,
        "history_pt": None,
    }


def test_build_keeps_the_cities_it_was_not_asked_for():
    config = load_cities()
    previous = {"tokyo": {"summary_en": "Tokyo is the capital of Japan."}}
    built = city_summaries.build(_client(), config, [config.get("amsterdam")], previous)
    assert built["tokyo"] == previous["tokyo"]
    assert built["amsterdam"]["summary_en"] == "Amsterdam is the capital.\nIt has canals."


def test_cities_seed_carries_the_summaries():
    config = load_cities()
    config.cities = [config.get("amsterdam")]
    summaries = {
        "amsterdam": {
            "wikipedia_en": "Amsterdam",
            "wikipedia_pt": None,
            "summary_en": "Canals and bikes.",
            "summary_pt": None,
            "history_en": "Dammed in 1250.",
            "history_pt": None,
        }
    }
    sql = seed.cities_sql(config, summaries)
    assert "summary_en, summary_pt, wikipedia_en, wikipedia_pt, history_en, history_pt" in sql
    assert "'Canals and bikes.', null, 'Amsterdam', null, 'Dammed in 1250.', null" in sql


def test_cities_seed_without_a_summary_uses_nulls():
    config = load_cities()
    config.cities = [config.get("amsterdam")]
    assert "null, null, null, null, null, null" in seed.cities_sql(config, {})
