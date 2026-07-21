# Why our visual agent builder refuses to run your code

Most visual agent builders have a "Run" button. Ours doesn't, and never will. That's not a
missing feature — it's the whole design. Here's the reasoning, laid out honestly, because the
trade-off is real and you should understand it before choosing a tool.

## The pattern: builders that run your flows keep getting breached

If a server accepts a workflow you built and *executes* it, that server runs code shaped by
user input. That is one of the oldest and highest-value classes of vulnerability. In the most
popular visual builder in this space — Langflow, an excellent product with 100k+ GitHub stars
and IBM/DataStax backing — the pattern has played out publicly and repeatedly over less than
18 months:

- **CVE-2025-3248** (CVSS 9.8): the `/api/v1/validate/code` endpoint passed user-supplied
  Python to `exec()` with no authentication. Added to CISA's Known Exploited Vulnerabilities
  (KEV) catalog in May 2025; used in the wild to deploy the Flodrix botnet.
- **CVE-2025-34291** (CVSS 9.4): a chain of a permissive CORS policy, a cross-site-deliverable
  refresh-token cookie, and a missing CSRF check — one click on a malicious page could take
  over an account, reach code-execution endpoints, **and read the provider API keys stored in
  the workspace.** On CISA KEV; used by the Iranian APT group MuddyWater for initial access.
- **CVE-2026-33017** (CVSS 9.8): unauthenticated RCE through the public flow-build endpoint.
  On CISA KEV; researchers observed exploitation within ~20 hours of the advisory, dropping
  Monero cryptominers on exposed AI infrastructure.
- **CVE-2026-5027** (CVSS 8.8): a path-traversal in the file-upload endpoint let an attacker
  write arbitrary files (e.g. a cron job) and reach RCE — against roughly 7,000
  internet-exposed instances at the time it was being exploited.

Different endpoints, different researchers, same root: a server that runs user-defined logic,
often with unauthenticated access on by default, holding credentials worth stealing. To be
clear, this is **not** a knock on Langflow's engineering — every one of these was patched, and
running arbitrary user flows server-side is genuinely hard to secure. It's an *architectural*
observation: the capability that makes "click Run and it executes in the cloud" convenient is
the same capability attackers keep turning into remote code execution and key theft.

## The root cause is the feature

You cannot fully sandbox your way out of this. The product's core promise — "assemble a flow
and run it here" — requires a server that (a) turns your graph into executing code and (b)
holds the provider API keys those calls need. Each is a target on its own; together they're a
target worth a nation-state's time. Hardening reduces the odds of any specific bug; it doesn't
change the shape of the attack surface.

## Our answer: generate code, execute nothing

Breakerbox's builder is **codegen-only**. You draw the graph on a canvas, and the app
produces a plain Python *string* — readable LangGraph wrapped in our `guard()` budget. That's
the entire output. There is:

- **No execution endpoint.** Nothing on our side ever runs your flow. The transformation is
  one-directional: spec → Python text → your clipboard or a `.py` download.
- **No stored keys.** Your OpenAI/Anthropic/etc. keys never touch a dashboard, database, or
  edge function. They live in *your* environment, used by the code *you* run.

The codegen runs in your browser, and the canonical generator is a pure Python function
(`agentbreaker build spec.json`) locked to the browser version by shared golden-fixture tests
in CI. If there's no server executing your graph and no vault of keys, there is simply nothing
in our infrastructure for an attacker to compromise. The class of CVE above cannot exist here
because the precondition — a server that runs your code — was removed.

## What you give up, honestly

One-click cloud runs. With Langflow you can hit Run and watch it execute without leaving the
browser. With Breakerbox you copy the generated file and run it yourself:
`python workflow.py`. That's a real ergonomic cost, and for quick throwaway prototyping a
run-it-here builder is genuinely nicer. Our bet is that for anything you'd put in production,
"the builder cannot be turned into RCE and cannot leak my keys" is worth one extra command.
Prototype wherever you like; ship the version that has no server to breach.

## The upside: budgets are first-class

Removing the server isn't only about what we took away. Because the output is your own
guarded code, budgets become part of the canvas instead of an afterthought. The builder has a
**Budget Tree**: a root dollar budget, per-node sub-allocations, and the unallocated
remainder. Over-allocate a node and it turns red and blocks export — you can't generate a
graph whose child budgets exceed the parent's. Tools can be tagged side-effecting so the
receipt shows which ones fired before a trip. The generated code enforces all of it at
runtime: a hierarchical escrow that stops a runaway loop at a hop boundary (never mid-call)
and writes a receipt that leads with the number that matters — *stopped at $Y, budget $Z*.

That's the trade in one sentence: no Run button, no stored keys, no attack surface — and in
return, readable code you own with a hard dollar budget baked in.

---

*Sources: CISA KEV catalog; the Langflow GitHub security advisories; and public write-ups from
VulnCheck, Tenable, Sysdig, JFrog, Orca, and others for CVE-2025-3248, CVE-2025-34291,
CVE-2026-33017, and CVE-2026-5027. Re-verify the specifics before republishing — see LAUNCH.md.*
