-- pgTAP smoke tests for the base schema. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_extension('postgis', 'PostGIS is installed');
select has_function('public', 'set_updated_at', 'set_updated_at() helper exists');

-- Geography maths works (Lisbon → Porto is ~274 km as the crow flies).
select ok(
  extensions.st_distance(
    extensions.st_makepoint(-9.139016, 38.708042)::extensions.geography,
    extensions.st_makepoint(-8.610833, 41.15)::extensions.geography
  ) between 270000 and 280000,
  'PostGIS geography distance is sane'
);

-- Every table in public must have RLS enabled (guards all future migrations).
select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity $$,
  'RLS is enabled on every public table'
);

select * from finish();
rollback;
