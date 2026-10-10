from wayfarer_pipeline import coverage
from wayfarer_pipeline.config import CitiesConfig

COUNTRIES = {"PT": {"name_en": "Portugal"}, "GB": {"name_en": "United Kingdom"}}


def _config():
    city = {
        "center": [38.7, -9.1],
        "bbox": [38.6, -9.3, 38.8, -9.0],
    }
    return CitiesConfig.model_validate(
        {
            "version": 1,
            "cities": [
                {
                    **city,
                    "slug": "lisbon",
                    "wikidata_id": "Q597",
                    "name": {"en": "Lisbon", "pt": "Lisboa"},
                    "country_code": "PT",
                },
                {
                    **city,
                    "slug": "london",
                    "wikidata_id": "Q84",
                    "name": {"en": "London", "pt": "Londres"},
                    "country_code": "GB",
                },
            ],
        }
    )


def test_render_lists_every_city_with_stats_and_flags_missing_ingestion():
    docs = {
        "lisbon": {
            "retrieved": "2026-09-28",
            "attractions": [
                {"image_url": "x", "name_pt": "Torre", "opening_hours": None, "is_unesco": True},
                {"image_url": None, "name_pt": None, "opening_hours": "24/7", "is_unesco": False},
            ],
        }
    }
    md = coverage.render(_config(), docs, COUNTRIES)

    assert "**2 cities** in **2 countries**, **1** live on the map, **2 attractions**" in md
    assert (
        "| 1 | Lisbon | Lisboa | Portugal (PT) | `lisbon` | 2 | 50% | 50% | 50% | 1 "
        "| 2026-09-28 | active |" in md
    )
    assert "| 2 | London | Londres | United Kingdom (GB) | `london` | 0 |" in md
    assert "not ingested" in md
    assert "**Not ingested yet:** `london`" in md


def test_is_current_detects_stale_file(tmp_path):
    path = tmp_path / "CITIES.md"
    assert not coverage.is_current("a", path)
    coverage.write("a", path)
    assert coverage.is_current("a", path)
    assert not coverage.is_current("b", path)
