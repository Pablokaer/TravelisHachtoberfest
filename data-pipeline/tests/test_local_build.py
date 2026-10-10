"""Building one city end to end, from a geocoded place to rows in the database (D-079)."""

from __future__ import annotations

from pathlib import Path

import pytest
from local_fakes import (
    SINTRA,
    FakeDatabase,
    FakeIngester,
    FakeNames,
    make_builder,
    town_doc,
)

from wayfarer_pipeline.local.build import BuildError
from wayfarer_pipeline.local.database import DatabaseError
from wayfarer_pipeline.local.places import Place


class Stages:
    """Records the progress callbacks of one build."""

    def __init__(self) -> None:
        self.seen: list[str] = []

    def __call__(self, stage: str, **counts: int) -> None:
        self.seen.append(stage)
        self.counts = counts


def test_a_build_goes_through_every_stage_in_order(tmp_path: Path) -> None:
    builder, _, _, _ = make_builder(tmp_path)
    stages = Stages()
    builder.build(SINTRA, stages)
    assert stages.seen == ["locating", "attractions", "texts", "routes", "saving"]


def test_a_build_saves_the_city_its_places_and_routes_in_one_script(tmp_path: Path) -> None:
    builder, db, _, _ = make_builder(tmp_path)
    result = builder.build(SINTRA, Stages())
    assert (result.slug, result.attractions, result.routes) == ("sintra", 4, 1)
    (sql,) = db.applied
    assert "insert into public.cities" in sql and "'Q131526'" in sql
    assert "insert into public.attractions" in sql and "Sintra is a town." in sql
    assert "About Place Q1" in sql
    assert "delete from public.suggested_routes where city_slug = 'sintra';" in sql
    assert "delete from public.suggested_routes;" not in sql
    assert "insert into public.suggested_route_stops" in sql


def test_the_countrys_row_is_added_only_when_the_database_lacks_it(tmp_path: Path) -> None:
    builder, db, _, _ = make_builder(tmp_path)
    builder.build(SINTRA, Stages())
    assert "insert into public.countries" not in db.applied[0]
    db2 = FakeDatabase()
    db2.countries = set()
    builder2, _, _, _ = make_builder(tmp_path / "b", db=db2)
    builder2.build(SINTRA, Stages())
    assert "insert into public.countries" in db2.applied[0]


def test_places_that_belong_to_another_city_are_left_alone(tmp_path: Path) -> None:
    """``attractions.wikidata_id`` is unique: re-seeding Q1 for Sintra would steal it."""
    db = FakeDatabase(owners={"Q1": "lisbon"})
    builder, _, _, _ = make_builder(tmp_path, db=db)
    result = builder.build(SINTRA, Stages())
    assert result.attractions == 3
    assert "'Q1'" not in db.applied[0].split("insert into public.attractions")[1]


def test_the_new_city_is_remembered_in_the_local_config(tmp_path: Path) -> None:
    builder, _, _, store = make_builder(tmp_path)
    builder.build(SINTRA, Stages())
    (city,) = store.cities()
    assert (city.slug, city.timezone) == ("sintra", "Europe/Lisbon")
    assert (store.directory / "sintra" / "attractions.json").exists()


def test_the_slug_avoids_every_city_the_database_already_has(tmp_path: Path) -> None:
    db = FakeDatabase()
    db.cities.append({"slug": "sintra", "wikidata_id": "Q1", "bbox": [0, 0, 1, 1]})
    builder, _, _, _ = make_builder(tmp_path, db=db)
    assert builder.build(SINTRA, Stages()).slug == "sintra-pt"


def test_a_place_without_wikidata_is_looked_up_by_name(tmp_path: Path) -> None:
    anonymous = Place(**{**SINTRA.__dict__, "wikidata_id": None})
    builder, _, _, _ = make_builder(tmp_path, names=FakeNames(found="Q131526"))
    assert builder.identify(anonymous).wikidata_id == "Q131526"
    builder2, _, _, _ = make_builder(tmp_path / "b", names=FakeNames(found=None))
    assert builder2.identify(anonymous) is None


def test_a_city_with_no_notable_place_is_not_saved(tmp_path: Path) -> None:
    ingester = FakeIngester(lambda city: town_doc(city.slug, count=0))
    builder, db, _, _ = make_builder(tmp_path, ingester=ingester)
    with pytest.raises(BuildError, match="no notable.*Sintra"):
        builder.build(SINTRA, Stages())
    assert db.applied == []


def test_a_country_nobody_seeded_is_refused_with_its_code(tmp_path: Path) -> None:
    foreign = Place(**{**SINTRA.__dict__, "country_code": "ZZ"})
    builder, _, _, _ = make_builder(tmp_path)
    with pytest.raises(BuildError, match="'ZZ'"):
        builder.build(foreign, Stages())


def test_an_area_too_big_to_walk_is_refused_with_its_size(tmp_path: Path) -> None:
    huge = Place(**{**SINTRA.__dict__, "bbox": (30.0, -20.0, 45.0, 5.0)})
    builder, _, ingester, _ = make_builder(tmp_path)
    with pytest.raises(BuildError, match="25.0"):
        builder.build(huge, Stages())
    assert ingester.cities == []


def test_a_database_refusal_surfaces_with_its_message(tmp_path: Path) -> None:
    db = FakeDatabase()
    db.fail_apply = DatabaseError("psql exited 3: violates foreign key")
    builder, _, _, _ = make_builder(tmp_path, db=db)
    with pytest.raises(DatabaseError, match="foreign key"):
        builder.build(SINTRA, Stages())
