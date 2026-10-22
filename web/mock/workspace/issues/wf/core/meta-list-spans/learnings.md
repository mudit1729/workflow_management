# Learnings

## 2026-10-12T16:20+05:30 @codex — A bare @handle works in a meta list but breaks YAML frontmatter. {#L-4dz9w}
- kind: gotcha
- tags: yaml, frontmatter, authors
- applies_to: `goal.md`, `plan.md`, `current_state.md`
- promote: candidate

Quote every handle in YAML frontmatter, for example `owner: "@shruti"`. A meta list accepts the bare form `- claimed_by: @codex`.

Evidence: Three `goal.md` files broke with F001 on `owner: @shruti` in one day.
