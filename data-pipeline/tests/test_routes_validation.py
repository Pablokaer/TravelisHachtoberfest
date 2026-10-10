import pytest
from routes_fakes import line_of_places

from wayfarer_pipeline.routes import validation
from wayfarer_pipeline.routes.model import InvalidProposal, Proposal


def _proposal(stops, **kw) -> Proposal:
    base = {"theme": "churches", "title_en": "Old churches", "title_pt": "Igrejas antigas"}
    return Proposal(stops=tuple(stops), **{**base, **kw})


def test_accepts_a_proposal_that_uses_candidate_ids_only():
    group = line_of_places(5)
    ok = validation.validate_proposal(_proposal(["Q1", "Q2", "Q3"]), group)
    assert ok.stops == ("Q1", "Q2", "Q3")


def test_repairs_duplicate_ids_keeping_the_first():
    group = line_of_places(5)
    fixed = validation.validate_proposal(_proposal(["Q1", "Q2", "Q1", "Q3"]), group)
    assert fixed.stops == ("Q1", "Q2", "Q3")


def test_repairs_a_theme_into_a_short_kebab_key():
    group = line_of_places(5)
    fixed = validation.validate_proposal(
        _proposal(["Q1", "Q2", "Q3"], theme=" Old Town  Walk! "), group
    )
    assert fixed.theme == "old-town-walk"


def test_rejects_an_id_outside_the_candidates_naming_it():
    with pytest.raises(InvalidProposal, match="Q999"):
        validation.validate_proposal(_proposal(["Q1", "Q2", "Q999"]), line_of_places(5))


@pytest.mark.parametrize("stops", [["Q1", "Q2"], ["Q1", "Q1", "Q2"]])
def test_rejects_fewer_than_three_distinct_stops(stops):
    with pytest.raises(InvalidProposal, match="3 to 8"):
        validation.validate_proposal(_proposal(stops), line_of_places(5))


def test_rejects_more_than_eight_stops():
    ids = [f"Q{i}" for i in range(1, 10)]
    with pytest.raises(InvalidProposal, match="3 to 8"):
        validation.validate_proposal(_proposal(ids), line_of_places(9))


@pytest.mark.parametrize("field", ["title_en", "title_pt", "theme"])
def test_rejects_empty_titles_and_themes(field):
    with pytest.raises(InvalidProposal, match=field):
        validation.validate_proposal(
            _proposal(["Q1", "Q2", "Q3"], **{field: "  "}), line_of_places(4)
        )


def test_rejects_an_overlong_title_with_its_length():
    with pytest.raises(InvalidProposal, match=r"title_en.*81"):
        validation.validate_proposal(
            _proposal(["Q1", "Q2", "Q3"], title_en="x" * 81), line_of_places(4)
        )


def test_slug_folds_accents_and_is_kebab_case():
    assert validation.slugify("Igrejas e capelas perto de Sé!") == "igrejas-e-capelas-perto-de-se"
    assert validation.slugify("  --Ünï  Kraków Århus-- ") == "uni-krakow-arhus"


def test_slug_falls_back_when_nothing_is_left():
    assert validation.slugify("???") == "route"


def test_unique_slug_numbers_a_taken_one():
    taken = {"old-churches", "old-churches-2"}
    assert validation.unique_slug("Old churches", taken) == "old-churches-3"
    assert "old-churches-3" in taken
    assert validation.unique_slug("Castles", taken) == "castles"
