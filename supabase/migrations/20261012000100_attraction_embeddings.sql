-- D-084: semantic + keyword search of attractions with pgvector.
-- The pipeline's `embed` command fills attraction_embeddings with a local Ollama embedding model
-- (nomic-embed-text, 768 dimensions); search_attractions_hybrid fuses the vector ranking with a
-- full-text ranking (reciprocal rank fusion), so "quiet gardens with a view" finds places whose
-- text never says those words and an exact name still ranks first.

create extension if not exists vector with schema extensions;

create table public.attraction_embeddings (
  attraction_id uuid primary key references public.attractions (id) on delete cascade,
  model         text not null,
  embedding     extensions.vector(768) not null,
  updated_at    timestamptz not null default now()
);

create index attraction_embeddings_cosine_idx
  on public.attraction_embeddings using hnsw (embedding extensions.vector_cosine_ops);

alter table public.attraction_embeddings enable row level security;
-- Derived from public reference data, like the attractions themselves: readable by everyone,
-- written only by the pipeline (service role / psql), never by the app.
create policy attraction_embeddings_read on public.attraction_embeddings
  for select using (true);

create or replace function public.search_attractions_hybrid(
  query_text      text,
  query_embedding extensions.vector(768),
  in_city         text default null,
  match_count     integer default 10
)
returns table (
  id           uuid,
  city_slug    text,
  name_en      text,
  category     public.attraction_category,
  score        double precision,
  vector_pos   integer,
  keyword_pos  integer
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with semantic as (
    select e.attraction_id,
           row_number() over (order by e.embedding <=> query_embedding) as pos
      from public.attraction_embeddings e
      join public.attractions a on a.id = e.attraction_id
     where in_city is null or a.city_slug = in_city
     order by e.embedding <=> query_embedding
     limit 40
  ),
  keyword as (
    select a.id as attraction_id,
           row_number() over (
             order by ts_rank_cd(
               to_tsvector('simple', a.name_en || ' ' || coalesce(a.description_en, '')),
               websearch_to_tsquery('simple', query_text)) desc) as pos
      from public.attractions a
     where (in_city is null or a.city_slug = in_city)
       and to_tsvector('simple', a.name_en || ' ' || coalesce(a.description_en, ''))
           @@ websearch_to_tsquery('simple', query_text)
     limit 40
  )
  select a.id, a.city_slug, a.name_en, a.category,
         (coalesce(1.0 / (60 + s.pos), 0) + coalesce(1.0 / (60 + k.pos), 0))::double precision,
         s.pos::integer,
         k.pos::integer
    from public.attractions a
    left join semantic s on s.attraction_id = a.id
    left join keyword k on k.attraction_id = a.id
   where s.attraction_id is not null or k.attraction_id is not null
   order by 5 desc
   limit least(greatest(match_count, 1), 25);
$$;

grant execute on function public.search_attractions_hybrid(text, extensions.vector, text, integer)
  to anon, authenticated;
