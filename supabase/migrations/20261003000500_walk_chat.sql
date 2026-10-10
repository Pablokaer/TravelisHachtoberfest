-- Walk list group chat (D-043): the organiser of a walk list and everyone going to it
-- (`walk_attendees`, D-041) share a chat. Messages arrive instantly through Supabase Realtime,
-- which applies the same select policy to each subscriber. Messages cannot be edited or deleted.

create table public.walk_messages (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index walk_messages_trip_created_idx on public.walk_messages (trip_id, created_at desc);
create index walk_messages_user_idx on public.walk_messages (user_id);

-- Messages are stored trimmed, so a blank one fails the length check.
create or replace function public.trim_walk_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  return new;
end;
$$;

revoke execute on function public.trim_walk_message from public, anon, authenticated;

create trigger walk_messages_trim before insert on public.walk_messages
  for each row execute function public.trim_walk_message();

-- True when the caller is in the trip's chat: its organiser, or going to it while it is public.
-- Security definer because trips and attendance are owner-only under RLS; one boolean.
-- @example select public.is_walk_chat_member('<trip id>');
create or replace function public.is_walk_chat_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
     where t.id = p_trip_id
       and (t.user_id = auth.uid()
            or (t.visibility = 'public'
                and exists (select 1 from public.walk_attendees wa
                             where wa.trip_id = t.id and wa.user_id = auth.uid())))
  );
$$;

revoke execute on function public.is_walk_chat_member from public, anon;
grant execute on function public.is_walk_chat_member to authenticated;

alter table public.walk_messages enable row level security;

create policy "walk chat: members read" on public.walk_messages
  for select to authenticated using (public.is_walk_chat_member(trip_id));
create policy "walk chat: members write as themselves" on public.walk_messages
  for insert to authenticated with check (
    (select auth.uid()) = user_id and public.is_walk_chat_member(trip_id)
  );

revoke all on public.walk_messages from anon;
revoke update, delete on public.walk_messages from authenticated;

-- Instant delivery: Realtime streams inserts to subscribed members (RLS-checked per subscriber).
alter publication supabase_realtime add table public.walk_messages;

-- The newest messages of a chat (up to 200, older ones with p_before), each with its author's
-- public name and photo. Members only; security definer only to read those profile fields.
-- @example select * from public.list_walk_messages('<trip id>', p_limit => 50);
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
  is_own boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.body, m.created_at, p.display_name, p.avatar_path, m.user_id = auth.uid()
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
