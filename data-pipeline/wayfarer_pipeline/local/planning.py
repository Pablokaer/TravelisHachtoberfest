"""Which route planner the service uses: a local Ollama model when there is one, else rules."""

from __future__ import annotations

from ..routes.model import PlannerError, RoutePlanner
from ..routes.ollama import OllamaRoutePlanner, OllamaTransport
from ..routes.rules import RuleBasedRoutePlanner


def installed_models(planner: OllamaRoutePlanner) -> list[str]:
    """The model tags the Ollama server lists; ``PlannerError`` when it does not answer."""
    reply = planner.transport.get_json(f"{planner.base_url}/api/tags")
    return [str(m.get("name", "")) for m in reply.get("models", [])]


def _has_model(model: str, installed: list[str]) -> bool:
    return model in installed or (":" not in model and f"{model}:latest" in installed)


def choose_planner(choice: str, model: str, url: str, transport: OllamaTransport) -> RoutePlanner:
    """``rules``: no model. ``ollama``: the model or a ``PlannerError``. ``auto``: the model when
    the server answers and has it, else the rules (a build never waits on a missing model).

    >>> choose_planner("auto", "qwen2.5:7b", "http://localhost:11434", transport).name
    """
    if choice == "rules":
        return RuleBasedRoutePlanner()
    planner = OllamaRoutePlanner(model, url, transport)
    try:
        installed = installed_models(planner)
    except PlannerError:
        if choice == "ollama":
            raise
        return RuleBasedRoutePlanner()
    if _has_model(model, installed):
        return planner
    if choice == "ollama":
        raise PlannerError(f"model {model!r} is not installed; installed: {', '.join(installed)}")
    return RuleBasedRoutePlanner()
