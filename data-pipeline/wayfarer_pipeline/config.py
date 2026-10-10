"""Loading and validation of ``cities.yaml``."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

DEFAULT_CITIES_FILE = Path(__file__).resolve().parent.parent / "cities.yaml"

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class LocalizedName(BaseModel):
    model_config = ConfigDict(extra="forbid")

    en: str = Field(min_length=1)
    pt: str = Field(min_length=1)


class City(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str
    name: LocalizedName
    country_code: str
    wikidata_id: str
    osm_relation_id: int | None = None
    center: tuple[Latitude, Longitude]
    bbox: tuple[Latitude, Longitude, Latitude, Longitude]
    timezone: str | None = None
    is_active: bool = True

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is not None:
            try:
                ZoneInfo(v)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError(f"unknown IANA timezone {v!r}") from exc
        return v

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", v):
            raise ValueError("slug must be lowercase kebab-case")
        return v

    @field_validator("country_code")
    @classmethod
    def _country(cls, v: str) -> str:
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("country_code must be ISO-3166-1 alpha-2 (uppercase)")
        return v

    @field_validator("wikidata_id")
    @classmethod
    def _qid(cls, v: str) -> str:
        if not re.fullmatch(r"Q[1-9][0-9]*", v):
            raise ValueError("wikidata_id must look like Q123")
        return v

    @model_validator(mode="after")
    def _bbox_contains_center(self) -> City:
        south, west, north, east = self.bbox
        if not (south < north and west < east):
            raise ValueError("bbox must be [south, west, north, east] with south<north, west<east")
        lat, lon = self.center
        if not (south <= lat <= north and west <= lon <= east):
            raise ValueError("center must lie inside bbox")
        return self


class CitiesConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    cities: list[City] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self) -> CitiesConfig:
        for attr in ("slug", "wikidata_id"):
            values = [getattr(c, attr) for c in self.cities]
            dupes = {v for v in values if values.count(v) > 1}
            if dupes:
                raise ValueError(f"duplicate {attr}: {sorted(dupes)}")
        return self

    def get(self, slug: str) -> City:
        for city in self.cities:
            if city.slug == slug:
                return city
        known = ", ".join(c.slug for c in self.cities)
        raise KeyError(f"unknown city '{slug}'. Known cities: {known}")


def load_cities(path: Path | str = DEFAULT_CITIES_FILE) -> CitiesConfig:
    with open(path, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return CitiesConfig.model_validate(raw)
