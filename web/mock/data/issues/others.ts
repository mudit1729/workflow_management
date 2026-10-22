// Lighter issues outside the web group. Each one shows a specific state or signal:
//   wf-a7ne5  stale (no change and no state update for 3 days), docs group
//   wf-f6qa2  minimal backlog issue, docs group
//   wf-g5rx8  urgent, due in 2 days; plan.md holds the invalid `broken-release-flow` diagram
//   wf-n7vy3  cancelled, out of v1 scope
//   wf-ss0lo  backlog, platform/auth
//   wf-y4bz7  planned, due date in the past, fyi question to @mudit (a scripted event answers it)
//   wf-p2hs4  in review, the SessionStart hook
//   wf-7p4dn  done, the index scan; wf-9tq4e done, the write-back splice (library sources)
import type { IssueSrc } from "../../source";
import { ago, dateIn, daysAgo } from "../../time";
import { DOCS_GROUP } from "../groups";

export function userGuide(): IssueSrc {
  return {
    slug: "user-guide",
    group: DOCS_GROUP,
    goal: {
      id: "wf-a7ne5",
      title: "Write the user guide",
      status: "in_progress",
      priority: "low",
      size: "m",
      owner: "shruti",
      labels: ["docs"],
      blocked_by: [],
      created: daysAgo(12, 11, 30),
    },
    context: `New users meet wf through the README and the skills. They need one guide that walks them from \`wf init\` to their first verified criterion in 20 minutes.

The guide lives in \`docs/user/\` and every command in it runs against the golden workspace.`,
    criteria: [
      {
        text: "When a new user follows the quickstart, the user shall reach a verified criterion within 20 min.",
        checked: false,
        verify: "manual",
      },
      {
        text: "The guide shall show one example of each file in an issue folder.",
        checked: false,
        verify: "manual",
      },
      {
        text: "Every command in the guide shall run against the golden workspace.",
        checked: false,
        verify: "`just docs-check`",
      },
    ],
    out_of_scope: `- A reference for every CLI flag. \`wf --help\` covers it.
- Video tutorials.`,
    plan: {
      updated_at: daysAgo(10, 14, 0),
      updated_by: "shruti",
      revision: 1,
      approach:
        "Write the quickstart first, because it tests the CLI the way a new user does. Write one page per file of the issue folder, then check every command in CI.",
      assumptions: [],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Draft",
          tasks: [
            {
              id: "T-1",
              title: "Write the quickstart",
              status: "done",
              lane: "docs",
              owns: ["docs/user/quickstart.md"],
              satisfies: ["SC-1"],
              assignee: "shruti",
              claimed_by: "shruti",
              verify: "manual",
              brief:
                "Walk from `wf init` to `wf verify` on one criterion. Keep the page under 400 words.",
            },
            {
              id: "T-2",
              title: "Write the issue anatomy page",
              status: "in_progress",
              lane: "docs",
              depends_on: ["T-1"],
              owns: ["docs/user/anatomy.md"],
              satisfies: ["SC-2"],
              assignee: "shruti",
              verify: "manual",
              brief:
                "Show one real example of `goal.md`, `plan.md`, `current_state.md` and the three logs.",
              steps: [
                { text: "Show `goal.md` and `plan.md`.", done: true },
                { text: "Show `current_state.md`.", done: false },
                { text: "Show the three logs.", done: false },
              ],
            },
            {
              id: "T-3",
              title: "Check every command against the golden workspace",
              status: "todo",
              lane: "docs",
              depends_on: ["T-2"],
              owns: ["docs/user/check.sh"],
              satisfies: ["SC-3"],
              assignee: "shruti",
              verify: "`just docs-check`",
              brief:
                "Extract each `wf` command from the pages and run it in a temp copy of the golden workspace.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "The quickstart is drafted; the anatomy page is half done.",
      updated_at: daysAgo(3, 17, 5),
      updated_by: "shruti",
      phase: "Draft",
      done: ["[[#T-1]] The quickstart has 6 steps. See [[#C-8hf5s]]."],
      in_flight: ["[[#T-2]] The anatomy page covers `goal.md` and `plan.md`."],
      needs_you: [],
      next_steps: ["Finish the anatomy page in [[#T-2]].", "Check the commands in [[#T-3]]."],
    },
    changes: [
      {
        id: "C-8hf5s",
        ts: daysAgo(5, 15, 10),
        author: "shruti",
        title: "Drafted the quickstart",
        kind: "docs",
        task: "T-1",
        files: ["docs/user/quickstart.md"],
        body: "Wrote a 6-step quickstart from `wf init` to `wf verify`. Ran it once on a clean laptop in 17 minutes.",
      },
      {
        id: "C-3wr2y",
        ts: daysAgo(3, 16, 20),
        author: "shruti",
        title: "Started the issue anatomy page",
        kind: "docs",
        task: "T-2",
        files: ["docs/user/anatomy.md"],
        body: "Added the examples of `goal.md` and `plan.md`. The other four files are still empty.",
      },
    ],
    decisions: [],
    learnings: [],
  };
}

export function agentHandoffNotes(): IssueSrc {
  return {
    slug: "agent-handoff-notes",
    group: DOCS_GROUP,
    goal: {
      id: "wf-f6qa2",
      title: "Research notes on agent handoffs",
      status: "backlog",
      priority: "none",
      size: "s",
      labels: ["research"],
      blocked_by: [],
      created: daysAgo(20, 16, 10),
    },
    context: `Agents lose context when a session ends. A good handoff note lets the next session continue in minutes. This note compares the handoff formats that teams use and picks one for wf.`,
    criteria: [
      {
        text: "The note shall compare 3 handoff formats.",
        checked: false,
        verify: "manual",
      },
      {
        text: "The note shall name the one format that wf adopts and give the reason.",
        checked: false,
        verify: "manual",
      },
    ],
    changes: [],
    decisions: [],
    learnings: [],
  };
}

export function cutRelease(): IssueSrc {
  return {
    slug: "cut-v0-1-release",
    group: "g-wf001",
    goal: {
      id: "wf-g5rx8",
      title: "Cut the v0.1 release",
      status: "planned",
      priority: "urgent",
      size: "m",
      owner: "mudit",
      labels: ["release"],
      blocked_by: [],
      due: dateIn(2),
      created: daysAgo(5, 10, 40),
    },
    context: `v0.1 is the first tagged build that outside testers can install. It needs a signed binary for each platform, release notes and a Homebrew formula. The tag is due in 2 days, and nobody has run the release flow end to end yet.`,
    criteria: [
      {
        text: "When a maintainer pushes the tag `v0.1.0`, CI shall build binaries for macOS and Linux.",
        checked: false,
        verify: "`just release-dry-run`",
      },
      {
        text: "The release notes shall list every issue that closed since the last tag.",
        checked: false,
        verify: "manual",
      },
      {
        text: "When a user runs `brew install wf`, the formula shall install `wf` and `wf-server`.",
        checked: false,
        verify: "manual",
      },
    ],
    out_of_scope: `- A Windows build. The first testers use macOS and Linux.
- Auto-update inside the binary.`,
    links: `- [[wf-b1d7v]]: Build v1, task T-7 cuts v0.1.`,
    plan: {
      updated_at: daysAgo(1, 15, 0),
      updated_by: "mudit",
      revision: 1,
      approach: `Build, sign, notarize and upload in one CI workflow. The diagram shows the current draft of the flow.

\`\`\`wf-diagram
broken-release-flow
\`\`\``,
      assumptions: [{ id: "A1", text: "Notarization takes under 15 min.", state: "open" }],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Prepare",
          tasks: [
            {
              id: "T-1",
              title: "Write the release checklist",
              status: "todo",
              lane: "release",
              owns: ["docs/release/checklist.md"],
              satisfies: ["SC-2"],
              assignee: "mudit",
              verify: "manual",
              brief:
                "List the steps from the tag to the Homebrew pull request. Name the owner of each step.",
            },
          ],
        },
        {
          index: 2,
          name: "Build",
          tasks: [
            {
              id: "T-2",
              title: "Build signed binaries in CI",
              status: "todo",
              lane: "release",
              depends_on: ["T-1"],
              owns: [".github/workflows/release.yml"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              verify: "`just release-dry-run`",
              brief:
                "Build for `aarch64-apple-darwin`, `x86_64-apple-darwin` and `x86_64-unknown-linux-gnu`. Sign and notarize the macOS builds.",
            },
            {
              id: "T-3",
              title: "Write the Homebrew formula",
              status: "todo",
              lane: "release",
              depends_on: ["T-2"],
              owns: ["packaging/homebrew/wf.rb"],
              satisfies: ["SC-3"],
              assignee: "mudit",
              verify: "manual",
              brief:
                "Install `wf` and `wf-server` from the release archive. Pin the SHA-256 of each archive.",
            },
          ],
        },
      ],
    },
    state: {
      summary:
        "Planned. The release flow diagram fails to render; fix it before the CI work starts.",
      updated_at: daysAgo(1, 15, 10),
      updated_by: "mudit",
      done: [],
      needs_you: [],
      handoff: [
        "Run the dry run on a fork first. A wrong tag on the main repo cannot be deleted from the Homebrew tap.",
      ],
      next_steps: [
        "Fix the archify errors of the release flow in `plan.md`.",
        "Write the checklist in [[#T-1]].",
        "Run `just release-dry-run` on a fork.",
      ],
    },
    changes: [
      {
        id: "C-4wb7h",
        ts: daysAgo(1, 15, 0),
        author: "mudit",
        title: "Drafted the release flow diagram",
        kind: "docs",
        files: ["plan.md"],
        body: "Added the first draft of the release flow to `plan.md`. Archify rejected it with 2 errors, one on an edge target and one on a missing label.",
      },
    ],
    decisions: [],
    learnings: [],
  };
}

export function githubTwoWaySync(): IssueSrc {
  return {
    slug: "github-two-way-sync",
    group: "g-wf001",
    goal: {
      id: "wf-n7vy3",
      title: "Two-way sync with GitHub issues",
      status: "cancelled",
      priority: "none",
      size: "l",
      owner: "mudit",
      labels: ["integration"],
      blocked_by: [],
      created: daysAgo(30, 11, 0),
    },
    context: `Some teams track work in GitHub issues. This issue asked for a sync in both directions, so that a change in one system shows up in the other.

The team cut it from v1. Two systems that both write the same fields need a conflict rule, and the file format has none.`,
    criteria: [
      {
        text: "When a GitHub issue changes, the daemon shall update the matching wf issue within 1 min.",
        checked: false,
        verify: "manual",
      },
      {
        text: "When a wf issue changes status, the daemon shall update the matching GitHub issue within 1 min.",
        checked: false,
        verify: "manual",
      },
    ],
    out_of_scope: `- Everything. The issue is cancelled and out of scope for v1.`,
    links: `- [[wf-b1d7v]]: Build v1 lists two-way sync as out of scope.`,
    changes: [
      {
        id: "C-9qd2s",
        ts: daysAgo(14, 12, 30),
        author: "mudit",
        title: "Cancelled the issue; out of scope for v1",
        kind: "docs",
        files: ["goal.md"],
        body: "Moved the issue to cancelled. Wrote the reason in D-3rk8y. The v1 vision lists two-way sync as a non-goal.",
      },
    ],
    decisions: [
      {
        id: "D-3rk8y",
        ts: daysAgo(14, 12, 20),
        author: "mudit",
        title: "Sync GitHub issues in both directions",
        status: "rejected",
        topic: "scope",
        decided_by: ["mudit", "shruti"],
        decision: "Do not build a two-way sync with GitHub issues in v1.",
        because:
          "Two writers need a conflict rule, and the format has none. The files are the source of truth.",
        rejected:
          "A one-way export (reconsider after v1); a two-way sync with last-writer-wins (loses edits).",
        consequences: "Teams that use GitHub issues copy the link into `## Links` by hand.",
        revisit: "Three teams ask for the sync after v1.",
      },
    ],
    learnings: [],
    activity: [
      {
        ts: daysAgo(14, 12, 35),
        author: "mudit",
        kind: "status",
        title: "Moved from backlog to cancelled",
      },
    ],
  };
}

export function ssoLogin(): IssueSrc {
  return {
    slug: "sso-login",
    group: "g-auth1",
    goal: {
      id: "wf-ss0lo",
      title: "SSO login",
      status: "backlog",
      priority: "medium",
      size: "l",
      owner: "mudit",
      labels: ["auth"],
      blocked_by: [],
      created: daysAgo(15, 10, 20),
    },
    context: `The daemon binds to 127.0.0.1 and trusts anyone on the machine. A shared server needs a login. Single sign-on through OIDC lets a team reuse its identity provider.`,
    criteria: [
      {
        text: "When a user opens the dashboard without a session, the server shall redirect to the identity provider.",
        checked: false,
        verify: "manual",
      },
      {
        text: "When the identity provider returns a valid code, the server shall create a session that lasts 8 h.",
        checked: false,
        verify: "`cargo test -p wf-server oidc_session`",
      },
      {
        text: "If the token is invalid, then the server shall answer 401 and log the reason.",
        checked: false,
        verify: "`cargo test -p wf-server oidc_invalid_token`",
      },
    ],
    out_of_scope: `- Roles and per-group permissions.
- Login by password.`,
    links: `- [[wf-y4bz7]]: refresh tokens silently.`,
    changes: [],
    decisions: [],
    learnings: [],
  };
}

export function silentTokenRefresh(): IssueSrc {
  return {
    slug: "silent-token-refresh",
    group: "g-auth1",
    goal: {
      id: "wf-y4bz7",
      title: "Refresh SSO tokens silently",
      status: "planned",
      priority: "low",
      size: "m",
      owner: "mudit",
      labels: ["auth"],
      claimed_by: "claude-opus",
      blocked_by: [],
      due: dateIn(-3),
      created: daysAgo(14, 14, 0),
    },
    context: `A session ends when the access token expires, and the user then lands on the login page in the middle of work. The browser must refresh the token in the background, so that a working session never ends by surprise.`,
    criteria: [
      {
        text: "When the access token has 5 min left, the browser shall request a new token in the background.",
        checked: false,
        verify: "`pnpm -C web test token-refresh`",
      },
      {
        text: "If the refresh fails twice, then the browser shall show the login page.",
        checked: false,
        verify: "`pnpm -C web test token-refresh-fail`",
      },
      {
        text: "While a refresh runs, the browser shall queue other API calls.",
        checked: false,
        verify: "`pnpm -C web test token-queue`",
      },
    ],
    out_of_scope: `- Refresh tokens for the CLI. The CLI reads a long-lived key.`,
    links: `- [[wf-ss0lo]]: SSO login.`,
    plan: {
      updated_at: daysAgo(4, 13, 30),
      updated_by: "claude-opus",
      revision: 1,
      approach:
        "Start a timer from the `expires_in` value of the token. Refresh through a hidden request. Queue API calls while the refresh runs.",
      assumptions: [
        { id: "A1", text: "The identity provider allows refresh tokens.", state: "open" },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Refresh",
          tasks: [
            {
              id: "T-1",
              title: "Start a refresh timer from the token lifetime",
              status: "todo",
              lane: "web",
              owns: ["web/src/lib/auth/refresh.ts"],
              satisfies: ["SC-1"],
              assignee: "role:frontend",
              verify: "`pnpm -C web test token-refresh`",
              brief: "Read `expires_in` and set a timer for the moment when 5 min remain.",
            },
            {
              id: "T-2",
              title: "Queue API calls during a refresh",
              status: "todo",
              lane: "web",
              depends_on: ["T-1"],
              owns: ["web/src/lib/auth/queue.ts"],
              satisfies: ["SC-3"],
              assignee: "role:frontend",
              verify: "`pnpm -C web test token-queue`",
              brief:
                "Hold every API call until the new token arrives, then replay the calls in order.",
            },
            {
              id: "T-3",
              title: "Show the login page after 2 failures",
              status: "todo",
              lane: "web",
              depends_on: ["T-1"],
              owns: ["web/src/lib/auth/fail.ts"],
              satisfies: ["SC-2"],
              assignee: "role:frontend",
              verify: "`pnpm -C web test token-refresh-fail`",
              brief: "Count refresh failures. Redirect to the login page on the second one.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "Planned. One question about the refresh time is open.",
      updated_at: ago(26 * 60),
      updated_by: "claude-opus",
      phase: "Refresh",
      needs_you: [
        {
          id: "Q-5ys8j",
          question: "Refresh the token 5 min before it expires, or after the first 401?",
          from: "claude-opus",
          to: "mudit",
          kind: "question",
          urgency: "fyi",
          asked: ago(26 * 60),
          options: ["5 min before expiry", "after the first 401"],
          ref: "[[#T-1]]",
        },
      ],
      next_steps: [
        "Apply the answer to [[#Q-5ys8j]] to [[#T-1]].",
        "Claim [[#T-1]] and start the timer.",
      ],
    },
    changes: [
      {
        id: "C-6mh3k",
        ts: daysAgo(4, 13, 40),
        author: "claude-opus",
        title: "Planned the silent refresh in 3 tasks",
        kind: "docs",
        files: ["plan.md"],
        model: "claude-opus-5-5",
        body: "Wrote `plan.md` with 3 web tasks. Left the refresh time open, because it depends on the identity provider.",
      },
    ],
    decisions: [],
    learnings: [],
  };
}

export function resumeOnSessionStart(): IssueSrc {
  return {
    slug: "resume-on-session-start",
    group: "g-skl01",
    goal: {
      id: "wf-p2hs4",
      title: "Resume the issue on session start",
      status: "review",
      priority: "medium",
      size: "s",
      owner: "shruti",
      labels: ["hooks"],
      claimed_by: "claude-opus",
      blocked_by: [],
      created: daysAgo(7, 13, 10),
    },
    context: `A fresh agent session starts with no memory of the issue. The \`SessionStart\` hook loads the context bundle, so the agent resumes where the last session stopped. The hook finds the issue from the branch name.`,
    criteria: [
      {
        text: "When a session starts on a branch named `wf-<id>/…`, the hook shall print the context bundle of that issue.",
        checked: true,
        verify: "`bash plugins/agent-execution/hooks/test_session_start.sh`",
        evidence: "`bash plugins/agent-execution/hooks/test_session_start.sh` passed at `0c6fa38`",
        verified_by: "claude-opus",
      },
      {
        text: "If the branch names no issue, then the hook shall print nothing.",
        checked: true,
        verify: "`bash plugins/agent-execution/hooks/test_no_issue.sh`",
        evidence: "`bash plugins/agent-execution/hooks/test_no_issue.sh` passed at `0c6fa38`",
        verified_by: "claude-opus",
      },
      {
        text: "The hook shall finish within 300 ms.",
        checked: true,
        verify: "`bash plugins/agent-execution/hooks/time_hook.sh`",
      },
    ],
    out_of_scope: `- Resuming from a branch of a different repo.
- Hooks for editors other than Claude Code.`,
    links: `- [[lib-6pm4c]]: how an agent resumes an issue.
- [[wf-skf01]]: the flowchart that shows where \`resume-issue\` runs.`,
    plan: {
      updated_at: daysAgo(6, 9, 30),
      updated_by: "claude-opus",
      revision: 1,
      approach:
        "Read the branch name in a shell hook. Call `wf context` for the issue ID and print the bundle. Print nothing when the branch holds no ID.",
      assumptions: [],
      prior_art: [{ ref: "lib-6pm4c", why: "the bundle is the first thing an agent reads." }],
      phases: [
        {
          index: 1,
          name: "Hook",
          tasks: [
            {
              id: "T-1",
              title: "Parse the issue ID from the branch name",
              status: "done",
              lane: "skills",
              owns: ["plugins/agent-execution/hooks/session_start.sh"],
              satisfies: ["SC-1", "SC-2"],
              assignee: "claude-opus",
              claimed_by: "claude-opus",
              verify: "`bash plugins/agent-execution/hooks/test_no_issue.sh`",
              brief: "Match `wf-` followed by 5 characters at the start of the branch name.",
            },
            {
              id: "T-2",
              title: "Print the bundle",
              status: "done",
              lane: "skills",
              depends_on: ["T-1"],
              owns: ["plugins/agent-execution/hooks/print_bundle.sh"],
              satisfies: ["SC-1"],
              assignee: "claude-opus",
              claimed_by: "claude-opus",
              verify: "`bash plugins/agent-execution/hooks/test_session_start.sh`",
              brief: "Run `wf context <id>` and write the output to the hook stream.",
            },
            {
              id: "T-3",
              title: "Time the hook",
              status: "review",
              lane: "skills",
              depends_on: ["T-2"],
              owns: ["plugins/agent-execution/hooks/time_hook.sh"],
              satisfies: ["SC-3"],
              assignee: "claude-opus",
              claimed_by: "claude-opus",
              verify: "`bash plugins/agent-execution/hooks/time_hook.sh`",
              brief: "Run the hook 20 times and fail when the median passes 300 ms.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "The hook prints the bundle; @shruti reviews the timing test.",
      updated_at: ago(8 * 60),
      updated_by: "claude-opus",
      phase: "Hook",
      library_refs: ["lib-6pm4c"],
      session: "cc-e0b5",
      done: [
        "[[#T-1]] and [[#T-2]] print the bundle. See [[#C-8xk6d]].",
        "[[#SC-1]] and [[#SC-2]] have evidence.",
      ],
      in_flight: ["[[#T-3]] The timing test waits for a review by @shruti."],
      needs_you: [],
      next_steps: ["Run `wf verify wf-p2hs4 SC-3` after the review.", "Move the issue to done."],
    },
    changes: [
      {
        id: "C-5tz2g",
        ts: daysAgo(5, 14, 20),
        author: "claude-opus",
        title: "Parsed the issue ID from the branch name",
        kind: "progress",
        task: "T-1",
        commit: "91ae4d6",
        files: ["plugins/agent-execution/hooks/session_start.sh"],
        model: "claude-opus-5-5",
        body: "Matched `wf-` and 5 characters at the start of the branch. A branch such as `main` prints nothing.",
      },
      {
        id: "C-8xk6d",
        ts: daysAgo(3, 16, 50),
        author: "claude-opus",
        title: "Printed the bundle from the hook",
        kind: "progress",
        task: "T-2",
        criteria: ["SC-1", "SC-2"],
        result: "pass",
        commit: "0c6fa38",
        files: ["plugins/agent-execution/hooks/print_bundle.sh"],
        model: "claude-opus-5-5",
        body: "Called `wf context` for the issue ID. Both shell tests pass in a temp repo.",
      },
      {
        id: "C-3pm9v",
        ts: ago(8 * 60),
        author: "claude-opus",
        title: "Timed the hook at 120 ms",
        kind: "test",
        task: "T-3",
        criteria: ["SC-3"],
        files: ["plugins/agent-execution/hooks/time_hook.sh"],
        model: "claude-opus-5-5",
        body: "Ran the hook 20 times on a laptop. The median was 120 ms and the slowest run took 210 ms.",
      },
    ],
    decisions: [],
    learnings: [],
    activity: [
      {
        ts: ago(7 * 60 + 30),
        author: "claude-opus",
        kind: "status",
        title: "Moved from in_progress to review",
      },
    ],
  };
}

export function indexScanAndSnapshot(): IssueSrc {
  return {
    slug: "index-scan-and-snapshot",
    group: "g-core1",
    goal: {
      id: "wf-7p4dn",
      title: "Scan the workspace into a snapshot",
      status: "done",
      priority: "high",
      size: "m",
      owner: "mudit",
      labels: ["index"],
      claimed_by: "codex",
      blocked_by: [],
      created: daysAgo(62, 10, 0),
    },
    context: `Every view of wf starts from one snapshot of the workspace. The index scans the folder, parses each file and builds the groups, the issues and their signals. The snapshot is the base for the board, the CLI and the live deltas.`,
    criteria: [
      {
        text: "When the daemon starts, the index shall scan the 40-issue golden workspace in under 300 ms.",
        checked: true,
        verify: "`cargo bench -p wf-index scan_bench`",
        evidence: "`cargo bench -p wf-index scan_bench` scanned it in 118 ms at `a41c7e0`",
        verified_by: "mudit",
      },
      {
        text: "The index shall ignore `.git/`, `.wf/`, `node_modules/` and editor swap files.",
        checked: true,
        verify: "`cargo test -p wf-index scan_ignores`",
        evidence: "`cargo test -p wf-index scan_ignores` passed at `a41c7e0`",
        verified_by: "codex",
      },
      {
        text: "If a folder holds both `goal.md` and `_group.md`, then the index shall report F008.",
        checked: true,
        verify: "`cargo test -p wf-index f008_both_files`",
        evidence: "`cargo test -p wf-index f008_both_files` passed at `a41c7e0`",
        verified_by: "codex",
      },
    ],
    links: `- [[wf-3k9x2]]: live updates build deltas on top of this snapshot.`,
    plan: {
      updated_at: daysAgo(61, 11, 0),
      updated_by: "codex",
      revision: 1,
      approach:
        "Walk the folder once, parse each file with `wf-parse` and build the snapshot in memory. Measure the scan on the golden workspace.",
      assumptions: [],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Scan",
          tasks: [
            {
              id: "T-1",
              title: "Walk the folder and apply the ignore rules",
              status: "done",
              lane: "core",
              owns: ["crates/wf-index/src/scan.rs"],
              satisfies: ["SC-2", "SC-3"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-index scan_ignores`",
              brief:
                "Skip the ignored paths. Report a folder with both `goal.md` and `_group.md` as F008.",
            },
            {
              id: "T-2",
              title: "Build the snapshot and time the scan",
              status: "done",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-index/src/snapshot.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo bench -p wf-index scan_bench`",
              brief: "Parse the files in parallel and join the results into one snapshot.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "Done. The index scans the golden workspace in 118 ms.",
      updated_at: daysAgo(45, 16, 10),
      updated_by: "codex",
      done: ["[[#T-1]] and [[#T-2]] are merged. See [[#C-4gk3w]]."],
      needs_you: [],
      next_steps: ["Build live deltas on top of the snapshot in [[wf-3k9x2]]."],
    },
    changes: [
      {
        id: "C-2tn5x",
        ts: daysAgo(55, 14, 30),
        author: "codex",
        title: "Walked the folder with the ignore rules",
        kind: "progress",
        task: "T-1",
        commit: "6b2f0d4",
        files: ["crates/wf-index/src/scan.rs"],
        model: "gpt-5-codex",
        body: "Added the folder walk. It skips `.git/`, `.wf/`, `node_modules/` and swap files.",
      },
      {
        id: "C-7ya8c",
        ts: daysAgo(50, 12, 10),
        author: "codex",
        title: "Parsed files in parallel",
        kind: "progress",
        task: "T-2",
        commit: "a41c7e0",
        files: ["crates/wf-index/src/snapshot.rs"],
        model: "gpt-5-codex",
        body: "Parsed the files on all cores. The golden workspace scans in 118 ms, down from 410 ms.",
      },
      {
        id: "C-4gk3w",
        ts: daysAgo(45, 16, 0),
        author: "mudit",
        title: "Reviewed the scan and closed the issue",
        kind: "review",
        body: "Read the diff of `wf-index`. All three criteria hold evidence. Moved the issue to done.",
      },
    ],
    decisions: [],
    learnings: [
      {
        id: "L-7hx2d",
        ts: daysAgo(46, 11, 40),
        author: "codex",
        title: "Hash every file the daemon writes, so that the index can ignore the watcher echo.",
        kind: "pattern",
        tags: ["watcher", "hashing", "write-back"],
        applies_to: ["crates/wf-index/src/watch.rs", "crates/wf-edit/**"],
        promote: "candidate",
        rule: "Store the blake3 hash of every file the daemon writes. When the watcher reports that file, drop the event if the hash on disk matches.",
        evidence:
          "A prototype wrote `goal.md` and scanned it twice: once from the write, once from the echo. Every delta doubled.",
      },
    ],
  };
}

export function writeBackOneValue(): IssueSrc {
  return {
    slug: "write-back-one-value",
    group: "g-core1",
    goal: {
      id: "wf-9tq4e",
      title: "Write back one value without reformatting",
      status: "done",
      priority: "high",
      size: "m",
      owner: "mudit",
      labels: ["write-back"],
      claimed_by: "codex",
      blocked_by: [],
      created: daysAgo(82, 10, 30),
    },
    context: `The web UI changes one value of a file, such as a status or a tick. A serializer that reads the whole file and writes it back drops comments, reorders keys and rewrites quotes. The git diff of a one-word change then fills a screen.

The editor must change only the bytes of the value and leave the rest of the file untouched.`,
    criteria: [
      {
        text: "When a user changes a status, the editor shall replace only the bytes of the status value.",
        checked: true,
        verify: "`cargo test -p wf-edit splice_status`",
        evidence: "`cargo test -p wf-edit splice_status` passed at `c80e5f2`",
        verified_by: "codex",
      },
      {
        text: "If the file changed since the client read it, then the editor shall refuse the write.",
        checked: true,
        verify: "`cargo test -p wf-edit stale_rev_refused`",
        evidence: "`cargo test -p wf-edit stale_rev_refused` passed at `c80e5f2`",
        verified_by: "codex",
      },
      {
        text: "When the editor writes a file, the editor shall write a temp file and rename it into place.",
        checked: true,
        verify: "`cargo test -p wf-edit atomic_write`",
        evidence: "`cargo test -p wf-edit atomic_write` passed at `c80e5f2`",
        verified_by: "mudit",
      },
    ],
    links: `- [[wf-m3tq8]]: spans for meta lists, the next step.
- [[lib-2hq6n]]: splice one value span; never re-serialize frontmatter.`,
    plan: {
      updated_at: daysAgo(81, 11, 0),
      updated_by: "codex",
      revision: 1,
      approach:
        "Parse the frontmatter with byte spans. Replace the bytes of one value and write the file through a temp file and a rename.",
      assumptions: [],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Splice",
          tasks: [
            {
              id: "T-1",
              title: "Splice one frontmatter value",
              status: "done",
              lane: "core",
              owns: ["crates/wf-edit/src/splice.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-edit splice_status`",
              brief:
                "Find the span of the value. Replace the bytes inside it and keep all other bytes.",
            },
            {
              id: "T-2",
              title: "Check the rev and write atomically",
              status: "done",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-edit/src/write.rs"],
              satisfies: ["SC-2", "SC-3"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-edit atomic_write`",
              brief: "Hold the lock, compare the `base_rev`, write `.wf-tmp-*` and rename it.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "Done. The editor splices one value and writes the file atomically.",
      updated_at: daysAgo(70, 15, 20),
      updated_by: "codex",
      done: ["[[#T-1]] and [[#T-2]] are merged. See [[#C-3hn6t]]."],
      needs_you: [],
      next_steps: ["Add spans for meta lists in [[wf-m3tq8]]."],
    },
    changes: [
      {
        id: "C-5bq9m",
        ts: daysAgo(78, 13, 40),
        author: "codex",
        title: "A round-trip serializer dropped YAML comments",
        kind: "failure",
        task: "T-1",
        result: "fail",
        evidence: "`golden/goal.md` lost 3 comment lines",
        files: ["crates/wf-edit/src/serialize.rs"],
        body: "Wrote `goal.md` back with a YAML serializer. The git diff showed 3 deleted comments and a reordered key.",
      },
      {
        id: "C-8vd4z",
        ts: daysAgo(74, 12, 15),
        author: "codex",
        title: "Spliced one frontmatter value by its span",
        kind: "fix",
        task: "T-1",
        commit: "c80e5f2",
        files: ["crates/wf-edit/src/splice.rs"],
        model: "gpt-5-codex",
        body: "Replaced the bytes of the value and kept every other byte. The property test passes with 1024 cases.",
      },
      {
        id: "C-3hn6t",
        ts: daysAgo(70, 15, 10),
        author: "mudit",
        title: "Reviewed the editor and closed the issue",
        kind: "review",
        body: "Read the diff of `wf-edit`. All three criteria hold evidence. Moved the issue to done.",
      },
    ],
    decisions: [
      {
        id: "D-3qv8n",
        ts: daysAgo(76, 11, 20),
        author: "codex",
        title: "Splice one value span; never re-serialize frontmatter",
        status: "accepted",
        topic: "write-back",
        affects: ["SC-1"],
        decided_by: ["codex", "mudit"],
        decision:
          "Replace only the bytes of the changed value. Never write a file from a serialized tree.",
        because:
          "People edit these files by hand. A round trip drops their comments and reorders their keys.",
        rejected:
          "A round-trip YAML serializer (loses comments); a custom YAML emitter (a large surface to maintain).",
        consequences: "Every editable value needs a byte span from the parser.",
        revisit: "A value needs a multi-line rewrite that a span cannot express.",
      },
    ],
    learnings: [],
  };
}
