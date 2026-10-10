import json

from wayfarer_pipeline import attraction_texts

ARTICLE = (
    "St Paul's is a cathedral.\n\n== History ==\nRebuilt by Wren after the Great Fire of 1666."
)


class FakeExtractsClient:
    """Answers MediaWiki ``prop=extracts`` queries from canned articles by (language, title)."""

    def __init__(self, articles: dict[tuple[str, str], str]):
        self.articles = articles
        self.titles: list[str] = []

    def request(self, method: str, url: str, **kwargs) -> tuple[int, str]:
        title = kwargs["params"]["titles"]
        self.titles.append(title)
        language = url.split("//")[1].split(".")[0]
        article = self.articles.get((language, title))
        page = {"extract": article} if article else {"missing": True}
        return 200, json.dumps({"query": {"pages": [page]}})


def _doc(*attractions: dict) -> dict:
    return {"city": "london", "attractions": list(attractions)}


def _place(qid: str, en: str | None, pt: str | None) -> dict:
    return {"wikidata_id": qid, "wikipedia_en": en, "wikipedia_pt": pt}


def test_texts_come_from_each_language_article():
    client = FakeExtractsClient({("en", "St Paul's Cathedral"): ARTICLE})
    texts = attraction_texts.build_city(client, _doc(_place("Q1", "St Paul's Cathedral", None)))
    assert texts == {
        "Q1": {
            "summary_en": "St Paul's is a cathedral.",
            "history_en": "Rebuilt by Wren after the Great Fire of 1666.",
            "summary_pt": None,
            "history_pt": None,
        }
    }


def test_places_without_any_article_are_left_out_and_not_requested():
    client = FakeExtractsClient({})
    assert attraction_texts.build_city(client, _doc(_place("Q2", None, None))) == {}
    assert client.titles == []


def test_save_and_load_round_trip(tmp_path):
    texts = {"Q1": {"summary_en": "A.", "history_en": None, "summary_pt": None, "history_pt": None}}
    attraction_texts.save("london", texts, directory=tmp_path, format_json=False)
    assert attraction_texts.load_all(tmp_path) == {"london": texts}


def test_summary_line_counts_texts_per_language():
    texts = {
        "london": {
            "Q1": {"summary_en": "A.", "history_en": "B.", "summary_pt": None, "history_pt": None},
            "Q2": {"summary_en": "C.", "history_en": None, "summary_pt": "D.", "history_pt": None},
        }
    }
    assert attraction_texts.summary_line(texts) == (
        "2 attractions: 2 English and 1 Portuguese introductions,"
        " 1 English and 0 Portuguese histories"
    )
