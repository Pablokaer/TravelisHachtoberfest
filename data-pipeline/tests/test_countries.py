import pytest

from wayfarer_pipeline import countries as C

RANK = "http://wikiba.se/ontology#"


@pytest.mark.parametrize(
    ("qid", "label", "letter"),
    [
        ("Q1378312", "Europlug", "C"),
        ("Q1123613", "Schuko", "F"),
        ("Q1528507", "BS 1363", "G"),
        ("Q24288454", "NEMA 1-15", "A"),
        ("Q1653438", "IEC 60906-1", "N"),
        ("Q999", "NBR 14136", "N"),  # label fallback
        ("Q999", "Type M", "M"),
        ("Q60740126", "AC power plugs and sockets: British and related types", None),
        ("Q999", None, None),
    ],
)
def test_plug_letter(qid, label, letter):
    assert C.plug_letter(qid, label) == letter


def test_pick_items_prefers_country_then_sitelinks():
    base = [
        {"item": "Q29999", "code": "NL", "sl": "107", "isCountry": "true", "isSov": "true"},
        {"item": "Q55", "code": "NL", "sl": "300", "isCountry": "true", "isSov": "false"},
        {"item": "Q644636", "code": "CY", "sl": "65", "isCountry": "false", "isSov": "false"},
        {"item": "Q229", "code": "CY", "sl": "325", "isCountry": "true", "isSov": "true"},
        {"item": "Q1", "code": "EZ", "sl": "9", "isCountry": "false", "isSov": "false"},
    ]
    picked = C.pick_items(base)
    assert picked["NL"]["item"] == "Q55"
    assert picked["CY"]["item"] == "Q229"
    assert "EZ" not in picked  # exceptionally reserved code


def test_pick_emergency():
    rows = [
        {"st": "s1", "v": "Q1", "label": "112", "num": "112"},
        {"st": "s2", "v": "Q2", "label": "999", "num": "999"},
        {"st": "s3", "v": "Q3", "label": "091", "num": "+34-091", "use": "Q35535"},
        {"st": "s4", "v": "Q4", "label": "x", "num": "+34-061", "use": "Q860447"},
        {"st": "s5", "v": "Q5", "label": "156", "num": "156", "use": "Q1758690"},  # municipal
        # a multi-use statement is treated as general
        {"st": "s6", "v": "Q1", "label": "112", "num": "112", "use": "Q35535"},
        {"st": "s6", "v": "Q1", "label": "112", "num": "112", "use": "Q6498663"},
    ]
    assert C.pick_emergency(rows) == {
        "emergency_number": "999",
        "police_number": "091",
        "ambulance_number": "061",
        "fire_number": None,
    }


def test_pick_voltage_and_calling_code():
    volts = [
        {"amount": "400", "hz": "50", "rank": RANK + "NormalRank"},
        {"amount": "127", "hz": "60", "rank": RANK + "NormalRank"},
        {"amount": "220", "hz": "60", "rank": RANK + "NormalRank"},
    ]
    assert C.pick_voltage(volts) == (220, 60)
    assert C.pick_voltage([]) == (None, None)
    calls = [
        {"v": "+36", "rank": RANK + "NormalRank"},
        {"v": "+90", "rank": RANK + "PreferredRank"},
    ]
    assert C.pick_calling_code(calls) == "+90"


def test_overrides_patch_fields_and_flags():
    base = {"NL": {"code": "NL", "name_en": "Kingdom", "currency_codes": ["AWG", "EUR"]}}
    out = C.apply_overrides(
        base,
        {
            "NL": {"source": "x", "name_en": "Netherlands", "currency_codes": ["EUR"]},
            "XK": {"source": "y", "name_en": "Kosovo"},
        },
    )
    assert out["NL"]["name_en"] == "Netherlands"
    assert out["NL"]["currency_codes"] == ["EUR"]
    assert out["NL"]["is_eu"] and out["NL"]["is_schengen"]
    assert out["XK"]["name_pt"] == "Kosovo" and out["XK"]["plug_types"] == []
    with pytest.raises(ValueError):
        C.apply_overrides(base, {"NL": {"source": "x", "colour": "orange"}})


def test_eu_and_schengen_lists():
    assert len(C.EU) == 27 and len(C.SCHENGEN) == 29
    assert {"BG", "RO", "HR", "IS", "LI", "NO", "CH"} <= C.SCHENGEN
    assert "IE" in C.EU and "IE" not in C.SCHENGEN


def test_committed_snapshot_key_destinations():
    data = C.load()
    assert len(data) >= 240
    gb, us, fr = data["GB"], data["US"], data["FR"]
    assert (gb["plug_types"], gb["driving_side"], gb["calling_code"]) == (["G"], "left", "+44")
    assert gb["emergency_number"] == "999" and gb["currency_codes"] == ["GBP"]
    assert (us["plug_types"], us["voltage"], us["frequency_hz"]) == (["A", "B"], 120, 60)
    assert (fr["police_number"], fr["ambulance_number"], fr["fire_number"]) == ("17", "15", "18")
    assert data["TR"]["calling_code"] == "+90"
    assert data["NL"]["name_en"] == "Netherlands" and data["NL"]["currency_codes"] == ["EUR"]
    assert data["IT"]["plug_types"] == ["C", "F", "L"]
    assert data["BR"]["plug_types"] == ["C", "N"] and data["BR"]["frequency_hz"] == 60
    assert "XK" in data
