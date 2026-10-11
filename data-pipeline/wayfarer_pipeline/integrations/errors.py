"""Errors of the optional integrations; the server turns them into 503 / 502 answers."""

from __future__ import annotations


class IntegrationError(RuntimeError):
    """A partner service refused or failed; the message names the value and what was expected."""


class NotConfigured(IntegrationError):
    """The integration's key is not set: the feature is simply off (HTTP 503)."""
