---
summary: "Planned. The release flow diagram fails to render; fix it before the CI work starts."
updated_at: 2026-10-21T15:10+05:30
updated_by: "@mudit"
---

## Handoff notes
- Run the dry run on a fork first. A wrong tag on the main repo cannot be deleted from the Homebrew tap.

## Next steps
1. Fix the archify errors of the release flow in `plan.md`.
2. Write the checklist in [[#T-1]].
3. Run `just release-dry-run` on a fork.
