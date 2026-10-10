"""Rules every proposal must pass before it becomes a route, whoever proposed it."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence

from .constants import ROUTE_MAX_STOPS, ROUTE_MIN_STOPS, THEME_MAX_CHARS, TITLE_MAX_CHARS
from .model import Candidate, InvalidProposal, Proposal

SLUG_MAX_CHARS = 60
# Letters that do not decompose into base letter + accent, so ASCII folding would drop them.
_TRANSLITERATIONS = str.maketrans(
    {"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "đ": "d", "ł": "l", "ð": "d", "þ": "th"}
)


def slugify(text: str) -> str:
    """Kebab-case ASCII slug (``^[a-z0-9]+(-[a-z0-9]+)*$``); ``"route"`` when nothing is left.

    >>> slugify("Igrejas e capelas perto de Sé!")
    'igrejas-e-capelas-perto-de-se'
    """
    folded = unicodedata.normalize("NFKD", text.lower().translate(_TRANSLITERATIONS))
    ascii_text = folded.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")[:SLUG_MAX_CHARS].strip("-")
    return slug or "route"


def unique_slug(title: str, taken: set[str]) -> str:
    """Slug of ``title`` not in ``taken`` (``-2``, ``-3``… on a clash); records it in ``taken``.

    >>> unique_slug("Old churches", {"old-churches"})
    'old-churches-2'
    """
    base = slugify(title)
    slug, number = base, 2
    while slug in taken:
        slug, number = f"{base}-{number}", number + 1
    taken.add(slug)
    return slug


def _clean_title(field: str, value: str) -> str:
    text = " ".join(value.split())
    if not text or len(text) > TITLE_MAX_CHARS:
        raise InvalidProposal(
            f"{field} is {len(text)} characters; expected 1 to {TITLE_MAX_CHARS}: {value[:40]!r}"
        )
    return text


def _clean_theme(value: str) -> str:
    if not value.strip():
        raise InvalidProposal(f"theme is empty; expected 1 to {THEME_MAX_CHARS} characters")
    return slugify(value)[:THEME_MAX_CHARS].strip("-")


def _clean_stops(stops: Sequence[str], group: Sequence[Candidate]) -> tuple[str, ...]:
    known = {c.qid for c in group}
    unknown = [s for s in stops if s not in known]
    if unknown:
        raise InvalidProposal(
            f"stops {unknown} are not in the group; expected ids of {sorted(known)}"
        )
    distinct = tuple(dict.fromkeys(stops))
    if not ROUTE_MIN_STOPS <= len(distinct) <= ROUTE_MAX_STOPS:
        raise InvalidProposal(
            f"{len(distinct)} distinct stops; expected {ROUTE_MIN_STOPS} to {ROUTE_MAX_STOPS}"
        )
    return distinct


def validate_proposal(proposal: Proposal, group: Sequence[Candidate]) -> Proposal:
    """The proposal with its text cleaned and duplicate stops dropped, or ``InvalidProposal``.

    Repairs what is harmless (spacing, a theme that is not a short kebab-case key, a repeated
    id); rejects what means the model went off the list (an id outside ``group``, a title that
    is empty or longer than the column, fewer than 3 or more than 8 stops).

    >>> validate_proposal(Proposal("Old Town", "Old town", "Velha", ("Q1", "Q1", "Q2")), g)
    """
    return Proposal(
        theme=_clean_theme(proposal.theme),
        title_en=_clean_title("title_en", proposal.title_en),
        title_pt=_clean_title("title_pt", proposal.title_pt),
        stops=_clean_stops(proposal.stops, group),
    )
