-- Welcome email (D-066): `profiles.welcome_email_sent_at` is set only by the welcome-email Edge
-- Function (service role) through claim_welcome_email / release_welcome_email. Users can read it
-- but never set or clear it, and two concurrent claims send once. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('c1111111-1111-4111-8111-111111111111', 'ana@example.com', '{"display_name":"Ana","language":"pt"}', 'authenticated', 'authenticated'),
       ('c2222222-2222-4222-8222-222222222222', 'ben@example.com', '{"display_name":"Ben"}', 'authenticated', 'authenticated');

select has_column('public', 'profiles', 'welcome_email_sent_at', 'profiles record when the welcome email went out');
select is((select welcome_email_sent_at from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
  null, 'a new profile has not been welcomed yet');

-- Users: may read the column and edit their profile, never touch the column.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$ update public.profiles set display_name = 'Ana B', onboarded_at = now()
      where id = 'c1111111-1111-4111-8111-111111111111' $$,
  'Ana still edits her profile and finishes onboarding');
select throws_ok(
  $$ update public.profiles set welcome_email_sent_at = now() where id = 'c1111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'Ana cannot mark her welcome email as sent');
select throws_ok(
  $$ select public.claim_welcome_email('c1111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'users cannot call the claim function');
select throws_ok(
  $$ select public.release_welcome_email('c1111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'users cannot call the release function');
reset role;

-- The service role claims once, with everything the email needs.
set local role service_role;
select results_eq(
  $$ select email, language, display_name from public.claim_welcome_email('c1111111-1111-4111-8111-111111111111') $$,
  $$ values ('ana@example.com'::text, 'pt'::text, 'Ana B'::text) $$,
  'the first claim returns the address, language and name');
select isnt((select welcome_email_sent_at from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
  null, 'the claim stamps welcome_email_sent_at');
select is_empty(
  $$ select * from public.claim_welcome_email('c1111111-1111-4111-8111-111111111111') $$,
  'a second claim gets nothing: the email goes out once');
select is_empty(
  $$ select * from public.claim_welcome_email('c2222222-2222-4222-8222-222222222222') $$,
  'a profile that has not finished onboarding is not welcomed yet');

-- A failed send releases the claim so a later call retries.
select lives_ok($$ select public.release_welcome_email('c1111111-1111-4111-8111-111111111111') $$,
  'the service role releases a claim after a failed send');
select is((select welcome_email_sent_at from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
  null, 'the release clears the stamp');
select isnt_empty(
  $$ select * from public.claim_welcome_email('c1111111-1111-4111-8111-111111111111') $$,
  'after a release the next claim succeeds');
reset role;

-- Users cannot clear the stamp either (it would let them trigger more emails).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ update public.profiles set welcome_email_sent_at = null where id = 'c1111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'Ana cannot clear the stamp to get another welcome email');

select * from finish();
rollback;
