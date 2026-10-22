// issues/wf/core/reap-expired-leases: wf-q4fs9. T-3 holds a lease that expired 35 min ago
// (Q004, amber). Request Q-9nh2e is answered and waits for `wf resolve`.
import type { IssueSrc } from "../../source";
import { ago, ahead, daysAgo } from "../../time";

export function reapExpiredLeases(): IssueSrc {
  return {
    slug: "reap-expired-leases",
    group: "g-core1",
    goal: {
      id: "wf-q4fs9",
      title: "Reap expired task leases",
      status: "in_progress",
      priority: "medium",
      size: "s",
      owner: "mudit",
      labels: ["lease"],
      claimed_by: "codex",
      lease_until: ahead(33),
      blocked_by: [],
      created: daysAgo(2, 15, 10),
    },
    context: `A task lease that expires still names its holder, so a task that another agent can take looks claimed for good. The index shows an amber warning (Q004) but never frees the task.

A reaper must free the claim after a grace period and tell the coordinator what it freed.`,
    criteria: [
      {
        text: "When a task lease has been expired for 15 min, the daemon shall release the claim and set the task to `todo`.",
        checked: false,
        verify: "`cargo test -p wf-index reap_after_grace`",
      },
      {
        text: "While a lease is inside its grace period, the board shall show the lease as expired.",
        checked: false,
        verify: "manual",
      },
      {
        text: "When the daemon reaps a lease, the daemon shall append a change entry that names the former holder.",
        checked: false,
        verify: "`cargo test -p wf-index reap_appends_change`",
      },
    ],
    out_of_scope: `- Reaping the lease of a coordinator. A person decides who takes over an issue.
- Warning an agent before its lease ends.`,
    links: `- [[wf-3k9x2]]: live updates show a reaped task within 2 s.
- [[wf-b1d7v]]: Build v1.`,
    plan: {
      updated_at: ago(3 * 60 + 30),
      updated_by: "codex",
      revision: 1,
      approach:
        "Compute the lease state in the index, then let a timer in the daemon release claims that stay expired past the grace period. Show the grace period on the board card.",
      assumptions: [
        { id: "A1", text: "A 15 min grace period covers an agent restart.", state: "confirmed" },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Detect and release",
          tasks: [
            {
              id: "T-1",
              title: "Compute the lease state in the index",
              status: "done",
              lane: "core",
              owns: ["crates/wf-index/src/lease.rs"],
              satisfies: ["SC-2"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-index lease_state`",
              brief: "Return `none`, `live` or `expired` from `claimed_by` and `lease_until`.",
            },
            {
              id: "T-2",
              title: "Release expired claims after the grace period",
              status: "in_progress",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-index/src/reap.rs"],
              satisfies: ["SC-1", "SC-3"],
              assignee: "role:backend",
              claimed_by: "codex",
              lease_until: ahead(33),
              verify: "`cargo test -p wf-index reap_after_grace`",
              brief:
                "Run a timer every minute. Clear `claimed_by` and `lease_until`, set the task to `todo` and append a change entry.",
              steps: [
                { text: "Add the minute timer.", done: true },
                { text: "Clear the claim under the file lock.", done: true },
                { text: "Append the change entry.", done: false },
              ],
            },
            {
              id: "T-3",
              title: "Show the grace period on the board card",
              status: "in_progress",
              lane: "web",
              depends_on: ["T-1"],
              owns: ["web/src/features/board/LeaseBadge.tsx"],
              satisfies: ["SC-2"],
              assignee: "role:frontend",
              claimed_by: "claude-sonnet",
              lease_until: ago(35),
              verify: "manual",
              brief:
                "Show `lease expired 12m ago` in amber on the card until the reaper frees the task.",
              steps: [
                { text: "Read `lease` from the task summary.", done: true },
                { text: "Show the amber badge with the time.", done: false },
              ],
            },
          ],
        },
      ],
    },
    state: {
      summary:
        "Lease state is in the index; the reaper is in flight and the lease on T-3 has expired.",
      updated_at: ago(45),
      updated_by: "codex",
      phase: "Detect and release",
      session: "cx-77c2",
      done: ["[[#T-1]] The index returns the lease state. See [[#C-4xn8r]]."],
      in_flight: [
        "[[#T-2]] The reaper. @codex holds the lease. The timer and the claim release work.",
        "[[#T-3]] The card badge. The lease of @claude-sonnet expired 35 min ago.",
      ],
      needs_you: [
        {
          id: "Q-9nh2e",
          question: "Release a lease at expiry, or after a grace period?",
          from: "codex",
          to: "mudit",
          kind: "question",
          urgency: "blocking",
          asked: ago(3 * 60),
          options: ["at expiry", "after 15 min"],
          answered: true,
          answer: "after 15 min. Agents often restart in under 10 min.",
          answered_by: "mudit",
          answered_at: ago(40),
        },
      ],
      handoff: [
        "@codex owns `crates/wf-index/src/reap.rs` under the T-2 lease. Do not edit that file.",
      ],
      next_steps: [
        "Run `wf resolve wf-q4fs9` to record the answer to [[#Q-9nh2e]].",
        "Append the change entry in [[#T-2]].",
        "Take over [[#T-3]] with `wf claim wf-q4fs9#T-3 --steal`.",
      ],
    },
    changes: [
      {
        id: "C-4xn8r",
        ts: daysAgo(1, 14, 10),
        author: "codex",
        title: "Returned the lease state from the index",
        kind: "progress",
        task: "T-1",
        commit: "f3a71d9",
        files: ["crates/wf-index/src/lease.rs"],
        model: "gpt-5-codex",
        body: "Added `lease_state()`. It returns `none`, `live` or `expired` for a task and for a coordinator.",
      },
      {
        id: "C-9kd3v",
        ts: ago(4 * 60 + 20),
        author: "claude-sonnet",
        title: "Read the lease state in the board card",
        kind: "progress",
        task: "T-3",
        files: ["web/src/features/board/IssueCard.tsx"],
        model: "claude-sonnet-5-5",
        body: "Passed `lease` from the task summary into the card. The amber badge is still missing.",
      },
      {
        id: "C-2hb7q",
        ts: ago(75),
        author: "codex",
        title: "Released an expired claim under the file lock",
        kind: "progress",
        task: "T-2",
        commit: "8b5e0c2",
        files: ["crates/wf-index/src/reap.rs"],
        model: "gpt-5-codex",
        body: "Added the minute timer and the claim release. The test sets a lease 20 min in the past and expects `todo` after one tick.",
      },
    ],
    decisions: [],
    learnings: [],
  };
}
