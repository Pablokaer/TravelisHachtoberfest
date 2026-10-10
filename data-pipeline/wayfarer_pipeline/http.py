"""Polite HTTP client: descriptive User-Agent, per-host rate limits, retries and a disk cache.

Raw responses are cached under ``data-pipeline/.cache/<namespace>/`` keyed by a hash of the
request, so re-running the pipeline during development does not hit the public APIs again.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import requests

from . import __version__
from .paths import CACHE_DIR

# Wikimedia's User-Agent policy asks for an email address or a URL to reach the operator.
DEFAULT_CONTACT = "https://github.com/Pablokaer/travelist"


def user_agent() -> str:
    contact = os.environ.get("PIPELINE_CONTACT_EMAIL") or DEFAULT_CONTACT
    return f"wayfarer-pipeline/{__version__} ({contact})"


@dataclass(frozen=True)
class HostPolicy:
    """How politely, and how patiently, to talk to one host.

    ``min_interval``: minimum seconds between request starts; ``concurrency``: max requests in
    flight; ``timeout``: requests' per-socket-read timeout; ``deadline``: wall-clock bound on the
    whole request (see ``HttpClient._send``)."""

    min_interval: float
    concurrency: int = 1
    timeout: float = 60.0
    deadline: float = 120.0


# Wikidata SPARQL: WDQS allows 5 parallel queries per client, but the monthly refresh runs on
# shared GitHub runner IPs (other tenants count against the same limit), so we stay at 2 and keep
# one query start per second; 429s are absorbed by Retry-After/backoff. WDQS kills a query at 60 s
# server side, so a response still pending at ~75 s is a hung connection, not a slow query:
# giving up at 90 s instead of 360 s keeps a hang from eating the CI timeout (7 attempts each).
# Overpass: one request at a time, and its queries set [timeout:300], so it must wait longer.
# Wikimedia REST ≤ 10 req/s (the pageviews API answered 429 at 20 req/s), Commons ≤ 10 req/s.
POLICIES: dict[str, HostPolicy] = {
    "query.wikidata.org": HostPolicy(min_interval=1.0, concurrency=2, timeout=75.0, deadline=90.0),
    "overpass-api.de": HostPolicy(min_interval=5.0, concurrency=1, timeout=300.0, deadline=360.0),
    "wikimedia.org": HostPolicy(min_interval=0.1, concurrency=4),
    "commons.wikimedia.org": HostPolicy(min_interval=0.1, concurrency=2),
    # Article texts (D-070): thousands of small API reads; Wikimedia asks for modest parallelism.
    "en.wikipedia.org": HostPolicy(min_interval=0.1, concurrency=2),
    "pt.wikipedia.org": HostPolicy(min_interval=0.1, concurrency=2),
    # Nominatim's usage policy: an absolute maximum of one request per second.
    "nominatim.openstreetmap.org": HostPolicy(min_interval=1.1, concurrency=1),
    # Open-Meteo's free tier weighs a ten-year daily request heavily (hourly/daily quotas), so
    # the 200 cities are asked for one at a time, four seconds apart.
    "archive-api.open-meteo.com": HostPolicy(min_interval=4.0, concurrency=1, deadline=180.0),
    "raw.githubusercontent.com": HostPolicy(min_interval=0.5, concurrency=1),
    "api.github.com": HostPolicy(min_interval=1.0, concurrency=1),
}
DEFAULT_POLICY = HostPolicy(min_interval=0.5, concurrency=1)


class HttpError(RuntimeError):
    def __init__(self, status: int, url: str, body: str = ""):
        super().__init__(f"HTTP {status} for {url}: {body[:200]}")
        self.status = status


class _HostGate:
    def __init__(self, policy: HostPolicy):
        self.policy = policy
        self.sem = threading.Semaphore(policy.concurrency)
        self.lock = threading.Lock()
        self.next_start = 0.0

    def wait_turn(self) -> None:
        with self.lock:
            now = time.monotonic()
            start = max(now, self.next_start)
            self.next_start = start + self.policy.min_interval
        delay = start - now
        if delay > 0:
            time.sleep(delay)

    def penalise(self, seconds: float) -> None:
        with self.lock:
            self.next_start = max(self.next_start, time.monotonic() + seconds)


def _retry_after(resp: requests.Response) -> float | None:
    value = resp.headers.get("Retry-After")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        try:
            return max(0.0, parsedate_to_datetime(value).timestamp() - time.time())
        except (TypeError, ValueError):
            return None


class HttpClient:
    """Thread-safe client. ``cache_statuses`` are the HTTP statuses stored in the disk cache."""

    def __init__(
        self,
        cache_dir: Path = CACHE_DIR,
        use_cache: bool = True,
        max_retries: int = 6,
        policies: Mapping[str, HostPolicy] = POLICIES,
        session_factory: Callable[[], requests.Session] = requests.Session,
    ):
        self.cache_dir = cache_dir
        self.use_cache = use_cache
        self.max_retries = max_retries
        # Per-host rate limits and timeouts (HostPolicy); hosts not listed get DEFAULT_POLICY.
        self.policies = policies
        self.session_factory = session_factory
        self._local = threading.local()
        self._gates: dict[str, _HostGate] = {}
        self._gates_lock = threading.Lock()
        self.stats = {"network": 0, "cache": 0}

    # -- internals -------------------------------------------------------------------------
    def _session(self) -> requests.Session:
        session = getattr(self._local, "session", None)
        if session is None:
            session = self.session_factory()
            session.headers["User-Agent"] = user_agent()
            self._local.session = session
        return session

    def _send(self, policy: HostPolicy, method: str, url: str, **kwargs: Any) -> requests.Response:
        """``session.request`` with a wall-clock deadline. On expiry the (possibly stuck)
        session is abandoned to its daemon thread and a fresh one is used next time.

        requests' timeout is per socket read: a server trickling bytes can hold a request open
        forever (seen with WDQS), so ``policy.deadline`` bounds the whole request."""
        session = self._session()
        box: dict[str, Any] = {}

        def run() -> None:
            try:
                box["resp"] = session.request(method, url, timeout=policy.timeout, **kwargs)
            except BaseException as exc:  # noqa: BLE001 - re-raised in the caller's thread
                box["error"] = exc

        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        worker.join(policy.deadline)
        if worker.is_alive():
            self._local.session = None
            raise requests.Timeout(f"no complete response within {policy.deadline:.0f}s")
        if "error" in box:
            raise box["error"]
        return box["resp"]

    def _gate(self, host: str) -> _HostGate:
        with self._gates_lock:
            if host not in self._gates:
                self._gates[host] = _HostGate(self.policies.get(host, DEFAULT_POLICY))
            return self._gates[host]

    def _cache_path(self, namespace: str, method: str, url: str, payload: Any) -> Path:
        key = json.dumps([method, url, payload], sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.cache_dir / namespace / digest[:2] / f"{digest}.json"

    # -- public API ------------------------------------------------------------------------
    def request(
        self,
        method: str,
        url: str,
        *,
        namespace: str,
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        cache_statuses: tuple[int, ...] = (200,),
        validate: Callable[[str], bool] | None = None,
    ) -> tuple[int, str]:
        """Return ``(status, text)``. Raises :class:`HttpError` for uncached error statuses."""
        payload = {"params": params, "data": data}
        path = self._cache_path(namespace, method, url, payload)
        if self.use_cache and path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            self.stats["cache"] += 1
            return cached["status"], cached["text"]

        host = urlsplit(url).hostname or ""
        gate = self._gate(host)
        attempt = 0
        while True:
            attempt += 1
            with gate.sem:
                gate.wait_turn()
                try:
                    resp = self._send(
                        gate.policy, method, url, params=params, data=data, headers=headers
                    )
                    error: Exception | None = None
                except requests.RequestException as exc:
                    resp = None
                    error = exc
            self.stats["network"] += 1

            if resp is not None and (resp.status_code in cache_statuses or resp.status_code < 400):
                status, text = resp.status_code, resp.text
                if validate is not None and status == 200 and not validate(text):
                    raise HttpError(status, url, "response failed validation: " + text[:300])
                if status in cache_statuses:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    tmp = path.with_suffix(".tmp")
                    tmp.write_text(
                        json.dumps(
                            {"url": url, "status": status, "text": text}, ensure_ascii=False
                        ),
                        encoding="utf-8",
                    )
                    tmp.replace(path)
                return status, text

            retryable = resp is None or resp.status_code in (429, 500, 502, 503, 504)
            if resp is not None and "TimeoutException" in resp.text[:5000]:
                retryable = False  # WDQS query timeout: retrying the same query won't help
            # Overpass/Wikidata report query timeouts in 200/400-ish bodies too; callers decide.
            if not retryable or attempt > self.max_retries:
                if resp is None:
                    raise HttpError(0, url, str(error))
                raise HttpError(resp.status_code, url, resp.text)
            wait = (_retry_after(resp) if resp is not None else None) or min(120.0, 2.0**attempt)
            gate.penalise(wait)
            print(
                f"    retry {attempt}/{self.max_retries} for {host} in {wait:.0f}s "
                f"({resp.status_code if resp is not None else error})",
                flush=True,
            )

    def get_json(self, url: str, *, namespace: str, **kwargs: Any) -> Any:
        _, text = self.request("GET", url, namespace=namespace, **kwargs)
        return json.loads(text)
