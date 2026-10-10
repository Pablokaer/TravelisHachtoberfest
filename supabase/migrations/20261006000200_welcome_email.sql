-- Welcome email (D-066). The welcome-email Edge Function sends one email per account, in the
-- profile's language, once onboarding has finished. `welcome_email_sent_at` makes it idempotent:
-- the function claims the row (stamp where null, returning) before sending, so two concurrent
-- calls send once, and releases the claim when the provider fails so a later call retries.

alter table public.profiles add column welcome_email_sent_at timestamptz;
comment on column public.profiles.welcome_email_sent_at is
  'When the welcome email was sent (claimed). Set only by the service role (D-066).';

-- Accounts that finished onboarding before this feature never get a surprise welcome email.
update public.profiles set welcome_email_sent_at = onboarded_at where onboarded_at is not null;

-- Users update their own profile row (RLS), so a column grant alone would not stop them from
-- stamping or clearing this column; a trigger does, whatever columns a client sends.
create or replace function public.protect_welcome_email_sent_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.welcome_email_sent_at is distinct from old.welcome_email_sent_at
     and current_user in ('anon', 'authenticated') then
    raise exception 'welcome_email_sent_at is set by the server only, got a change from % to %',
      old.welcome_email_sent_at, new.welcome_email_sent_at
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_welcome_email_sent_at from public, anon, authenticated;

create trigger profiles_protect_welcome_email_sent_at
  before update of welcome_email_sent_at on public.profiles
  for each row execute function public.protect_welcome_email_sent_at();

-- Claims the welcome email of an onboarded user who has not had it: one row with what the email
-- needs, or none (already sent, or onboarding not finished). The row lock of the update makes a
-- concurrent second claim wait and then find the stamp set.
create or replace function public.claim_welcome_email(p_user uuid)
returns table (email text, language text, display_name text)
language sql
security definer
set search_path = ''
as $$
  update public.profiles p
     set welcome_email_sent_at = now()
    from auth.users u
   where p.id = p_user
     and u.id = p.id
     and p.welcome_email_sent_at is null
     and p.onboarded_at is not null
  returning u.email::text, p.language, p.display_name;
$$;
revoke execute on function public.claim_welcome_email from public, anon, authenticated;
grant execute on function public.claim_welcome_email to service_role;

-- Gives a claim back after the provider failed, so the next app start retries.
create or replace function public.release_welcome_email(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set welcome_email_sent_at = null where id = p_user;
$$;
revoke execute on function public.release_welcome_email from public, anon, authenticated;
grant execute on function public.release_welcome_email to service_role;
