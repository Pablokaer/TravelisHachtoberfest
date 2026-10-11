"""Embeddings of attractions and hybrid search (pgvector, D-084), with a fake model and database."""

from __future__ import annotations

from typing import Any

import pytest
from integration_fakes import FakeOllamaTransport

from wayfarer_pipeline.integrations.errors import IntegrationError
from wayfarer_pipeline.integrations.semantic import (
    DIMENSIONS,
    OllamaEmbedder,
    SemanticSearch,
    attraction_text,
    embed_missing,
    vector_literal,
)

VECTOR = [0.5] * DIMENSIONS


class FakeEmbeddingDb:
    """Answers the two selects of the semantic module and keeps the scripts it is given."""

    def __init__(self, missing: list[dict[str, Any]], hits: list[dict[str, Any]] | None = None):
        self.missing, self.hits, self.applied, self.selects = missing, hits or [], [], []

    def rows(self, select: str) -> list[dict[str, Any]]:
        self.selects.append(select)
        return (
            self.missing
            if "attraction_embeddings" in select and "left join" in select
            else self.hits
        )

    def apply(self, sql: str) -> None:
        self.applied.append(sql)


def embedder(vectors: list[list[float]]) -> tuple[OllamaEmbedder, FakeOllamaTransport]:
    transport = FakeOllamaTransport({"embeddings": vectors})
    return OllamaEmbedder("nomic-embed-text", "http://localhost:11434", transport), transport


def test_the_text_to_embed_joins_name_category_and_description() -> None:
    row = {"name_en": "Pena Palace", "category": "castle", "description_en": "A romantic palace"}
    assert attraction_text(row) == "Pena Palace. castle. A romantic palace"


def test_a_missing_description_is_left_out_not_written_as_none() -> None:
    row = {"name_en": "Old Gate", "category": "monument", "description_en": None}
    assert attraction_text(row) == "Old Gate. monument"


def test_the_embedder_posts_to_ollama_embed_and_returns_the_vectors() -> None:
    model, transport = embedder([VECTOR, VECTOR])
    assert model.embed(["a", "b"]) == [VECTOR, VECTOR]
    url, payload = transport.posts[0]
    assert url == "http://localhost:11434/api/embed"
    assert payload == {"model": "nomic-embed-text", "input": ["a", "b"]}


def test_a_vector_of_the_wrong_size_is_refused_naming_both_sizes() -> None:
    model, _ = embedder([[0.1, 0.2]])
    with pytest.raises(IntegrationError, match=f"2.*{DIMENSIONS}"):
        model.embed(["a"])


def test_the_literal_is_a_pgvector_text_value() -> None:
    assert vector_literal([0.5, 1.0]) == "'[0.5,1.0]'::extensions.vector"


def test_embed_missing_writes_one_upsert_for_the_batch_and_counts_it() -> None:
    rows = [
        {"id": "id-1", "name_en": "Pena", "category": "castle", "description_en": None},
        {"id": "id-2", "name_en": "Quinta", "category": "park", "description_en": "Garden"},
    ]
    db = FakeEmbeddingDb(rows)
    model, _ = embedder([VECTOR, VECTOR])
    assert embed_missing(db, model, limit=50) == 2
    script = db.applied[0]
    assert script.count("insert into public.attraction_embeddings") == 1
    assert "'id-1'" in script and "'id-2'" in script
    assert "on conflict (attraction_id) do update" in script


def test_embed_missing_with_nothing_to_do_writes_nothing() -> None:
    db = FakeEmbeddingDb([])
    model, transport = embedder([])
    assert embed_missing(db, model, limit=50) == 0
    assert db.applied == [] and transport.posts == []


def test_search_embeds_the_query_and_calls_the_hybrid_function_with_the_city() -> None:
    hits = [{"id": "id-1", "name_en": "Quinta", "score": 0.03}]
    db = FakeEmbeddingDb([], hits)
    model, transport = embedder([VECTOR])
    found = SemanticSearch(db, model).search("quiet garden with a view", "sintra", 5)
    assert found == hits
    assert transport.posts[0][1]["input"] == ["quiet garden with a view"]
    select = db.selects[-1]
    assert "search_attractions_hybrid('quiet garden with a view'" in select
    assert "'sintra'" in select and select.rstrip().endswith("5)")


def test_a_quote_in_the_query_is_doubled_not_executed() -> None:
    db = FakeEmbeddingDb([])
    model, _ = embedder([VECTOR])
    SemanticSearch(db, model).search("o'clock'); drop table x; --", None, 5)
    assert "'o''clock''); drop table x; --'" in db.selects[-1]
