// issues/wf/core/background-archify-renders: wf-w8vz4, blocked by wf-r6jk2 (the embed-size research).
import type { IssueSrc } from "../../source";
import { daysAgo } from "../../time";

export function backgroundArchifyRenders(): IssueSrc {
  return {
    slug: "background-archify-renders",
    group: "g-core1",
    goal: {
      id: "wf-w8vz4",
      title: "Stream archify renders in the background",
      status: "blocked",
      priority: "medium",
      size: "m",
      owner: "mudit",
      labels: ["archify", "performance"],
      claimed_by: "codex",
      blocked_by: ["wf-r6jk2"],
      created: daysAgo(9, 13, 0),
    },
    context: `Archify takes 3 to 8 s to render one diagram. Today \`wf serve\` renders every block during the scan. The first snapshot waits for all of them, and the board stays empty for up to 40 s.

The server must answer the snapshot at once, render the diagrams in the background and push a \`diagram\` event when each render ends.`,
    criteria: [
      {
        text: "When the daemon starts, the server shall answer `GET /api/snapshot` within 500 ms, before any diagram renders.",
        checked: true,
        verify: "`cargo test -p wf-server snapshot_before_render`",
      },
      {
        text: "When a render ends, the server shall send a `diagram` event with the new status.",
        checked: false,
        verify: "`cargo test -p wf-server diagram_event`",
      },
      {
        text: "While archify runs, the server shall run at most 2 renders at the same time.",
        checked: false,
        verify: "`cargo test -p wf-archify concurrency_limit`",
      },
      {
        text: "If a render takes longer than 90 s, then the server shall mark the diagram as invalid with a timeout error.",
        checked: false,
        verify: "`cargo test -p wf-archify render_timeout`",
      },
    ],
    out_of_scope: `- Caching renders across workspaces.
- Rendering diagrams in the browser.`,
    links: `- [[wf-r6jk2]]: the research that sets the size hint in the \`diagram\` event.
- [[wf-t3jp5]]: the context bundle reads the node count from the render receipt.
- [[wf-3k9x2]]: the SSE stream that carries the event.`,
    plan: {
      updated_at: daysAgo(2, 11, 30),
      updated_by: "codex",
      revision: 2,
      approach:
        "Serve the snapshot first and put the renders in a queue. Run at most 2 renders at a time and send a `diagram` event after each one. Time out a render after 90 s.",
      assumptions: [
        {
          id: "A1",
          text: "The `diagram` event needs a height hint to stop layout jumps.",
          state: "open",
        },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Queue and events",
          tasks: [
            {
              id: "T-1",
              title: "Queue renders behind the first snapshot",
              status: "done",
              lane: "server",
              owns: ["crates/wf-archify/src/queue.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-server snapshot_before_render`",
              brief: "Scan the workspace, serve the snapshot and push each block into a queue.",
            },
            {
              id: "T-2",
              title: "Send a diagram event when a render ends",
              status: "blocked",
              lane: "server",
              depends_on: ["T-1"],
              owns: ["crates/wf-server/src/diagram_event.rs"],
              satisfies: ["SC-2"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-server diagram_event`",
              brief:
                "Send `{hash, status, errors}` and a height hint. The hint depends on the size contract of [[wf-r6jk2]].",
            },
            {
              id: "T-3",
              title: "Limit renders to 2 at the same time",
              status: "todo",
              lane: "server",
              depends_on: ["T-2"],
              owns: ["crates/wf-archify/src/pool.rs"],
              satisfies: ["SC-3"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-archify concurrency_limit`",
              brief: "Use a semaphore with 2 permits. Read the limit from `[archify] concurrency`.",
            },
            {
              id: "T-4",
              title: "Time out a render after 90 s",
              status: "todo",
              lane: "server",
              depends_on: ["T-3"],
              owns: ["crates/wf-archify/src/timeout.rs"],
              satisfies: ["SC-4"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-archify render_timeout`",
              brief:
                "Kill the `node` process after `timeout_s`. Mark the diagram `invalid` with a timeout error.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "Blocked. The diagram event waits for the size contract from the embed research.",
      updated_at: daysAgo(2, 11, 40),
      updated_by: "codex",
      phase: "Queue and events",
      session: "cx-0e6d",
      done: ["[[#T-1]] The queue serves the snapshot in 120 ms. See [[#C-6rt5m]]."],
      blocked: [
        "[[#T-2]] waits for [[wf-r6jk2]]. The event must carry a height hint, and the research sets its form.",
      ],
      needs_you: [],
      handoff: ["Do not start [[#T-3]] before [[#T-2]] lands. Both edit the render pool."],
      next_steps: [
        "Read the findings of [[wf-r6jk2]] when it moves to review.",
        "Unblock [[#T-2]] and send the event with a height hint.",
        "Claim [[#T-3]] after [[#T-2]] lands.",
      ],
    },
    changes: [
      {
        id: "C-6rt5m",
        ts: daysAgo(3, 14, 30),
        author: "codex",
        title: "Queued renders behind the first snapshot",
        kind: "progress",
        task: "T-1",
        criteria: ["SC-1"],
        commit: "47d1b9e",
        files: ["crates/wf-archify/src/queue.rs"],
        model: "gpt-5-codex",
        body: "Moved the render call out of the scan. The first snapshot of the golden workspace now arrives in 120 ms.",
      },
      {
        id: "C-3zk9w",
        ts: daysAgo(2, 11, 20),
        author: "codex",
        title: "Blocked T-2 on the size contract",
        kind: "research",
        task: "T-2",
        body: "Drafted the `diagram` event. It needs a height hint, or the iframe jumps when the render ends. Asked for the measurements in [[wf-r6jk2]].",
      },
    ],
    decisions: [
      {
        id: "D-7wc4x",
        ts: daysAgo(3, 12, 0),
        author: "codex",
        title: "Run at most 2 archify renders at the same time",
        status: "accepted",
        topic: "render-pool",
        affects: ["SC-3"],
        decided_by: ["codex", "mudit"],
        decision: "Limit archify to 2 parallel renders.",
        because:
          "Each render starts a Node process of about 300 MB. Two renders keep a laptop responsive.",
        rejected:
          "One render at a time (a 40 s queue for a large workspace); no limit (memory spikes).",
        consequences: "A workspace with 20 diagrams needs about 80 s to render them all.",
        revisit: "Archify renders in under 1 s.",
      },
    ],
    learnings: [],
    activity: [
      {
        ts: daysAgo(2, 11, 45),
        author: "codex",
        kind: "status",
        title: "Moved from in_progress to blocked",
      },
    ],
  };
}
