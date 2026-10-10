"""Guards (restore a text that got worse) and blocks (refuse a refresh that lost too much) per
dataset. Each guard returns the repaired data and what it did."""

from wayfarer_pipeline.gates import attractions, countries, summaries, visa

LEAD_EN = (
    "Amsterdam is the capital and largest city of the Netherlands. It is colloquially referred "
    "to as the Venice of the North, for its large number of canals."
)
LEAD_PT = (
    "Amesterdão é a capital e a cidade mais populosa do Reino dos Países Baixos, conhecida "
    "pelos seus canais e pelo centro histórico classificado pela UNESCO."
)


def _summary(en: str | None = LEAD_EN, pt: str | None = LEAD_PT) -> dict:
    return {
        "wikipedia_en": "Amsterdam",
        "summary_en": en,
        "wikipedia_pt": "Amesterdão",
        "summary_pt": pt,
    }


# --- city summaries ---------------------------------------------------------------------------


def test_a_broken_new_summary_is_replaced_by_the_previous_one():
    new = {"amsterdam": _summary(en="Amsterdam may refer to: a city, a ship…" * 3, pt=None)}
    old = {"amsterdam": _summary()}
    result = summaries.guard(new, old)
    assert result.data["amsterdam"] == _summary()
    assert [(f.subject, f.field, f.action) for f in result.findings] == [
        ("amsterdam", "summary_en", "restored"),
        ("amsterdam", "summary_pt", "restored"),
    ]
    assert result.findings[0].detail == "disambiguation"


def test_a_better_or_equal_summary_is_kept():
    longer = _summary(en=LEAD_EN + " It has a population of about 940,000.")
    result = summaries.guard({"amsterdam": longer}, {"amsterdam": _summary()})
    assert result.data["amsterdam"] == longer
    assert result.findings == []


def test_a_new_city_with_a_broken_summary_is_reported_but_cannot_be_restored():
    result = summaries.guard({"lisbon": _summary(en=None)}, {})
    assert [(f.subject, f.field, f.action) for f in result.findings] == [
        ("lisbon", "summary_en", "unrepaired"),
    ]


def test_too_many_restored_summaries_means_the_source_broke():
    old = {f"city{i}": _summary() for i in range(4)}
    new = {f"city{i}": _summary(en=None, pt=None) for i in range(4)}
    result = summaries.guard(new, old)
    assert [f.action for f in result.findings].count("blocked") == 1
    assert "8 of 8 texts" in next(f.detail for f in result.findings if f.action == "blocked")


# --- attractions ------------------------------------------------------------------------------


def _place(qid: str, **over) -> dict:
    place = {
        "wikidata_id": qid,
        "name_en": f"Place {qid}",
        "name_pt": f"Lugar {qid}",
        "description_en": "museum in Amsterdam",
        "description_pt": "museu em Amesterdão",
        "image_url": f"https://upload.wikimedia.org/{qid}.jpg",
        "image_author": "Ann",
        "image_license": "CC BY-SA 4.0",
        "image_license_url": None,
        "image_page_url": f"https://commons.wikimedia.org/wiki/File:{qid}.jpg",
        "opening_hours": "Mo-Su 09:00-17:00",
    }
    return {**place, **over}


def _city(places: list[dict]) -> dict:
    return {"city": "amsterdam", "retrieved": "2026-10-01", "attractions": places}


def test_lost_names_descriptions_and_photos_come_back_from_the_previous_data():
    old = _city([_place("Q1"), _place("Q2")] + [_place(f"Q{i}") for i in range(3, 20)])
    broken = _place("Q1", name_en="Q1", description_pt=None, image_url=None, image_author=None)
    new = _city([broken, _place("Q2", opening_hours=None)] + old["attractions"][2:])
    result = attractions.guard("amsterdam", new, old)
    assert result.data["attractions"][0] == _place("Q1")
    # Opening hours can legitimately disappear (a place closed): not restored.
    assert result.data["attractions"][1]["opening_hours"] is None
    assert sorted((f.field, f.action) for f in result.findings) == [
        ("description_pt", "restored"),
        ("image", "restored"),
        ("name_en", "restored"),
    ]


def test_a_city_that_lost_many_places_is_blocked():
    old = _city([_place(f"Q{i}") for i in range(100)])
    new = _city([_place(f"Q{i}") for i in range(80)])
    result = attractions.guard("amsterdam", new, old)
    blocked = [f for f in result.findings if f.action == "blocked"]
    assert [f.detail for f in blocked] == ["places dropped from 100 to 80 (-20%, limit -15%)"]


def test_a_city_whose_places_were_mostly_replaced_is_blocked():
    old = _city([_place(f"Q{i}") for i in range(100)])
    new = _city([_place(f"Q{i}") for i in range(60)] + [_place(f"N{i}") for i in range(40)])
    result = attractions.guard("amsterdam", new, old)
    assert [f.detail for f in result.findings if f.action == "blocked"] == [
        "40 of 100 previous places are gone (40%, limit 30%)"
    ]


def test_a_new_city_has_nothing_to_compare_with():
    result = attractions.guard("lisbon", _city([_place("Q1")]), None)
    assert result.findings == []


# --- countries --------------------------------------------------------------------------------


def _country(code: str = "NL", **over) -> dict:
    country = {
        "code": code,
        "name_en": "Netherlands",
        "name_pt": "Países Baixos",
        "currency_codes": ["EUR"],
        "plug_types": ["C", "F"],
        "voltage": 230,
        "emergency_number": "112",
        "police_number": "112",
    }
    return {**country, **over}


def test_country_facts_that_vanished_are_restored_and_changed_ones_flagged():
    new = [_country(plug_types=[], voltage=None, name_pt="", police_number="0900-8844")]
    result = countries.guard(new, [_country()])
    assert result.data == [_country(police_number="0900-8844")]
    assert sorted((f.field, f.action) for f in result.findings) == [
        ("name_pt", "restored"),
        ("plug_types", "restored"),
        ("police_number", "review"),
        ("voltage", "restored"),
    ]
    review = next(f for f in result.findings if f.action == "review")
    assert review.detail == "'112' → '0900-8844'"


def test_a_missing_country_is_blocked():
    result = countries.guard([_country("NL")], [_country("NL"), _country("PT", name_en="Portugal")])
    assert [(f.subject, f.action) for f in result.findings] == [("PT", "blocked")]


# --- visa -------------------------------------------------------------------------------------


def _rows(n: int, requirement: str = "visa_free") -> list[dict]:
    return [
        {
            "passport": f"P{i}",
            "destination": "NL",
            "requirement": requirement,
            "max_stay_days": "90",
        }
        for i in range(n)
    ]


def test_visa_rows_that_disappeared_block_the_refresh():
    result = visa.check(_rows(90), _rows(100))
    assert [f.detail for f in result if f.action == "blocked"] == [
        "rules dropped from 100 to 90 (-10.0%, limit -1%)"
    ]


def test_a_wave_of_changed_visa_rules_is_blocked_and_a_few_are_listed_for_review():
    few = _rows(100)
    few[0] = {**few[0], "requirement": "visa_required", "max_stay_days": ""}
    assert [(f.subject, f.action, f.detail) for f in visa.check(few, _rows(100))] == [
        ("P0→NL", "review", "visa_free 90 days → visa_required")
    ]
    many = _rows(20, "visa_required") + _rows(100)[20:]
    blocked = [f for f in visa.check(many, _rows(100)) if f.action == "blocked"]
    assert [f.detail for f in blocked] == ["20 of 100 rules changed (20.0%, limit 10%)"]
