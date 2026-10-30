---
updated_at: 2026-10-16T09:30+05:30
updated_by: "@claude-opus"
revision: 1
---

## Approach

Read the branch name in a shell hook. Call `wf context` for the issue ID and print the bundle. Print nothing when the branch holds no ID.

## Prior art

- [[lib-6pm4c]]: the bundle is the first thing an agent reads.

## Phase 1: Hook

### T-1: Parse the issue ID from the branch name
- status: done
- lane: skills
- owns: `plugins/agent-execution/hooks/session_start.sh`
- satisfies: SC-1, SC-2
- assignee: @claude-opus
- claimed_by: @claude-opus
- verify: `bash plugins/agent-execution/hooks/test_no_issue.sh`

Match `wf-` followed by 5 characters at the start of the branch name.

### T-2: Print the bundle
- status: done
- lane: skills
- depends_on: T-1
- owns: `plugins/agent-execution/hooks/print_bundle.sh`
- satisfies: SC-1
- assignee: @claude-opus
- claimed_by: @claude-opus
- verify: `bash plugins/agent-execution/hooks/test_session_start.sh`

Run `wf context <id>` and write the output to the hook stream.

### T-3: Time the hook
- status: review
- lane: skills
- depends_on: T-2
- owns: `plugins/agent-execution/hooks/time_hook.sh`
- satisfies: SC-3
- assignee: @claude-opus
- claimed_by: @claude-opus
- verify: `bash plugins/agent-execution/hooks/time_hook.sh`

Run the hook 20 times and fail when the median passes 300 ms.
