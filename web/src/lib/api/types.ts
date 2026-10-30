// Types shared by the client, the mock server and the hooks.
import type {
  ContextLink,
  Diagnostic,
  GroupId,
  Handle,
  IssueId,
  Op,
  OpResult,
  Priority,
  Rev,
  Size,
  TaskId,
  Ts,
} from "@/gen/types";

/** Where `search` looks. `all` mixes every kind of hit. */
export type SearchScope = "all" | "issues" | "entries" | "docs" | "library" | "terms";

/** `new_issue` also carries the size picked in the dialog (the generated type predates it). */
export type NewIssueOp = Extract<Op, { op: "new_issue" }> & { size?: Size };

// ---------------------------------------------------------------- add work

/** One issue `create_work` writes as a `goal.md`. */
export interface WorkIssueInput {
  title: string;
  priority: Priority;
  size: Size;
  status: "backlog" | "planned";
  /** EARS sentences, one `SC-n` each, in order. At least one. */
  criteria: string[];
  /** Prose for `## Context`. Empty keeps the template's own text. */
  context?: string;
  /** Workdatabase items to link under `## Links`, in order. */
  links?: ContextLink[];
}

/** An existing group by id, or a new group to create under `parent`. */
export type WorkGroup = GroupId | { parent: GroupId; title: string };

/**
 * Add work: the group (new or existing) and 1 to 8 issues, written as `_group.md` and `goal.md`
 * files in ONE commit with one activity entry.
 */
export interface CreateWorkOp {
  op: "create_work";
  base_rev: Rev;
  group: WorkGroup;
  issues: WorkIssueInput[];
}

/** What `create_work` created: the group and the issues, in the order they were sent. */
export interface CreateWorkResult {
  groupId: GroupId;
  issueIds: IssueId[];
}

/** `OpResult` of `create_work`; `created` holds the group id. */
export interface WorkOpResult extends OpResult {
  work: CreateWorkResult;
}

/** Every op the client may send. */
export type WfOp = Exclude<Op, { op: "new_issue" }> | NewIssueOp | CreateWorkOp;

/** The progress the person sees while Codex splits a group, in order. */
export const SPLIT_STEPS = [
  "Reading the group",
  "Reading linked context",
  "Splitting into issues",
] as const;

/** What Codex reads to split a group into issues. `context` holds library, glossary or file ids. */
export interface SplitInput {
  title: string;
  outcome: string;
  size?: Size;
  context: string[];
}

/** One issue Codex proposes. The person keeps or drops it before it is added. */
export interface Proposal {
  /** Stable within one result. */
  key: string;
  /** Imperative verb first. */
  title: string;
  size: Size;
  priority: Priority;
  /** An EARS sentence for `SC-1`. */
  criterion: string;
  /** One line, imperative verb first. */
  why: string;
}

export interface SplitResult {
  issues: Proposal[];
}

// ---------------------------------------------------------------- delivery: git, PRs, CI
// Derived, never written into the workspace (plan D2). The prototype reads a fixture while the
// sample is loaded and what a Codex run adds; `wf serve` reads `git` and `gh`.

export interface Commit {
  /** 7 hex characters. */
  sha: string;
  subject: string;
  author: Handle;
  at: Ts;
  branch: string;
  task?: TaskId;
  /** Number of the pull request that carries the commit. */
  pr?: number;
  files_changed: number;
  /**
   * The line that ties the commit to the issue (`Issue: wf-3k9x2`). Absent when only the branch
   * name (`wf-3k9x2/…`) does.
   */
  trailer?: string;
}

export type PullRequestState = "open" | "draft" | "merged" | "closed";
export type ReviewState = "approved" | "changes_requested" | "pending";

export interface PullRequest {
  number: number;
  title: string;
  state: PullRequestState;
  branch: string;
  author: Handle;
  updated_at: Ts;
  checks: { passed: number; failed: number; pending: number };
  review: ReviewState;
  /** `null` in the prototype: there is no GitHub to link to. */
  url?: string | null;
}

export type PipelineStatus = "queued" | "in_progress" | "completed";
export type PipelineConclusion = "success" | "failure" | "cancelled";

export interface PipelineJob {
  name: string;
  /** Absent while the job has not finished. */
  conclusion?: PipelineConclusion;
  duration_s?: number;
}

export interface PipelineRun {
  id: string;
  workflow: string;
  trigger: "push" | "pull_request";
  branch: string;
  sha: string;
  status: PipelineStatus;
  /** Present when `status` is `completed`. */
  conclusion?: PipelineConclusion;
  started_at: Ts;
  /** Wall time of the run. Present when `status` is `completed`. */
  duration_s?: number;
  jobs: PipelineJob[];
}

/** Everything git, GitHub and CI know about one issue, newest first. */
export interface Delivery {
  commits: Commit[];
  prs: PullRequest[];
  pipelines: PipelineRun[];
}

// ---------------------------------------------------------------- Codex runs

/** The kinds of run Codex starts. `next_step` does the next ready task of an issue. */
export type CodexRunKind = "next_step";

/**
 * `running` until the last phase lands. `nothing_ready` ends at once (see `reason`). `failed`
 * means the task changed under the run (see `reason`).
 */
export type CodexRunStatus = "running" | "done" | "failed" | "cancelled" | "nothing_ready";

/** The phases of a `next_step` run, in order. */
export type CodexPhaseId = "claim" | "log" | "verify" | "done";

export interface CodexPhase {
  id: CodexPhaseId;
  /** Imperative, for a step list: "Claim T-2". */
  label: string;
  /**
   * `running` only while the run is `running`. A run that stops early (`cancelled`, `failed`)
   * leaves the phase it cut short, and the ones after it, `pending`.
   */
  state: "pending" | "running" | "done";
}

export interface CodexRun {
  id: string;
  issue: IssueId;
  kind: CodexRunKind;
  status: CodexRunStatus;
  /** Who the run writes as. */
  by: Handle;
  /** The task the run picked. Absent when nothing was ready. */
  task?: TaskId;
  task_title?: string;
  /** The phase in progress; for a run that stopped early, the phase it stopped in. Absent for `nothing_ready`. */
  phase?: CodexPhaseId;
  /** Empty for `nothing_ready`. */
  phases: CodexPhase[];
  started_at: Ts;
  finished_at?: Ts;
  /** Why the run did not do a task: nothing ready, stopped, or changed under it. */
  reason?: string;
  /** The commit the run added, once the last phase has landed. */
  commit?: string;
  /** The CI run the run added. */
  pipeline?: string;
}

/** An op without its tag and revision: what a write hook takes. */
export type OpArgs<N extends Op["op"]> = Omit<Extract<WfOp, { op: N }>, "op" | "base_rev"> & {
  base_rev?: string;
};

// ---------------------------------------------------------------- workspace files
// Prototype endpoints beyond contract 1.10: `GET /api/files`, `GET|PUT|DELETE /api/files/{path}`.
// The Workdatabase · Files view reads and edits the markdown the board is built from.

/** One file of the workspace, as the file tree lists it. */
export interface WorkspaceFileInfo {
  path: string;
  kind: "md" | "toml" | "image" | "other";
  bytes: number;
  /** Content hash: changes whenever the text does. */
  rev: string;
  /** The issue whose folder holds the file. */
  issue?: string;
  /** The group this file (`_group.md`) describes. */
  group?: string;
  /** The library item this file holds. */
  library?: string;
  /** Lint findings in this file, by severity. */
  errors: number;
  warnings: number;
  infos: number;
}

/** One file with its content. `text` is null for a binary file (see `url`). */
export interface WorkspaceFile {
  path: string;
  text: string | null;
  /** Where an image is served. */
  url?: string;
  rev: string;
  bytes: number;
  /** Findings of this file, with line numbers. */
  diagnostics: Diagnostic[];
}
