---
title: Push board updates over SSE
kind: issue-summary
issue: wf-3k9x2
workspace: wf
group: wf/web
status: in_progress
rev: "5b1e07a"
summarized_at: 2026-10-27T18:40+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Delta stream runs end to end; lagged-client resync has not started. @codex has claimed T-3, and the issue waits for @shruti on Q-4m2pz. 1 of 5 criteria is verified.

## Done so far

- Checked the raw-file view for invalid frontmatter · [[wf-3k9x2#C-m7x4c]]
- Verified SC-1 with `live_append` · `b81f03a` · [[wf-3k9x2#C-v2n8s]]
- Added the `live_append` test · [[wf-3k9x2#C-k4t7b]]
- Diffed snapshots into deltas · `4c1d7e0` · [[wf-3k9x2#C-9df2a]]
- Reverted to notify 8.2 and rescanned the subtree · `a3f9c21` · [[wf-3k9x2#C-h6r3n]]

## Decisions

- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE (accepted, replaces [[wf-3k9x2#D-2ab3c]])

## Learnings

- [[wf-3k9x2#L-2gk7r]] Rescan the subtree, since notify 8.2 drops rename events on macOS.
- [[wf-3k9x2#L-6ct3p]] Compare files by blake3 hash, never by mtime.

## Next

1. @shruti answers Q-4m2pz: Approve keeping SSE instead of WebSocket for the board?
2. Stream deltas over SSE in [[wf-3k9x2#T-3]], then start `resync` for lagged clients.
3. Claim [[wf-3k9x2#T-4]] once [[wf-3k9x2#T-3]] lands.
4. Verify [[wf-3k9x2#SC-3]] with its command.
