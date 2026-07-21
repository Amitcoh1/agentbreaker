-- AgentBreaker cloud schema: runs (denormalized summary) + events (raw stream).
-- Ingest is done by the edge function with the service role (bypasses RLS).
-- Reads are anon + RLS: a run and its events are visible only when runs.public = true,
-- so a run URL is an unlisted, shareable link.

create table if not exists public.runs (
  run_id                 text primary key,
  status                 text,
  trip_reason            text,
  hops                   integer,
  budget_usd             numeric,
  spent_usd              numeric,
  projected_uncapped_usd numeric,
  saved_usd              numeric,
  side_effects           jsonb   not null default '[]',
  public                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.events (
  id                  bigserial primary key,
  run_id              text not null references public.runs(run_id) on delete cascade,
  seq                 integer not null,
  ts                  text,
  type                text,
  node                text,
  parent              text,
  model               text,
  tokens_in           integer,
  tokens_out          integer,
  estimate_microusd   bigint,
  actual_microusd     bigint,
  cumulative_microusd bigint,
  side_effecting      boolean not null default false,
  detail              jsonb   not null default '{}',
  inserted_at         timestamptz not null default now(),
  unique (run_id, seq)
);

create index if not exists events_run_seq_idx on public.events (run_id, seq);
create index if not exists runs_updated_idx on public.runs (updated_at desc);

-- Row-level security: public-read only.
alter table public.runs   enable row level security;
alter table public.events enable row level security;

drop policy if exists "public runs are readable" on public.runs;
create policy "public runs are readable"
  on public.runs for select
  using (public = true);

drop policy if exists "events of public runs are readable" on public.events;
create policy "events of public runs are readable"
  on public.events for select
  using (exists (select 1 from public.runs r where r.run_id = events.run_id and r.public));

-- Live updates for the dashboard timeline.
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.runs;
