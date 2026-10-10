import json

import pytest
from routes_fakes import FakeOllamaTransport

from wayfarer_pipeline import cli
from wayfarer_pipeline.routes.ollama import OllamaRoutePlanner
from wayfarer_pipeline.routes.rules import RuleBasedRoutePlanner


def test_suggest_routes_defaults_to_the_rule_planner():
    args = cli.build_parser().parse_args(["suggest-routes", "--city", "lisbon"])
    planner = cli.make_route_planner(args)
    assert isinstance(planner, RuleBasedRoutePlanner)


def test_suggest_routes_needs_a_city_selection():
    with pytest.raises(SystemExit):
        cli.build_parser().parse_args(["suggest-routes"])


def test_ollama_planner_takes_model_and_url_from_the_options():
    argv = ["suggest-routes", "--all", "--planner", "ollama", "--model", "gemma3:4b"]
    args = cli.build_parser().parse_args([*argv, "--ollama-url", "http://pc:11434"])
    planner = cli.make_route_planner(args)
    assert isinstance(planner, OllamaRoutePlanner)
    assert (planner.name, planner.base_url) == ("gemma3:4b", "http://pc:11434")


def test_unreachable_ollama_stops_the_command_with_a_clear_message(capsys, monkeypatch):
    transport = FakeOllamaTransport([], reachable=False)
    monkeypatch.setattr(cli, "make_ollama_transport", lambda: transport)
    code = cli.main(["suggest-routes", "--city", "lisbon", "--planner", "ollama"])
    err = capsys.readouterr().err
    assert code == 1 and "ERROR" in err and "/api/tags" in err
    assert json.dumps(transport.posts) == "[]"
