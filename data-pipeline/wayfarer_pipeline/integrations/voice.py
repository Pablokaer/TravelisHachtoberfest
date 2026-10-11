"""Narration of a route or an attraction with ElevenLabs text-to-speech (D-084).

The text is the app's own (a route's stops, an attraction's Wikipedia extract): the voice reads
it, it does not write it. Off without ``ELEVENLABS_API_KEY``.
"""

from __future__ import annotations

from collections.abc import Mapping

from .errors import IntegrationError, NotConfigured
from .transport import WebTransport

SPEECH_URL = "https://api.elevenlabs.io/v1/text-to-speech"
KEY_VARIABLE = "ELEVENLABS_API_KEY"
VOICE_VARIABLE = "ELEVENLABS_VOICE_ID"
DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"  # a stock multilingual voice of the free tier
MODEL_ID = "eleven_multilingual_v2"  # reads English and European Portuguese
MAX_NARRATION_CHARS = 2500  # about three minutes of speech, and a bounded bill


class ElevenLabsVoice:
    """>>> ElevenLabsVoice.from_env(os.environ, transport).narrate("Welcome to Sintra.")  # mp3"""

    def __init__(self, api_key: str, voice_id: str, transport: WebTransport) -> None:
        self.api_key, self.voice_id, self.transport = api_key, voice_id, transport

    @classmethod
    def from_env(cls, env: Mapping[str, str], transport: WebTransport) -> ElevenLabsVoice:
        key = env.get(KEY_VARIABLE, "").strip()
        if not key:
            raise NotConfigured(f"{KEY_VARIABLE} is empty; expected an ElevenLabs key")
        return cls(key, env.get(VOICE_VARIABLE, "").strip() or DEFAULT_VOICE, transport)

    def narrate(self, text: str) -> bytes:
        """MP3 bytes for ``text``; ``IntegrationError`` when it is empty or too long."""
        clean = text.strip()
        if not clean:
            raise IntegrationError("text is empty; expected something to read aloud")
        if len(clean) > MAX_NARRATION_CHARS:
            raise IntegrationError(
                f"text has {len(clean)} characters; expected at most {MAX_NARRATION_CHARS}"
            )
        url = f"{SPEECH_URL}/{self.voice_id}?output_format=mp3_44100_128"
        headers = {"xi-api-key": self.api_key, "Accept": "audio/mpeg"}
        return self.transport.post_bytes(url, {"text": clean, "model_id": MODEL_ID}, headers)
