---
id: wf-p2hs4
title: Resume the issue on session start
status: review
priority: medium
size: s
owner: "@shruti"
labels: [hooks]
claimed_by: "@claude-opus"
blocked_by: []
created: 2026-10-15T13:10+05:30
---

## Context

A fresh agent session starts with no memory of the issue. The `SessionStart` hook loads the context bundle, so the agent resumes where the last session stopped. The hook finds the issue from the branch name.

## Success criteria

- [x] SC-1: When a session starts on a branch named `wf-<id>/…`, the hook shall print the context bundle of that issue.
  - verify: `bash plugins/agent-execution/hooks/test_session_start.sh`
  - evidence: `bash plugins/agent-execution/hooks/test_session_start.sh` passed at `0c6fa38`
  - verified_by: @claude-opus
- [x] SC-2: If the branch names no issue, then the hook shall print nothing.
  - verify: `bash plugins/agent-execution/hooks/test_no_issue.sh`
  - evidence: `bash plugins/agent-execution/hooks/test_no_issue.sh` passed at `0c6fa38`
  - verified_by: @claude-opus
- [x] SC-3: The hook shall finish within 300 ms.
  - verify: `bash plugins/agent-execution/hooks/time_hook.sh`

## Out of scope

- Resuming from a branch of a different repo.
- Hooks for editors other than Claude Code.

## Links

- [[lib-6pm4c]]: how an agent resumes an issue.
- [[wf-skf01]]: the flowchart that shows where `resume-issue` runs.
