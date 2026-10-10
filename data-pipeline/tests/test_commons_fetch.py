"""Commons imageinfo batches stay under Wikimedia's URL length limit (HTTP 414 on Belgrade)."""

import json
from typing import Any
from urllib.parse import urlencode

from wayfarer_pipeline.attractions import commons


class FakeCommonsClient:
    """Records each GET's params and answers with an empty imageinfo result."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def request(self, method: str, url: str, *, namespace: str, params: dict[str, Any]):
        self.calls.append(params)
        return 200, json.dumps({"query": {"pages": []}})


def _url_length(params: dict[str, Any]) -> int:
    return len(commons.API) + 1 + len(urlencode(params))


def test_long_non_latin_filenames_are_split_below_the_url_limit() -> None:
    # 50 Cyrillic names of ~60 characters encode to ~360 bytes each: one batch would be ~18 kB.
    names = [f"Београд — Храм Светог Саве, поглед са југа {i:02d}.jpg" for i in range(50)]
    client = FakeCommonsClient()

    commons.fetch(client, names)

    assert len(client.calls) > 1
    assert all(_url_length(p) <= commons.MAX_URL_LENGTH for p in client.calls)
    sent = [t for p in client.calls for t in p["titles"].split("|")]
    assert sorted(sent) == sorted(f"File:{n}" for n in names)


def test_short_names_keep_one_request_per_50_files() -> None:
    # Batches that already fit keep their exact shape, so cached responses stay valid.
    names = [f"Photo {i:03d}.jpg" for i in range(120)]
    client = FakeCommonsClient()

    commons.fetch(client, names)

    assert [len(p["titles"].split("|")) for p in client.calls] == [50, 50, 20]


def test_an_author_repeated_by_the_commons_markup_is_shown_once():
    # Public-domain portraits carry "Unknown author" twice (a link and its label), e.g. Amália
    # Rodrigues' 1956 album cover; the credit read "Unknown author Unknown author".
    from wayfarer_pipeline.attractions.commons import strip_html

    markup = '<span lang="en">Unknown author</span> <span class="x">Unknown author</span>'
    assert strip_html(markup) == "Unknown author"
    assert strip_html("Ana Ana Silva") == "Ana Ana Silva"  # only an exact double is collapsed


def test_a_repeated_unknown_author_inside_a_longer_credit_is_shown_once():
    from wayfarer_pipeline.attractions.commons import strip_html

    assert (
        strip_html("Original: Unknown author Unknown author Derivative work: TharonXX")
        == "Original: Unknown author Derivative work: TharonXX"
    )
