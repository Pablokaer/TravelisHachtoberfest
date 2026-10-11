"""Named fakes for the partner web integrations: canned JSON or bytes, no network."""

from __future__ import annotations

from typing import Any


class FakeWebTransport:
    """The HTTP layer of the web integrations: canned JSON or bytes, and a log of the calls."""

    def __init__(self, json_reply: dict[str, Any] | None = None, audio: bytes = b"ID3"):
        self.json_reply, self.audio = json_reply or {}, audio
        self.gets: list[tuple[str, dict[str, str]]] = []
        self.posts: list[tuple[str, dict[str, Any], dict[str, str]]] = []

    def get_json(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        self.gets.append((url, params))
        return self.json_reply

    def post_bytes(self, url: str, body: dict[str, Any], headers: dict[str, str]) -> bytes:
        self.posts.append((url, body, headers))
        return self.audio
