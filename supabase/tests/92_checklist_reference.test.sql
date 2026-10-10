-- Checklist reference data (D-054): `checklist_place` returns a city with its country and the
-- traveller's home country in one call, `visa_options_for_city` the visa rules of the city's
-- country for some passports — two reads the Edge Function starts together, instead of three one
-- after another. Service role only. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.countries (code, name_en, name_pt, currency_codes, plug_types, voltage)
values ('ZY', 'Checkland', 'Terra do Check', '{ZYX}', '{C}', 230),
       ('ZX', 'Homeland', 'Terra Natal', '{ZXX}', '{A}', 120);
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, timezone)
values ('checkville', 'Checkville', 'Vila Check', 'ZY', 'Q999999950',
        extensions.st_setsrid(extensions.st_makepoint(2.5, 1.5), 4326)::extensions.geography,
        array[1, 2, 2, 3], 'Europe/Lisbon');
insert into public.visa_requirements (passport, destination, requirement, max_stay_days)
values ('ZX', 'ZY', 'visa_free', 90), ('ZV', 'ZY', 'visa_required', null), ('ZX', 'ZW', 'e_visa', 30);

set local role service_role;

-- 1–4. The city and its countries, as the checklist reads them.
select is(
  public.checklist_place('checkville', 'ZX') -> 'city',
  jsonb_build_object('slug', 'checkville', 'name_en', 'Checkville', 'name_pt', 'Vila Check',
                     'country_code', 'ZY', 'lat', 1.5, 'lng', 2.5, 'timezone', 'Europe/Lisbon'),
  'the city, with its centre as lat/lng');
select is(
  (select array_agg(c ->> 'code' order by c ->> 'code')
     from jsonb_array_elements(public.checklist_place('checkville', 'ZX') -> 'countries') c),
  array['ZX', 'ZY'],
  'its country and the home country');
select is(
  (select array_agg(k order by k)
     from jsonb_object_keys((public.checklist_place('checkville', 'ZX') -> 'countries') -> 0) k),
  array['ambulance_number', 'calling_code', 'code', 'currency_codes', 'driving_side',
        'emergency_number', 'fire_number', 'frequency_hz', 'languages', 'name_en', 'name_pt',
        'plug_types', 'police_number', 'timezones', 'voltage'],
  'each country carries the fields the checklist sections read');
select is(jsonb_array_length(public.checklist_place('checkville', 'ZY') -> 'countries'), 1,
  'a traveller from the city''s own country: one country');

-- 5. An unknown city.
select is(public.checklist_place('atlantis', 'ZX'), null, 'an unknown city is null');

-- 6. The visa rules of the city's country, for the passports asked only.
select results_eq(
  $$select passport::text, requirement::text, max_stay_days
      from public.visa_options_for_city('checkville', array['ZX', 'ZV', 'ZQ']::char(2)[])
     order by 1$$,
  $$values ('ZV', 'visa_required', null::integer), ('ZX', 'visa_free', 90)$$,
  'visa rules of the city''s country for those passports');

-- 7–8. Only the Edge Functions (service role) call them.
reset role;
set local role authenticated;
select throws_ok($$select public.checklist_place('checkville', 'ZX')$$, '42501', null,
  'signed-in users cannot read the checklist place');
select throws_ok($$select * from public.visa_options_for_city('checkville', array['ZX']::char(2)[])$$,
  '42501', null, 'nor the visa rules by city');

select * from finish();
rollback;
