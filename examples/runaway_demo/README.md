# Runaway demo

A deliberately broken LangGraph agent: a retry loop that never drops its context, so
every hop re-sends a larger conversation and costs more than the last. Classic runaway.

No API keys needed — a fake model returns a real, `max_tokens`-sized reply that gets
retained each hop, so the context (and cost) genuinely grows. The **same metering engine
bills both runs**, so the comparison is apples to apples.

```bash
pip install -e ..              # or: pip install breakerbox
python demo.py
```

Output (deterministic):

```
==============================================================
  UNGUARDED runaway : ran 60 hops, spent $12.63
  GUARDED           : killed early, spent $0.82  (budget $0.90)
  AVERTED           : $11.81
  receipt (open it) : .../reports/<run>.html
==============================================================
```

The guard stops **strictly under budget** ($0.82 < $0.90): because the model declares a
real `max_tokens`, the reserve estimate is a true upper bound, so the call that *would*
cross the line is blocked before it runs — no mid-flight interruption, no overshoot.

Open the generated `report.html` (or [`sample_receipt.html`](./sample_receipt.html)) for
the timeline, per-hop cost bars, cumulative curve, and the **projected → stopped** headline.
