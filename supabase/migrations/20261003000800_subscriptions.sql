-- Plans and subscriptions, first version (D-047). No payments yet: the model is ready for a
-- payment provider (Stripe or another) to write subscriptions later.
--
--   plans          the rules of each plan: price and limits. The one place the limits live;
--                  a new plan is a new row. Free is the default.
--   subscriptions  one row per subscription a user has had (history): plan, status, start, end
--                  of the paid period, and the provider's ids. Written only by the payment side
--                  (service role); users read their own.
--
-- A user's plan is the plan of their active subscription, or Free (`effective_plan`). The limits
-- are enforced here for user requests (whatever the client) and read by the app to explain them.
-- Admin writes (seeds, support, as the service role or postgres) are not limited. Existing data
-- over a limit is kept: only new lists, new places and deleting are refused.

create table public.plans (
  id                  text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  price_cents         integer not null check (price_cents >= 0),
  currency            char(3) not null default 'EUR',
  billing_interval    text check (billing_interval in ('month', 'year')),
  -- null: unlimited
  max_lists           integer check (max_lists > 0),
  max_items_per_list  integer check (max_items_per_list > 0),
  can_delete_lists    boolean not null,
  is_default          boolean not null default false,
  sort_order          smallint not null default 0,
  created_at          timestamptz not null default now(),
  check ((price_cents = 0) = (billing_interval is null))
);

-- Exactly one default plan: what users without an active subscription get.
create unique index plans_one_default on public.plans (is_default) where is_default;

insert into public.plans
  (id, price_cents, currency, billing_interval, max_lists, max_items_per_list, can_delete_lists, is_default, sort_order)
values
  ('free', 0, 'EUR', null, 5, 5, false, true, 1),
  ('premium', 500, 'EUR', 'month', null, null, true, false, 2);

alter table public.plans enable row level security;
create policy "plans are readable by everyone" on public.plans
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.plans from anon, authenticated;

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users (id) on delete cascade,
  plan_id                   text not null references public.plans (id),
  -- Free has no row. Only `active` grants the plan today; the others are for the payment side.
  status                    text not null
                            check (status in ('active', 'cancelled', 'expired', 'past_due')),
  started_at                timestamptz not null default now(),
  -- End of the paid period ("valid until"); null = open-ended.
  current_period_end        timestamptz,
  cancelled_at              timestamptz,
  -- The payment provider and its subscription id (e.g. 'stripe', 'sub_…'); null until then.
  provider                  text,
  provider_subscription_id  text unique,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index subscriptions_user_started_idx on public.subscriptions (user_id, started_at desc);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;
create policy "own subscriptions: select" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;

-- Whether a subscription gives its plan right now. The one place to change when cancelled,
-- past-due or grace periods get their own rules.
create or replace function public.subscription_grants_plan(p_status text, p_period_end timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status = 'active' and (p_period_end is null or p_period_end > now());
$$;

-- The subscription that gives a user their plan now (the latest granting one), if any.
create or replace function public.current_subscription(p_user_id uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.subscriptions s
   where s.user_id = p_user_id
     and public.subscription_grants_plan(s.status, s.current_period_end)
   order by s.started_at desc
   limit 1;
$$;

-- A user's plan: their current subscription's, or the default (Free).
-- @example select (public.effective_plan(auth.uid())).max_lists;
create or replace function public.effective_plan(p_user_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.plans p
   where p.id = coalesce(
     (select (public.current_subscription(p_user_id)).plan_id),
     (select d.id from public.plans d where d.is_default));
$$;

revoke execute on function public.current_subscription from public, anon, authenticated;
revoke execute on function public.effective_plan from public, anon;
grant execute on function public.effective_plan to authenticated;

-- The caller's plan, subscription and usage, for Settings and the app's limit messages:
-- {plan: {...}, status: 'free' | subscription status, started_at, valid_until, list_count}.
-- @example select public.my_subscription() -> 'plan' ->> 'id'; -- 'free'
create or replace function public.my_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.plans;
  s public.subscriptions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  p := public.effective_plan(auth.uid());
  s := public.current_subscription(auth.uid());
  return jsonb_build_object(
    'plan', to_jsonb(p) - 'created_at' - 'is_default' - 'sort_order',
    'status', coalesce(s.status, 'free'),
    'started_at', s.started_at,
    'valid_until', s.current_period_end,
    'list_count', (select count(*) from public.trips t where t.user_id = auth.uid())
  );
end;
$$;

revoke execute on function public.my_subscription from public, anon;
grant execute on function public.my_subscription to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Enforcement. Error codes (mirrored in @wayfarer/shared PLAN_LIMIT_ERRORS):
--   WF001 walk list limit, WF002 places-per-list limit, WF003 deleting lists not in the plan.
-- ---------------------------------------------------------------------------------------------

-- A new walk list within the plan's number of lists (existing lists over it are kept).
create or replace function public.enforce_plan_list_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.plans;
  lists integer;
begin
  if current_user <> 'authenticated' then
    return new; -- admin writes (service role, seeds) are not limited
  end if;
  p := public.effective_plan(new.user_id);
  if p.max_lists is null then
    return new;
  end if;
  select count(*) into lists from public.trips where user_id = new.user_id;
  if lists >= p.max_lists then
    raise exception 'plan limit: the % plan allows % walk lists, you have %', p.id, p.max_lists, lists
      using errcode = 'WF001', hint = 'lists';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_plan_list_limit from public, anon, authenticated;

create trigger trips_plan_list_limit before insert on public.trips
  for each row execute function public.enforce_plan_list_limit();

-- A list's places within the plan's limit, checked after the statement's rows are in (so a
-- whole list saved at once is counted). Security invoker: users insert places only into their
-- own lists (RLS), which they can read and count.
create or replace function public.enforce_plan_item_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner uuid;
  p public.plans;
  places integer;
begin
  if current_user <> 'authenticated' then
    return null; -- admin writes (service role, seeds) are not limited
  end if;
  select t.user_id into owner from public.trips t where t.id = new.trip_id;
  p := public.effective_plan(owner);
  if p.max_items_per_list is null then
    return null;
  end if;
  select count(*) into places from public.trip_stops s where s.trip_id = new.trip_id;
  if places > p.max_items_per_list then
    raise exception 'plan limit: the % plan allows % places per walk list, this one would have %',
      p.id, p.max_items_per_list, places using errcode = 'WF002', hint = 'items';
  end if;
  return null;
end;
$$;

revoke execute on function public.enforce_plan_item_limit from public, anon, authenticated;

create trigger trip_stops_plan_item_limit after insert on public.trip_stops
  for each row execute function public.enforce_plan_item_limit();

-- Deleting lists is a plan feature. The owner-only rule stays; a direct delete by a user whose
-- plan does not allow it removes nothing, and `delete_trip` says why.
create or replace function public.plan_allows_deleting_lists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.effective_plan(auth.uid())).can_delete_lists;
$$;

revoke execute on function public.plan_allows_deleting_lists from public, anon;
grant execute on function public.plan_allows_deleting_lists to authenticated;

drop policy "own trips: delete" on public.trips;
create policy "own trips: delete" on public.trips
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.plan_allows_deleting_lists());

-- Deletes the caller's walk list. Errors: WF003 when the plan does not allow deleting lists,
-- P0002 when the list is not the caller's (or does not exist). Account deletion is unaffected.
-- @example select public.delete_trip('<trip id>');
create or replace function public.delete_trip(p_trip_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.plan_allows_deleting_lists() then
    raise exception 'plan limit: the % plan does not include deleting walk lists (trip %)',
      (public.effective_plan(auth.uid())).id, p_trip_id using errcode = 'WF003', hint = 'delete';
  end if;
  delete from public.trips where id = p_trip_id and user_id = auth.uid();
  if not found then
    raise exception 'trip % not found for the caller', p_trip_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_trip from public, anon;
grant execute on function public.delete_trip to authenticated;
