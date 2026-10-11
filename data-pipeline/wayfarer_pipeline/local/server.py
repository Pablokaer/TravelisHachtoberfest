"""The HTTP face of the on-demand city service: JSON in, JSON out, open CORS (local use only)."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .errors import PlanUnavailable
from .service import BadRequest, CityService

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}
MAX_BODY_BYTES = 65536  # a shortlist request carries up to 30 cities with their facts


def _handler_class(service: CityService) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            url = urlsplit(self.path)
            if url.path == "/health":
                return self._send(200, {"ok": True})
            if url.path == "/places/search":
                return self._search(parse_qs(url.query))
            extras = {
                "/places/web": service.extras.web_tips,
                "/search/attractions": service.extras.attractions,
                "/plan/history": service.extras.history,
            }
            if url.path in extras:
                return self._answer(lambda: (200, extras[url.path](parse_qs(url.query))))
            prefix = "/jobs/"
            if url.path.startswith(prefix):
                job = service.job(url.path[len(prefix) :])
                if job is not None:
                    return self._send(200, job)
                return self._failed(404, f"unknown job {url.path[len(prefix) :]!r}")
            self._failed(404, f"unknown path {url.path!r}")

        def _search(self, params: dict[str, list[str]]) -> None:
            try:
                self._send(200, service.search(params))
            except BadRequest as exc:
                self._failed(400, str(exc))
            except Exception as exc:  # noqa: BLE001 - Nominatim down: reported as a bad gateway
                self._failed(502, f"{type(exc).__name__}: {exc}")

        def _answer(self, make: Callable[[], tuple[int, dict[str, Any]]]) -> None:
            """One JSON answer, with the status each kind of failure maps to."""
            try:
                status, body = make()
            except BadRequest as exc:
                return self._failed(400, str(exc))
            except PlanUnavailable as exc:
                return self._failed(503, str(exc))
            except Exception as exc:  # noqa: BLE001 - a partner service failed: bad gateway
                return self._failed(502, f"{type(exc).__name__}: {exc}")
            self._send(status, body)

        def _narrate(self) -> None:
            try:
                audio = service.extras.narrate(self._read_json())
            except BadRequest as exc:
                return self._failed(400, str(exc))
            except PlanUnavailable as exc:
                return self._failed(503, str(exc))
            except Exception as exc:  # noqa: BLE001 - ElevenLabs failed: bad gateway
                return self._failed(502, f"{type(exc).__name__}: {exc}")
            self._send_bytes(200, audio, "audio/mpeg")

        def do_POST(self) -> None:
            if self.path == "/narrate":
                return self._narrate()
            routes = {
                "/places/resolve": service.resolve,
                "/plan/question": lambda payload: (200, service.plan_question(payload)),
                "/plan/rank": lambda payload: (200, service.plan_rank(payload)),
            }
            handler = routes.get(self.path)
            if handler is None:
                return self._failed(404, f"unknown path {self.path!r}")
            try:
                status, body = handler(self._read_json())
            except BadRequest as exc:
                return self._failed(400, str(exc))
            except PlanUnavailable as exc:
                return self._failed(503, str(exc))
            except Exception as exc:  # noqa: BLE001 - reported to the app as a bad gateway
                return self._failed(502, f"{type(exc).__name__}: {exc}")
            self._send(status, body)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self._cors()
            self.end_headers()

        def _read_json(self) -> Any:
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY_BYTES:
                raise BadRequest(
                    f"body of {length} bytes is too long; expected at most {MAX_BODY_BYTES}"
                )
            raw = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                return json.loads(raw)
            except json.JSONDecodeError as exc:
                raise BadRequest(f"body {raw[:40]!r} is not valid JSON: {exc.msg}") from exc

        def _failed(self, status: int, message: str) -> None:
            self._send(status, {"status": "failed", "message": message})

        def _send(self, status: int, body: dict[str, Any]) -> None:
            self._send_bytes(status, json.dumps(body).encode("utf-8"), "application/json")

        def _send_bytes(self, status: int, payload: bytes, content_type: str) -> None:
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _cors(self) -> None:
            for name, value in CORS_HEADERS.items():
                self.send_header(name, value)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            line = {"event": "request", "client": self.client_address[0], "line": format % args}
            print(json.dumps(line), file=sys.stderr, flush=True)

    return Handler


def make_server(host: str, port: int, service: CityService) -> ThreadingHTTPServer:
    """A server bound to ``host:port`` (port 0 picks a free one); call ``serve_forever()``."""
    server = ThreadingHTTPServer((host, port), _handler_class(service))
    server.daemon_threads = True
    return server
