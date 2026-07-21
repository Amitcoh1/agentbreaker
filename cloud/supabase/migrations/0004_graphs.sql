-- Saved builder graphs. Prepared but UNUSED until auth lands (the builder currently saves to
-- localStorage). When Supabase Auth is added, owner_id + these RLS policies make graphs private
-- per user. TODO(auth): switch the builder's save/load from localStorage to this table.

create table if not exists public.graphs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid,                      -- TODO(auth): references auth.users, not null
  name       text not null default 'untitled',
  spec       jsonb not null,           -- a graph spec (see agentbreaker.graphspec)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists graphs_owner_idx on public.graphs (owner_id, updated_at desc);

alter table public.graphs enable row level security;

-- No policies yet => no anon access. Owner-scoped policies come with auth:
--   create policy "owner reads"  on public.graphs for select using (owner_id = auth.uid());
--   create policy "owner writes" on public.graphs for all    using (owner_id = auth.uid());
