"""The ``climate`` and ``facts`` commands: resumable runs, one failure does not stop the rest."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from local_fakes import FakeDatabase
from test_climate import FakeOpenMeteo, archive
from test_facts import FakeOverpass, FakeWikidata, _lit, _uri

from wayfarer_pipeline import city_data_commands as commands
from wayfarer_pipeline import cli, climate, facts
from wayfarer_pipeline.config import City, LocalizedName


def cities() -> list[City]:
    def make(slug: str, qid: str) -> City:
        return City(
            slug=slug,
            name=LocalizedName(en=slug.title(), pt=slug.title()),
            country_code="PT",
            wikidata_id=qid,
            center=(38.72, -9.14),
            bbox=(38.6, -9.3, 38.8, -9.0),
        )

    return [make("lisbon", "Q597"), make("porto", "Q36433")]


class FlakyOpenMeteo(FakeOpenMeteo):
    """Fails for one latitude, like a throttled request."""

    def __init__(self, doc: dict[str, Any], fail_slug_lat: float) -> None:
        super().__init__(doc)
        self.fail_lat = fail_slug_lat

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        if kwargs["params"]["latitude"] == self.fail_lat:
            raise RuntimeError("HTTP 503: Open-Meteo is down")
        return super().request(method, url, **kwargs)


def test_climate_writes_one_snapshot_per_city(tmp_path: Path) -> None:
    client = FakeOpenMeteo(archive())
    result = commands.run_climate(client, cities(), tmp_path)
    assert sorted(p.name for p in tmp_path.glob("*.json")) == ["lisbon.json", "porto.json"]
    assert result.failed == [] and result.written == ["lisbon", "porto"]


def test_a_second_run_keeps_the_snapshots_and_asks_nothing(tmp_path: Path) -> None:
    commands.run_climate(FakeOpenMeteo(archive()), cities(), tmp_path)
    client = FakeOpenMeteo(archive())
    result = commands.run_climate(client, cities(), tmp_path)
    assert client.requests == [] and result.kept == ["lisbon", "porto"]
    again = commands.run_climate(client, cities(), tmp_path, refresh=True)
    assert len(client.requests) == 2 and again.written == ["lisbon", "porto"]


def test_one_failed_city_is_reported_and_the_rest_are_written(tmp_path: Path) -> None:
    pair = cities()
    pair[0] = pair[0].model_copy(update={"center": (1.0, 2.0)})
    client = FlakyOpenMeteo(archive(), fail_slug_lat=1.0)
    result = commands.run_climate(client, pair, tmp_path)
    assert result.written == ["porto"]
    assert result.failed == [("lisbon", "RuntimeError: HTTP 503: Open-Meteo is down")]


def test_facts_asks_wikidata_once_and_overpass_per_city(tmp_path: Path) -> None:
    wikidata = FakeWikidata(
        [
            {"item": _uri("Q597"), "pop": _lit("545000")},
            {"item": _uri("Q36433"), "pop": _lit("231000")},
        ]
    )
    overpass = FakeOverpass(total=4)
    result = commands.run_facts(wikidata, overpass, cities(), tmp_path)
    assert result.written == ["lisbon", "porto"] and len(wikidata.queries) == 1
    assert len(overpass.requests) == 2
    assert facts.load_all(tmp_path)["porto"]["population"] == 231000


def test_facts_skip_kept_cities_before_asking_wikidata(tmp_path: Path) -> None:
    commands.run_facts(FakeWikidata([]), FakeOverpass(total=1), cities(), tmp_path)
    wikidata = FakeWikidata([])
    result = commands.run_facts(wikidata, FakeOverpass(total=1), cities(), tmp_path)
    assert wikidata.queries == [] and result.kept == ["lisbon", "porto"]


def test_a_failed_overpass_city_is_reported(tmp_path: Path) -> None:
    class Down:
        def request(self, *args: Any, **kwargs: Any) -> tuple[int, str]:
            raise RuntimeError("Overpass answered HTTP 504")

    result = commands.run_facts(FakeWikidata([]), Down(), cities(), tmp_path)
    assert result.written == [] and [slug for slug, _ in result.failed] == ["lisbon", "porto"]


def test_the_summary_names_what_happened() -> None:
    result = commands.RunResult(written=["a"], kept=["b", "c"], failed=[("d", "x")])
    assert result.line("climate") == "climate: 1 written, 2 kept, 1 failed"


def test_commands_are_registered_with_city_selection_and_refresh() -> None:
    args = cli.build_parser().parse_args(["climate", "--all", "--refresh"])
    assert args.all and args.refresh and not args.local
    args = cli.build_parser().parse_args(["facts", "--city", "lisbon", "--local"])
    assert args.city == "lisbon" and args.local
    assert args.db_url.startswith("postgresql://")


def test_local_cities_are_loaded_into_the_database(tmp_path: Path) -> None:
    db = FakeDatabase()
    commands.run_climate(FakeOpenMeteo(archive()), cities()[:1], tmp_path)
    commands.load_into_database(db, climate.load_all(tmp_path), {})
    assert "insert into public.city_climate" in db.applied[0]
    assert "insert into public.city_facts" not in db.applied[0]


def test_nothing_is_applied_when_there_is_nothing_to_load() -> None:
    db = FakeDatabase()
    commands.load_into_database(db, {}, {})
    assert db.applied == []


@pytest.mark.parametrize("name", ["70_city_climate.sql", "80_city_facts.sql"])
def test_the_seed_readme_lists_the_new_files(name: str) -> None:
    from wayfarer_pipeline import seed

    assert name in seed.README_SQL


class QuotaOpenMeteo(FakeOpenMeteo):
    """Answers twice, then reports the day's quota used up."""

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        if len(self.requests) >= 2:
            self.requests.append((url, kwargs["params"]))
            raise RuntimeError(
                "HTTP 429: Daily API request limit exceeded. Please try again tomorrow."
            )
        return super().request(method, url, **kwargs)


def test_a_used_up_daily_quota_stops_the_run_and_it_resumes_later(tmp_path: Path) -> None:
    many = [cities()[0].model_copy(update={"slug": f"c{i}"}) for i in range(6)]
    client = QuotaOpenMeteo(archive())
    result = commands.run_climate(client, many, tmp_path)
    assert result.written == ["c0", "c1"]
    assert [slug for slug, _ in result.failed] == ["c2"]
    assert len(client.requests) == 3  # the other cities were not even tried
    resumed = commands.run_climate(FakeOpenMeteo(archive()), many, tmp_path)
    assert resumed.kept == ["c0", "c1"] and resumed.written == ["c2", "c3", "c4", "c5"]


def test_the_climate_command_takes_a_first_year() -> None:
    args = cli.build_parser().parse_args(["climate", "--all", "--first-year", "2022"])
    assert args.first_year == 2022
    assert cli.build_parser().parse_args(["climate", "--all"]).first_year == 2015


class HourlyOpenMeteo(FakeOpenMeteo):
    """Reports the hourly quota used up for the first ``blocked`` requests."""

    def __init__(self, doc: dict[str, Any], blocked: int) -> None:
        super().__init__(doc)
        self.blocked, self.asked = blocked, 0

    def request(self, method: str, url: str, **kwargs: Any) -> tuple[int, str]:
        self.asked += 1
        if self.asked <= self.blocked:
            raise RuntimeError("HTTP 429: Hourly API request limit exceeded. Try the next hour.")
        return super().request(method, url, **kwargs)


def test_an_hourly_quota_is_waited_out_and_the_same_city_is_retried(tmp_path: Path) -> None:
    waits: list[float] = []
    client = HourlyOpenMeteo(archive(), blocked=2)
    result = commands.run_climate(client, cities()[:1], tmp_path, sleep=waits.append)
    assert result.written == ["lisbon"] and result.failed == []
    assert waits == [commands.QUOTA_WAIT_SECONDS] * 2


def test_an_hourly_quota_that_never_clears_gives_up_on_that_city(tmp_path: Path) -> None:
    waits: list[float] = []
    client = HourlyOpenMeteo(archive(), blocked=10_000)
    result = commands.run_climate(client, cities()[:1], tmp_path, sleep=waits.append)
    assert [slug for slug, _ in result.failed] == ["lisbon"]
    assert len(waits) == commands.QUOTA_MAX_WAITS


def test_a_shard_takes_every_nth_city() -> None:
    many = [cities()[0].model_copy(update={"slug": f"c{i}"}) for i in range(7)]
    assert [c.slug for c in commands.shard(many, "1/3")] == ["c0", "c3", "c6"]
    assert [c.slug for c in commands.shard(many, "3/3")] == ["c2", "c5"]
    assert commands.shard(many, None) == many


@pytest.mark.parametrize("bad", ["0/2", "3/2", "a/b", "2", "1/0"])
def test_a_bad_shard_is_refused_with_its_value(bad: str) -> None:
    with pytest.raises(SystemExit, match=bad):
        commands.shard(cities(), bad)


def test_commands_take_a_shard() -> None:
    args = cli.build_parser().parse_args(["facts", "--all", "--shard", "2/3"])
    assert args.shard == "2/3"
