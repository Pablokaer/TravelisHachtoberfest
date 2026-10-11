-- Visited attractions (D-085): the places a traveller marks "I have been here" on an attraction's
-- page. Suggested routes then leave them out of the way: a place already seen is not a priority,
-- however close it is. One row per user and attraction; private to its owner (an anonymous
-- local-mode account counts as a user, D-078).
create table public.visited_attractions (
  user_id       uuid not null references auth.users (id) on delete cascade,
  attraction_id uuid not null references public.attractions (id) on delete cascade,
  visited_at    timestamptz not null default now(),
  primary key (user_id, attraction_id)
);

comment on table public.visited_attractions is
  'Attractions a traveller marked as visited (D-085). Owner-only.';

create index visited_attractions_attraction_idx on public.visited_attractions (attraction_id);

alter table public.visited_attractions enable row level security;

create policy "own visited: select" on public.visited_attractions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own visited: insert" on public.visited_attractions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own visited: delete" on public.visited_attractions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Supabase grants new public tables to anon by default; this one is for signed-in users only.
-- There is no update: a mark is added or removed, never edited. Revoking from `authenticated`
-- too drops the default grants Supabase gives new tables, so only the three below remain.
revoke all on public.visited_attractions from anon, authenticated;
grant select, insert, delete on public.visited_attractions to authenticated;
