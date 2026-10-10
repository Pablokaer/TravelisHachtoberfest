-- Walk chat re-reads (D-056): an open chat re-read its newest 100 messages every 10 s and on each
-- live event (D-044), for every member. `p_after` lets it ask only for what is new since a little
-- before the newest message it shows. Same columns and rules; a new parameter (appended) needs
-- drop + create, and the grants again.
drop function public.list_walk_messages(uuid, timestamptz, integer);

-- The newest messages of a chat (up to 200; older ones with p_before, only newer ones with
-- p_after), each with its author's public name, photo, public id and nickname. Members only;
-- security definer only to read those profile fields.
-- @example select * from public.list_walk_messages('<trip id>', p_after => now() - interval '1 minute');
create or replace function public.list_walk_messages(
  p_trip_id uuid,
  p_before timestamptz default null,
  p_limit integer default 100,
  p_after timestamptz default null
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
     and (p_after is null or m.created_at > p_after)
   order by m.created_at desc, m.id
   limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function public.list_walk_messages from public, anon;
grant execute on function public.list_walk_messages to authenticated;
