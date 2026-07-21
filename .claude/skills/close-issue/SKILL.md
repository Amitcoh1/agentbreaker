---
name: close-issue
description: Close a GitHub issue once its "Done when" is actually met — verify each criterion, reference the resolving commit/PR, then close. Refuses to close if the acceptance criteria aren't satisfied. Use after finishing work that resolves an issue, or when the user types /close-issue.
---

# close-issue

Close an issue honestly: only when its acceptance criteria are truly met, with a trail back to
what resolved it.

## When to use

- You just finished work that resolves an open issue.
- The user types `/close-issue [number]`.

## Steps

1. **Resolve repo:** `gh repo view --json nameWithOwner -q .nameWithOwner` → `<repo>`.
2. **Identify the issue:**
   - From the user's `[number]`, or
   - infer from recent work: `gh issue list --repo <repo> --state open --search "<keywords>"`.
     If ambiguous, list the candidates and ask.
3. **Read it:** `gh issue view <n> --repo <repo>` — note the `## Done when` checklist.
4. **Verify every `Done when` item is actually met.** If any isn't, **DO NOT close** — comment
   what's left and stop:
   `gh issue comment <n> --repo <repo> --body "Not closing yet — still open: <items>."`
   For code items, confirm tests/lint/CI are green (`gh run list --repo <repo> --limit 1`).
5. **Find the resolving commit(s)/PR:** `git log --oneline -8` or the merged PR.
6. **Close with a trail:**
   - Comment: `gh issue comment <n> --repo <repo> --body "Resolved by <sha/PR>. <1-line summary of what shipped>."`
   - Close: `gh issue close <n> --repo <repo> --reason completed`
   - If you're *about to commit* the resolving change, prefer putting `Closes #<n>` in the commit
     or PR body — GitHub closes it automatically and you skip the manual close.
7. Print the issue URL and its new state.

## Rules

- **Never close an issue whose `Done when` isn't genuinely satisfied** — that discipline is the point.
- Always leave a comment linking the commit/PR so "why closed" stays auditable.
- Don't touch unrelated issues; don't reopen.
- If one change closed several issues, close each with its own trail comment.
