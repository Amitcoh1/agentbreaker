---
name: file-issue
description: Turn a gap or task found during work into a GitHub issue (roadmap "Why + Done-when" shape) on the current repo, with sensible milestone + labels. Creates a milestone only when a new horizon is explicitly named. Use when you or the user spot something to build/fix later, or when the user types /file-issue.
---

# file-issue

Capture a gap/task as a GitHub issue so it isn't lost — fast, without derailing current work.
This is a capture tool, not a planning session.

## When to use

- You (or the user) notice something that should be built or fixed later during a session.
- The user types `/file-issue [rough description]`.
- Right after finishing work, to log the follow-ups you discovered.

## Steps

1. **Resolve the repo:** run `gh repo view --json nameWithOwner -q .nameWithOwner` → use as `<repo>`.
   If `gh` is not authenticated, stop and tell the user to run `gh auth login`.

2. **Draft the issue** from the user's words + the current context:
   - **Title** — imperative, specific, ≤ ~70 chars (e.g. `Add undo/redo to the builder`).
   - **Body** — exactly this shape (the `Done when` list is the whole point — it must be
     executable by a fresh Claude Code session with no extra context):
     ```
     ## Why
     <1–2 lines: the gap and why it matters. Reference a ROADMAP.md bullet if it maps to one.>

     ## Done when
     - [ ] <concrete, checkable acceptance criterion>
     - [ ] <…>
     - [ ] tests + lint + CI green (if it's code)
     ```

3. **Pick milestone + labels — only from ones that already exist:**
   - Existing milestones: `gh api repos/<repo>/milestones --jq '.[].title'`
   - Existing labels: `gh label list --repo <repo>`
   - Milestone: `H0 — Launch` if it blocks launch · `H1 — Moat` if it's post-launch depth · else none.
   - Labels: always `product`; add `flagship` for a headline feature; `launch`/`moat` to match the milestone.
   - **New milestone:** create one ONLY if the user explicitly names a new horizon —
     `gh api repos/<repo>/milestones -f title="<name>" -f description="<one line>"`.

4. **Dedupe:** `gh issue list --repo <repo> --search "<2–3 keywords>" --state open`.
   If a close match exists, link it and ask whether to still file — never create a near-duplicate silently.

5. **Confirm in one line** (`title · milestone · labels`), then create:
   ```
   gh issue create --repo <repo> --title "<title>" \
     --milestone "<milestone>" --label "product,<extra>" \
     --body "$(cat <<'EOF'
   ## Why
   ...
   ## Done when
   - [ ] ...
   EOF
   )"
   ```
   Omit `--milestone` if none. Print the returned issue URL.

6. If several gaps came up at once, batch them and list all the URLs.

## Rules

- **One issue = one shippable unit of work** (so it maps cleanly to one Claude Code session later).
- Capture what was actually observed; don't invent scope.
- Keep it fast: default to sensible milestone/labels and proceed; only ask when genuinely ambiguous.
- Never create labels/milestones that already exist. Never delete or close issues from this skill.
- Strategy stays private: budgets/pricing/partnership/kill-criteria belong in the private tracker,
  not in a public issue.
