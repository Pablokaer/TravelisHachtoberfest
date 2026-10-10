"""The model-free planner: theme and titles from a group's dominant category.

It is the safety net of ``suggest-routes``: whenever a language model fails to give a valid
answer for a group, this planner names the whole group, so every city still gets its routes.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence

from .constants import THEME_MAX_CHARS, TITLE_MAX_CHARS
from .model import Candidate, PlannerContext, Proposal

# category -> (theme key, English title, Portuguese title)
THEMES: dict[str, tuple[str, str, str]] = {
    "church": ("churches", "Churches and chapels", "Igrejas e capelas"),
    "castle": ("castles", "Castles and viewpoints", "Castelos e miradouros"),
    "palace": ("palaces", "Palaces and noble houses", "Palácios e casas nobres"),
    "museum": ("museums", "Museums and collections", "Museus e coleções"),
    "monument": ("monuments", "Monuments and memorials", "Monumentos e memoriais"),
    "landmark": ("landmarks", "City landmarks", "Marcos da cidade"),
    "viewpoint": ("viewpoints", "Viewpoints and panoramas", "Miradouros e panoramas"),
}
MIXED = ("highlights", "Historic highlights", "Destaques históricos")


def _theme_of(group: Sequence[Candidate]) -> tuple[str, str, str]:
    """The theme of the category at least 40% of the places share; otherwise the group is mixed.
    (A strict majority left three routes in four "mixed" in dense city centres.)"""
    category, count = Counter(c.category for c in group).most_common(1)[0]
    return THEMES[category] if category in THEMES and count * 5 >= len(group) * 2 else MIXED


def _anchor(group: Sequence[Candidate]) -> Candidate:
    return max(group, key=lambda c: (c.popularity, -int(c.qid[1:])))


def _title(head: str, link: str, name: str) -> str:
    room = TITLE_MAX_CHARS - len(head) - len(link) - 2
    return f"{head} {link} {name[: max(room, 1)].rstrip()}"


class RuleBasedRoutePlanner:
    """One proposal per group: every place, named after its dominant category and its anchor.

    >>> RuleBasedRoutePlanner().propose(group, context)[0].title_en
    'Churches and chapels around Sé de Lisboa'
    """

    name = "rules"

    def propose(self, group: Sequence[Candidate], context: PlannerContext) -> list[Proposal]:
        theme, title_en, title_pt = _theme_of(group)
        anchor = _anchor(group)
        return [
            Proposal(
                theme=theme[:THEME_MAX_CHARS],
                title_en=_title(title_en, "around", anchor.name_en),
                title_pt=_title(title_pt, "perto de", anchor.name_pt or anchor.name_en),
                stops=tuple(c.qid for c in group),
            )
        ]
