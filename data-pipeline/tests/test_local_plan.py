"""The trip wizard's two AI endpoints: a follow-up question and a ranked shortlist (D-081)."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

import pytest
from local_fakes import FakeGeocoder, FakeOllama, make_builder
from test_local_service import Api

from wayfarer_pipeline.local.jobs import JobBoard
from wayfarer_pipeline.local.plan import PlanAssistant, PlanUnavailable
from wayfarer_pipeline.local.server import make_server
from wayfarer_pipeline.local.service import BadRequest, CityService

ANSWERS = [
    {"id": "month", "question": "When do you want to travel?", "answer": "December 2026"},
    {"id": "themes", "question": "What do you want to see?", "answer": "Castles and beaches"},
]
GOOD_QUESTION = {
    "text": "What kind of castle atmosphere do you prefer?",
    "kind": "single",
    "options": ["Hilltop castles", "Fairytale palaces", "Ruined fortresses"],
    "allow_other": True,
}


def says(payload: dict[str, Any] | str) -> str:
    return payload if isinstance(payload, str) else json.dumps(payload)


def assistant(*contents: Any, **kw: Any) -> tuple[PlanAssistant, FakeOllama]:
    ollama = FakeOllama(list(contents), **kw)
    return PlanAssistant(ollama, "qwen2.5:7b", "http://localhost:11434"), ollama


def ask(wizard: PlanAssistant, answers: list[dict[str, str]] = ANSWERS, language: str = "en"):
    return wizard.question(language, answers)


def test_a_valid_follow_up_question_is_returned_with_slug_values() -> None:
    wizard, _ = assistant(says(GOOD_QUESTION))
    result = ask(wizard)
    assert result == {
        "question": {
            "id": "ai-2",
            "text": "What kind of castle atmosphere do you prefer?",
            "kind": "single",
            "options": [
                {"value": "hilltop-castles", "label": "Hilltop castles"},
                {"value": "fairytale-palaces", "label": "Fairytale palaces"},
                {"value": "ruined-fortresses", "label": "Ruined fortresses"},
            ],
            "allow_other": True,
        },
        "source": "ollama",
    }


def test_the_prompt_carries_the_answers_the_language_and_a_schema() -> None:
    wizard, ollama = assistant(says(GOOD_QUESTION))
    ask(wizard, language="pt")
    (payload,) = ollama.posts
    prompt = " ".join(m["content"] for m in payload["messages"])
    assert payload["model"] == "qwen2.5:7b" and payload["stream"] is False
    assert "European Portuguese" in prompt
    assert "When do you want to travel?" in prompt and "Castles and beaches" in prompt
    schema = payload["format"]
    assert schema["properties"]["kind"]["enum"] == ["single", "multi", "text"]


def test_a_text_question_has_no_options_and_no_other() -> None:
    free = {"text": "Anything you would hate to miss?", "kind": "text", "options": []}
    result = ask(assistant(says(free))[0])
    assert result["question"]["options"] == [] and result["question"]["allow_other"] is False


def test_values_are_ascii_kebab_slugs_made_unique() -> None:
    wizard, _ = assistant(
        says({**GOOD_QUESTION, "options": ["Café & Bar", "Cafe Bar", "Sunset views"]})
    )
    labels = [o["value"] for o in ask(wizard)["question"]["options"]]
    assert labels == ["cafe-bar", "cafe-bar-2", "sunset-views"]


@pytest.mark.parametrize(
    "bad",
    [
        "not json at all",
        {**GOOD_QUESTION, "text": "x" * 111},
        {**GOOD_QUESTION, "text": "  "},
        {**GOOD_QUESTION, "kind": "radio"},
        {**GOOD_QUESTION, "options": ["Only", "Two"]},
        {**GOOD_QUESTION, "options": [f"Option {i}" for i in range(7)]},
        {**GOOD_QUESTION, "options": ["A" * 41, "Fine", "Also fine"]},
        {**GOOD_QUESTION, "options": ["Same", "same", "Other"]},
        {**GOOD_QUESTION, "text": "When do you want to travel??"},
        {**GOOD_QUESTION, "text": "What do you want to see"},
    ],
)
def test_an_invalid_question_is_retried_and_the_next_valid_one_is_used(bad: Any) -> None:
    wizard, ollama = assistant(says(bad), says(GOOD_QUESTION))
    assert ask(wizard)["question"]["text"] == GOOD_QUESTION["text"]
    assert len(ollama.posts) == 2


def test_three_invalid_answers_in_a_row_are_a_503_naming_the_last_problem() -> None:
    wizard, ollama = assistant(says({**GOOD_QUESTION, "text": "x" * 111}))
    with pytest.raises(PlanUnavailable, match="110"):
        ask(wizard)
    assert len(ollama.posts) == 3  # the first try and two retries


def test_the_id_counts_the_answers_so_far() -> None:
    wizard, _ = assistant(says(GOOD_QUESTION))
    assert ask(wizard, answers=ANSWERS[:1])["question"]["id"] == "ai-1"


def test_a_missing_model_or_server_is_unavailable_without_trying() -> None:
    wizard, ollama = assistant(says(GOOD_QUESTION), models=["llama3:8b"])
    with pytest.raises(PlanUnavailable, match="qwen2.5:7b"):
        ask(wizard)
    off, _ = assistant(says(GOOD_QUESTION), reachable=False)
    with pytest.raises(PlanUnavailable, match="Ollama"):
        ask(off)
    assert ollama.posts == []


def test_the_rules_planner_has_no_assistant() -> None:
    wizard = PlanAssistant(FakeOllama([]), "qwen2.5:7b", "http://x", enabled=False)
    with pytest.raises(PlanUnavailable, match="--planner"):
        ask(wizard)


CANDIDATES = [
    {
        "slug": "lisbon",
        "name": "Lisbon",
        "country": "Portugal",
        "distance_km": 1900,
        "facts": {
            "temp_mean_c": 15.1,
            "temp_max_c": 18,
            "sunshine_hours": 5.2,
            "population": 545000,
            "inception_year": None,
            "beaches": 12,
            "unesco": 4,
            "castles": 3,
        },
    },
    {"slug": "porto", "name": "Porto", "country": "Portugal", "distance_km": 2100,
     "facts": {"temp_mean_c": 13.2, "beaches": 5, "castles": 1}},
    {"slug": "sintra", "name": "Sintra", "country": "Portugal", "distance_km": 1950,
     "facts": {"temp_mean_c": 14.0, "castles": 9, "unesco": 1}},
    {"slug": "split", "name": "Split", "country": "Croatia", "distance_km": 2900,
     "facts": {"temp_mean_c": 11.0, "beaches": 9, "castles": 2}},
]  # fmt: skip


def picks(*pairs: tuple[str, str]) -> str:
    return says({"picks": [{"slug": s, "reason": r} for s, r in pairs]})


GOOD_PICKS = picks(
    ("lisbon", "Mild December days around 15 °C and 12 beaches."),
    ("sintra", "A castle town with 9 castles."),
    ("split", "Beaches and a palace-fortress on the Adriatic."),
)


def rank(wizard: PlanAssistant, limit: int = 3, candidates: list | None = None, language="en"):
    return wizard.rank(language, limit, ANSWERS, CANDIDATES if candidates is None else candidates)


def test_a_valid_shortlist_is_returned_in_the_models_order() -> None:
    wizard, _ = assistant(GOOD_PICKS)
    result = rank(wizard, limit=3)
    assert [p["slug"] for p in result["picks"]] == ["lisbon", "sintra", "split"]
    assert result["source"] == "ollama" and result["picks"][0]["reason"].startswith("Mild")


def test_the_prompt_lists_every_candidate_with_its_facts_and_forbids_inventing() -> None:
    wizard, ollama = assistant(GOOD_PICKS)
    rank(wizard, limit=3)
    (payload,) = ollama.posts
    prompt = " ".join(m["content"] for m in payload["messages"])
    assert "lisbon" in prompt and "545000" in prompt and "Castles and beaches" in prompt
    assert "never invent" in prompt.lower() and "do not drop" in prompt.lower()
    item = payload["format"]["properties"]["picks"]
    assert item["items"]["properties"]["slug"]["enum"] == ["lisbon", "porto", "sintra", "split"]
    assert (item["minItems"], item["maxItems"]) == (3, 3)


def test_with_fewer_candidates_than_three_all_of_them_are_picked() -> None:
    wizard, ollama = assistant(picks(("lisbon", "Mild weather."), ("porto", "Cooler and cheaper.")))
    result = rank(wizard, limit=6, candidates=CANDIDATES[:2])
    assert len(result["picks"]) == 2
    schema = ollama.posts[0]["format"]["properties"]["picks"]
    assert (schema["minItems"], schema["maxItems"]) == (2, 2)


@pytest.mark.parametrize(
    "bad",
    [
        "{ nope",
        picks(("lisbon", "ok"), ("sintra", "ok"), ("atlantis", "Sunken city.")),
        picks(("lisbon", "ok"), ("lisbon", "again"), ("sintra", "ok")),
        picks(("lisbon", ""), ("sintra", "ok"), ("split", "ok")),
        picks(("lisbon", "x" * 221), ("sintra", "ok"), ("split", "ok")),
        picks(("lisbon", "ok"), ("sintra", "ok")),
        picks(("lisbon", "a"), ("sintra", "b"), ("split", "c"), ("porto", "d")),
        picks(("lisbon", "Home to 9,999,999 people."), ("sintra", "ok"), ("split", "ok")),
        says({"picks": "lisbon"}),
    ],
)
def test_an_invalid_shortlist_is_retried_and_the_next_valid_one_is_used(bad: Any) -> None:
    wizard, ollama = assistant(bad, GOOD_PICKS)
    assert len(rank(wizard, limit=3)["picks"]) == 3
    assert len(ollama.posts) == 2


def test_numbers_from_the_candidates_facts_are_welcome() -> None:
    wizard, _ = assistant(
        picks(
            ("lisbon", "About 1900 km away, with a population of 545000 and 4 UNESCO sites."),
            ("sintra", "1950 km away and 9 castles."),
            ("split", "2900 km, beaches."),
        )
    )
    assert len(rank(wizard, limit=3)["picks"]) == 3


def test_three_invalid_shortlists_are_a_503() -> None:
    wizard, ollama = assistant(picks(("atlantis", "x"), ("lisbon", "ok"), ("sintra", "ok")))
    with pytest.raises(PlanUnavailable, match="atlantis"):
        rank(wizard, limit=3)
    assert len(ollama.posts) == 3


def test_the_limit_cuts_the_shortlist_range() -> None:
    wizard, ollama = assistant(picks(("lisbon", "a"), ("sintra", "b"), ("split", "c")))
    rank(wizard, limit=4)
    schema = ollama.posts[0]["format"]["properties"]["picks"]
    assert (schema["minItems"], schema["maxItems"]) == (3, 4)


class PlanRig:
    """The service over HTTP with a scripted Ollama behind the assistant."""

    def __init__(self, tmp_path: Path, wizard: PlanAssistant | None) -> None:
        builder, db, _, _ = make_builder(tmp_path)
        service = CityService(FakeGeocoder(), db, builder, JobBoard(), None, wizard)
        self.server = make_server("127.0.0.1", 0, service)
        self.api = Api(self.server.server_address[1])
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


def test_the_question_endpoint_over_http_with_cors(tmp_path: Path) -> None:
    rig = PlanRig(tmp_path, assistant(says(GOOD_QUESTION))[0])
    try:
        body = {"language": "en", "answers": ANSWERS}
        status, answer, headers = rig.api.call("POST", "/plan/question", body)
        assert status == 200 and answer["question"]["id"] == "ai-2"
        assert headers["Access-Control-Allow-Origin"] == "*"
        assert rig.api.call("OPTIONS", "/plan/rank")[0] == 204
    finally:
        rig.server.shutdown()


def test_the_rank_endpoint_over_http(tmp_path: Path) -> None:
    rig = PlanRig(tmp_path, assistant(GOOD_PICKS)[0])
    try:
        body = {"language": "en", "limit": 3, "answers": ANSWERS, "candidates": CANDIDATES}
        status, answer, _ = rig.api.call("POST", "/plan/rank", body)
        assert status == 200 and [p["slug"] for p in answer["picks"]] == [
            "lisbon",
            "sintra",
            "split",
        ]
    finally:
        rig.server.shutdown()


def test_an_unavailable_assistant_is_503_json(tmp_path: Path) -> None:
    off = PlanAssistant(FakeOllama([]), "m", "http://x", enabled=False)
    rig = PlanRig(tmp_path, off)
    try:
        body = {"language": "en", "answers": ANSWERS}
        status, answer, _ = rig.api.call("POST", "/plan/question", body)
        assert status == 503 and answer["status"] == "failed" and "--planner" in answer["message"]
    finally:
        rig.server.shutdown()


def test_no_assistant_configured_is_503(tmp_path: Path) -> None:
    rig = PlanRig(tmp_path, None)
    try:
        status, answer, _ = rig.api.call(
            "POST", "/plan/question", {"language": "en", "answers": []}
        )
        assert status == 503 and "assistant" in answer["message"]
    finally:
        rig.server.shutdown()


@pytest.mark.parametrize(
    ("path", "body", "needle"),
    [
        ("/plan/question", {"language": "fr", "answers": []}, "'fr'"),
        ("/plan/question", {"language": "en"}, "answers"),
        ("/plan/question", {"language": "en", "answers": [{"id": "a"}]}, "question"),
        (
            "/plan/question",
            {"language": "en", "answers": [{"id": "a", "question": "q", "answer": 5}]},
            "5",
        ),
        ("/plan/rank", {"language": "en", "answers": [], "candidates": []}, "candidates"),
        (
            "/plan/rank",
            {"language": "en", "limit": 0, "answers": [], "candidates": CANDIDATES},
            "limit",
        ),
        (
            "/plan/rank",
            {"language": "en", "limit": 11, "answers": [], "candidates": CANDIDATES},
            "11",
        ),
        ("/plan/rank", {"language": "en", "answers": [], "candidates": CANDIDATES * 8}, "32"),
        ("/plan/rank", {"language": "en", "answers": [], "candidates": [{"slug": "x"}]}, "name"),
        (
            "/plan/rank",
            {"language": "en", "answers": [], "candidates": CANDIDATES[:1] * 2},
            "lisbon",
        ),
    ],
)
def test_bad_plan_requests_are_400_naming_the_value(
    tmp_path: Path, path: str, body: dict, needle: str
) -> None:
    ollama = FakeOllama([GOOD_PICKS])
    rig = PlanRig(tmp_path, PlanAssistant(ollama, "qwen2.5:7b", "http://x"))
    try:
        status, answer, _ = rig.api.call("POST", path, body)
        assert status == 400 and needle in answer["message"]
        assert ollama.posts == []
    finally:
        rig.server.shutdown()


def test_bad_request_is_the_services_own_error_type() -> None:
    assert issubclass(BadRequest, ValueError)


def test_the_language_is_repeated_at_the_end_of_the_user_message_for_the_question() -> None:
    """A small model (Gemma 4B) loses a language set only in the system prompt, because the
    answers it reads are in English: the user message ends with it too (D-084)."""
    wizard, ollama = assistant(says(GOOD_QUESTION))
    ask(wizard, language="pt")
    last = ollama.posts[0]["messages"][-1]
    assert last["role"] == "user"
    assert last["content"].rstrip().endswith("never Brazilian Portuguese.")


def test_the_language_is_repeated_at_the_end_of_the_user_message_for_the_ranking() -> None:
    wizard, ollama = assistant(GOOD_PICKS)
    rank(wizard, language="pt")
    last = ollama.posts[0]["messages"][-1]
    assert last["role"] == "user"
    assert last["content"].rstrip().endswith("never Brazilian Portuguese.")


def test_english_is_asked_for_in_english_in_the_user_message_too() -> None:
    wizard, ollama = assistant(says(GOOD_QUESTION))
    ask(wizard, language="en")
    assert ollama.posts[0]["messages"][-1]["content"].rstrip().endswith("Reply in English.")
