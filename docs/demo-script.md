# 60-second demo script

The one-take flow for a screen recording. Goal: budgets are the star, and the output is code
you run yourself — nothing executes in the cloud.

**Setup:** `cd cloud/dashboard && npm run dev`, open `http://localhost:3000/builder`. The
canvas loads preloaded with the example graph (never a blank screen).

---

**0:00 — "This is a visual agent builder with one rule: it never runs your code."**
Show the canvas: a small graph (start → planner → search → writer → router → publish → end).
Point at the right-hand **Budget Tree** — root budget $5.00, `planner` $2.00, `writer` $1.50,
unallocated $1.50 in green.

**0:10 — Drag.** Add a `model` node from the palette; connect `search → newModel → writer`.
The node appears; the Budget Tree still shows $1.50 unallocated.

**0:18 — Allocate.** Select the new node, set `sub_budget_usd` to `2.00`. Watch the Budget
Tree: a new bar fills, unallocated drops to **-$0.50** and the panel turns **red**. The
**Generate / Download** buttons disable; the toolbar shows *"1 error — fix to export."*
Say: *"You can't export a graph whose child budgets exceed the parent's."*

**0:30 — Fix.** Change it to `1.00`. Red clears, unallocated back to $0.50, export re-enables.

**0:36 — Generate.** Click **Generate Python**. A modal shows the real, readable code:
`from breakerbox import guard`, one `def` per node with TODO bodies, `add_conditional_edges`
for the router, and `guard(..., sub_budgets={...}, on_trip="pause")`. Say: *"That's the whole
output — a Python string. No server ran anything; your API keys never left your machine."*
Click **Copy** (or **Download .py**).

**0:46 — Run it locally.** Cut to a terminal: fill one node body with a real model call, then
`python workflow.py`. It runs on *your* machine with *your* keys.

**0:52 — The receipt.** Show the terminal receipt from a runaway that tripped:
```
 Breakerbox receipt · killed (budget)
 stopped at $0.87   budget $0.90   hops 12
 projected (naive linear extrapolation, likely an underestimate): $9.40
```
Say: *"Hard dollar budget, stops at a hop boundary, and a receipt that leads with the real
number — not a scary projection."*

**1:00 — Close.** *"No Run button, no stored keys, nothing to hack. Code you own, with a
budget baked in."*

---

Recording notes:
- Keep the Budget Tree on screen the whole time — it's the differentiator.
- The red over-allocation → export-block is the money shot; don't rush it.
- Don't dunk on any competitor on camera; the value stands on its own.
