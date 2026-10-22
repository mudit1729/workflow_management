// issues/wf/build-v1: wf-b1d7v, the umbrella milestone that tracks the whole build.
// A lanes plan with 7 tasks in 4 phases, 7 criteria, an fyi request to the acting author.
import type { IssueSrc } from "../../source";
import { ago, ahead, dateIn, daysAgo } from "../../time";

export function buildV1(): IssueSrc {
  return {
    slug: "build-v1",
    group: "g-wf001",
    goal: {
      id: "wf-b1d7v",
      title: "Build v1",
      status: "in_progress",
      priority: "high",
      size: "l",
      owner: "mudit",
      labels: ["milestone"],
      claimed_by: "claude-opus",
      lease_until: ahead(48),
      blocked_by: [],
      due: dateIn(9),
      created: daysAgo(61, 10, 5),
    },
    context: `wf v1 is the first version that a team can run on its own repo. It holds the file format, the Rust daemon, the CLI, the web UI and the skills. The team builds v1 inside wf, so this folder is also the main example of the format.

This issue tracks the whole build. Each group lead links the issues that block the release, and the coordinator keeps the plan and the state current. Read \`current_state.md\` first. It names the one next action.`,
    criteria: [
      {
        text: "When a user runs `wf init` in an empty git repo, the CLI shall create a workspace that `wf lint` accepts.",
        checked: true,
        verify: "`cargo test -p wf-cli init_lints_clean`",
        evidence: "`cargo test -p wf-cli init_lints_clean` passed at `7c2e9d4`, see [[#C-6hx3q]]",
        verified_by: "codex",
      },
      {
        text: "When a file in the workspace changes, the daemon shall rebuild the affected roll-ups within 500 ms.",
        checked: true,
        verify: "`cargo test -p wf-index rollup_latency`",
        evidence: "`cargo test -p wf-index rollup_latency` passed at `e41b8a7`, see [[#C-9rm5t]]",
        verified_by: "mudit",
      },
      {
        text: "If a write conflicts with a newer edit, then the daemon shall refuse the write and return the current value.",
        checked: true,
        verify: "`cargo test -p wf-server write_conflict`",
        evidence: "`cargo test -p wf-server write_conflict` passed at `2fa90c6`, see [[#C-4zp7d]]",
        verified_by: "codex",
      },
      {
        text: "The web UI shall show every issue, group and open request of the workspace.",
        checked: false,
        verify: "manual",
      },
      {
        text: "When an agent runs `wf context` on an issue, the CLI shall print a bundle of at most 6000 tokens.",
        checked: false,
        verify: "`cargo test -p wf-cli context_budget`",
      },
      {
        text: "When an agent starts a session on an issue, the `resume-issue` skill shall load the context bundle first.",
        checked: false,
        verify: "manual",
      },
      {
        text: "The release shall pass `wf lint --strict` on the dogfood workspace.",
        checked: false,
        verify: "`just dogfood-lint`",
      },
    ],
    out_of_scope: `- Two-way sync with GitHub, Jira or Linear. See [[wf-n7vy3]].
- Login and roles. See [[wf-ss0lo]].
- More than one workspace per daemon.`,
    links: `- [[wf-3k9x2]]: live board updates.
- [[wf-t3jp5]]: the context bundle within the token budget.
- [[wf-g5rx8]]: the v0.1 release.
- [[lib-6pm4c]]: how an agent resumes an issue.`,
    plan: {
      updated_at: ago(9 * 60),
      updated_by: "claude-opus",
      revision: 4,
      approach: `Build v1 in four phases. The format and the index land first, because every other part reads them. The daemon and the CLI follow. The web UI and the skills then run in parallel on the mock server and the fixtures. The release phase starts when the other phases are done.`,
      assumptions: [
        { id: "A1", text: "`cargo test --workspace` stays under 90 s in CI.", state: "confirmed" },
        { id: "A2", text: "The skills need no change after the format freezes.", state: "open" },
        {
          id: "A3",
          text: "Dogfooding finds the last format gaps before the release.",
          state: "open",
        },
      ],
      prior_art: [{ ref: "lib-6pm4c", why: "start every agent session from the handoff bundle." }],
      phases: [
        {
          index: 1,
          name: "Format and index",
          tasks: [
            {
              id: "T-1",
              title: "Freeze wf_format 1",
              status: "done",
              lane: "core",
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "mudit",
              verify: "`cargo test -p wf-parse golden`",
              brief:
                "Write the grammar into `spec/format.md`. Cover every file type with a golden fixture.",
              steps: [
                { text: "Write `spec/format.md`.", done: true },
                { text: "Add one golden fixture per file type.", done: true },
              ],
            },
            {
              id: "T-2",
              title: "Ship the index and the watcher",
              status: "done",
              lane: "core",
              depends_on: ["T-1"],
              satisfies: ["SC-2"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-index`",
              brief: "Scan the workspace into a snapshot and keep it current from watcher events.",
            },
          ],
        },
        {
          index: 2,
          name: "Daemon and CLI",
          tasks: [
            {
              id: "T-3",
              title: "Ship the write protocol",
              status: "done",
              lane: "server",
              depends_on: ["T-2"],
              satisfies: ["SC-3"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-server write_conflict`",
              brief:
                "Lock the file, check the `base_rev`, splice one value and write the file atomically.",
            },
            {
              id: "T-4",
              title: "Ship the context bundle",
              status: "in_progress",
              lane: "core",
              depends_on: ["T-2"],
              satisfies: ["SC-5"],
              assignee: "role:backend",
              claimed_by: "mudit",
              lease_until: ahead(55),
              verify: "`cargo test -p wf-cli context_budget`",
              brief:
                "Land [[wf-t3jp5]]. The bundle must fit the budget and must keep `## Needs you` and `## Next steps`.",
              steps: [
                { text: "Count tokens in the bundle.", done: true },
                { text: "Trim the bundle in a fixed order.", done: false },
              ],
            },
          ],
        },
        {
          index: 3,
          name: "Board and skills",
          tasks: [
            {
              id: "T-5",
              title: "Ship the board and the drawer",
              status: "in_progress",
              lane: "web",
              depends_on: ["T-3"],
              satisfies: ["SC-4"],
              assignee: "role:frontend",
              claimed_by: "shruti",
              lease_until: ahead(42),
              verify: "manual",
              brief:
                "Build every element of the board, the drawer, the library and the inbox on the mock server. Live updates come from [[wf-3k9x2]].",
              steps: [
                { text: "Build the board and the cards.", done: true },
                { text: "Build the drawer tabs.", done: true },
                { text: "Build the library and the inbox.", done: false },
              ],
            },
            {
              id: "T-6",
              title: "Ship the skills and hooks",
              status: "todo",
              lane: "skills",
              depends_on: ["T-1"],
              satisfies: ["SC-6"],
              assignee: "role:skills",
              verify: "manual",
              brief:
                "Write the 14 skills of the three plugins and the `SessionStart` hook. [[wf-skf01]] draws the flowchart.",
            },
          ],
        },
        {
          index: 4,
          name: "Release",
          tasks: [
            {
              id: "T-7",
              title: "Cut v0.1 and dogfood the build",
              status: "todo",
              lane: "release",
              depends_on: ["T-4", "T-5", "T-6"],
              satisfies: ["SC-7"],
              assignee: "mudit",
              verify: "`just dogfood-lint`",
              brief:
                "Tag v0.1 through [[wf-g5rx8]]. Run `wf lint --strict` on the dogfood workspace.",
            },
          ],
        },
      ],
    },
    state: {
      summary:
        "The format, index and write protocol are done; the context bundle and the board are in flight.",
      updated_at: ago(2 * 60 + 20),
      updated_by: "claude-opus",
      phase: "Board and skills",
      library_refs: ["lib-6pm4c"],
      session: "cc-9a1f",
      done: [
        "[[#T-1]] The format is frozen. See [[#D-6kq4w]].",
        "[[#T-2]] The index and the watcher run. See [[wf-7p4dn]].",
        "[[#T-3]] Writes use the lock and the rev check. See [[wf-9tq4e]].",
      ],
      in_flight: [
        "[[#T-4]] The context bundle. @mudit holds the lease. [[wf-t3jp5]] trims it to 6000 tokens.",
        "[[#T-5]] The board and the drawer. @shruti holds the lease. [[wf-3k9x2]] adds live updates.",
      ],
      blocked: ["[[#T-7]] waits for [[#T-4]], [[#T-5]] and [[#T-6]]."],
      needs_you: [
        {
          id: "Q-2kx9r",
          question:
            "Keep the due date in 9 days, or move the release by 2 days if the context bundle slips?",
          from: "claude-opus",
          to: "shruti",
          kind: "question",
          urgency: "fyi",
          asked: ago(95),
          ref: "[[wf-t3jp5]]",
        },
      ],
      failed_attempts: [
        "CI job `rust` timed out: `test result: FAILED. finished in 612.04s` in `wf-index`. Built the golden fixtures once per run. See [[#C-8cw2n]].",
      ],
      handoff: [
        "Group leads own their lane issues. Do not edit the `plan.md` of another lane.",
        "Run `just dogfood-lint` before you ask for a review.",
      ],
      next_steps: [
        "Land [[wf-t3jp5]] so that SC-5 gets evidence.",
        "Claim [[#T-6]] and start [[wf-p2hs4]].",
        "Run `wf verify wf-b1d7v SC-4` after the board passes the manual check.",
      ],
    },
    changes: [
      {
        id: "C-6hx3q",
        ts: daysAgo(11, 16, 40),
        author: "codex",
        title: "Verified SC-1 with `init_lints_clean`",
        kind: "verify",
        task: "T-1",
        criteria: ["SC-1"],
        result: "pass",
        evidence: "`cargo test -p wf-cli init_lints_clean` passed at `7c2e9d4`",
        commit: "7c2e9d4",
        model: "gpt-5-codex",
        body: "Ran `wf verify wf-b1d7v SC-1`. `wf init` created a workspace in a temp repo and `wf lint` reported zero findings.",
      },
      {
        id: "C-9rm5t",
        ts: daysAgo(7, 12, 5),
        author: "mudit",
        title: "Verified SC-2: roll-ups rebuild in 180 ms",
        kind: "verify",
        task: "T-2",
        criteria: ["SC-2"],
        result: "pass",
        evidence: "`cargo test -p wf-index rollup_latency` passed at `e41b8a7`",
        commit: "e41b8a7",
        body: "Touched one `goal.md` in the golden workspace with 40 issues. The roll-ups rebuilt in 180 ms, below the 500 ms limit.",
      },
      {
        id: "C-4zp7d",
        ts: daysAgo(6, 17, 30),
        author: "codex",
        title: "Verified SC-3 with `write_conflict`",
        kind: "verify",
        task: "T-3",
        criteria: ["SC-3"],
        result: "pass",
        evidence: "`cargo test -p wf-server write_conflict` passed at `2fa90c6`",
        commit: "2fa90c6",
        model: "gpt-5-codex",
        body: "Changed `goal.md` between the read and the write. The server answered 409 with the current value and left the file untouched.",
      },
      {
        id: "C-8cw2n",
        ts: ago(26 * 60 + 10),
        author: "codex",
        title: "CI timed out in `wf-index`",
        kind: "failure",
        result: "fail",
        evidence: "`test result: FAILED. finished in 612.04s`",
        files: [".github/workflows/ci.yml"],
        body: "The `rust` job ran past 10 min. Each test rebuilt the golden fixtures from scratch, and the runner has 2 cores.",
      },
      {
        id: "C-3tb6y",
        ts: ago(24 * 60 + 50),
        author: "codex",
        title: "Built the golden fixtures once per CI run",
        kind: "fix",
        commit: "d90b4e3",
        files: ["fixtures/golden/build.rs", ".github/workflows/ci.yml"],
        body: "Moved the fixture build into a `build.rs` step and cached it. The `rust` job now takes 74 s.",
      },
      {
        id: "C-7qs5w",
        ts: ago(5 * 60),
        author: "claude-sonnet",
        title: "Built the issue drawer on the mock server",
        kind: "progress",
        task: "T-5",
        files: ["web/src/features/issue/IssueDrawer.tsx"],
        model: "claude-sonnet-5-5",
        body: "Added the five drawer tabs and the docked and overlay modes. The drawer reads every field from the mock `IssueDetail`.",
      },
    ],
    decisions: [
      {
        id: "D-6kq4w",
        ts: daysAgo(14, 11, 40),
        author: "mudit",
        title: "Freeze wf_format at 1 before the first release",
        status: "accepted",
        topic: "format",
        affects: ["SC-1"],
        decided_by: ["mudit", "shruti"],
        decision: "Freeze `wf_format = 1` now and change it only for a breaking edit.",
        because:
          "The skills, the parser and the web types all read the same files. A frozen format lets the three lanes build in parallel.",
        rejected: "Freeze at v1.0 (the lanes would build on a moving target).",
        consequences:
          "A new field needs a default and a lint rule. A rename needs `wf_format = 2`.",
        revisit: "Two features need a breaking edit in the same month.",
      },
      {
        id: "D-2ns9h",
        ts: ago(8 * 60),
        author: "claude-opus",
        title: "Ship the web build inside the binary",
        status: "proposed",
        topic: "packaging",
        affects: ["SC-4"],
        decided_by: ["claude-opus"],
        decision: "Embed the built `web/dist` files in the `wf` binary with `rust-embed`.",
        because: "A user installs one file. `wf serve` then needs no Node and no second download.",
        rejected: "A separate `wf-web` archive (two downloads, two versions to match).",
        consequences: "Every web change needs a Rust rebuild. The binary grows by about 2 MB.",
        revisit: "The web build passes 5 MB.",
      },
    ],
    learnings: [
      {
        id: "L-5vz3k",
        ts: daysAgo(31, 15, 10),
        author: "claude-opus",
        title: "Start a session from the handoff bundle, not from the folder.",
        kind: "pattern",
        tags: ["handoff", "context", "session"],
        applies_to: ["resume-issue"],
        promote: "candidate",
        rule: "Start every session with `wf context <issue>`. Read `## Needs you` first, then the next step. Open other files only when the bundle points at them.",
        evidence:
          "A fresh agent that read all six files spent 18,000 tokens before its first edit. The bundle took 3,900.",
      },
      {
        id: "L-2pn6j",
        ts: ago(2 * 24 * 60 + 40),
        author: "claude-opus",
        title: "Write each criterion so that a command or a named person can check it.",
        kind: "pattern",
        tags: ["ears", "criteria", "writing"],
        applies_to: ["goal.md", "write-goal"],
        promote: "candidate",
        rule: "Write each criterion in an EARS pattern. Add a number with a unit, a backticked literal or a `verify:` line, so that the check has one answer.",
        evidence:
          "S07 flagged 6 of the 19 criteria in the first draft of this workspace. Each one had `fast` or `reliable` in it.",
      },
    ],
    activity: [
      {
        ts: daysAgo(40, 9, 30),
        author: "mudit",
        kind: "status",
        title: "Moved from planned to in_progress",
      },
    ],
  };
}
