# Learnings

## 2026-09-21T15:10+05:30 @claude-opus — Start a session from the handoff bundle, not from the folder. {#L-5vz3k}
- kind: pattern
- tags: handoff, context, session
- applies_to: resume-issue
- promote: candidate

Start every session with `wf context <issue>`. Read `## Needs you` first, then the next step. Open other files only when the bundle points at them.

Evidence: A fresh agent that read all six files spent 18,000 tokens before its first edit. The bundle took 3,900.

## 2026-10-20T15:47+05:30 @claude-opus — Write each criterion so that a command or a named person can check it. {#L-2pn6j}
- kind: pattern
- tags: ears, criteria, writing
- applies_to: `goal.md`, write-goal
- promote: candidate

Write each criterion in an EARS pattern. Add a number with a unit, a backticked literal or a `verify:` line, so that the check has one answer.

Evidence: S07 flagged 6 of the 19 criteria in the first draft of this workspace. Each one had `fast` or `reliable` in it.
