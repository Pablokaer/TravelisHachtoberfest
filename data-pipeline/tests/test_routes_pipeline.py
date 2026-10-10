from datetime import date

import pytest
from routes_fakes import ScriptedPlanner, attraction_json, line_of_places, make_candidate

from wayfarer_pipeline.routes import pipeline
from wayfarer_pipeline.routes.model import InvalidProposal, PlannerContext, PlannerError, Proposal
from wayfarer_pipeline.routes.rules import RuleBasedRoutePlanner

TODAY = date(2026, 10, 10)
CONTEXT = PlannerContext(city_en="Lisbon", city_pt="Lisboa")


def _doc(count: int = 6) -> dict:
    items = [
        attraction_json(c.qid, c.lat, c.lng, popularity=c.popularity, avg_visit_minutes=20)
        for c in line_of_places(count)
    ]
    return {"city": "lisbon", "attractions": items}


def _good(stops=("Q3", "Q1", "Q2")) -> Proposal:
    return Proposal("churches", "Hill churches", "Igrejas da colina", stops)


def _build(planner, doc=None, retries: int = 2) -> dict:
    return pipeline.build_city(
        doc or _doc(), CONTEXT, planner, RuleBasedRoutePlanner(), TODAY, retries=retries
    )


def test_a_valid_proposal_becomes_an_ordered_measured_route():
    route = _build(ScriptedPlanner("qwen2.5:7b", [[_good()]]))["routes"][0]
    assert route["generated_by"] == "qwen2.5:7b"
    assert route["stops"] in (
        ["Q1", "Q2", "Q3"],
        ["Q3", "Q2", "Q1"],
    )  # walking order, not LLM order
    assert route["slug"] == "hill-churches" and route["theme"] == "churches"
    assert route["visit_minutes"] == 60
    assert 400 < route["distance_m"] < 700
    assert route["walking_seconds"] == round(route["distance_m"] / 1.25)


def test_document_shape_matches_the_snapshot_contract():
    doc = _build(ScriptedPlanner("rules", [[_good()]]))
    assert set(doc) == {"city", "generated", "routes"}
    assert (doc["city"], doc["generated"]) == ("lisbon", "2026-10-10")
    keys = {"slug", "theme", "title_en", "title_pt", "generated_by"}
    assert set(doc["routes"][0]) == keys | {
        "stops",
        "distance_m",
        "walking_seconds",
        "visit_minutes",
    }


def test_an_invalid_answer_is_retried_then_succeeds():
    bad = Proposal("churches", "Bad", "Mau", ("Q1", "Q2", "Q404"))
    planner = ScriptedPlanner("m", [[bad], PlannerError("timeout"), [_good()]])
    route = _build(planner)["routes"][0]
    assert (planner.calls, route["generated_by"]) == (3, "m")


def test_after_the_retries_the_rule_planner_takes_over_and_is_named():
    bad = Proposal("churches", "Bad", "Mau", ("Q1",))
    planner = ScriptedPlanner("m", [[bad]])
    routes = _build(planner, retries=1)["routes"]
    assert planner.calls == 2
    assert [r["generated_by"] for r in routes] == ["rules"]
    assert len(routes[0]["stops"]) == 6


def test_a_proposal_too_long_to_walk_is_rejected_naming_the_distance():
    group = [
        make_candidate(f"Q{i}", 38.7 + i * 0.03, -9.14, popularity=90 - i) for i in range(1, 4)
    ]
    long_walk = Proposal("churches", "Marathon", "Maratona", ("Q1", "Q2", "Q3"))
    with pytest.raises(InvalidProposal, match=r"walk of \d+ m.*5000 m"):
        pipeline.route_from_proposal(long_walk, group, "m", "marathon")


def test_slugs_stay_unique_within_a_city():
    doc = _doc(0)
    doc["attractions"] = [
        attraction_json(f"Q{k}{i}", 38.7 + k * 0.5, -9.14 + i * 0.002, popularity=80)
        for k in range(1, 3)
        for i in range(1, 5)
    ]
    planner = ScriptedPlanner("m", [[_good(("Q11", "Q12", "Q13"))], [_good(("Q21", "Q22", "Q23"))]])
    slugs = [r["slug"] for r in _build(planner, doc=doc)["routes"]]
    assert slugs == ["hill-churches", "hill-churches-2"]


def test_a_city_with_too_few_places_gets_no_routes():
    assert _build(RuleBasedRoutePlanner(), doc=_doc(2))["routes"] == []


def test_save_and_load_round_trip(tmp_path):
    doc = _build(RuleBasedRoutePlanner())
    pipeline.save(doc, tmp_path, format_json=False)
    assert pipeline.load_all(tmp_path) == {"lisbon": doc}
    assert pipeline.load_all(tmp_path / "missing") == {}


def test_summary_line_counts_cities_routes_and_planners():
    docs = {"lisbon": _build(RuleBasedRoutePlanner()), "porto": {"routes": []}}
    assert pipeline.summary_line(docs) == "2 cities, 1 routes (rules 1)"


def test_unknown_retry_count_is_refused_with_the_value():
    with pytest.raises(ValueError, match="retries.*-1"):
        _build(RuleBasedRoutePlanner(), retries=-1)
