"""Semantic + keyword search of attractions on pgvector (D-084).

``embed_missing`` writes one 768-dimension vector per attraction with a local Ollama embedding
model (nothing leaves the machine); ``SemanticSearch`` embeds a query and asks the database's
``search_attractions_hybrid`` for the fusion of the vector and full-text rankings.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol

from ..routes.ollama import OllamaTransport
from ..sql import quote
from .errors import IntegrationError

DIMENSIONS = 768  # nomic-embed-text; the column in 20261012000100_attraction_embeddings.sql
DEFAULT_EMBED_MODEL = "nomic-embed-text"
EMBED_BATCH = 32


class Embedder(Protocol):
    name: str

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class EmbeddingDatabase(Protocol):
    def rows(self, select: str) -> list[dict[str, Any]]: ...

    def apply(self, sql: str) -> None: ...


def attraction_text(row: dict[str, Any]) -> str:
    """What is embedded for an attraction: name, category and the Wikidata description.

    >>> attraction_text({"name_en": "Pena Palace", "category": "castle", "description_en": None})
    'Pena Palace. castle'
    """
    parts = [row["name_en"], row["category"], row.get("description_en")]
    return ". ".join(str(part) for part in parts if part)


def vector_literal(vector: Sequence[float]) -> str:
    """A pgvector value as SQL text: ``'[0.5,1.0]'::extensions.vector``."""
    return "'[" + ",".join(repr(float(x)) for x in vector) + "]'::extensions.vector"


class OllamaEmbedder:
    """``POST /api/embed`` on a local Ollama; refuses vectors that do not fit the column."""

    def __init__(self, model: str, base_url: str, transport: OllamaTransport) -> None:
        self.name, self.base_url, self.transport = model, base_url.rstrip("/"), transport

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        reply = self.transport.post_json(
            f"{self.base_url}/api/embed", {"model": self.name, "input": list(texts)}
        )
        vectors = reply.get("embeddings", [])
        if len(vectors) != len(texts):
            raise IntegrationError(f"got {len(vectors)} vectors for {len(texts)} texts")
        for vector in vectors:
            if len(vector) != DIMENSIONS:
                raise IntegrationError(
                    f"model {self.name!r} returned {len(vector)} dimensions; expected {DIMENSIONS}"
                )
        return vectors


def _missing_select(limit: int) -> str:
    return (
        "select a.id, a.name_en, a.category, a.description_en from public.attractions a "
        "left join public.attraction_embeddings e on e.attraction_id = a.id "
        f"where e.attraction_id is null order by a.popularity desc limit {int(limit)}"
    )


def _upsert(rows: Sequence[dict[str, Any]], vectors: Sequence[Sequence[float]], model: str) -> str:
    values = ",\n".join(
        f"({quote(str(row['id']))}::uuid, {quote(model)}, {vector_literal(vector)})"
        for row, vector in zip(rows, vectors, strict=True)
    )
    return (
        "insert into public.attraction_embeddings (attraction_id, model, embedding) values\n"
        f"{values}\non conflict (attraction_id) do update set model = excluded.model, "
        "embedding = excluded.embedding, updated_at = now();"
    )


def embed_missing(db: EmbeddingDatabase, embedder: Embedder, limit: int) -> int:
    """Embeds up to ``limit`` attractions that have no vector yet (most popular first); returns
    how many were written. Run it again until it returns 0.

    >>> embed_missing(db, OllamaEmbedder("nomic-embed-text", url, transport), limit=200)  # 200
    """
    rows = db.rows(_missing_select(limit))
    for start in range(0, len(rows), EMBED_BATCH):
        batch = rows[start : start + EMBED_BATCH]
        vectors = embedder.embed([attraction_text(row) for row in batch])
        db.apply(_upsert(batch, vectors, embedder.name))
    return len(rows)


class SemanticSearch:
    """>>> SemanticSearch(db, embedder).search("quiet garden with a view", "sintra", 5)"""

    def __init__(self, db: EmbeddingDatabase, embedder: Embedder) -> None:
        self.db, self.embedder = db, embedder

    def search(self, query: str, city_slug: str | None, limit: int) -> list[dict[str, Any]]:
        vector = self.embedder.embed([query])[0]
        city = quote(city_slug) if city_slug else "null"
        select = (
            f"select * from public.search_attractions_hybrid({quote(query)}, "
            f"{vector_literal(vector)}, {city}, {int(limit)})"
        )
        return self.db.rows(select)
