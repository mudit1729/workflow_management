// issues/wf/web/live-board-updates: the dogfood issue wf-3k9x2 (contract §4 example,
// moved forward in time). The richest issue in the mock world: every element of the
// drawer has real content here.
import type { IssueSrc } from "../../source";
import { ago, ahead, dateIn, daysAgo } from "../../time";

export const RESEARCH_NOTE = `# Delivering board updates

Input for [[#D-7f3k2]], written by @codex.

## Options

| Need | SSE | WebSocket | Polling every 2 s |
|---|---|---|---|
| Direction of data | Server to browser | Both ways | Browser asks |
| Reconnect and replay | Built in with \`Last-Event-ID\` | Custom code | Not needed |
| Latency | Under 100 ms | Under 100 ms | Up to 2 s |
| Server code | One axum route | A socket handler and a protocol | None |

## Findings

- The board writes through \`POST /api/ops\`. The live channel only reads.
- Browsers allow 6 HTTP/1.1 connections per origin. Each open tab holds one stream, so the board needs one leader tab.
- notify 9.0-rc reports a folder rename as \`Remove(Any)\` without the old path. notify 8.2 with a subtree rescan passes \`rename_folder\`.

## Recommendation

Use SSE with a ring of 256 events. Elect one leader tab per browser and share events over \`BroadcastChannel\`.
`;

export function liveBoardUpdates(): IssueSrc {
  return {
    slug: "live-board-updates",
    group: "g-web01",
    goal: {
      id: "wf-3k9x2",
      title: "Live board updates",
      status: "in_progress",
      priority: "high",
      size: "m",
      owner: "shruti",
      labels: ["live", "sse"],
      claimed_by: "claude-opus",
      lease_until: ahead(35),
      blocked_by: [],
      due: dateIn(8),
      created: daysAgo(3, 9, 12),
    },
    context: `Agents append changes from their terminals all day. Humans tick criteria and answer requests in the browser. Today the board shows those changes only after a manual reload, so a human reads old status and misses new needs-you requests.

This issue adds a live path from disk to the board. The daemon watches the workspace, rescans what changed and pushes each delta over SSE. The board must show a new entry within 2 s, without a reload.

\`\`\`wf-diagram
live-board-architecture
\`\`\``,
    criteria: [
      {
        text: "When an agent appends to `changes.md`, the board shall show the entry within 2 s.",
        checked: true,
        verify: "`cargo test -p wf-index live_append`",
        evidence: "`cargo test -p wf-index live_append` passed at `b81f03a`, see [[#C-v2n8s]]",
        verified_by: "codex",
      },
      {
        text: "If `goal.md` frontmatter is invalid, then the drawer shall show a lint finding and the raw file.",
        checked: true,
        verify: "manual",
        evidence: "screenshot `evidence/sc2.png`, checked by @shruti",
        verified_by: "shruti",
      },
      {
        text: "While the event stream is down, the board shall show a reconnecting badge and replay missed events on reconnect.",
        checked: true,
        verify: "`pnpm -C web test live-reconnect`",
      },
      {
        text: "When two tabs are open, the dashboard shall hold only one event-stream connection.",
        checked: false,
        verify: "manual",
        scenario:
          "Given 2 open board tabs / When the leader tab closes / Then the other tab opens `/api/events` within 2 s",
      },
      {
        text: "The daemon shall ignore the watcher echo of its own writes.",
        checked: false,
        verify: "`cargo test -p wf-index echo_suppression`",
      },
    ],
    out_of_scope: `- Two-way sync with Jira or Linear.
- A WebSocket transport. See [[#D-7f3k2]].
- More than one workspace per daemon.`,
    links: `- [[wf-7p4dn]]: index scan and snapshot.
- [[lib-4tz7c]]: rescan subtrees instead of trusting notify on macOS.
- [[lib-3fz8t]]: push one-way live updates over SSE.
- \`spec/api.md\`: the SSE event types.`,
    plan: {
      updated_at: ago(4 * 60 + 10),
      updated_by: "claude-opus",
      revision: 3,
      approach: `Treat each watcher event as a dirty hint. Rescan the nearest existing ancestor, diff the files by hash and push one \`delta\` per debounce window over SSE. One leader tab per browser holds the stream and shares events with the other tabs.

\`\`\`wf-diagram
sse-delivery-flow
\`\`\``,
      assumptions: [
        {
          id: "A1",
          text: "notify 8.2 is enough on macOS if we rescan subtrees.",
          state: "confirmed",
        },
        { id: "A2", text: "256 events of replay cover a laptop sleep.", state: "open" },
      ],
      prior_art: [
        { ref: "lib-4tz7c", why: "rescan the subtree on every event; never trust event kinds." },
      ],
      phases: [
        {
          index: 1,
          name: "Index deltas",
          tasks: [
            {
              id: "T-1",
              title: "Diff snapshots into deltas",
              status: "done",
              lane: "core",
              owns: ["crates/wf-index/src/delta.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-index delta`",
              brief:
                "Compare two snapshots by file hash. Emit one `Delta` with the upserted and removed issues and the changed details.",
              steps: [
                {
                  text: "Add `Delta` with `rev`, the upsert lists and the remove lists.",
                  done: true,
                },
                { text: "Diff the per-file blake3 hashes of two snapshots.", done: true },
                { text: "List the changed issue IDs in `details_changed`.", done: true },
              ],
            },
            {
              id: "T-2",
              title: "Suppress watcher echoes by content hash",
              status: "review",
              lane: "core",
              owns: ["crates/wf-index/src/watch.rs"],
              satisfies: ["SC-5"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-index echo_suppression`",
              brief:
                "Record the hash of each file the daemon writes, as [[lib-8w3fd]] describes. Drop a watcher event when the file on disk still has that hash.",
              steps: [
                { text: "Store the hash of each write in the index.", done: true },
                { text: "Skip events whose file hash matches the stored hash.", done: true },
              ],
            },
          ],
        },
        {
          index: 2,
          name: "Live transport",
          tasks: [
            {
              id: "T-3",
              title: "Build the SSE delta stream",
              status: "in_progress",
              lane: "server",
              depends_on: ["T-1", "T-2"],
              owns: ["crates/wf-server/src/sse.rs"],
              satisfies: ["SC-1", "SC-3"],
              assignee: "role:backend",
              claimed_by: "codex",
              lease_until: ahead(40),
              verify: "`cargo test -p wf-server sse`",
              brief:
                "Stream `delta` events from the index broadcast. Send `snapshot` on connect. Keep a ring of 256 events and replay them for `Last-Event-ID`.",
              steps: [
                { text: "Add the `GET /api/events` route.", done: true },
                { text: "Answer a lagged client with `resync`.", done: false },
              ],
            },
          ],
        },
        {
          index: 3,
          name: "Board client",
          tasks: [
            {
              id: "T-4",
              title: "Elect one leader tab over BroadcastChannel",
              status: "todo",
              lane: "web",
              owns: ["web/src/lib/live/leader.ts"],
              satisfies: ["SC-4"],
              assignee: "role:frontend",
              verify: "`pnpm -C web test leader`",
              brief:
                "Elect one leader tab with the Web Locks API. The leader opens the `EventSource` and relays each event to the other tabs over `BroadcastChannel`.",
              steps: [
                { text: "Take the `wf-live` lock in each tab.", done: false },
                { text: "Relay events from the leader over `BroadcastChannel`.", done: false },
              ],
            },
            {
              id: "T-5",
              title: "Fade changed cards and show the reconnecting badge",
              status: "todo",
              lane: "web",
              depends_on: ["T-3", "T-4"],
              owns: ["web/src/features/board/**"],
              satisfies: ["SC-1", "SC-3"],
              assignee: "role:frontend",
              verify: "`pnpm -C web test live-highlight`",
              brief:
                "Fade each changed card for 150 ms. The fade probably needs the `--wf-dur-2` token. Show a reconnecting badge in the toolbar while the stream is down.",
              steps: [
                { text: "Read the changed IDs from `issues_upserted`.", done: false },
                { text: "Add the `wf-flash` class for 150 ms.", done: false },
                { text: "Show the badge while the stream reconnects.", done: false },
              ],
            },
          ],
        },
      ],
    },
    state: {
      summary: "The delta stream runs end to end; lagged-client resync is in flight.",
      updated_at: ago(25),
      updated_by: "claude-opus",
      phase: "Live transport",
      library_refs: ["lib-4tz7c"],
      session: "cc-7d2e",
      done: [
        "[[#T-1]] Snapshot diff into deltas. See [[#C-9df2a]].",
        "[[#SC-1]] has evidence from `wf verify`. See [[#C-v2n8s]].",
        "[[#SC-2]] checked by @shruti with `evidence/sc2.png`. See [[#C-m7x4c]].",
      ],
      in_flight: [
        "[[#T-3]] SSE delta stream. @codex holds the lease. The route and `snapshot` on connect work. `resync` for lagged clients remains.",
        "[[#T-2]] Echo suppression waits for a review by @claude-sonnet.",
      ],
      blocked: ["[[#T-5]] waits for [[#T-3]] and [[#T-4]]."],
      needs_you: [
        {
          id: "Q-4m2pz",
          question: "Approve keeping SSE instead of WebSocket for the board?",
          from: "claude-opus",
          to: "shruti",
          kind: "approval",
          urgency: "blocking",
          asked: ago(48),
          options: ["approve", "reject"],
          ref: "[[#D-7f3k2]]",
        },
      ],
      failed_attempts: [
        "notify 9.0-rc: `Remove(Any)` lost on rename. Reverted to 8.2. See [[#C-5wq7k]].",
      ],
      handoff: [
        "@codex owns `crates/wf-server/src/sse.rs` under the T-3 lease. Do not edit that file.",
        "The mock server in `web/mock/` plays a scripted event loop every 20 s and the web lane can build T-4 and T-5 against it without waiting for T-3 to land on main.",
      ],
      next_steps: [
        "Finish `resync` for lagged clients in [[#T-3]].",
        "Claim [[#T-4]] once [[#T-3]] lands.",
        "Run `wf verify wf-3k9x2 SC-3`.",
      ],
    },
    changes: [
      {
        id: "C-3m8tz",
        ts: ago(47 * 60 + 5),
        author: "claude-opus",
        title: "Wrote the plan with 5 tasks in 3 lanes",
        kind: "docs",
        files: ["plan.md"],
        model: "claude-opus-5-5",
        session: "cc-41a9",
        body: "Split the work into the `core`, `server` and `web` lanes. Made T-4 independent of the server lane, so web work can start on the mock server.",
      },
      {
        id: "C-5rd9e",
        ts: ago(45 * 60 + 40),
        author: "codex",
        title: "Compared SSE, WebSocket and polling for the board",
        kind: "research",
        files: ["notes/research.md"],
        body: "Wrote `notes/research.md`. SSE needs one axum route and replays with `Last-Event-ID`. Polling every 2 s misses the latency target.",
      },
      {
        id: "C-5wq7k",
        ts: ago(41 * 60 + 15),
        author: "codex",
        title: "notify 9.0-rc lost the remove event of a renamed folder",
        kind: "failure",
        task: "T-2",
        result: "fail",
        evidence: "`cargo test -p wf-index rename_folder` failed",
        files: ["crates/wf-index/src/watch.rs"],
        body: "Ran `rename_folder` on notify 9.0-rc. The watcher reported `Remove(Any)` without the old path, and the index kept `issues/a/` after `mv issues/a issues/b`.",
      },
      {
        id: "C-h6r3n",
        ts: ago(40 * 60 + 2),
        author: "codex",
        title: "Reverted to notify 8.2 and rescanned the subtree",
        kind: "fix",
        task: "T-2",
        result: "pass",
        commit: "a3f9c21",
        files: ["crates/wf-index/src/watch.rs", "Cargo.lock"],
        body: "Pinned notify 8.2. Mapped each event to its nearest existing ancestor and rescanned that subtree. `rename_folder` passes.",
      },
      {
        id: "C-9df2a",
        ts: ago(30 * 60 + 20),
        author: "codex",
        title: "Diffed snapshots into deltas",
        kind: "progress",
        task: "T-1",
        commit: "4c1d7e0",
        files: ["crates/wf-index/src/delta.rs"],
        body: "Added `Delta` to `wf-index`. Compared two snapshots by per-file hash and listed the changed issue IDs.",
      },
      {
        id: "C-k4t7b",
        ts: ago(28 * 60 + 45),
        author: "codex",
        title: "Added the `live_append` test",
        kind: "test",
        task: "T-1",
        criteria: ["SC-1"],
        result: "pass",
        files: ["crates/wf-index/tests/live_append.rs"],
        body: "Appended an entry with `wf append` in a temp workspace and asserted a `delta` within 2 s. The delta arrived after 640 ms.",
      },
      {
        id: "C-v2n8s",
        ts: ago(26 * 60 + 10),
        author: "codex",
        title: "Verified SC-1 with `live_append`",
        kind: "verify",
        criteria: ["SC-1"],
        result: "pass",
        evidence: "`cargo test -p wf-index live_append` passed at `b81f03a`",
        commit: "b81f03a",
        body: "Ran `wf verify wf-3k9x2 SC-1`. The command passed and wrote the evidence to `goal.md`.",
      },
      {
        id: "C-8yb3m",
        ts: ago(20 * 60 + 30),
        author: "claude-sonnet",
        title: "Reviewed echo suppression in `watch.rs`",
        kind: "review",
        task: "T-2",
        model: "claude-sonnet-5-5",
        body: "Read the hash check in `watch.rs`. Asked for a test with two writes in one debounce window before the task moves to done.",
      },
      {
        id: "C-m7x4c",
        ts: ago(6 * 60 + 5),
        author: "shruti",
        title: "Checked the raw-file view for invalid frontmatter",
        kind: "verify",
        criteria: ["SC-2"],
        result: "pass",
        evidence: "screenshot `evidence/sc2.png`",
        files: ["evidence/sc2.png"],
        body: "Broke the YAML of `wf-7yq2m` by hand. The drawer showed F001 at line 7 and the raw file with the line highlighted.",
      },
      {
        id: "C-q3h9a",
        ts: ago(3 * 60 + 20),
        author: "claude-opus",
        title: "Resolved Q-7hd2k on the replay buffer size",
        kind: "answer",
        model: "claude-opus-5-5",
        body: "**Q:** Keep the SSE ring buffer at 256 events?\n**A:** Yes. Measure one laptop sleep before you change it. (@shruti)",
      },
      {
        id: "C-7k2q9",
        ts: ago(50),
        author: "codex",
        title: "Added the SSE delta stream",
        kind: "progress",
        task: "T-3",
        commit: "9f1e2ab",
        files: ["crates/wf-server/src/sse.rs"],
        body: "Added `GET /api/events`. The route streams `delta` events from the index broadcast.",
      },
      {
        id: "C-2xk8v",
        ts: ago(32),
        author: "codex",
        title: "Sent `snapshot` on connect",
        kind: "progress",
        task: "T-3",
        commit: "0d4a6c1",
        files: ["crates/wf-server/src/sse.rs"],
        body: "Sent one `snapshot` event when a client connects without `Last-Event-ID`.",
      },
    ],
    decisions: [
      {
        id: "D-2ab3c",
        ts: ago(46 * 60 + 30),
        author: "claude-opus",
        title: "Poll the snapshot every 2 s",
        status: "accepted",
        topic: "live-transport",
        affects: ["SC-1"],
        decided_by: ["claude-opus"],
        decision: "Poll `GET /api/snapshot` every 2 s from each open tab.",
        because: "Polling needs no new server code.",
        rejected: "SSE (one more route); WebSocket (two-way, more code).",
        consequences: "Each tab sends 30 requests a minute. An update can take 2 s to show.",
        revisit: "A test shows latency above 2 s.",
      },
      {
        id: "D-7f3k2",
        ts: ago(44 * 60 + 50),
        author: "claude-opus",
        title: "Push board updates over SSE",
        status: "accepted",
        topic: "live-transport",
        supersedes: "D-2ab3c",
        affects: ["SC-1", "SC-3"],
        decided_by: ["claude-opus", "shruti"],
        decision: "Use SSE for board updates.",
        because:
          "Data flows one way. SSE reconnects with `Last-Event-ID`. Polling every 2 s misses the latency target.",
        rejected: "WebSocket (two-way, more code); polling (latency up to 2 s).",
        consequences:
          "The board needs one leader tab per browser, because browsers allow 6 HTTP/1.1 connections per origin.",
        revisit: "The UI needs to send updates over the live channel.",
      },
      {
        id: "D-5mh8q",
        ts: ago(4 * 60 + 15),
        author: "claude-opus",
        title: "Elect one leader tab per browser",
        status: "proposed",
        topic: "multi-tab",
        affects: ["SC-4"],
        decided_by: ["claude-opus"],
        decision:
          "Elect one leader tab with the Web Locks API. The leader holds the `EventSource` and relays events over `BroadcastChannel`.",
        because:
          "Each open tab would hold one of the 6 connections that a browser allows per origin.",
        rejected: "A `SharedWorker` (harder to debug; a crash ends the stream for every tab).",
        consequences: "A new leader must take over within 2 s when the leader tab closes.",
        revisit: "The daemon serves HTTP/2, which removes the connection limit.",
      },
    ],
    learnings: [
      {
        id: "L-2gk7r",
        ts: ago(39 * 60 + 40),
        author: "codex",
        title: "notify 8.2 drops rename events on macOS; rescan the subtree instead.",
        kind: "gotcha",
        tags: ["notify", "macos", "watcher"],
        applies_to: ["crates/*/src/watch.rs", "notify"],
        promote: "candidate",
        rule: "Treat each notify event as a dirty hint. Rescan the nearest existing ancestor and compare the files by hash.",
        evidence:
          "[[#C-5wq7k]] lost a rename with notify 9.0-rc. [[#C-h6r3n]] passes `rename_folder` on 8.2 with the rescan.",
      },
      {
        id: "L-6ct3p",
        ts: ago(27 * 60 + 5),
        author: "claude-opus",
        title: "Compare files by blake3 hash, never by mtime.",
        kind: "pattern",
        tags: ["watcher", "hashing"],
        applies_to: ["crates/wf-index/**"],
        promote: "no",
        rule: "Compare files by blake3 hash, never by mtime. Editors and git checkouts rewrite mtimes without content changes.",
        evidence: "`git checkout main` touched 212 files. The hash diff found 3 real changes.",
      },
      {
        id: "L-9mz4e",
        ts: ago(25 * 60 + 35),
        author: "codex",
        title: "Keep the SSE ring buffer at 256 events",
        kind: "tip",
        tags: ["sse", "reconnect"],
        applies_to: ["crates/wf-server/src/sse.rs"],
        promote: "candidate",
        rule: "Keep the SSE ring buffer at 256 events. Send `resync` when `Last-Event-ID` is older than the buffer.",
        evidence: "A 10 min soak test on this workspace produced 140 events.",
      },
    ],
    docs: [
      { path: "notes/research.md", title: "Delivering board updates", body: RESEARCH_NOTE },
      { path: "evidence/sc2.png", bytes: 95362 },
    ],
    findings: [
      {
        rule: "S06",
        severity: "warn",
        file: "plan.md",
        find: "probably",
        message: "Hedge word “probably”. State the fact, or list it as an assumption.",
        fix: "The fade uses the `--wf-dur-2` token.",
      },
      {
        rule: "S01",
        severity: "warn",
        file: "current_state.md",
        find: "The mock server in `web/mock/` plays",
        message: "Sentence has 32 words (limit 25). Split it into two sentences.",
      },
    ],
  };
}
