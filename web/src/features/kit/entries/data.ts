// Ids of the mock world that the variants pick: the markdown files under web/mock/workspace/.
// Variants read the live objects through the data hooks and override fields where a state does
// not exist in the files.

export const ISSUE = {
  /** In progress, high priority, blocking approval, rich logs, two diagrams, docs. */
  rich: "wf-3k9x2",
  /** In progress, nothing happened for days (Q003). */
  stale: "wf-a7ne5",
  /** A task lease ran out (Q004). */
  leaseExpired: "wf-q4fs9",
  /** Done, but criteria are not verified (Q001). */
  doneUnmet: "wf-c2pn6",
  /** goal.md frontmatter does not parse (F001). */
  badYaml: "wf-7yq2m",
  /** Blocked by another issue. */
  blocked: "wf-w8vz4",
  /** Planned, fifteen lint findings. */
  heavyLint: "wf-k8dv6",
  /** In progress without a plan (Q002). */
  noPlan: "wf-h2tb7",
  /** Done and clean. */
  cleanDone: "wf-m3tq8",
  /** Urgent, with an invalid diagram. */
  invalidDiagram: "wf-g5rx8",
  /** Skills flowchart: a diagram, a doc and a blocking question. */
  skills: "wf-skf01",
  /** Quiet in progress issue with one live lease. */
  plain: "wf-t3jp5",
  /** Review, fyi approval. */
  fyi: "wf-9gr4k",
  /** Cancelled. */
  cancelled: "wf-n7vy3",
  /** Three live leases. */
  crowded: "wf-b1d7v",
} as const;

export const LIB = {
  reviewed: "lib-4tz7c",
  draft: "lib-7nq3d",
  retired: "lib-0rt4e",
  overdue: "lib-2hq6n",
} as const;

export const AUTHORS = [
  "shruti",
  "claude-opus",
  "codex",
  "claude-sonnet",
  "cursor-bot",
  "mudit",
] as const;

export const LONG_TITLE =
  "Make the board survive a flaky network, replay missed events after reconnect and explain it in the drawer";
