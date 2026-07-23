# Contributing to Breakerbox

Thanks for helping out! Breakerbox is the `agentbreaker` Python library plus an optional cloud
(marketing site, dashboard, docs, Supabase functions). Small, focused PRs are easiest to review.

## Repo layout

- `src/agentbreaker/` — the Python library (`guard`, ledger, meter, tripwire, codegen, graphspec, …).
- `tests/` — pytest, including the golden fixtures in `tests/fixtures/graphspec/`.
- `cloud/dashboard/` — the app (Next.js, the visual builder + run dashboard).
- `cloud/marketing/` — the marketing site (standalone Next.js).
- `cloud/docs/` — the docs site (Fumadocs).
- `cloud/supabase/` — edge functions + migrations.

## Dev setup & checks

**Python (the library):**

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
ruff check .
pytest -q
```

**Dashboard (and the marketing / docs apps):**

```bash
cd cloud/dashboard        # or cloud/marketing, cloud/docs
npm install
npm run typecheck && npm run lint && npm run build
npx vitest run            # dashboard only
```

Please make sure lint + tests are green before opening a PR (CI runs all of the above).

## The one rule you can't skip: codegen parity

Codegen is mirrored in two languages and **locked byte-for-byte** by golden fixtures:

- Canonical: `src/agentbreaker/codegen.py` + `src/agentbreaker/graphspec.py` (Python).
- Mirror: `cloud/dashboard/lib/graphspec.ts` (TypeScript — the browser generates the code).
- Locked by: `tests/fixtures/graphspec/*.json` → `*.py` (and `over_allocation.errors.json`),
  checked by `tests/test_codegen.py` (pytest) **and** `cloud/dashboard/lib/graphspec.test.ts` (vitest).

If you change what the generated Python looks like, you must update the Python side, the TS mirror,
**and** regenerate the golden fixtures — in the same PR — or CI will fail. Generate the `.py` golden
from the canonical Python side, never by hand.

## Non-negotiable constraints (see `SECURITY.md`)

Don't add: server-side execution of user graphs, storage/transmission of provider keys, or any
endpoint that evals/imports/templates user code. Codegen stays one-directional (spec → string).

## PRs

Describe what changed and why. Reference an issue if there is one. New non-trivial logic should come
with a test.
