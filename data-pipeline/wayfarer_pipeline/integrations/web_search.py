"""Live web search through SerpApi (D-084): fresh tips about a city, beside the static sources.

Wikidata, OpenStreetMap and Wikipedia say what a place *is*; a web search says what people are
saying about it *now*. The results are links with a snippet, never merged into the attraction
data, and the feature is off without ``SERPAPI_API_KEY``.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol

from .errors import NotConfigured
from .transport import WebTransport

SEARCH_URL = "https://serpapi.com/search.json"
KEY_VARIABLE = "SERPAPI_API_KEY"


class WebSearch(Protocol):
    def search(self, query: str, limit: int) -> list[dict[str, str]]: ...


class SerpApiSearch:
    """Google results from SerpApi.

    >>> SerpApiSearch.from_env(os.environ, transport).search("things to do in Sintra", 5)
    [{'title': ..., 'link': ..., 'snippet': ...}]
    """

    def __init__(self, api_key: str, transport: WebTransport) -> None:
        self.api_key, self.transport = api_key, transport

    @classmethod
    def from_env(cls, env: Mapping[str, str], transport: WebTransport) -> SerpApiSearch:
        key = env.get(KEY_VARIABLE, "").strip()
        if not key:
            raise NotConfigured(f"{KEY_VARIABLE} is empty; expected a SerpApi key (serpapi.com)")
        return cls(key, transport)

    def search(self, query: str, limit: int) -> list[dict[str, str]]:
        params = {"engine": "google", "q": query, "num": str(limit), "api_key": self.api_key}
        reply = self.transport.get_json(SEARCH_URL, params)
        hits = [_hit(item) for item in reply.get("organic_results", [])]
        return [hit for hit in hits if hit][:limit]


def _hit(item: Mapping[str, str]) -> dict[str, str] | None:
    if not item.get("link") or not item.get("title"):
        return None
    return {"title": item["title"], "link": item["link"], "snippet": item.get("snippet", "")}
