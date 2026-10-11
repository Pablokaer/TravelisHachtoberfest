"""A span for every language-model call: model, latency, tokens, errors (D-084).

``TracedTransport`` wraps the project's Ollama transport, so the route planner and the trip
wizard are traced without knowing it. Spans always go to stderr as JSON lines (compare Gemma and
Qwen by their ``latency_ms`` and ``tokens_per_second``); with ``SENTRY_DSN`` set they also go to
Sentry as ``gen_ai.chat`` spans (Sentry Agent Tracing). The model never sees any of it.
"""

from __future__ import annotations

import json
import sys
import time
from collections.abc import Callable, Mapping
from typing import Any, Protocol, TextIO

NANOSECONDS = 1_000_000_000


class ActiveSpan(Protocol):
    def finish(self, fields: dict[str, Any]) -> None: ...


class SpanSink(Protocol):
    def start(self, model: str) -> ActiveSpan: ...


def usage_of(reply: Mapping[str, Any]) -> dict[str, Any]:
    """Token counts and speed from an Ollama ``/api/chat`` reply; ``{}`` when it has none.

    >>> usage_of({"prompt_eval_count": 120, "eval_count": 40, "eval_duration": 2_000_000_000})
    {'input_tokens': 120, 'output_tokens': 40, 'tokens_per_second': 20.0}
    """
    if "eval_count" not in reply:
        return {}
    usage: dict[str, Any] = {
        "input_tokens": int(reply.get("prompt_eval_count", 0)),
        "output_tokens": int(reply["eval_count"]),
    }
    seconds = int(reply.get("eval_duration", 0)) / NANOSECONDS
    if seconds > 0:
        usage["tokens_per_second"] = round(usage["output_tokens"] / seconds, 1)
    return usage


class JsonLineSpans:
    """Structured JSON logging, one line per model call."""

    def __init__(self, out: TextIO | None = None, clock: Callable[[], float] = time.perf_counter):
        self.out, self.clock = out or sys.stderr, clock

    def start(self, model: str) -> ActiveSpan:
        return _JsonLineSpan(self.out, self.clock, model, self.clock())


class _JsonLineSpan:
    def __init__(self, out: TextIO, clock: Callable[[], float], model: str, began: float):
        self.out, self.clock, self.model, self.began = out, clock, model, began

    def finish(self, fields: dict[str, Any]) -> None:
        latency_ms = round((self.clock() - self.began) * 1000)
        line = {"event": "llm_call", "model": self.model, "latency_ms": latency_ms, **fields}
        print(json.dumps(line), file=self.out, flush=True)


class SentrySpans:
    """``gen_ai.chat`` spans through an injected ``sentry_sdk`` (a fake in the tests)."""

    def __init__(self, sdk: Any) -> None:
        self.sdk = sdk

    def start(self, model: str) -> ActiveSpan:
        # sentry-sdk 2.x only sends a span that belongs to a transaction, so each model call is
        # one (a lone start_span was silently dropped: found with the real SDK).
        transaction = self.sdk.start_transaction(op="gen_ai.invoke_agent", name=f"chat {model}")
        transaction.__enter__()
        span = self.sdk.start_span(op="gen_ai.chat", name=f"chat {model}")
        span.__enter__()
        span.set_data("gen_ai.request.model", model)
        return _SentrySpan(span, transaction)


class _SentrySpan:
    def __init__(self, span: Any, transaction: Any) -> None:
        self.span, self.transaction = span, transaction

    def finish(self, fields: dict[str, Any]) -> None:
        for key in ("input_tokens", "output_tokens"):
            if key in fields:
                self.span.set_data(f"gen_ai.usage.{key}", fields[key])
        if fields.get("error"):
            self.span.set_data("error.message", fields["error"])
        self.span.__exit__(None, None, None)
        self.transaction.__exit__(None, None, None)


class BothSpans:
    """Fans one call out to several sinks (the log line and Sentry)."""

    def __init__(self, *sinks: SpanSink) -> None:
        self.sinks = sinks

    def start(self, model: str) -> ActiveSpan:
        return _BothSpan([sink.start(model) for sink in self.sinks])


class _BothSpan:
    def __init__(self, spans: list[ActiveSpan]) -> None:
        self.spans = spans

    def finish(self, fields: dict[str, Any]) -> None:
        for span in self.spans:
            span.finish(fields)


def sentry_spans_or_none(env: Mapping[str, str], sdk: Any | None = None) -> SentrySpans | None:
    """Sentry spans when ``SENTRY_DSN`` is set and the SDK is installed; else ``None``."""
    dsn = env.get("SENTRY_DSN", "").strip()
    if not dsn:
        return None
    if sdk is None:
        try:
            import sentry_sdk as sdk  # noqa: PLC0415 - optional dependency
        except ImportError:
            print('{"event": "sentry_missing", "fix": "pip install sentry-sdk"}', file=sys.stderr)
            return None
    sdk.init(dsn=dsn, traces_sample_rate=1.0, send_default_pii=False)
    return SentrySpans(sdk)


class TracedTransport:
    """Drop-in for ``OllamaTransport``: ``post_json`` (the model call) is traced, ``get_json``
    (the model list) is not.

    >>> TracedTransport(RequestsOllamaTransport(), JsonLineSpans()).post_json(url, payload)
    """

    def __init__(self, inner: Any, spans: SpanSink) -> None:
        self.inner, self.spans = inner, spans

    def get_json(self, url: str) -> dict[str, Any]:
        return self.inner.get_json(url)

    def post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        span = self.spans.start(str(payload.get("model", "unknown")))
        try:
            reply = self.inner.post_json(url, payload)
        except Exception as exc:
            span.finish({"error": f"{type(exc).__name__}: {exc}"})
            raise
        span.finish({**usage_of(reply), "error": None})
        return reply


def default_spans(env: Mapping[str, str]) -> SpanSink:
    """The JSON log, plus Sentry when configured."""
    sentry = sentry_spans_or_none(env)
    return BothSpans(JsonLineSpans(), sentry) if sentry else JsonLineSpans()
