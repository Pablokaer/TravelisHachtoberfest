-- Demo accounts (LOCAL ONLY — never in supabase/seed, so `db push --include-seed` cannot ship
-- them): a group of six friends who write in English, Spanish and French, plus the "Wayfarer
-- Team" editorial account, a moderator that owns the official walk lists. Idempotent: re-running
-- refreshes names and profiles and keeps ids, so per-city files can reference them.
-- Every account signs in with password `wayfarer-demo`, by email or by nickname (D-048): emma,
-- oliver, lucia, mateo, camille, julien, wayfarer_team.
begin;

create temporary table demo_account (
  id uuid primary key,
  email text not null,
  display_name text not null,
  nickname text not null,
  home_country char(2) not null,
  created_at timestamptz not null
) on commit drop;

insert into demo_account values
  ('d0000000-0000-4000-8000-000000000001', 'emma@demo-wayfarer.example.com',    'Emma Clarke',     'emma',          'GB', '2026-06-02 09:14+00'),
  ('d0000000-0000-4000-8000-000000000002', 'oliver@demo-wayfarer.example.com',  'Oliver Bennett',  'oliver',        'US', '2026-06-03 18:40+00'),
  ('d0000000-0000-4000-8000-000000000003', 'lucia@demo-wayfarer.example.com',   'Lucía Fernández', 'lucia',         'ES', '2026-06-04 11:02+00'),
  ('d0000000-0000-4000-8000-000000000004', 'mateo@demo-wayfarer.example.com',   'Mateo Rojas',     'mateo',         'MX', '2026-06-05 21:27+00'),
  ('d0000000-0000-4000-8000-000000000005', 'camille@demo-wayfarer.example.com', 'Camille Dubois',  'camille',       'FR', '2026-06-06 08:55+00'),
  ('d0000000-0000-4000-8000-000000000006', 'julien@demo-wayfarer.example.com',  'Julien Moreau',   'julien',        'CA', '2026-06-07 16:10+00'),
  ('d0000000-0000-4000-8000-000000000099', 'team@demo-wayfarer.example.com',    'Wayfarer Team',   'wayfarer_team', 'NL', '2026-06-01 08:00+00');

-- GoTrue reads the token columns as strings: they must be '' rather than null for password
-- sign-in to work on hand-inserted users.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token,
                        reauthentication_token)
select '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
       extensions.crypt('wayfarer-demo', extensions.gen_salt('bf')), a.created_at,
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('display_name', a.display_name), a.created_at, a.created_at,
       '', '', '', '', '', '', '', ''
  from demo_account a
on conflict (id) do update set email = excluded.email, raw_user_meta_data = excluded.raw_user_meta_data;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select a.id::text, a.id,
       jsonb_build_object('sub', a.id::text, 'email', a.email, 'email_verified', true),
       'email', a.created_at, a.created_at
  from demo_account a
on conflict (provider_id, provider) do nothing;

-- The on_auth_user_created trigger made the profiles; finish onboarding so sign-in lands on the app.
-- Demo accounts count as welcomed (D-066), so signing in does not send them a welcome email.
update public.profiles p
   set display_name = a.display_name, nickname = a.nickname, home_country = a.home_country,
       onboarded_at = coalesce(p.onboarded_at, a.created_at),
       welcome_email_sent_at = coalesce(p.welcome_email_sent_at, a.created_at)
  from demo_account a
 where p.id = a.id;

insert into public.profile_nationalities (profile_id, country_code)
select a.id, a.home_country from demo_account a
on conflict do nothing;

insert into public.moderators (user_id) values ('d0000000-0000-4000-8000-000000000099')
on conflict do nothing;

commit;
