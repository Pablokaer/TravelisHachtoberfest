import pytest

from wayfarer_pipeline.sql import Raw, array, geography_point, literal, quote, upsert


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "null"),
        (True, "true"),
        (False, "false"),
        (42, "42"),
        (1.5, "1.5"),
        ("plain", "'plain'"),
        ("O'Connell's", "'O''Connell''s'"),
        ("back\\slash", "'back\\slash'"),  # standard_conforming_strings: no escaping
        ("Jerónimos; drop table x; --", "'Jerónimos; drop table x; --'"),
        ("line\nbreak", "'line\nbreak'"),
        (Raw("now()"), "now()"),
    ],
)
def test_literal(value, expected):
    assert literal(value) == expected


def test_quote_rejects_nul():
    with pytest.raises(ValueError):
        quote("a\x00b")


def test_literal_rejects_nan_and_unknown_types():
    with pytest.raises(ValueError):
        literal(float("nan"))
    with pytest.raises(TypeError):
        literal(object())


def test_arrays():
    assert array(["C", "F"]) == "array['C','F']"
    assert array([], "text[]") == "'{}'::text[]"
    assert array([1.0, 2.5], "double precision[]") == "array[1.0,2.5]::double precision[]"
    assert array(["it's"]) == "array['it''s']"


def test_geography_point_is_lng_lat():
    sql = geography_point(38.7, -9.1).sql
    assert "st_makepoint(-9.1, 38.7)" in sql
    assert sql.endswith("::extensions.geography")


def test_upsert_batches_and_conflict_clause():
    rows = [[i, f"n{i}"] for i in range(5)]
    sql = upsert("public.t", ["id", "name"], rows, conflict=["id"], batch_size=2)
    assert sql.count("insert into public.t (id, name) values") == 3
    assert sql.count("on conflict (id) do update set") == 3
    assert "name = excluded.name" in sql and "id = excluded.id" not in sql
    assert "updated_at = now()" in sql


def test_upsert_rejects_wrong_arity():
    with pytest.raises(ValueError):
        upsert("public.t", ["a", "b"], [[1]], conflict=["a"])
