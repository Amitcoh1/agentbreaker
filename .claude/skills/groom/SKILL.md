---
name: groom
description: Review the open GitHub issues and report what needs attention — underspecified (no Done-when), duplicate, stale, mis-milestoned, unlabeled, or too big — with one recommended action per issue. Applies only safe non-destructive fixes (labels/milestones/comments) and asks before closing anything. Use for a backlog review or when the user types /groom.
---

# groom

Keep the backlog honest and actionable. Produces a report and applies only safe fixes — it
never closes issues without confirmation.

## When to use

- Periodic backlog review (the weekly engine).
- The user types `/groom`.

## Steps

1. **Resolve repo:** `gh repo view --json nameWithOwner -q .nameWithOwner` → `<repo>`.
2. **Pull open issues:**
   `gh issue list --repo <repo> --state open --limit 100 --json number,title,body,labels,milestone,updatedAt,comments`
3. **Assess each** against:
   - **Underspecified** — no `## Done when`, or an empty checklist. *(Top priority — an issue
     without Done-when can't be executed by a fresh session.)*
   - **Duplicate / overlapping** — near-identical title or scope to another open issue.
   - **Stale** — no update in > 30 days and not in the current milestone.
   - **Mis-milestoned** — launch-blocking work not in `H0 — Launch`, or post-launch depth in H0.
   - **Unlabeled** — missing `product` or a milestone-matching label.
   - **Too big** — bundles several shippable units (one issue should = one session).
4. **Report** — a compact list grouped by severity, one recommended action each, e.g.:
   `#12 needs Done-when · #7 dup of #6 (close #7?) · #9 stale — still relevant? · #4 add label:launch`
5. **Apply only the safe, non-destructive fixes** automatically, and say what you did:
   - add a missing label: `gh issue edit <n> --repo <repo> --add-label product`
   - set/fix a milestone: `gh issue edit <n> --repo <repo> --milestone "<title>"`
   - add a "needs Done-when" comment with a suggested checklist.
6. **Ask before anything destructive** — closing duplicates or stale issues. Never close from
   this skill without an explicit yes (use `/close-issue` for real closes).

## Rules

- Propose first, mutate second. The only silent mutations allowed are labels, milestones, and comments.
- Don't invent work — flag underspecified issues for the author, or offer to draft the Done-when.
- Milestones are the source of truth for what's in flight (per ROADMAP.md).
- Recommend splitting when an issue isn't a single shippable unit.
