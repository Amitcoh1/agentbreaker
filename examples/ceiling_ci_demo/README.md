# Demo — prove it before you run it

No API keys. No agent runs. No tokens spent. Just the **provable cost ceiling** catching a cost
regression at the pull request — the way an observe-after-the-fact dashboard or a gateway proxy
structurally can't.

Run it yourself (after `pip install breakerbox`):

```bash
./demo.sh
```

## 1. Prove the maximum, statically

```console
$ breakerbox ceiling pipeline.spec.json
Worst-case ceiling: ≤ $2.09  (proven, no API calls)
  Basis: 48 hops × the costliest call ($0.0435).
```

Zero API calls, zero tokens. This graph **cannot** cost more than $2.09 — provably, before it runs.

## 2. Someone bumps `max_tokens` — the classic quiet raise

`pipeline_v2.spec.json` raises the researcher's `max_tokens` from 4096 → 16384. Harmless-looking in a
code review. Watch the ceiling:

```console
$ breakerbox diff pipeline.spec.json pipeline_v2.spec.json --fail-on-increase
Cost ceiling: $2.09 → $9.15  (+$7.06, +339%)
# exit 1
```

A **4× cost blow-up**, caught at the PR — weeks before the invoice would have shown it.

## 3. Gate it in CI

```yaml
# .github/workflows/cost-ceiling.yml
name: cost-ceiling
on: [pull_request]
jobs:
  ceiling:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Amitcoh1/agentbreaker@v1
        with:
          spec: "examples/ceiling_ci_demo/*.spec.json"
          max: "5.00"          # any ceiling over $5.00 reddens the PR
          comment: "true"      # posts the proof as a sticky PR comment
```

`pipeline.spec.json` passes at $2.09; `pipeline_v2.spec.json` fails at $9.15.

## 4. Pin it so cost can't drift silently

```console
$ breakerbox lock pipeline.spec.json          # commit breakerbox.lock
wrote breakerbox.lock — pinned 1 spec(s) at price table 2026-07-24.

$ breakerbox lock --check                     # exit 1 if prices move or the ceiling changes
```

---

A proxy *is* the egress and can't attest to code it doesn't see. Only static codegen can prove the
whole cost surface — **before** it runs.
