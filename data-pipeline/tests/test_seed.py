import re

from wayfarer_pipeline import seed
from wayfarer_pipeline.config import load_cities


def _attraction(qid, **kw):
    base = {
        "wikidata_id": qid,
        "osm_id": "way/1",
        "name_en": "St Paul's",
        "name_pt": None,
        "description_en": "cathedral",
        "description_pt": None,
        "category": "church",
        "lat": 51.5138,
        "lng": -0.0983,
        "image_url": None,
        "image_author": None,
        "image_license": None,
        "image_license_url": None,
        "image_page_url": None,
        "is_unesco": False,
        "website": None,
        "wikipedia_en": "St Paul's Cathedral",
        "wikipedia_pt": None,
        "opening_hours": "Mo-Sa 08:30-16:30",
        "fee": "yes",
        "avg_visit_minutes": 30,
        "popularity": 88,
    }
    return {**base, **kw}


def test_attractions_sql_is_deterministic_and_sorted():
    docs_a = {
        "paris": {"attractions": [_attraction("Q243"), _attraction("Q9")]},
        "london": {"attractions": [_attraction("Q6373")]},
    }
    docs_b = {  # same content, different insertion order
        "london": {"attractions": [_attraction("Q6373")]},
        "paris": {"attractions": [_attraction("Q9"), _attraction("Q243")]},
    }
    sql_a, warn_a = seed.attractions_sql(docs_a)
    sql_b, _ = seed.attractions_sql(docs_b)
    assert sql_a == sql_b and warn_a == []
    qids = re.findall(r"'london', '(Q\d+)'|'paris', '(Q\d+)'", sql_a)
    assert [a or b for a, b in qids] == ["Q6373", "Q9", "Q243"]
    assert "'St Paul''s'" in sql_a
    assert "on conflict (wikidata_id) do update" in sql_a
    assert "id = excluded.id" not in sql_a  # keep stable ids
    assert f"'{seed.attraction_uuid('Q243')}'::uuid" in sql_a
    assert "'church'::public.attraction_category" in sql_a


def test_attractions_sql_carries_the_wikipedia_texts():
    docs = {"london": {"attractions": [_attraction("Q1"), _attraction("Q2")]}}
    texts = {
        "london": {
            "Q1": {
                "summary_en": "A cathedral.",
                "history_en": "Rebuilt after 1666.",
                "summary_pt": None,
                "history_pt": None,
            }
        }
    }
    sql, _ = seed.attractions_sql(docs, texts)
    assert "summary_en, summary_pt, history_en, history_pt" in sql
    assert "'A cathedral.', null, 'Rebuilt after 1666.', null" in sql
    assert sql.count("null, null, null, null)") == 1  # Q2 has no texts


def test_attractions_duplicate_qid_across_cities_is_skipped():
    docs = {
        "a": {"attractions": [_attraction("Q1")]},
        "b": {"attractions": [_attraction("Q1")]},
    }
    rows, warnings = seed.attractions_rows(docs)
    assert len(rows) == 1 and len(warnings) == 1


def test_attractions_duplicate_qid_prefers_city_confirmed_by_osm():
    # Madrid Arena has a second, wrong Wikidata coordinate in Bilbao; only Madrid matches OSM.
    docs = {
        "bilbao": {"attractions": [_attraction("Q1", osm_id=None)]},
        "madrid": {"attractions": [_attraction("Q1")]},
    }
    rows, warnings = seed.attractions_rows(docs)
    assert [r[1] for r in rows] == ["madrid"]
    assert warnings == ["Q1 in bilbao already seeded for madrid; skipped"]


def test_attraction_uuid_is_stable():
    assert seed.attraction_uuid("Q243") == seed.attraction_uuid("Q243")
    assert seed.attraction_uuid("Q243") != seed.attraction_uuid("Q244")


def test_cities_sql():
    config = load_cities()
    sql = seed.cities_sql(config)
    assert sql.count("  ('") == len(config.cities)
    assert "('oslo', 'Oslo', 'Oslo', 'NO'" in sql
    assert "array[38.6913994,-9.2298356,38.7967584,-9.0863328]::double precision[]" in sql
    assert "extensions.st_makepoint(-9.139016, 38.708042)" in sql
    assert "'Europe/Lisbon'" in sql


def test_countries_and_visa_sql():
    countries = {
        "PT": {
            "name_en": "Portugal",
            "name_pt": "Portugal",
            "currency_codes": ["EUR"],
            "plug_types": ["C", "F"],
            "timezones": [],
            "languages": ["pt"],
            "voltage": 230,
            "is_eu": True,
            "is_schengen": True,
        }
    }
    sql = seed.countries_sql(countries)
    assert "array['C','F']::text[]" in sql and "'{}'::text[]" in sql
    visa = seed.visa_sql(
        [
            {
                "passport": "PT",
                "destination": "BR",
                "requirement": "visa_free",
                "max_stay_days": 90,
            },
            {
                "passport": "BR",
                "destination": "PT",
                "requirement": "visa_free",
                "max_stay_days": None,
            },
        ]
    )
    assert visa.index("('BR', 'PT'") < visa.index("('PT', 'BR'")
    assert "'visa_free'::public.visa_requirement, 90" in visa
    assert "on conflict (passport, destination)" in visa


def _routes_doc(city: str = "lisbon", stops=("Q1", "Q2", "Q3")) -> dict:
    route = {
        "slug": "hill-churches",
        "theme": "churches",
        "title_en": "Hill churches",
        "title_pt": "Igrejas da colina's",
        "generated_by": "rules",
        "stops": list(stops),
        "distance_m": 1200,
        "walking_seconds": 960,
        "visit_minutes": 90,
    }
    return {"city": city, "generated": "2026-10-10", "routes": [route]}


def test_route_uuid_is_stable_and_differs_per_city_and_slug():
    assert seed.route_uuid("lisbon", "a") == seed.route_uuid("lisbon", "a")
    assert seed.route_uuid("lisbon", "a") != seed.route_uuid("porto", "a")
    assert seed.route_uuid("lisbon", "a") != seed.route_uuid("lisbon", "b")


def test_suggested_routes_sql_empties_the_table_then_inserts_routes_and_stops():
    sql, warnings = seed.suggested_routes_sql({"lisbon": _routes_doc()})
    rid = seed.route_uuid("lisbon", "hill-churches")
    assert warnings == []
    assert sql.startswith("delete from public.suggested_routes;")
    assert f"'{rid}'::uuid" in sql and "'Igrejas da colina''s'" in sql
    assert "insert into public.suggested_routes (" in sql
    assert "insert into public.suggested_route_stops (route_id, position, attraction_id)" in sql
    assert f"('{rid}'::uuid, 1, '{seed.attraction_uuid('Q2')}'::uuid)" in sql


def test_suggested_routes_sql_is_deterministic_whatever_the_city_order():
    a = {"porto": _routes_doc("porto"), "lisbon": _routes_doc()}
    b = {"lisbon": _routes_doc(), "porto": _routes_doc("porto")}
    assert seed.suggested_routes_sql(a) == seed.suggested_routes_sql(b)


def test_suggested_routes_sql_drops_unseeded_stops_and_short_routes():
    docs = {"lisbon": _routes_doc(stops=("Q1", "Q2", "Q3", "Q4")), "porto": _routes_doc("porto")}
    sql, warnings = seed.suggested_routes_sql(docs, known_qids={"Q1", "Q2", "Q3"})
    assert seed.attraction_uuid("Q4") not in sql
    assert warnings == ["lisbon/hill-churches: Q4 is not a seeded attraction; stop dropped"]
    sql, warnings = seed.suggested_routes_sql(docs, known_qids={"Q1", "Q2"})
    assert "insert into" not in sql
    assert "fewer than 3 stops" in warnings[-1]


def test_suggested_routes_sql_with_no_routes_only_empties_the_table():
    sql, _ = seed.suggested_routes_sql({})
    assert sql.strip() == "delete from public.suggested_routes;"


def test_suggested_routes_sql_for_one_city_only_replaces_that_citys_routes():
    """The on-demand service (D-079) adds a city without emptying everyone else's routes."""
    sql, _ = seed.suggested_routes_sql({"porto": _routes_doc("porto")}, only_city="porto")
    assert sql.startswith("delete from public.suggested_routes where city_slug = 'porto';")
    assert "delete from public.suggested_routes;" not in sql
    assert "insert into public.suggested_routes (" in sql


def test_write_suggested_routes_names_the_file_after_the_command(tmp_path):
    path, _ = seed.write_suggested_routes(tmp_path, docs={"lisbon": _routes_doc()}, known_qids=None)
    assert path.name == "60_suggested_routes.sql"
    assert "suggest-routes" in path.read_text(encoding="utf-8").splitlines()[0]


def test_readme_lists_the_suggested_routes_seed():
    assert "60_suggested_routes.sql" in seed.README_SQL
