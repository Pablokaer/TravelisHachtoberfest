"""The trip wizard's two language-model calls (D-081): a follow-up question and a shortlist.

The model only *writes*: one short question with options, or a one-line reason per pick. Its
answer is constrained by a JSON schema and then checked by code (lengths, unique values, known
slugs, no numbers that are not in the candidate's facts); an invalid answer is asked for again
twice, then the endpoint answers 503. Scoring and hard filters stay in the app.
"""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from typing import Any

from ..attractions.pipeline import normalize_name
from ..routes.model import PlannerError
from ..routes.ollama import OllamaTransport
from ..routes.validation import slugify
from .errors import PlanUnavailable
from .plan_requests import Answer

QUESTION_MAX_CHARS = 110
LABEL_MAX_CHARS = 40
OPTIONS_MIN, OPTIONS_MAX = 3, 6
REASON_MAX_CHARS = 220
MIN_PICKS = 3
RETRIES = 2
SAME_QUESTION_RATIO = 0.85
# A number this big in a reason must come from the candidate's data (population, a distance, a
# founding year, rainfall…); smaller ones (a temperature, a count of sites) are not checked.
CHECKED_NUMBER_FROM = 100
QUESTION_TEMPERATURE = 0.7
RANK_TEMPERATURE = 0.2

LANGUAGE_NAMES = {
    "en": "English",
    "pt": "European Portuguese (Portugal), in a formal register, never Brazilian Portuguese",
}
FACTS_LEGEND = (
    "Facts: temp_mean_c and temp_max_c are the mean and maximum daily temperature in °C in the "
    "travel month; precip_mm and snowfall_cm the rain and snow of that month; sunshine_hours "
    "the sunshine per day; inception_year the founding year (negative: before the common era); "
    "beaches, unesco, castles, museums and churches are counts of such places."
)
KINDS = ["single", "multi", "text"]
_NUMBER = re.compile(r"\d[\d.,]*\d|\d")


class InvalidAnswer(ValueError):
    """The model's answer broke a rule; the message says which and is fed back on the retry."""


def _norm(text: str) -> str:
    return normalize_name(text)


def question_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "text": {"type": "string"},
            "kind": {"type": "string", "enum": KINDS},
            "options": {"type": "array", "items": {"type": "string"}},
            "allow_other": {"type": "boolean"},
        },
        "required": ["text", "kind", "options"],
    }


def rank_schema(slugs: list[str], low: int, high: int) -> dict[str, Any]:
    pick = {
        "type": "object",
        "properties": {"slug": {"type": "string", "enum": slugs}, "reason": {"type": "string"}},
        "required": ["slug", "reason"],
    }
    picks = {"type": "array", "items": pick, "minItems": low, "maxItems": high}
    return {"type": "object", "properties": {"picks": picks}, "required": ["picks"]}


def _same_question(a: str, b: str) -> bool:
    x, y = _norm(a), _norm(b)
    return x == y or SequenceMatcher(None, x, y).ratio() >= SAME_QUESTION_RATIO


def _options(labels: Any) -> list[dict[str, str]]:
    if not isinstance(labels, list) or not all(isinstance(x, str) for x in labels):
        raise InvalidAnswer(f"options {labels!r} is not a list of text")
    if not OPTIONS_MIN <= len(labels) <= OPTIONS_MAX:
        raise InvalidAnswer(f"{len(labels)} options; expected {OPTIONS_MIN} to {OPTIONS_MAX}")
    clean = [x.strip() for x in labels]
    for label in clean:
        if not 1 <= len(label) <= LABEL_MAX_CHARS:
            raise InvalidAnswer(f"option {label!r} is not 1 to {LABEL_MAX_CHARS} characters")
    if len({x.casefold() for x in clean}) != len(clean):
        raise InvalidAnswer(f"options {clean} repeat a label; expected each once")
    return _with_values(clean)


def _with_values(labels: list[str]) -> list[dict[str, str]]:
    taken: set[str] = set()
    options = []
    for label in labels:
        base = slugify(label)
        if base == "route" and "route" not in label.lower():
            raise InvalidAnswer(f"option {label!r} has no letters or digits for a value")
        value, n = base, 2
        while value in taken:
            value, n = f"{base}-{n}", n + 1
        taken.add(value)
        options.append({"value": value, "label": label})
    return options


def check_question(answer: Any, answers: list[Answer]) -> dict[str, Any]:
    """The question in the endpoint's shape, or ``InvalidAnswer``."""
    if not isinstance(answer, dict):
        raise InvalidAnswer(f"answer {str(answer)[:60]!r} is not an object")
    text, kind = str(answer.get("text") or "").strip(), answer.get("kind")
    if not 1 <= len(text) <= QUESTION_MAX_CHARS:
        raise InvalidAnswer(
            f"question of {len(text)} characters; expected 1 to {QUESTION_MAX_CHARS}"
        )
    if kind not in KINDS:
        raise InvalidAnswer(f"kind {kind!r} is unknown; expected one of {KINDS}")
    for earlier in answers:
        if _same_question(text, earlier["question"]):
            raise InvalidAnswer(f"question {text!r} repeats the earlier {earlier['question']!r}")
    options = [] if kind == "text" else _options(answer.get("options"))
    other = False if kind == "text" else bool(answer.get("allow_other", True))
    return {"id": f"ai-{len(answers)}", "text": text, "kind": kind, "options": options,
            "allow_other": other}  # fmt: skip


def _numbers_in(text: str) -> list[float]:
    found = []
    for token in _NUMBER.findall(text):
        digits = token.replace(",", "").rstrip(".")
        try:
            found.append(float(digits))
        except ValueError:
            continue
    return found


def _known_values(candidate: dict[str, Any]) -> list[float]:
    values = [candidate.get("distance_km"), *candidate.get("facts", {}).values()]
    return [float(v) for v in values if isinstance(v, int | float) and not isinstance(v, bool)]


def _in_facts(number: float, known: list[float]) -> bool:
    """The number is a fact (or a fact rounded, or in thousands/millions): within 1%."""
    for value in known:
        for scale in (1.0, 1000.0, 1_000_000.0):
            target = value / scale
            if target and abs(number - target) <= max(0.51, abs(target) * 0.01):
                return True
    return False


def check_reason(reason: Any, candidate: dict[str, Any]) -> str:
    text = reason.strip() if isinstance(reason, str) else ""
    if not 1 <= len(text) <= REASON_MAX_CHARS:
        raise InvalidAnswer(f"reason of {len(text)} characters; expected 1 to {REASON_MAX_CHARS}")
    known = _known_values(candidate)
    for number in _numbers_in(text):
        if number >= CHECKED_NUMBER_FROM and not _in_facts(number, known):
            raise InvalidAnswer(
                f"reason for {candidate['slug']} says {number:g}, which is not in its facts"
            )
    return text


def pick_range(limit: int, available: int) -> tuple[int, int]:
    """The allowed number of picks: ``MIN_PICKS``..``limit``, cut down to the candidates."""
    high = min(limit, available)
    return min(MIN_PICKS, high), high


def check_picks(answer: Any, candidates: list[dict[str, Any]], limit: int) -> list[dict[str, str]]:
    """The shortlist in the endpoint's shape, or ``InvalidAnswer``."""
    picks = answer.get("picks") if isinstance(answer, dict) else None
    if not isinstance(picks, list):
        raise InvalidAnswer(f"picks {str(picks)[:60]!r} is not a list")
    low, high = pick_range(limit, len(candidates))
    if not low <= len(picks) <= high:
        raise InvalidAnswer(f"{len(picks)} picks; expected {low} to {high}")
    by_slug = {c["slug"]: c for c in candidates}
    seen: set[str] = set()
    checked = []
    for pick in picks:
        slug = pick.get("slug") if isinstance(pick, dict) else None
        if slug not in by_slug:
            raise InvalidAnswer(
                f"slug {slug!r} is not a candidate; expected one of {list(by_slug)}"
            )
        if slug in seen:
            raise InvalidAnswer(f"slug {slug!r} is picked twice; expected each once")
        seen.add(slug)
        checked.append({"slug": slug, "reason": check_reason(pick.get("reason"), by_slug[slug])})
    return checked


def _history(answers: list[Answer]) -> str:
    return "\n".join(f"- Q: {a['question']}\n  A: {a['answer']}" for a in answers) or "(none yet)"


def _question_messages(language: str, answers: list[Answer]) -> list[dict[str, str]]:
    system = (
        "You help a traveller choose their next trip by asking ONE short follow-up question at "
        "a time. Read their answers and dig into what they reveal (for example castles plus "
        "warm weather: ask what kind of castle or old-town atmosphere they like). Go deeper than "
        "what they already said: ask about something they have not told you that would change "
        "which city fits, and never offer options that just restate an earlier answer. Never "
        f"repeat a question already asked. The question is at most {QUESTION_MAX_CHARS} "
        "characters. "
        "kind is 'single' (pick one), 'multi' (pick several) or 'text' (free answer, no "
        f"options). For single or multi give {OPTIONS_MIN} to {OPTIONS_MAX} options, each a "
        f"label of at most {LABEL_MAX_CHARS} characters. Write in {LANGUAGE_NAMES[language]}."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Answers so far:\n{_history(answers)}"},
    ]


def _candidate_line(candidate: dict[str, Any]) -> str:
    facts = {k: v for k, v in candidate.get("facts", {}).items() if v is not None}
    head = {k: candidate.get(k) for k in ("slug", "name", "country", "distance_km")}
    return json.dumps({**head, "facts": facts}, ensure_ascii=False, separators=(",", ":"))


def _rank_messages(
    language: str, limit: int, answers: list[Answer], candidates: list[dict[str, Any]]
) -> list[dict[str, str]]:
    low, high = pick_range(limit, len(candidates))
    system = (
        f"You pick destinations for a traveller. From the list choose {high} cities that best "
        "fit ALL their answers, including the free-text ones, best first; choose fewer (never "
        f"fewer than {low}) only when the others clearly do not fit. For each give a reason of "
        f"one or two sentences, at most {REASON_MAX_CHARS} characters, that cites a concrete fact "
        "of that city from its data (temperature, sunshine, beaches, castles) and uses ONLY "
        "facts shown for that city: never invent numbers or facts. Do not drop a city because "
        "of distance or climate: the traveller's limits were already applied. Keep the "
        "shortlist varied: not all cities of one country unless the answers demand it. "
        f"{FACTS_LEGEND} "
        'Write the reason in natural language (say "highs of 29 °C", never a field name like '
        "temp_max_c) and add nothing that is not in the data (do not call a castle hilltop or "
        f"a beach quiet). Write in {LANGUAGE_NAMES[language]}."
    )
    cities = "\n".join(_candidate_line(c) for c in candidates)
    user = f"Answers:\n{_history(answers)}\n\nCities (one JSON object per line):\n{cities}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


class PlanAssistant:
    """Asks a local Ollama model for the wizard's question and shortlist.

    >>> PlanAssistant(transport, "qwen2.5:7b", "http://localhost:11434").question("en", answers)
    """

    def __init__(
        self, transport: OllamaTransport, model: str, base_url: str, enabled: bool = True
    ) -> None:
        self.transport = transport
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.enabled = enabled

    def question(self, language: str, answers: list[Answer]) -> dict[str, Any]:
        """``{"question": {...}, "source": "ollama"}``; ``PlanUnavailable`` after 3 bad tries."""
        messages = _question_messages(language, answers)
        question = self._ask(
            messages, question_schema(), QUESTION_TEMPERATURE, lambda a: check_question(a, answers)
        )
        return {"question": question, "source": "ollama"}

    def rank(
        self, language: str, limit: int, answers: list[Answer], candidates: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """``{"picks": [{slug, reason}], "source": "ollama"}``, 3..limit candidates."""
        low, high = pick_range(limit, len(candidates))
        schema = rank_schema([c["slug"] for c in candidates], low, high)
        messages = _rank_messages(language, limit, answers, candidates)
        picks = self._ask(
            messages, schema, RANK_TEMPERATURE, lambda a: check_picks(a, candidates, limit)
        )
        return {"picks": picks, "source": "ollama"}

    def _require_model(self) -> None:
        if not self.enabled:
            raise PlanUnavailable(
                "the AI assistant is off (--planner rules); expected auto or ollama"
            )
        try:
            reply = self.transport.get_json(f"{self.base_url}/api/tags")
        except PlannerError as exc:
            raise PlanUnavailable(f"Ollama does not answer: {exc}") from exc
        installed = [str(m.get("name", "")) for m in reply.get("models", [])]
        if self.model not in installed:
            raise PlanUnavailable(
                f"model {self.model!r} is not installed; "
                f"installed: {', '.join(installed) or 'none'}"
            )

    def _ask(
        self, messages: list[dict[str, str]], schema: dict[str, Any], temperature: float, check
    ):
        """One constrained call, checked by ``check``; the problem is fed back on each retry."""
        self._require_model()
        problem = ""
        for _ in range(RETRIES + 1):
            sent = messages if not problem else [*messages, _retry_note(problem)]
            try:
                return check(self._chat(sent, schema, temperature))
            except (InvalidAnswer, PlannerError, json.JSONDecodeError) as exc:
                problem = str(exc)
        raise PlanUnavailable(f"no valid answer in {RETRIES + 1} tries; last problem: {problem}")

    def _chat(
        self, messages: list[dict[str, str]], schema: dict[str, Any], temperature: float
    ) -> Any:
        payload = {
            "model": self.model,
            "stream": False,
            "format": schema,
            "options": {"temperature": temperature},
            "messages": messages,
        }
        reply = self.transport.post_json(f"{self.base_url}/api/chat", payload)
        return json.loads(str(reply.get("message", {}).get("content", "")))


def _retry_note(problem: str) -> dict[str, str]:
    return {"role": "user", "content": f"Your previous answer was invalid: {problem}. Try again."}
