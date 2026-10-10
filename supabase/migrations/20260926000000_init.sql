-- M0: base extensions and helpers. Domain tables arrive in M1 (profiles) and M2 (reference data).

-- PostGIS lives in the `extensions` schema (Supabase convention) to keep `public` clean.
create extension if not exists postgis with schema extensions;

-- Keeps `updated_at` current on every table that has one.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper: sets updated_at = now() on UPDATE. Attach with BEFORE UPDATE FOR EACH ROW.';
