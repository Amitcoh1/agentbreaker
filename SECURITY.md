# Security Policy

Breakerbox's whole premise is a small attack surface, so we take this seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's **[private vulnerability reporting](https://github.com/Amitcoh1/agentbreaker/security/advisories/new)**
(repo → **Security** → **Report a vulnerability**). Include a description, affected
version/component, and a reproduction if you have one.

We aim to acknowledge within a few days and to coordinate a fix and disclosure timeline with you.

## Supported versions

Breakerbox is pre-1.0; security fixes land on the latest released version on PyPI. Please reproduce
against the latest `agentbreaker` before reporting.

## Design guarantees (the security model)

These are intentional, permanent constraints — a vulnerability report that shows any of them is
violable is exactly what we want to hear about:

- **No server execution of your graphs.** The visual builder is codegen-only: a spec (JSON) becomes
  a Python **string** you download and run yourself. There is no runner, sandbox, or endpoint that
  evaluates, imports, or templates user code.
- **No stored or transmitted provider keys.** Breakerbox never stores, receives, or proxies your
  LLM/provider API keys. Bring-your-own-key features call the provider **directly from the browser**;
  the key lives only in `localStorage`.
- **Least-privilege cloud.** The optional dashboard uses Supabase with row-level security; the public
  anon key is browser-safe by design, and the service role is used only inside edge functions. A
  Breakerbox **ingest key** authorizes reporting your own runs and is stored only as a hash.

If you believe any of the above is not holding, that's a security issue — please report it.
