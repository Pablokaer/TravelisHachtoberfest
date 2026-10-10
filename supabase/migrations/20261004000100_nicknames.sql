-- Nicknames (D-048): a unique handle chosen at sign-up. Travellers sign in with it instead of
-- their email, and the walk chat shows it on every message. Emails never leave the database for
-- someone who does not know the password: `login_email_for_nickname` checks the password first.

alter table public.profiles add column nickname text
  constraint profiles_nickname_format check (nickname ~ '^[a-z0-9_]{3,20}$');
alter table public.profiles add constraint profiles_nickname_key unique (nickname);

comment on column public.profiles.nickname is
  'Unique sign-in handle, lowercase a-z 0-9 _ (3–20); null until chosen (OAuth sign-ups: onboarding).';

-- "  Nina_Walks " → "nina_walks": the form every nickname is stored and looked up in.
create or replace function public.normalize_nickname(p_nickname text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(p_nickname));
$$;

-- True when the nickname is valid and nobody else has it (any case); the caller's own nickname
-- counts as available, so saving a profile without changing it passes. Nicknames are public
-- (shown in the chat), so this reveals nothing new.
-- @example select public.nickname_available('Nina_Walks');
create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalize_nickname(p_nickname) ~ '^[a-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles p
        where p.nickname = public.normalize_nickname(p_nickname)
          and p.id is distinct from auth.uid()
     );
$$;

revoke execute on function public.nickname_available from public;
grant execute on function public.nickname_available to anon, authenticated;

-- Sign-up keeps the nickname from the metadata when it is valid and free; otherwise it stays
-- empty instead of failing the whole sign-up (onboarding asks for one).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := public.normalize_nickname(new.raw_user_meta_data ->> 'nickname');
begin
  insert into public.profiles (id, display_name, language, nickname)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name',
                         new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', ''), 80), ''),
    case when new.raw_user_meta_data ->> 'language' = 'pt' then 'pt' else 'en' end,
    case when public.nickname_available(wanted) then wanted end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user from public, anon, authenticated;

-- Failed nickname sign-ins, for the throttle below. No client role can read or write it.
create table public.nickname_login_failures (
  nickname   text not null,
  failed_at  timestamptz not null default now()
);

create index nickname_login_failures_idx on public.nickname_login_failures (nickname, failed_at desc);

alter table public.nickname_login_failures enable row level security;
revoke all on public.nickname_login_failures from public, anon, authenticated;

-- The email to sign in with, for a nickname and its password; null when either is wrong (the
-- same answer, so it cannot tell which). The app then signs in with Supabase Auth as usual. The
-- password is checked here, so without a throttle this would be a way around the Auth rate
-- limit: 10 failures in 15 minutes lock the nickname (errcode P0429) until they age out.
-- @example select public.login_email_for_nickname('nina_walks', 'her password');
create or replace function public.login_email_for_nickname(p_nickname text, p_password text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  nick text := public.normalize_nickname(p_nickname);
  found_email text;
  hash text;
begin
  delete from public.nickname_login_failures f
   where f.nickname = nick and f.failed_at < now() - interval '1 day';
  if (select count(*) from public.nickname_login_failures f
       where f.nickname = nick and f.failed_at > now() - interval '15 minutes') >= 10 then
    raise exception 'too many failed sign-ins for nickname %, expected fewer than 10 in 15 minutes', nick
      using errcode = 'P0429';
  end if;
  select u.email, u.encrypted_password into found_email, hash
    from public.profiles p join auth.users u on u.id = p.id
   where p.nickname = nick;
  if coalesce(hash, '') = '' or extensions.crypt(p_password, hash) <> hash then
    insert into public.nickname_login_failures (nickname) values (nick);
    return null;
  end if;
  delete from public.nickname_login_failures f where f.nickname = nick;
  return found_email;
end;
$$;

revoke execute on function public.login_email_for_nickname from public;
grant execute on function public.login_email_for_nickname to anon, authenticated;

-- The walk chat shows each author's nickname (appended; a new return type needs drop + create).
drop function public.list_walk_messages(uuid, timestamptz, integer);

create or replace function public.list_walk_messages(
  p_trip_id uuid,
  p_before timestamptz default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  author_avatar_path text,
  is_own boolean,
  author_public_id uuid,
  author_nickname text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.body, m.created_at, p.display_name, p.avatar_path, m.user_id = auth.uid(),
         p.public_id, p.nickname
    from public.walk_messages m
    left join public.profiles p on p.id = m.user_id
   where m.trip_id = p_trip_id
     and public.is_walk_chat_member(p_trip_id)
     and (p_before is null or m.created_at < p_before)
   order by m.created_at desc, m.id
   limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function public.list_walk_messages from public, anon;
grant execute on function public.list_walk_messages to authenticated;
