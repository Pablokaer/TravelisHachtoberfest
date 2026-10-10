-- Avoided countries (D-082): a list on the profile that its owner changes and nobody else sees.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'cy@example.test'),
       ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'di@example.test');

select is(
  (select avoid_countries from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  '{}'::char(2)[], 'a new profile avoids no country'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select lives_ok(
  $$ update public.profiles set avoid_countries = array['MT', 'IT']
      where id = '00000000-0000-0000-0000-0000000000d1' $$,
  'a traveller saves the countries they do not want'
);
select is(
  (select avoid_countries from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  array['MT', 'IT']::char(2)[], 'and reads them back'
);
select throws_ok(
  $$ update public.profiles set avoid_countries = array(select 'AA' from generate_series(1, 41))
      where id = '00000000-0000-0000-0000-0000000000d1' $$,
  '23514', null, 'at most 40 countries'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  0, 'another traveller cannot see them'
);

select * from finish();
rollback;
