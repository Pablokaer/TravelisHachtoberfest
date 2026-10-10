import socket
import threading
import time
from typing import Any

import pytest

from wayfarer_pipeline import http
from wayfarer_pipeline.http import POLICIES, HostPolicy, HttpClient, HttpError


def _trickle_server() -> tuple[str, threading.Event]:
    """HTTP server that sends headers, then one body byte every 0.2 s forever: each socket read
    succeeds, so a per-read timeout never fires."""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen()
    stop = threading.Event()

    def serve() -> None:
        while not stop.is_set():
            srv.settimeout(0.5)
            try:
                conn, _ = srv.accept()
            except TimeoutError:
                continue
            conn.recv(4096)
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n")
            try:
                while not stop.is_set():
                    conn.sendall(b"x")
                    time.sleep(0.2)
            except OSError:
                pass
            conn.close()

    threading.Thread(target=serve, daemon=True).start()
    return f"http://127.0.0.1:{srv.getsockname()[1]}/slow", stop


def test_deadline_bounds_a_trickling_response(tmp_path):
    url, stop = _trickle_server()
    local = HostPolicy(min_interval=0.0, timeout=1.0, deadline=1.5)
    client = HttpClient(cache_dir=tmp_path, max_retries=0, policies={"127.0.0.1": local})
    started = time.monotonic()
    with pytest.raises(HttpError):
        client.request("GET", url, namespace="test")
    stop.set()
    assert time.monotonic() - started < 5


def test_user_agent_names_the_project_repository_by_default(monkeypatch):
    monkeypatch.delenv("PIPELINE_CONTACT_EMAIL", raising=False)
    agent = http.user_agent()
    assert agent.startswith("wayfarer-pipeline/")
    assert agent.endswith("(https://github.com/Pablokaer/travelist)")


def test_user_agent_uses_the_configured_contact(monkeypatch):
    monkeypatch.setenv("PIPELINE_CONTACT_EMAIL", "data@example.org")
    assert http.user_agent().endswith("(data@example.org)")


class HangingSession:
    """Stands in for requests.Session: never answers (a hung WDQS connection), and records the
    per-read timeout each request was given."""

    def __init__(self) -> None:
        self.headers: dict[str, str] = {}
        self.timeouts: list[float] = []
        self.release = threading.Event()

    def request(self, method: str, url: str, *, timeout: float, **kwargs: Any) -> None:
        self.timeouts.append(timeout)
        self.release.wait(10)


def test_wikidata_gives_up_soon_after_its_60s_server_side_query_limit():
    wikidata = POLICIES["query.wikidata.org"]
    assert 60 < wikidata.timeout <= wikidata.deadline <= 90


def test_overpass_waits_for_its_300s_query_timeout():
    overpass = POLICIES["overpass-api.de"]
    assert overpass.timeout >= 300 and overpass.deadline > overpass.timeout


def test_a_hung_request_is_abandoned_at_its_host_deadline(tmp_path):
    session = HangingSession()
    wikidata = HostPolicy(min_interval=0.0, timeout=0.2, deadline=0.3)
    client = HttpClient(
        cache_dir=tmp_path,
        max_retries=0,
        policies={"query.wikidata.org": wikidata},
        session_factory=lambda: session,
    )
    started = time.monotonic()
    with pytest.raises(HttpError, match="within 0s"):
        client.request("POST", "https://query.wikidata.org/sparql", namespace="test")
    session.release.set()
    assert time.monotonic() - started < 2
    assert session.timeouts == [0.2]


def test_hosts_without_a_policy_get_the_default_timeouts(tmp_path):
    session = HangingSession()
    session.release.set()
    client = HttpClient(
        cache_dir=tmp_path, max_retries=0, policies={}, session_factory=lambda: session
    )
    with pytest.raises(HttpError):
        client.request("GET", "https://example.org/x", namespace="test")
    assert session.timeouts == [http.DEFAULT_POLICY.timeout]


def test_wikidata_runs_two_queries_at_once_still_one_start_per_second():
    wikidata = POLICIES["query.wikidata.org"]
    assert (wikidata.concurrency, wikidata.min_interval) == (2, 1.0)
