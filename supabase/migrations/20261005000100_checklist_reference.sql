-- Checklist reference data (D-054): the `checklist` Edge Function read the city, then its
-- countries, then the visa rules — three round trips one after another. Now it starts two reads
-- together: `checklist_place` (the city with its country and the traveller's home country) and
-- `visa_options_for_city` (looked up by city, so it does not wait for the first). The visa read
-- stays separate so that, as before, its failure only marks the visa section unavailable.
-- Service role only: the Edge Function calls them with the service key.

-- The city and its countries as one JSON value: {"city": {...}, "countries": [...]}, null for an
-- unknown city. The fields are the ones the checklist sections read.
-- @example select public.checklist_place('lisbon', 'BR') -> 'city' ->> 'timezone';
create or replace function public.checklist_place(p_city text, p_home char(2))
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'city', jsonb_build_object(
      'slug', c.slug,
      'name_en', c.name_en,
      'name_pt', c.name_pt,
      'country_code', c.country_code,
      'lat', extensions.st_y(c.center::extensions.geometry),
      'lng', extensions.st_x(c.center::extensions.geometry),
      'timezone', c.timezone),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', co.code,
        'name_en', co.name_en,
        'name_pt', co.name_pt,
        'currency_codes', co.currency_codes,
        'plug_types', co.plug_types,
        'voltage', co.voltage,
        'frequency_hz', co.frequency_hz,
        'driving_side', co.driving_side,
        'calling_code', co.calling_code,
        'emergency_number', co.emergency_number,
        'police_number', co.police_number,
        'ambulance_number', co.ambulance_number,
        'fire_number', co.fire_number,
        'languages', co.languages,
        'timezones', co.timezones))
        from public.countries co
       where co.code in (c.country_code, p_home)), '[]'::jsonb))
    from public.cities c
   where c.slug = p_city;
$$;

-- The visa rules of the city's country for each of the given passports.
-- @example select * from public.visa_options_for_city('lisbon', array['BR', 'US']::char(2)[]);
create or replace function public.visa_options_for_city(p_city text, p_passports char(2)[])
returns table (passport char(2), requirement public.visa_requirement, max_stay_days integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.passport, v.requirement, v.max_stay_days
    from public.cities c
    join public.visa_requirements v on v.destination = c.country_code
   where c.slug = p_city and v.passport = any (p_passports);
$$;

revoke execute on function public.checklist_place(text, char) from public, anon, authenticated;
revoke execute on function public.visa_options_for_city(text, char[]) from public, anon, authenticated;
grant execute on function public.checklist_place(text, char) to service_role;
grant execute on function public.visa_options_for_city(text, char[]) to service_role;
