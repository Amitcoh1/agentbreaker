# Demo video — recording script (#153)

A ~60-second screen recording of the runaway demo: a loop that burns **$12.63** unguarded is stopped
at **$0.82**, with the trip and the explainable receipt on screen. No API keys — the demo is
deterministic. **You record this** (user-in-the-loop); this is the shot list + narration.

## Setup (before recording)
- Terminal, dark theme, large font (≥16pt), ~100 cols. Clean prompt.
- From the repo root: `cd examples/runaway_demo`.
- Do a dry run first so nothing installs mid-take.

## Shot list

| # | Duration | On screen | Narration (voiceover or captions) |
|---|---|---|---|
| 1 | 0:00–0:05 | Title card: **"Your agents can't outspend you."** | "A runaway agent loop. Watch what it costs." |
| 2 | 0:05–0:20 | Run the **unguarded** path — the counter climbs hop after hop | "Unguarded, this loop never drops its context. Every hop costs more than the last…" |
| 3 | 0:20–0:26 | Final unguarded line: `ran 60 hops, spent $12.63` | "…sixty hops. Twelve dollars and sixty-three cents. On one run." |
| 4 | 0:26–0:32 | Show the one line: `guard(app, budget_usd=0.90, ladder=Ladder.default())` | "One wrap. A hard budget — and a degradation ladder." |
| 5 | 0:32–0:48 | Run the **guarded** path — counter climbs, then **⏻ tripped** at a hop boundary | "It trips at the hop boundary — never mid-call. Stopped at eighty-two cents." |
| 6 | 0:48–0:56 | The receipt: `killed (budget) · stopped at $0.82 · budget $0.90` + the explainable decision JSON | "And it tells you exactly why — an explainable trip, not a silent kill. Averted: eleven eighty-one." |
| 7 | 0:56–1:00 | End card: `pip install breakerbox` · github.com/Amitcoh1/agentbreaker | "Measure everywhere. Enforce at the boundary." |

## Exact commands to show
```bash
# shot 2–3: the runaway, unguarded
python demo.py --unguarded        # → ran 60 hops, spent $12.63

# shot 5–6: guarded — trips at $0.82 of a $0.90 budget
python demo.py                    # → killed early, spent $0.82 (budget $0.90); writes report.html
```
> If `demo.py` doesn't expose an `--unguarded` flag, run the bundled comparison it already prints
> (the `AVERTED $11.81` block) and hold on that frame for shots 2–3.

## Capture notes
- Record at 1080p or higher; export a 16:9 MP4 for the site and a 9:16 crop for social.
- Keep the tripped frame (shot 5) on screen for a beat — that's the money shot.
- The explainable-decision JSON (shot 6) is the differentiator vs. a plain cap — don't cut it.

## Where it embeds
- Marketing hero already has a live "tripped receipt" card; the video slots into the `WatchReel`
  section (`cloud/marketing/components/WatchReel.tsx`) — drop the MP4/poster there.
- Also embeddable at the top of the [spend-unpredictability guide](../../cloud/docs/content/docs/unpredictable-spend.mdx).
