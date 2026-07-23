-- Accounts: per-user ownership of runs + saved graphs, keyed off Supabase Auth.
--
-- Backward-compatible by design: existing rows have owner_id = null and stay public-readable, and
-- the legacy shared INGEST_KEY still ingests anonymous (owner_id null, public) runs. A personal
-- ingest key — issued in the dashboard and stored here only as a sha256 hash — maps an
-- x-ingest-key to a user, so runs sent with it are private to that user.

-- 1. Per-user ingest keys. Only the hash is stored; the plaintext is shown once at creation.
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  key_hash     text not null unique,
  label        text not null default 'default',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_keys_owner_idx on public.api_keys (owner_id);

alter table public.api_keys enable row level security;
-- Owners manage their own keys from the dashboard (authenticated client). The ingest edge function
-- reads key_hash with the service role, which bypasses RLS.
drop policy if exists "owner manages keys" on public.api_keys;
create policy "owner manages keys"
  on public.api_keys for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 2. Run ownership. Nullable: null = legacy/anonymous/public run (shared key or pre-accounts).
alter table public.runs
  add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists runs_owner_idx on public.runs (owner_id, updated_at desc);

-- 3. RLS: a run (and its events) is readable if it is public OR owned by the caller. This keeps
--    unlisted share links working for anon while giving each user their private runs.
drop policy if exists "public runs are readable" on public.runs;
create policy "runs readable to owner or public"
  on public.runs for select
  using (public = true or owner_id = auth.uid());

drop policy if exists "events of public runs are readable" on public.events;
create policy "events readable to owner or public"
  on public.events for select
  using (exists (
    select 1 from public.runs r
    where r.run_id = events.run_id and (r.public or r.owner_id = auth.uid())
  ));

-- 4. Saved graphs become owner-scoped (the table was prepared in 0004). Wiring the builder's
--    save/load to this table is a follow-up; these policies make per-user storage possible now.
drop policy if exists "owner reads graphs"  on public.graphs;
drop policy if exists "owner writes graphs" on public.graphs;
create policy "owner reads graphs"
  on public.graphs for select using (owner_id = auth.uid());
create policy "owner writes graphs"
  on public.graphs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Note: user builder templates are localStorage-only (per browser) — no table, nothing to scope.
