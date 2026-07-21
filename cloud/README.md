# Breakerbox cloud (optional)

A FinOps-style dashboard for run receipts: an overview (spend/savings KPIs + charts), a
searchable run list, and a per-run detail with a **live** timeline, a **workflow DAG**, raw
events, and **live control** (pause/kill a running agent from the browser). This is the
**only** cloud component — the core library is fully useful with `report_to` unset.

```
cloud/
  supabase/
    migrations/0001_init.sql            # runs + events, RLS (public-read), realtime
    migrations/0002_control_finops.sql  # commands table + FinOps aggregate views
    functions/ingest/index.ts           # library POSTs events + summary here
    functions/control/index.ts          # library polls (GET) / dashboard issues (POST) pause|kill
  dashboard/                            # Next.js + Tailwind app (deploy to Vercel)
```

## 1. Supabase

Create a project (free tier is enough), then:

```bash
supabase link --project-ref YOUR_REF
supabase db push                        # applies both migrations
supabase secrets set INGEST_KEY=$(openssl rand -hex 16)
supabase secrets set CONTROL_KEY=$(openssl rand -hex 16)
supabase functions deploy ingest  --no-verify-jwt
supabase functions deploy control --no-verify-jwt
```

Function URLs: `https://YOUR_REF.functions.supabase.co/{ingest,control}`.

RLS is **public-read**: a run and its events are visible only when `runs.public = true`
(default), so a run URL is an unlisted, shareable link. Ingest/control use the service role
inside the edge functions; no anon writes are exposed. Issuing a pause/kill requires the
`CONTROL_KEY` (typed into the dashboard), so an unlisted URL can't be used to stop an agent.

## 2. Dashboard (Vercel)

```bash
cd dashboard
cp .env.example .env.local              # fill URL + anon key + control URL
npm install && npm run dev              # http://localhost:3000
# deploy: push to GitHub and import in Vercel, or `vercel` — set the env vars there
```

Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CONTROL_URL`.

## 3. Point the library at it

```python
app = guard(my_app, budget_usd=5.00, report_to="https://YOUR_REF.functions.supabase.co/ingest")
```

```bash
export AGENTBREAKER_INGEST_KEY=...      # the INGEST_KEY you set above
# control URL is derived from report_to (/ingest -> /control); override with:
# export AGENTBREAKER_CONTROL_URL=...
```

Events stream to the dashboard as the run executes (best-effort, non-blocking — a cloud
outage never affects the run); the final summary lands on completion/trip. Open
`/runs/<run_id>` for the live timeline, DAG, and the **Controls** tab. Enter the `CONTROL_KEY`
there, then **Pause/Kill** — the running agent stops at its next hop boundary.

## Not included (follow-ups)

- **Auth + team views / run management writes.** The dashboard is public-read
  (unlisted-by-URL) and read-only apart from control commands; toggling a run
  public/private and deleting runs need Supabase Auth + per-owner RLS. The `runs.public`
  flag is the hook to build that on.
