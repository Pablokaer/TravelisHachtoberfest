-- Walk list participation and group chat as one flow (D-044, revising D-041 and D-043):
--  * "I'm going" works on any public walk list of someone else — with or without a date and
--    time, before or after its start — so every public list can gather people in its chat.
--  * Joining and leaving go through `set_walk_attendance`, idempotent: repeating a request never
--    fails and never duplicates a participant (the primary key guards concurrent joins too).
--  * The chat has one identity, the walk list itself (`walk_messages.trip_id`): there is no chat
--    row to create, so two people joining at once cannot create two chats.
--  * Members see who is in the chat (`list_walk_participants`).

-- True when the caller may join the trip: it is public and not theirs. Security definer because
-- trips are owner-only under RLS; it reveals one boolean.
create or replace function public.walk_open_to_join(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
     where t.id = p_trip_id and t.visibility = 'public' and t.user_id <> auth.uid()
  );
$$;

revoke execute on function public.walk_open_to_join from public, anon;
grant execute on function public.walk_open_to_join to authenticated;

drop policy "own attendance: insert" on public.walk_attendees;
create policy "own attendance: insert" on public.walk_attendees
  for insert to authenticated with check (
    (select auth.uid()) = user_id and public.walk_open_to_join(trip_id)
  );

drop function public.meetup_open_to_caller(uuid);

-- Joins (true) or leaves (false) a walk list and returns the caller's state and the number of
-- participants. Idempotent. Errors: 28000 signed out; 42501 when joining a list that is private,
-- the caller's own, or missing. Leaving is always allowed.
-- @example select public.set_walk_attendance('<trip id>', true); -- {"is_attending": true, "attendee_count": 3}
create or replace function public.set_walk_attendance(p_trip_id uuid, p_attending boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_attending then
    if not public.walk_open_to_join(p_trip_id) then
      raise exception 'walk list % cannot be joined: only other travellers'' public lists can',
        p_trip_id using errcode = '42501';
    end if;
    insert into public.walk_attendees (trip_id, user_id) values (p_trip_id, auth.uid())
      on conflict (trip_id, user_id) do nothing;
  else
    delete from public.walk_attendees where trip_id = p_trip_id and user_id = auth.uid();
  end if;
  return jsonb_build_object(
    'is_attending', exists (select 1 from public.walk_attendees
                             where trip_id = p_trip_id and user_id = auth.uid()),
    'attendee_count', (select count(*) from public.walk_attendees where trip_id = p_trip_id)
  );
end;
$$;

revoke execute on function public.set_walk_attendance from public, anon;
grant execute on function public.set_walk_attendance to authenticated;

-- The people in a walk list's chat: the organiser first, then participants in the order they
-- joined, with public name and photo. Members only (else no rows); security definer only to read
-- those profile fields.
-- @example select * from public.list_walk_participants('<trip id>');
create or replace function public.list_walk_participants(p_trip_id uuid)
returns table (name text, avatar_path text, is_organiser boolean, is_self boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.avatar_path, member.is_organiser, member.user_id = auth.uid()
    from (
      select t.user_id, true as is_organiser, t.created_at as since
        from public.trips t where t.id = p_trip_id
      union all
      select wa.user_id, false, wa.created_at
        from public.walk_attendees wa where wa.trip_id = p_trip_id
    ) member
    left join public.profiles p on p.id = member.user_id
   where public.is_walk_chat_member(p_trip_id)
   order by member.is_organiser desc, member.since, p.display_name;
$$;

revoke execute on function public.list_walk_participants from public, anon;
grant execute on function public.list_walk_participants to authenticated;
