---
title: core
kind: group-summary
workspace: wf
group: wf/core
rev: "665a4a0"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Outcome

Parse, index, lint and write the files safely. 8 issues: 2 in progress, 1 blocked, 1 in review, 1 planned and 3 done. Done means: `cargo test --workspace` passes; the golden fixtures are updated.

## Issues

| Issue | Status | In one line |
|---|---|---|
| [Trim context bundles to the token budget](wf-t3jp5.md) | In progress | Token counting is done; the trim order is in flight |
| [Reap expired task leases](wf-q4fs9.md) | In progress | Lease state is in the index; the reaper is in flight and the lease on T-3 has expired |
| [Stream archify renders in the background](wf-w8vz4.md) | Blocked | Diagram event is blocked on the size contract from the embed research |
| [Lint glossary synonyms (S09)](wf-9gr4k.md) | Review | S09 rule passes its tests; @shruti reviews the new library draft |
| [Lint hedge words (S06)](wf-k8dv6.md) | Planned | Hedge words such as "maybe" and "probably" make a goal or a step impossible to check |
| [Scan the workspace into a snapshot](wf-7p4dn.md) | Done | Index scans the golden workspace in 118 ms; done |
| [Write back one value without reformatting](wf-9tq4e.md) | Done | Editor splices one value and writes the file atomically; done |
| [Parse meta lists with byte spans](wf-m3tq8.md) | Done | `wf-edit` splices every meta value through its span; done |

## Risks

- [[wf-w8vz4]] is blocked by [[wf-r6jk2]].

## Next

1. [[wf-t3jp5]]: Add the `## Next steps` test to [[wf-t3jp5#T-2]].
2. [[wf-q4fs9]]: Answer [[wf-q4fs9#Q-9nh2e]] in the Needs you list.
3. [[wf-w8vz4]]: Read the findings of [[wf-r6jk2]] when it moves to review.
4. [[wf-9gr4k]]: Wait for the review of [[wf-9gr4k#T-3]] by @mudit.
5. [[wf-k8dv6]]: Verify [[wf-k8dv6#SC-1]].
