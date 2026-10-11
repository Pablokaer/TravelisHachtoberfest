import json

import pytest
from routes_fakes import CONTEXT, FakeOllamaTransport, line_of_places

from wayfarer_pipeline.routes.model import PlannerError
from wayfarer_pipeline.routes.ollama import OllamaRoutePlanner
from wayfarer_pipeline.routes.rules import RuleBasedRoutePlanner


def _group(category: str, count: int = 5):
    return [p.__class__(**{**p.__dict__, "category": category}) for p in line_of_places(count)]


def test_rules_planner_keeps_every_stop_in_one_bilingual_proposal():
    group = _group("castle")
    (proposal,) = RuleBasedRoutePlanner().propose(group, CONTEXT)
    assert proposal.stops == tuple(c.qid for c in group)
    assert proposal.theme == "castles"
    assert proposal.title_en.startswith("Castles and viewpoints around Place Q1")
    assert proposal.title_pt.startswith("Castelos e miradouros perto de Place Q1")


def test_rules_planner_uses_the_portuguese_name_of_the_anchor_in_pt():
    group = _group("church")
    group[0] = group[0].__class__(**{**group[0].__dict__, "name_pt": "Sé de Lisboa"})
    (proposal,) = RuleBasedRoutePlanner().propose(group, CONTEXT)
    assert proposal.title_pt == "Igrejas e capelas perto de Sé de Lisboa"


def test_rules_planner_calls_a_mixed_group_historic_highlights():
    base = line_of_places(4)
    categories = ["church", "museum", "palace", "monument"]  # 25% each: no dominant theme
    mixed = [
        c.__class__(**{**c.__dict__, "category": k}) for c, k in zip(base, categories, strict=True)
    ]
    (proposal,) = RuleBasedRoutePlanner().propose(mixed, CONTEXT)
    assert proposal.theme == "highlights"
    assert proposal.title_en.startswith("Historic highlights around ")


def test_rules_planner_names_the_theme_two_in_five_places_share():
    base = line_of_places(5)
    categories = ["museum", "museum", "church", "palace", "monument"]  # museums: 40%
    group = [
        c.__class__(**{**c.__dict__, "category": k}) for c, k in zip(base, categories, strict=True)
    ]
    assert RuleBasedRoutePlanner().propose(group, CONTEXT)[0].theme == "museums"


def test_rules_planner_names_itself_rules():
    assert RuleBasedRoutePlanner().name == "rules"


def _chat_reply(content: object) -> dict:
    return {"message": {"role": "assistant", "content": json.dumps(content)}}


def test_ollama_planner_posts_a_constrained_request_and_parses_the_answer():
    group = _group("church", 4)
    answer = {
        "theme": "churches",
        "title_en": "Churches of the old town",
        "title_pt": "Igrejas da cidade velha",
        "stops": ["Q2", "Q1", "Q3"],
    }
    transport = FakeOllamaTransport([_chat_reply(answer)])
    planner = OllamaRoutePlanner("qwen2.5:7b", "http://localhost:11434/", transport)
    (proposal,) = planner.propose(group, CONTEXT)
    assert planner.name == "qwen2.5:7b"
    assert proposal.stops == ("Q2", "Q1", "Q3") and proposal.theme == "churches"
    url, payload = transport.posts[0]
    assert url == "http://localhost:11434/api/chat"
    assert payload["stream"] is False and payload["model"] == "qwen2.5:7b"
    assert payload["options"]["temperature"] <= 0.3
    schema = payload["format"]
    assert schema["properties"]["stops"]["items"]["enum"] == ["Q1", "Q2", "Q3", "Q4"]
    prompt = json.dumps(payload["messages"])
    assert "Place Q1" in prompt and "church" in prompt
    assert "latitude" not in prompt  # the model only sees ids, names, categories, descriptions


def test_ollama_planner_rejects_an_answer_that_is_not_json():
    transport = FakeOllamaTransport([{"message": {"content": "Sure! Here is a route"}}])
    planner = OllamaRoutePlanner("m", "http://x", transport)
    with pytest.raises(PlannerError, match="not valid JSON"):
        planner.propose(_group("church"), CONTEXT)


def test_ollama_planner_rejects_an_answer_missing_fields():
    transport = FakeOllamaTransport([_chat_reply({"theme": "churches"})])
    planner = OllamaRoutePlanner("m", "http://x", transport)
    with pytest.raises(PlannerError, match="title_en"):
        planner.propose(_group("church"), CONTEXT)


def test_ollama_planner_reports_an_unreachable_server_with_the_url():
    planner = OllamaRoutePlanner(
        "m", "http://localhost:1", FakeOllamaTransport([], reachable=False)
    )
    with pytest.raises(PlannerError, match="http://localhost:1/api/tags"):
        planner.check_reachable()


def test_the_model_comes_from_the_environment_when_it_is_set() -> None:
    from wayfarer_pipeline.routes.ollama import DEFAULT_MODEL, default_model

    assert default_model({"OLLAMA_MODEL": "gemma3:4b"}) == "gemma3:4b"
    assert default_model({"OLLAMA_MODEL": "  gemma3:4b  "}) == "gemma3:4b"
    assert default_model({"OLLAMA_MODEL": ""}) == DEFAULT_MODEL
    assert default_model({}) == DEFAULT_MODEL
