import pytest

from wayfarer_pipeline.visa import normalize, normalize_requirement


@pytest.mark.parametrize(
    ("cell", "expected"),
    [
        ("90", ("visa_free", 90)),
        ("visa free", ("visa_free", None)),
        ("visa on arrival", ("visa_on_arrival", None)),
        ("eta", ("eta", None)),
        ("e-visa", ("e_visa", None)),
        ("visa required", ("visa_required", None)),
        ("no admission", ("no_admission", None)),
        ("-1", None),
    ],
)
def test_normalize_requirement(cell, expected):
    assert normalize_requirement(cell) == expected


def test_unknown_requirement_fails_loudly():
    with pytest.raises(ValueError):
        normalize_requirement("covid ban")


def _row(p, d, r):
    return {"Passport": p, "Destination": d, "Requirement": r}


def test_normalize_overlay_skip_and_sort():
    raw = [
        _row("PT", "PT", "-1"),
        _row("PT", "FR", "90"),  # EU → EU: freedom of movement overrides the number
        _row("CH", "PT", "visa free"),  # CH is in the free-movement area
        _row("BR", "PT", "90"),
        _row("BR", "GB", "eta"),
        _row("GB", "FR", "90"),  # UK left the EU
        _row("ZZ", "PT", "visa required"),  # unknown code
    ]
    rows, skipped = normalize(raw, known_codes={"PT", "FR", "CH", "BR", "GB"})
    assert skipped == {"ZZ"}
    assert [(r["passport"], r["destination"]) for r in rows] == [
        ("BR", "GB"),
        ("BR", "PT"),
        ("CH", "PT"),
        ("GB", "FR"),
        ("PT", "FR"),
    ]
    by_pair = {(r["passport"], r["destination"]): r for r in rows}
    assert by_pair[("PT", "FR")] == {
        "passport": "PT",
        "destination": "FR",
        "requirement": "freedom_of_movement",
        "max_stay_days": None,
    }
    assert by_pair[("CH", "PT")]["requirement"] == "freedom_of_movement"
    assert by_pair[("BR", "PT")]["requirement"] == "visa_free"
    assert by_pair[("BR", "PT")]["max_stay_days"] == 90
    assert by_pair[("GB", "FR")]["requirement"] == "visa_free"
    assert by_pair[("BR", "GB")]["requirement"] == "eta"
