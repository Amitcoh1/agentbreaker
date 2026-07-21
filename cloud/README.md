# AgentBreaker cloud (optional)

A lightweight dashboard for run receipts: a run list and a **live** timeline (via Supabase
Realtime), each run reachable by a shareable, unlisted URL. This is the **only** cloud
component — the core library is fully useful with `report_to` unset.

```
cloud/
  supabase/
    migrations/0001_init.sql      # runs + events tables, RLS (public-read), realtime
    functions/ingest/index.ts     # edge function the library POSTs to
  dashboard/                      # Next.js app (deploy to Vercel)
```

## 1. Supabase

Create a project (free tier is enough), then:

```bash
supabase link --project-ref YOUR_REF
supabase db push                       # applies migrations/0001_init.sql
supabase secrets set INGEST_KEY=$(openssl rand -hex 16)
supabase functions deploy ingest --no-verify-jwt
```

Note the function URL: `https://YOUR_REF.functions.supabase.co/ingest`.

RLS is **public-read**: a run and its events are visible only when `runs.public = true`
(the default), so a run URL is an unlisted, shareable link. Ingest happens with the service
role inside the edge function, so no anon writes are exposed.

## 2. Dashboard (Vercel)

```bash
cd dashboard
cp .env.example .env.local          # fill in your project URL + anon key
npm install && npm run dev          # http://localhost:3000
# deploy: push to GitHub and import in Vercel, or `vercel` — set the two env vars
```

Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 3. Point the library at it

```python
app = guard(my_app, budget_usd=5.00, report_to="https://YOUR_REF.functions.supabase.co/ingest")
```

```bash
export AGENTBREAKER_INGEST_KEY=...   # the INGEST_KEY you set above
```

Events stream to the dashboard as the run executes (best-effort, non-blocking — a cloud
outage never affects the run); the final summary lands on completion/trip. Open
`/runs/<run_id>` for the live timeline.

## Not included (follow-ups)

- **Auth + team views.** The dashboard is public-read (unlisted-by-URL). Wiring Supabase Auth
  and per-owner RLS is the natural next step; the schema already has a `runs.public` flag to
  build private runs on.
