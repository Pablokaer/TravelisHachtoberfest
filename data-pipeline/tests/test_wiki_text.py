import json

from wayfarer_pipeline import wiki_text

ARTICLE = """The Jerónimos Monastery is a former monastery in Belém.
It is a UNESCO World Heritage Site.

== History ==

=== Origins ===
It replaced a church where monks helped seafarers.
Vasco da Gama spent his last night in Portugal there before sailing to India in 1497.

=== Republic ===
It became a national pantheon.

== Architecture ==
Manueline style."""


def test_intro_is_the_text_before_the_first_heading():
    assert wiki_text.intro(ARTICLE) == (
        "The Jerónimos Monastery is a former monastery in Belém.\n"
        "It is a UNESCO World Heritage Site."
    )


def test_history_joins_the_section_paragraphs_without_subheadings():
    assert wiki_text.history(ARTICLE, "en") == (
        "It replaced a church where monks helped seafarers.\n"
        "Vasco da Gama spent his last night in Portugal there before sailing to India in 1497.\n"
        "It became a national pantheon."
    )


def test_history_finds_the_portuguese_heading():
    article = "Intro.\n\n== História ==\nFoi mandado construir por D. Manuel I.\n\n== Igreja ==\nX"
    assert wiki_text.history(article, "pt") == "Foi mandado construir por D. Manuel I."


def test_history_is_none_without_the_section():
    assert wiki_text.history("Intro.\n\n== Architecture ==\nManueline.", "en") is None


def test_long_text_keeps_whole_paragraphs_up_to_the_limit():
    text = "\n".join(["a" * 600, "b" * 600, "c" * 600])
    assert wiki_text.clip(text, limit=1300) == "a" * 600 + "\n" + "b" * 600


def test_a_first_paragraph_over_the_limit_is_cut_at_a_sentence():
    text = "First sentence. " * 100
    clipped = wiki_text.clip(text, limit=100)
    assert clipped.endswith("First sentence.")
    assert len(clipped) <= 100


class FakeExtractsClient:
    """Answers MediaWiki ``prop=extracts`` queries from canned pages keyed by (language, title)."""

    def __init__(self, pages: dict[tuple[str, str], dict]):
        self.pages = pages
        self.calls: list[dict] = []

    def request(self, method: str, url: str, **kwargs) -> tuple[int, str]:
        params = kwargs["params"]
        self.calls.append({"url": url, **params})
        language = url.split("//")[1].split(".")[0]
        page = self.pages.get((language, params["titles"]), {"missing": True})
        return 200, json.dumps({"query": {"pages": [page]}})


def test_article_text_returns_intro_and_history():
    client = FakeExtractsClient({("en", "Jerónimos Monastery"): {"extract": ARTICLE}})
    text = wiki_text.article_text(client, "en", "Jerónimos Monastery")
    assert text == wiki_text.ArticleText(
        summary=wiki_text.intro(ARTICLE), history=wiki_text.history(ARTICLE, "en")
    )
    assert client.calls[0]["url"] == "https://en.wikipedia.org/w/api.php"
    assert client.calls[0]["explaintext"] == 1


def test_missing_and_disambiguation_pages_have_no_text():
    client = FakeExtractsClient(
        {
            ("pt", "Belém"): {
                "extract": "Belém pode referir-se a:",
                "pageprops": {"disambiguation": ""},
            }
        }
    )
    assert wiki_text.article_text(client, "pt", "Belém") is None
    assert wiki_text.article_text(client, "en", "Nowhere") is None


def test_texts_with_leftover_wiki_markup_are_dropped():
    # Upstream articles sometimes leak wikitext into the plain extract (e.g. Bergen's
    # "[[Laksevåg]]", Moscow Zoo's "</link>"); the app would show it raw.
    article = "Intro with [[a link]].\n\n== History ==\nFounded in 1741.{{efn|note}}"
    assert wiki_text.intro(article) is None
    assert wiki_text.history(article, "en") is None
