-- Trip (walk list) visibility (D-031): private (owner only, the default), public (anyone with
-- the link, signed in or not) or password (anyone with the link and the password).
-- The trips table stays owner-only; others read a trip only through `shared_trip`.

alter table public.trips add column visibility text not null default 'private'
  check (visibility in ('private', 'public', 'password'));

-- Password hashes (bcrypt) live apart from trips so no client role can ever select them:
-- RLS is on with no policies and no grants; only the security definer functions below use it.
create table public.trip_passwords (
  trip_id        uuid primary key references public.trips (id) on delete cascade,
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

alter table public.trip_passwords enable row level security;
revoke all on public.trip_passwords from public, anon, authenticated;

-- Leaving "password" (through the RPC or a direct update) forgets the password, so protecting
-- the trip again always needs a new one.
create or replace function public.forget_trip_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.visibility = 'password' and new.visibility <> 'password' then
    delete from public.trip_passwords where trip_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.forget_trip_password from public, anon, authenticated;

create trigger trips_forget_password after update of visibility on public.trips
  for each row execute function public.forget_trip_password();

-- Sets the caller's trip visibility. With 'password', p_password (4–72 characters; bcrypt reads
-- at most 72 bytes) is required unless the trip already has one, which is then kept.
-- @example select public.set_trip_visibility('<trip id>', 'password', 'lisbon24');
create or replace function public.set_trip_visibility(
  p_trip_id uuid,
  p_visibility text,
  p_password text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_visibility text;
begin
  select t.visibility into current_visibility
    from public.trips t
   where t.id = p_trip_id and t.user_id = auth.uid();
  if not found then
    raise exception 'trip % not found for the caller', p_trip_id using errcode = 'P0002';
  end if;
  if p_visibility not in ('private', 'public', 'password') then
    raise exception 'visibility must be private, public or password, got %', p_visibility
      using errcode = '22023';
  end if;

  if p_visibility = 'password' and p_password is null and current_visibility <> 'password' then
    raise exception 'a password is required to protect trip %', p_trip_id using errcode = '22023';
  end if;
  if p_visibility = 'password' and p_password is not null then
    if char_length(p_password) not between 4 and 72 then
      raise exception 'a trip password needs 4 to 72 characters, got %', char_length(p_password)
        using errcode = '22023';
    end if;
    insert into public.trip_passwords (trip_id, password_hash)
    values (p_trip_id, extensions.crypt(p_password, extensions.gen_salt('bf')))
    on conflict (trip_id) do update set password_hash = excluded.password_hash, created_at = now();
  end if;

  update public.trips set visibility = p_visibility where id = p_trip_id;
end;
$$;

revoke execute on function public.set_trip_visibility from public, anon;
grant execute on function public.set_trip_visibility to authenticated;

-- A trip opened by link, for anyone (anon included). Returns {"status": …}:
--   ok                 → also "trip" (fields below, stop_ids in order, is_owner)
--   not_found          → missing, or private and the caller is not the owner (not revealed)
--   password_required  → protected and no password given
--   wrong_password     → protected and the password does not match
-- The owner always gets "ok".
-- @example select public.shared_trip('<trip id>', 'lisbon24') ->> 'status';
create or replace function public.shared_trip(p_trip_id uuid, p_password text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.trips;
  is_owner boolean;
  hash text;
begin
  select * into t from public.trips where id = p_trip_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- Signed out, auth.uid() is null: without coalesce `not is_owner` is null and skips the checks.
  is_owner := coalesce(t.user_id = auth.uid(), false);

  if not is_owner and t.visibility = 'private' then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not is_owner and t.visibility = 'password' then
    if p_password is null then
      return jsonb_build_object('status', 'password_required');
    end if;
    select password_hash into hash from public.trip_passwords where trip_id = t.id;
    if hash is null or extensions.crypt(p_password, hash) <> hash then
      return jsonb_build_object('status', 'wrong_password');
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'trip', jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'city_slug', t.city_slug,
    'trip_date', t.trip_date,
    'route_geometry', t.route_geometry,
    'distance_m', t.distance_m,
    'walking_seconds', t.walking_seconds,
    'visit_minutes', t.visit_minutes,
    'is_fallback', t.is_fallback,
    'provider', t.provider,
    'visibility', t.visibility,
    'created_at', t.created_at,
    'is_owner', is_owner,
    'stop_ids', coalesce(
      (select jsonb_agg(s.attraction_id order by s.position)
         from public.trip_stops s where s.trip_id = t.id),
      '[]'::jsonb)
  ));
end;
$$;

revoke execute on function public.shared_trip from public;
grant execute on function public.shared_trip to anon, authenticated;
