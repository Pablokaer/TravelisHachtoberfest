"""Shared block: a guard that had to restore too many texts is hiding a broken source."""

from __future__ import annotations

from .findings import Finding
from .limits import MAX_RESTORED_SHARE, RESTORED_SHARE_MIN_TEXTS


def restored_share_block(dataset: str, subject: str, restored: int, checked: int) -> Finding | None:
    """A blocking finding when more than MAX_RESTORED_SHARE of the checked texts were restored.

    >>> restored_share_block("city-summaries", "all cities", 8, 8).detail
    '8 of 8 texts needed restoring (100%, limit 25%): the source probably broke'
    """
    if checked < RESTORED_SHARE_MIN_TEXTS or restored / checked <= MAX_RESTORED_SHARE:
        return None
    share = int(restored / checked * 100)
    detail = (
        f"{restored} of {checked} texts needed restoring ({share}%, "
        f"limit {int(MAX_RESTORED_SHARE * 100)}%): the source probably broke"
    )
    return Finding(dataset, subject, "texts", "blocked", detail)
