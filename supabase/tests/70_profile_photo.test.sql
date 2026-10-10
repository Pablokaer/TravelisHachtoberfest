-- Profile photos (D-039): a public `avatars` bucket where each user writes only under their own
-- folder (`<user id>/…`), `profiles.avatar_path` pointing into it, and review authors' photos in
-- `list_reviews`. Deleting objects is covered through the Storage API (SQL deletes on
-- storage.objects are blocked by Supabase). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('a8888888-8888-8888-8888-888888888888', 'pia@example.com', '{"display_name":"Pia"}', 'authenticated', 'authenticated'),
       ('b9999999-9999-9999-9999-999999999999', 'raj@example.com', '{"display_name":"Raj"}', 'authenticated', 'authenticated');

select has_column('public', 'profiles', 'avatar_path', 'profiles have an avatar path');
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars' $$,
  $$ values (true, 2097152::bigint, array['image/jpeg', 'image/png', 'image/webp']) $$,
  'avatars bucket: public read, 2 MiB, JPEG / PNG / WebP only');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8888888-8888-8888-8888-888888888888","role":"authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatars', 'a8888888-8888-8888-8888-888888888888/avatar-1.jpg', 'a8888888-8888-8888-8888-888888888888') $$,
  'Pia uploads into her own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatars', 'b9999999-9999-9999-9999-999999999999/avatar-1.jpg', 'a8888888-8888-8888-8888-888888888888') $$,
  '42501', null, 'Pia cannot upload into Raj''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatars', 'avatar-1.jpg', 'a8888888-8888-8888-8888-888888888888') $$,
  '42501', null, 'nobody uploads outside a user folder');

select lives_ok(
  $$ update public.profiles set avatar_path = 'a8888888-8888-8888-8888-888888888888/avatar-1.jpg'
      where id = 'a8888888-8888-8888-8888-888888888888' $$,
  'Pia points her profile at her photo');
select throws_ok(
  $$ update public.profiles set avatar_path = 'b9999999-9999-9999-9999-999999999999/avatar-1.jpg'
      where id = 'a8888888-8888-8888-8888-888888888888' $$,
  '23514', null, 'a profile photo must be in the owner''s own folder');

-- Raj sees Pia's photo next to her review.
select public.save_review(p_city_slug => 'amsterdam', p_rating => 5, p_comment => 'Lovely');
select set_config('request.jwt.claims', '{"sub":"b9999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
select is(
  (select r.author_avatar_path from public.list_reviews(p_city_slug => 'amsterdam') r where r.author_name = 'Pia'),
  'a8888888-8888-8888-8888-888888888888/avatar-1.jpg',
  'list_reviews returns the author''s photo path');
select public.save_review(p_city_slug => 'amsterdam', p_rating => 4);
select is(
  (select r.author_avatar_path from public.list_reviews(p_city_slug => 'amsterdam') r where r.author_name = 'Raj'),
  null,
  'authors without a photo have none');

select * from finish();
rollback;
