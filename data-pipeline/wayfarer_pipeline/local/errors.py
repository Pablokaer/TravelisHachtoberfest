"""Errors the service layer maps to HTTP statuses."""

from __future__ import annotations


class BadRequest(ValueError):
    """The request is malformed; the message names the offending value (HTTP 400)."""


class PlanUnavailable(RuntimeError):
    """The trip wizard's language model cannot answer: off, missing, or unable to give a valid
    answer in three tries (HTTP 503)."""
