---
updated_at: 2026-10-22T11:27+05:30
updated_by: "@claude-sonnet"
revision: 2
---

## Approach

List the skills first. Draw the flow in archify with one node per skill. Link each node to its `SKILL.md`, then add a coverage check to `wf skills lint`.

## Assumptions

- A1: Archify keeps 14 nodes readable on one page. [open]
- A2: Every skill has a one-line trigger in its frontmatter. [confirmed]

## Phase 1: Draw

### T-1: List the skills and their triggers
- status: done
- lane: docs
- owns: `docs/skills-flowchart/skills.json`
- satisfies: SC-1
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- verify: manual

Read the frontmatter of every `SKILL.md`. Write one row per skill.
- [x] Read the `SKILL.md` of the three plugins.
- [x] Write `notes/skill-triggers.md`.

### T-2: Draw the flow in archify
- status: in_progress
- lane: docs
- depends_on: T-1
- owns: `docs/skills-flowchart/**`
- satisfies: SC-2
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- lease_until: 2026-10-22T16:47+05:30
- verify: `node docs/skills-flowchart/check.mjs`

Draw one node per skill and one edge per hand-off. Lay the nodes out by the answer to [[#Q-6vt4c]].
- [x] Draw the nodes and the edges.
- [ ] Pick the layout after the answer to [[#Q-6vt4c]].
- [ ] Render the page with the archify CLI.

## Phase 2: Link and check

### T-3: Link each node to its SKILL.md
- status: todo
- lane: docs
- depends_on: T-2
- owns: `docs/skills-flowchart/links.json`
- satisfies: SC-3
- assignee: @claude-sonnet
- verify: manual

Add the relative path of the `SKILL.md` to each node.

### T-4: Report missing skills in `wf skills lint`
- status: todo
- lane: skills
- depends_on: T-3
- owns: `crates/wf-cli/src/skills_lint.rs`
- satisfies: SC-4
- assignee: role:backend
- verify: `cargo test -p wf-cli skills_lint_coverage`

Compare the node list of the flowchart with the skill folders. Print one finding per missing skill.
