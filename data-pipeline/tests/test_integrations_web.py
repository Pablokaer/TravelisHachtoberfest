"""SerpApi live web search and ElevenLabs narration (D-084): both optional, both key-gated."""

from __future__ import annotations

import pytest
from integration_web_fakes import FakeWebTransport

from wayfarer_pipeline.integrations.errors import IntegrationError, NotConfigured
from wayfarer_pipeline.integrations.voice import MAX_NARRATION_CHARS, ElevenLabsVoice
from wayfarer_pipeline.integrations.web_search import SerpApiSearch

ORGANIC = {
    "organic_results": [
        {"title": "Sintra guide", "link": "https://a.example/sintra", "snippet": "Palaces."},
        {"title": "No link here", "snippet": "dropped"},
        {"title": "Quinta", "link": "https://b.example/q", "snippet": "A garden."},
    ]
}


def test_web_search_returns_title_link_and_snippet_of_organic_results() -> None:
    transport = FakeWebTransport(ORGANIC)
    hits = SerpApiSearch("key-1", transport).search("best things to do in Sintra", 5)
    assert hits == [
        {"title": "Sintra guide", "link": "https://a.example/sintra", "snippet": "Palaces."},
        {"title": "Quinta", "link": "https://b.example/q", "snippet": "A garden."},
    ]
    url, params = transport.gets[0]
    assert url == "https://serpapi.com/search.json"
    assert params["q"] == "best things to do in Sintra"
    assert params["api_key"] == "key-1"


def test_web_search_respects_the_limit() -> None:
    assert len(SerpApiSearch("k", FakeWebTransport(ORGANIC)).search("q", 1)) == 1


def test_web_search_without_a_key_says_which_variable_to_set() -> None:
    with pytest.raises(NotConfigured, match="SERPAPI_API_KEY"):
        SerpApiSearch.from_env({}, FakeWebTransport())


def test_narration_posts_text_with_the_key_in_the_header_and_returns_audio() -> None:
    transport = FakeWebTransport(audio=b"ID3-mp3")
    voice = ElevenLabsVoice("xi-1", "voice-9", transport)
    assert voice.narrate("Welcome to Sintra.") == b"ID3-mp3"
    url, body, headers = transport.posts[0]
    assert url.startswith("https://api.elevenlabs.io/v1/text-to-speech/voice-9")
    assert body["text"] == "Welcome to Sintra."
    assert headers["xi-api-key"] == "xi-1"


def test_narration_refuses_empty_and_overlong_text_naming_the_limit() -> None:
    voice = ElevenLabsVoice("k", "v", FakeWebTransport())
    with pytest.raises(IntegrationError, match="empty"):
        voice.narrate("   ")
    with pytest.raises(IntegrationError, match=str(MAX_NARRATION_CHARS)):
        voice.narrate("x" * (MAX_NARRATION_CHARS + 1))


def test_narration_without_a_key_says_which_variable_to_set() -> None:
    with pytest.raises(NotConfigured, match="ELEVENLABS_API_KEY"):
        ElevenLabsVoice.from_env({}, FakeWebTransport())
