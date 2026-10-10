-- D-021: the user picks a light or dark theme in Profile → Preferences. Stored on the profile
-- (like language and units) so it follows the user across devices; light by default.
alter table public.profiles
  add column theme text not null default 'light' check (theme in ('light', 'dark'));

comment on column public.profiles.theme is 'App colour theme chosen by the user (light | dark).';
