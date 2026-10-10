-- Profile photos (D-039): users add a photo to their profile. The file lives in the public
-- `avatars` Storage bucket under the owner's own folder (`<user id>/avatar-<time>.jpg`, resized to
-- 512 px by the app); `profiles.avatar_path` points at it. Review cards show the author's photo,
-- so `list_reviews` returns it.

alter table public.profiles add column avatar_path text
  check (avatar_path is null
         or (char_length(avatar_path) <= 200 and avatar_path like id::text || '/%'));

comment on column public.profiles.avatar_path is
  'Object path of the profile photo in the avatars bucket; always inside the owner''s folder.';

-- Public read: photos are shown to other travellers (review cards) by URL, with no signed URLs.
-- 2 MiB is well above a 512 px JPEG; the limit stops anything else from being stored.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Each user writes only in the folder named after their id. Select is needed by the Storage API
-- to replace and remove objects; public URLs do not go through these policies.
create policy "avatars: own folder select" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: own folder insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: own folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- list_reviews gains the author's photo (appended); a new return type needs drop + create.
drop function public.list_reviews(uuid, text, uuid, integer, integer);

-- The reviews of one target, newest first, with each author's public name. Security definer only
-- to read `profiles.display_name` and `avatar_path` (profiles are owner-only under RLS); nothing
-- else of the profile, and not the author's id, leaves the function.
-- @example select * from public.list_reviews(p_city_slug => 'lisbon', p_limit => 10);
create or replace function public.list_reviews(
  p_attraction_id uuid default null,
  p_city_slug text default null,
  p_trip_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  is_own boolean,
  author_avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if num_nonnulls(p_attraction_id, p_city_slug, p_trip_id) <> 1 then
    raise exception 'list_reviews needs exactly one target, got attraction %, city %, trip %',
      p_attraction_id, p_city_slug, p_trip_id using errcode = '22023';
  end if;
  return query
  select r.id, r.rating, r.comment, r.created_at, r.updated_at, p.display_name,
         r.user_id = auth.uid(), p.avatar_path
    from public.reviews r
    left join public.profiles p on p.id = r.user_id
   where auth.uid() is not null
     and (r.attraction_id = p_attraction_id or r.city_slug = p_city_slug or r.trip_id = p_trip_id)
   order by r.created_at desc, r.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.list_reviews from public, anon;
grant execute on function public.list_reviews to authenticated;
