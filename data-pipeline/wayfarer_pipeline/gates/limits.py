"""Thresholds of the data gates (D-042). Tuned so a normal monthly refresh passes: Wikidata and
pageviews move a few places in and out of each city's top 300 every month."""

from __future__ import annotations

# Texts ---------------------------------------------------------------------------------------
MIN_CHARS = {"name": 2, "description": 3, "summary": 80}
# A new summary shorter than this share of the previous one lost its content.
SUMMARY_MIN_KEPT_RATIO = 0.4
# More restores than this share of the checked texts means the source broke: block.
MAX_RESTORED_SHARE = 0.25
# ...but only once there are enough texts for a share to mean something.
RESTORED_SHARE_MIN_TEXTS = 8

# Attractions (per city) ----------------------------------------------------------------------
MAX_PLACES_DROP = 0.15
MAX_PLACES_GONE = 0.30

# Visa ------------------------------------------------------------------------------------------
MAX_VISA_ROWS_DROP = 0.01
MAX_VISA_CHANGED = 0.10
# Individual changed rules listed for review in the report.
MAX_VISA_REVIEW_ROWS = 50
