"""Every model call leaves a span: latency, tokens, errors (Sentry Agent Tracing, D-084)."""

from __future__ import annotations

import io
import json
from typing import Any

import pytest
from integration_fakes import FakeOllamaTransport, FakeSentrySdk, RecordingSpans

from wayfarer_pipeline.integrations.tracing import (
    JsonLineSpans,
    SentrySpans,
    TracedTransport,
    sentry_spans_or_none,
    usage_of,
)

REPLY = {
    "message": {"content": "{}"},
    "prompt_eval_count": 120,
    "eval_count": 40,
    "eval_duration": 2_000_000_000,
}
PAYLOAD = {"model": "gemma3:4b", "messages": []}


def test_usage_reads_tokens_and_speed_from_an_ollama_reply() -> None:
    assert usage_of(REPLY) == {
        "input_tokens": 120,
        "output_tokens": 40,
        "tokens_per_second": 20.0,
    }


def test_usage_of_a_reply_without_counts_is_empty_not_an_error() -> None:
    assert usage_of({"message": {"content": "x"}}) == {}


def test_a_traced_call_returns_the_reply_untouched_and_records_a_span() -> None:
    spans = RecordingSpans()
    inner = FakeOllamaTransport(REPLY)
    reply = TracedTransport(inner, spans).post_json("http://x/api/chat", PAYLOAD)
    assert reply == REPLY
    assert spans.started == ["gemma3:4b"]
    assert spans.finished[0]["output_tokens"] == 40
    assert spans.finished[0]["error"] is None


def test_a_failing_call_is_recorded_and_still_raises() -> None:
    spans = RecordingSpans()
    inner = FakeOllamaTransport(error=RuntimeError("model crashed"))
    with pytest.raises(RuntimeError, match="model crashed"):
        TracedTransport(inner, spans).post_json("http://x/api/chat", PAYLOAD)
    assert spans.finished[0]["error"] == "RuntimeError: model crashed"


def test_get_requests_are_not_traced() -> None:
    spans = RecordingSpans()
    TracedTransport(FakeOllamaTransport(), spans).get_json("http://x/api/tags")
    assert spans.started == []


def test_json_lines_carry_model_latency_and_tokens() -> None:
    out = io.StringIO()
    span = JsonLineSpans(out, clock=iter([10.0, 12.5]).__next__).start("qwen2.5:7b")
    span.finish({"input_tokens": 5, "output_tokens": 7, "error": None})
    line = json.loads(out.getvalue())
    assert line["event"] == "llm_call"
    assert line["model"] == "qwen2.5:7b"
    assert line["latency_ms"] == 2500
    assert line["output_tokens"] == 7


def test_sentry_spans_follow_the_gen_ai_conventions() -> None:
    sdk = FakeSentrySdk()
    span = SentrySpans(sdk).start("gemma3:4b")
    span.finish({"input_tokens": 120, "output_tokens": 40, "error": None})
    recorded = sdk.spans[0]
    assert recorded.name == "gen_ai.chat:chat gemma3:4b"
    # sentry-sdk 2.x sends a span only inside a transaction: a lone one was silently dropped
    assert [tx.name for tx in sdk.transactions] == ["gen_ai.invoke_agent:chat gemma3:4b"]
    assert sdk.transactions[0].exited
    assert recorded.data["gen_ai.request.model"] == "gemma3:4b"
    assert recorded.data["gen_ai.usage.input_tokens"] == 120
    assert recorded.data["gen_ai.usage.output_tokens"] == 40
    assert recorded.exited


def test_sentry_is_off_without_a_dsn_and_initialised_with_one() -> None:
    sdk = FakeSentrySdk()
    assert sentry_spans_or_none({}, sdk) is None
    assert sentry_spans_or_none({"SENTRY_DSN": "https://k@o.ingest.sentry.io/1"}, sdk) is not None
    assert sdk.inits[0]["dsn"] == "https://k@o.ingest.sentry.io/1"
    assert sdk.inits[0]["traces_sample_rate"] == 1.0


def test_the_real_sentry_sdk_turns_a_model_call_into_a_transaction_with_a_gen_ai_span() -> None:
    """Against the real SDK (events are captured, nothing is sent): the fake SDK above cannot
    tell a span that Sentry would drop from one it keeps."""
    sentry_sdk = pytest.importorskip("sentry_sdk")
    from sentry_sdk.transport import Transport

    class Capture(Transport):
        envelopes: list[Any] = []

        def capture_envelope(self, envelope: Any) -> None:
            Capture.envelopes.append(envelope)

    Capture.envelopes = []
    sentry_sdk.init(
        dsn="https://k@o1.ingest.sentry.io/2", traces_sample_rate=1.0, transport=Capture
    )
    span = SentrySpans(sentry_sdk).start("gemma3:4b")
    span.finish({"input_tokens": 12, "output_tokens": 5, "error": None})
    sentry_sdk.flush()
    payloads = [item.payload.json for env in Capture.envelopes for item in env.items]
    transactions = [p for p in payloads if p.get("type") == "transaction"]
    assert [t["contexts"]["trace"]["op"] for t in transactions] == ["gen_ai.invoke_agent"]
    # sentry-sdk 2.7x sends spans as their own items ({"version": 2, "items": [...]}), older ones
    # inside the transaction: read both
    spans = [i for p in payloads for i in p.get("items", [])]
    chat = [i for i in spans if i["attributes"]["sentry.op"]["value"] == "gen_ai.chat"]
    in_transaction = [
        x for t in transactions for x in t.get("spans", []) if x.get("op") == "gen_ai.chat"
    ]
    assert len(chat) + len(in_transaction) == 1
    if chat:
        assert chat[0]["attributes"]["gen_ai.usage.output_tokens"]["value"] == 5
        assert chat[0]["attributes"]["gen_ai.request.model"]["value"] == "gemma3:4b"
    else:
        assert in_transaction[0]["data"]["gen_ai.usage.output_tokens"] == 5
