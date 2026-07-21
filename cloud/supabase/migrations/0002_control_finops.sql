-- Live control channel + FinOps aggregate views.

-- commands: dashboard -> library. No anon access; only the control edge function
-- (service role) reads/writes. The library polls via GET, the dashboard issues via POST.
create table if not exists public.commands (
  id         bigserial primary key,
  run_id     text not null,
  command    text not null check (command in ('pause', 'kill')),
  status     text not null default 'pending' check (status in ('pending', 'applied')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index if not exists commands_pending_idx
  on public.commands (run_id) where status = 'pending';

alter table public.commands enable row level security;  -- no policies => anon has no access

-- FinOps read views over PUBLIC runs/events only. Views run with owner rights (they can
-- read the underlying tables), and the `r.public` join keeps private runs out. Anon reads
-- them through PostgREST via the grants below.
create or replace view public.v_spend_by_model as
  select e.model,
         count(*) filter (where e.type = 'reconcile')       as calls,
         coalesce(sum(e.actual_microusd), 0)                 as spent_microusd
  from public.events e
  join public.runs r on r.run_id = e.run_id and r.public
  where e.model is not null
  group by e.model
  order by spent_microusd desc;

create or replace view public.v_spend_by_node as
  select e.node,
         count(*) filter (where e.type in ('reconcile', 'tool_call')) as hops,
         coalesce(sum(e.actual_microusd), 0)                          as spent_microusd
  from public.events e
  join public.runs r on r.run_id = e.run_id and r.public
  where e.node is not null
  group by e.node
  order by spent_microusd desc;

create or replace view public.v_daily_spend as
  select date_trunc('day', r.updated_at)  as day,
         count(*)                          as runs,
         coalesce(sum(r.spent_usd), 0)     as spent_usd,
         coalesce(sum(r.saved_usd), 0)     as saved_usd
  from public.runs r
  where r.public
  group by 1
  order by 1;

grant select on public.v_spend_by_model, public.v_spend_by_node, public.v_daily_spend
  to anon, authenticated;
