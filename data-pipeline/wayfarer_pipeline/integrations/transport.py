"""The HTTP layer of the partner integrations, owned by the project so tests can fake it."""

from __future__ import annotations

from typing import Any, Protocol

import requests

from .errors import IntegrationError

TIMEOUT_SECONDS = 60.0


class WebTransport(Protocol):
    def get_json(self, url: str, params: dict[str, str]) -> dict[str, Any]: ...

    def post_bytes(self, url: str, body: dict[str, Any], headers: dict[str, str]) -> bytes: ...


class RequestsWebTransport:
    """``requests``; every failure becomes an ``IntegrationError`` without echoing the key."""

    def get_json(self, url: str, params: dict[str, str]) -> dict[str, Any]:
        try:
            response = requests.get(url, params=params, timeout=TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            raise IntegrationError(f"GET {url} failed: {_safe(exc)}") from exc

    def post_bytes(self, url: str, body: dict[str, Any], headers: dict[str, str]) -> bytes:
        try:
            response = requests.post(url, json=body, headers=headers, timeout=TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.content
        except requests.RequestException as exc:
            raise IntegrationError(f"POST {url} failed: {_safe(exc)}") from exc


def _safe(exc: Exception) -> str:
    """The exception type and status only: a URL in the message can carry an ``api_key``."""
    status = getattr(getattr(exc, "response", None), "status_code", None)
    return type(exc).__name__ + (f" (HTTP {status})" if status else "")
