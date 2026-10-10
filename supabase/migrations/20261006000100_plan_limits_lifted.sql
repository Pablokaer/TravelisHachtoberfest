-- Plan limits lifted (D-065, supersedes the enforcement half of D-047). For now every account
-- creates as many walk lists as it wants, each with as many places as a walking route holds
-- (ROUTE_MAX_STOPS = 20, D-030 — checked by `save_trip`, not a plan rule), and deletes its own
-- lists. Payments are not live, so a limit only Premium could lift was a wall with no door.
--
-- Kept on purpose, for when payments return: the `plans` and `subscriptions` tables,
-- `subscription_grants_plan`, `current_subscription`, `effective_plan` and `my_subscription`.
-- Bringing limits back is a new migration that re-creates the triggers below (see
-- 20261003000800_subscriptions.sql) and sets the Free row's limits again.

-- 1. No walk list or places-per-list limit (WF001, WF002).
drop trigger if exists trips_plan_list_limit on public.trips;
drop trigger if exists trip_stops_plan_item_limit on public.trip_stops;
drop function if exists public.enforce_plan_list_limit();
drop function if exists public.enforce_plan_item_limit();

-- 2. Deleting is back to owner-only (WF003 gone): the policy as 20260927000200_user_data.sql
-- created it, and `delete_trip` without the plan check. The function must be replaced before
-- `plan_allows_deleting_lists` can be dropped, since both it and the policy call it.
drop policy "own trips: delete" on public.trips;
create policy "own trips: delete" on public.trips
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Deletes the caller's walk list. Error: P0002 when the list is not the caller's (or does not
-- exist). Account deletion is unaffected.
-- @example select public.delete_trip('<trip id>');
create or replace function public.delete_trip(p_trip_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.trips where id = p_trip_id and user_id = auth.uid();
  if not found then
    raise exception 'trip % not found for the caller', p_trip_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_trip from public, anon;
grant execute on function public.delete_trip to authenticated;

drop function if exists public.plan_allows_deleting_lists();

-- 3. The data says what is true: Free has no limits now, so `my_subscription` (and the plans
-- page, while hidden) no longer report limits nobody enforces.
update public.plans
   set max_lists = null, max_items_per_list = null, can_delete_lists = true
 where id = 'free';
