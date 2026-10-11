"""Named fakes for the optional-integration tests: no network, no SDK, no database."""

from __future__ import annotations

from typing import Any


class FakeOllamaTransport:
    """An Ollama that answers a fixed reply (or fails) and remembers what it was asked."""

    def __init__(self, reply: dict[str, Any] | None = None, error: Exception | None = None):
        self.reply, self.error = reply or {}, error
        self.posts: list[tuple[str, dict[str, Any]]] = []

    def get_json(self, url: str) -> dict[str, Any]:
        return {"models": []}

    def post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.posts.append((url, payload))
        if self.error:
            raise self.error
        return self.reply


class RecordingSpans:
    """A span sink that keeps what it was told, for asserting on."""

    def __init__(self) -> None:
        self.started: list[str] = []
        self.finished: list[dict[str, Any]] = []

    def start(self, model: str) -> RecordingSpans:
        self.started.append(model)
        return self

    def finish(self, fields: dict[str, Any]) -> None:
        self.finished.append(fields)


class FakeSentrySpan:
    def __init__(self, name: str) -> None:
        self.name, self.data, self.exited = name, {}, False

    def set_data(self, key: str, value: Any) -> None:
        self.data[key] = value

    def __enter__(self) -> FakeSentrySpan:
        return self

    def __exit__(self, *exc: object) -> None:
        self.exited = True


class FakeSentrySdk:
    """The two calls of ``sentry_sdk`` the tracer uses."""

    def __init__(self) -> None:
        self.spans: list[FakeSentrySpan] = []
        self.transactions: list[FakeSentrySpan] = []
        self.inits: list[dict[str, Any]] = []

    def init(self, **options: Any) -> None:
        self.inits.append(options)

    def start_transaction(self, op: str, name: str) -> FakeSentrySpan:
        transaction = FakeSentrySpan(f"{op}:{name}")
        self.transactions.append(transaction)
        return transaction

    def start_span(self, op: str, name: str) -> FakeSentrySpan:
        span = FakeSentrySpan(f"{op}:{name}")
        self.spans.append(span)
        return span
