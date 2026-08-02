-- #26 — internal product signals (activation / retention / paid-shaped) for the maintainer.
--
-- The library never phones home (VISION §3.3); this reads only data users already opted to send by
-- setting report_to (the same `runs` the privacy policy covers). It returns ONLY aggregate counts +
-- a weekly histogram — never PII, never a per-user row — and ONLY to an admin allow-list. The Next
-- app stays RLS-only (no service-role key in the app): the privilege lives here as a security-definer
-- function, matching the existing v_spend_by_* view pattern.

-- Allow-list. No RLS policies => neither anon nor authenticated can read/write it through PostgREST;
-- seed it once by hand as the project owner:  insert into public.admins (user_id) values ('<your-auth-uid>');
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;

-- Aggregate signals over runs. security definer so it can read across owners regardless of RLS, but
-- it hands nothing back unless the caller is an admin, and only ever returns aggregates.
create or replace function public.product_signals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    return null;  -- non-admins (and the unseeded default) get nothing
  end if;

  with first_run as (
    select owner_id, min(created_at) as first_at, max(updated_at) as last_at
    from public.runs where owner_id is not null group by owner_id
  ),
  weeks as (
    select owner_id, count(distinct date_trunc('week', created_at)) as active_weeks
    from public.runs where owner_id is not null group by owner_id
  ),
  spend as (
    select owner_id,
           sum(coalesce(spent_usd, 0)) as total_spent,
           count(*) filter (where trip_reason in ('budget', 'velocity')) as budget_trips
    from public.runs where owner_id is not null group by owner_id
  )
  select jsonb_build_object(
    'activated_accounts', (select count(*) from first_run),
    'new_7d',  (select count(*) from first_run where first_at >= now() - interval '7 days'),
    'new_30d', (select count(*) from first_run where first_at >= now() - interval '30 days'),
    'active_7d', (select count(*) from first_run where last_at >= now() - interval '7 days'),
    'returning', (select count(*) from weeks where active_weeks >= 2),
    'paid_shaped', (select count(*) from spend where total_spent >= 10 or budget_trips > 0),
    'by_week', (
      select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'new_accounts', n) order by wk), '[]'::jsonb)
      from (
        select date_trunc('week', first_at)::date as wk, count(*) as n
        from first_run
        where first_at >= now() - interval '12 weeks'
        group by 1
      ) t
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.product_signals() to authenticated;
