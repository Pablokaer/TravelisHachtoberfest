from wayfarer_pipeline.gates.text import summary_problem, text_problem

AMSTERDAM = (
    "Amsterdam is the capital and largest city of the Netherlands. It is colloquially referred "
    "to as the Venice of the North, for its large number of canals."
)


def test_good_texts_have_no_problem():
    assert text_problem("Anne Frank House", "name") is None
    assert text_problem("museum in Amsterdam", "description") is None
    assert text_problem(AMSTERDAM, "summary") is None


def test_missing_or_blank_text():
    assert text_problem(None, "name") == "missing"
    assert text_problem("   ", "description") == "missing"


def test_too_short_for_its_kind():
    assert text_problem("A", "name") == "too short (1 < 2 characters)"
    assert text_problem("Amsterdam is a city.", "summary") == "too short (20 < 80 characters)"


def test_markup_and_broken_encoding():
    assert text_problem("{{Infobox city}} Amsterdam", "summary") == "markup"
    assert text_problem("Anne <b>Frank</b> House", "name") == "markup"
    assert text_problem("Caf&eacute; Américain", "name") == "markup"
    assert text_problem("Pal�cio Nacional", "name") == "broken encoding"


def test_placeholders_that_are_not_real_text():
    assert text_problem("Q165366", "name") == "raw Wikidata id"
    assert text_problem("Mercury may refer to: a planet, an element…" * 2, "summary") == (
        "disambiguation"
    )
    assert text_problem("Mercúrio pode referir-se a: um planeta, um elemento…" * 2, "summary") == (
        "disambiguation"
    )


def test_a_summary_that_lost_most_of_its_text_regressed():
    shorter = AMSTERDAM[:60] + " and more text to pass the minimum length of the summary."
    assert summary_problem(AMSTERDAM, AMSTERDAM) is None
    assert summary_problem(shorter, AMSTERDAM) is None
    cut = "Amsterdam is the capital of the Netherlands, a country in Europe, with many canals."
    assert summary_problem(cut, AMSTERDAM * 3) == "shrank to 18% of the previous text"


def test_a_summary_without_a_previous_text_is_only_checked_on_its_own():
    assert summary_problem(AMSTERDAM, None) is None
    assert summary_problem(None, None) == "missing"
