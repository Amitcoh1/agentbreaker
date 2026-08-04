# Claims audit — prove or remove

_Task 3 / #199. We do not ship claims we cannot back. Each public claim was researched to a primary
source and either **cited**, **softened/attributed**, or **removed** from user-facing material
(README, marketing site, docs). Audited 2026-08._

| # | Claim | Verdict | Action taken |
|---|---|---|---|
| 1 | Stanford: 1000× tokens, 30× variance, accuracy saturates, models underestimate | **VERIFIED** (all four verbatim in the paper abstract) | **Cited** in the docs |
| 2 | LiteLLM budget-cap failures | **VERIFIED (technical)** / "a customer left" **UNVERIFIED** | Cited issue numbers; **dropped** "a customer left over it" |
| 3 | $47k / 11-day runaway | **REAL but single first-person blog** | **Attributed** to the author; no longer stated as our fact |
| 4 | "5–10% spend prevented → ROI" | **No external source** | Kept only as our own labelled assumption (VISION); not user-facing |
| — | "1.67B tokens in 5 hours" (marketing hero stat) | **UNVERIFIED / no source** | **Removed** from the live site, replaced with a cited Stanford figure |

## 1 — Stanford Digital Economy Lab figures ✅ VERIFIED

All four figures are stated verbatim in the abstract of a real Stanford Digital Economy Lab paper:

- **How Do AI Agents Spend Your Money? Analyzing and Predicting Token Consumption in Agentic Coding Tasks** — Bai, Huang, Wang, Sun, Mihalcea, **Brynjolfsson**, Pentland, Pei.
- arXiv: `https://arxiv.org/abs/2604.22750` · Lab: `https://digitaleconomy.stanford.edu/publication/how-do-ai-agents-spend-your-money-analyzing-and-predicting-token-consumption-in-agentic-coding-tasks/`
- Quoted: *"consuming 1000x more tokens than code reasoning and code chat"* · *"runs on the same task can differ by up to 30x in total tokens"* · *"accuracy often peaks at intermediate cost and saturates at higher costs"* · *"systematically underestimate real token costs."*

**Precision note:** the 1000× baseline is "code reasoning **and** code chat," not general chat — our
"1000× the tokens of chat" is a fair-but-loose gloss. Docs now attribute to the paper by name.
_Caveat: the paper was surfaced via web research (April 2026 submission); confirm the exact arXiv URL
renders before any high-stakes print/PR use._

## 2 — LiteLLM budget-cap failures 🟡 PARTIALLY VERIFIED

The **technical** claims are real and citable on `BerriAI/litellm`:
- "instantiated but never registered" → **#27381** (Global max_budget_limiter never registered as a callback; budget bypass)
- "spend continues past a configured cap" → **#26672** (key/user max_budget bypassed in v1.82.3; a $0.05 cap accumulated $0.54)
- "team-key bypasses" → **#11962**, **#12905** (user/max budget not enforced for keys belonging to teams)
- others: org budget (#17054), end-user budget (#15967), DB model budgets (#25799)

**"At least one customer left over it" — NO source found.** Removed from VISION §4. (It never appeared
in user-facing docs; `landscape.mdx` already omitted it and now cites the issue numbers above.)

## 3 — $47,000 / 11-day runaway 🟡 REAL BUT UNCORROBORATED

Primary source: Teja Kusireddy, *"We Spent $47,000 Running AI Agents in Production"* (Medium; reposted
Substack/Towards AI) — `https://todatabeyond.substack.com/p/we-spent-47000-running-ai-agents`. Every
specific matches (four LangChain agents, A2A ping-pong loop, 11 days, $47k). **But** it is a single
first-person account — no company named, no invoice, no independent corroboration. It is **not** our
data and there is **no** second independent incident in the results.

**Action:** docs now attribute it explicitly ("as engineer Teja Kusireddy recounted…") with a link,
rather than stating it as an established fact. The live marketing hero's `$47,000` count-up is handled
in the hero rewrite (#200), where it is attributed; the unverified `1.67B tokens/5hrs` stat beside it
is removed now (below).

## 4 — "5–10% of agent spend prevented" ⚪ OUR ASSUMPTION

No external source quantifies a "5–10% of agent spend is waste" figure. It appears **only in VISION §9**
(internal), phrased conditionally ("if Breakerbox stops even 5–10% …") — an honest assumption, not a
cited stat — and is **not** in any user-facing material. Left as-is, labelled as ours. The Stanford
"up to 30× variance / accuracy saturates" finding is the legitimate external anchor for *"material
waste exists"* — but must not be read as the source of the 5–10% number.

## What changed in the repo
- `cloud/docs/content/docs/unpredictable-spend.mdx` + `…-he.mdx`: $47k attributed to Kusireddy (+link); Stanford figures cited to the paper.
- `cloud/docs/content/docs/landscape.mdx`: LiteLLM claims now cite the specific issue numbers.
- `cloud/marketing/components/LandingV3.tsx`: removed the unverified "1.67B tokens/5hrs" stat, replaced with the cited Stanford "30× cost variance."
- `VISION.md`: dropped "at least one customer left over it"; added the Stanford paper citation to §1.
