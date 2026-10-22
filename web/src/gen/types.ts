// Stand-in for the ts-rs export of `wf-model` (contract 1.8, 1.10). Hand-written
// for the UI prototype; T03 replaces it with generated types of the same shape.
//
// Conventions:
// - Handles are stored WITHOUT the leading "@" ("codex"). The UI renders "@codex".
// - Timestamps (`Ts`) are RFC 3339 with an offset: "2026-10-22T14:05+05:30".
// - Prose travels as markdown fragments in `*_md` fields. Archify fences inside a
//   fragment are replaced by ```wf-diagram\n<diagram_id>\n``` (see `Diagram.id`).
// - Every editable element carries an `EditRef`.

export type WfFormat = 1;
export type IssueId = string; // "wf-3k9x2"
export type GroupId = string; // "g-8m2qa"
export type LibId = string; // "lib-4tz7c"
export type EntryId = string; // "C-7k2q9" | "D-7f3k2" | "L-…"
export type RequestId = string; // "Q-4m2pz"
export type CriterionId = string; // "SC-1"
export type TaskId = string; // "T-3"
export type Handle = string; // "codex" (no "@")
export type Ts = string; // RFC 3339 with offset
export type DateStr = string; // "2026-10-22"
export type Rev = string; // short blake3 hex of a file or of the workspace

// ---------------------------------------------------------------- enums

export type IssueStatus =
  | "backlog"
  | "planned"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type Size = "xs" | "s" | "m" | "l";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "done" | "cancelled";
export type Severity = "error" | "warn" | "info";
export type AuthorKind = "human" | "agent";
export type Runtime = "claude-code" | "codex" | "cursor" | "other";
export type ChangeKind =
  | "progress"
  | "fix"
  | "refactor"
  | "docs"
  | "test"
  | "research"
  | "review"
  | "verify"
  | "failure"
  | "answer";
export type DecisionStatus = "proposed" | "accepted" | "rejected";
export type LearningKind = "tip" | "gotcha" | "pattern";
export type LibraryKind = "pattern" | "playbook" | "gotcha" | "decision";
export type LibraryStatus = "draft" | "reviewed" | "retired";
export type RequestKind = "question" | "approval" | "input";
export type Urgency = "blocking" | "fyi";
export type EarsPattern =
  | "ubiquitous"
  | "event"
  | "state"
  | "optional"
  | "unwanted"
  | "complex"
  | "freeform";
export type CriterionState = "open" | "claimed" | "verified";
export type LeaseState = "none" | "live" | "expired";
export type DiagramType = "architecture" | "workflow" | "sequence" | "dataflow" | "lifecycle";
export type DiagramStatus = "rendering" | "ready" | "invalid" | "unavailable";
export type ActivityKind =
  | "change"
  | "decision"
  | "learning"
  | "state"
  | "status"
  | "request"
  | "lease";

// ---------------------------------------------------------------- shared

/** Where a write-back lands. `anchor` is an ID: "SC-2", "T-3", "T-3.2", "Q-4m2pz", "status". */
export interface EditRef {
  file: string; // workspace-relative path, e.g. "issues/wf/web/live-board-updates/goal.md"
  rev: Rev;
  anchor: string;
}

export interface Author {
  handle: Handle;
  kind: AuthorKind;
  name?: string;
  runtime?: Runtime;
  model?: string;
  color: number; // 1–8 → --wf-hue-n
  lanes: string[];
  max_leases: number;
}

export interface Lease {
  holder: Handle;
  until: Ts;
  state: LeaseState; // live | expired
}

export interface Progress {
  criteria: { total: number; claimed: number; verified: number };
  tasks: {
    total: number;
    todo: number;
    in_progress: number;
    blocked: number;
    review: number;
    done: number;
    ready: number;
  };
  /** (verified + claimed criteria + done tasks) / (criteria + tasks); 0..1. Group roll-ups only. */
  percent: number;
}

/** Derived signals (contract 1.6). Never stored in files. */
export interface Signals {
  done_unmet: boolean; // Q001
  in_progress_no_plan: boolean; // Q002
  stale: boolean; // Q003 (amber)
  lease_expired: boolean; // Q004
  state_behind_changes: boolean; // Q005
  needs_you: number; // open requests in this issue
  needs_you_blocking: number;
}

export interface LintCounts {
  error: number;
  warn: number;
  info: number;
}

export interface Diagnostic {
  rule: string; // "F001", "Q006", "S06"
  severity: Severity;
  file: string; // workspace-relative
  line: number;
  col: number;
  span: [number, number]; // byte span
  message: string;
  fix?: string;
}

export type RefKind = "issue" | "entry" | "criterion" | "task" | "library" | "doc";
export interface Ref {
  kind: RefKind;
  target: string; // as written: "wf-3k9x2", "wf-3k9x2#D-7f3k2", "lib-4tz7c"
  issue?: IssueId;
  id?: string; // entry / criterion / task / library id
  title: string;
  path?: string;
}

// ---------------------------------------------------------------- snapshot

export interface WorkspaceConfig {
  name: string;
  wf_format: WfFormat;
  id_prefix: string;
  issues_dir: string;
  library_dir: string;
  leases_minutes: number;
  staleness: { issue_hours: number; task_hours: number };
  /** The UI acts as this author (`wf serve --author` or `[server] author`). */
  author: Handle;
  archify: "available" | "unavailable";
}

export interface LastActivity {
  ts: Ts;
  author: Handle;
  kind: ActivityKind;
  title: string;
}

export interface IssueSummary {
  id: IssueId;
  title: string;
  status: IssueStatus;
  priority: Priority;
  size: Size;
  owner?: Handle;
  labels: string[];
  group: GroupId; // direct parent group
  group_path: string[]; // group titles from the top-level group down to the parent
  path: string; // workspace-relative folder: "issues/wf/web/live-board-updates"
  coordinator?: Lease; // goal.md claimed_by + lease_until
  lease_holders: Handle[]; // holders of live task leases (plus the coordinator)
  blocked_by: IssueId[];
  due?: DateStr;
  created: Ts;
  last_activity?: LastActivity;
  state_summary?: string; // current_state.md summary line
  state_updated_at?: Ts;
  has_plan: boolean;
  progress: Progress;
  signals: Signals;
  lint: LintCounts;
  status_ref: EditRef; // anchor "status" in goal.md
}

export interface GroupRollup {
  issues: number; // whole subtree
  by_status: Record<IssueStatus, number>;
  percent: number; // 0..1
  needs_you: number;
  stale: number;
  blocked: number;
}

export interface GroupNode {
  id: GroupId;
  title: string;
  slug: string; // folder name
  path: string; // workspace-relative folder
  goal?: string;
  owner?: Handle;
  color: number; // 1–8
  order: number;
  implicit: boolean; // folder without _group.md
  definition_of_done: string[];
  rollup: GroupRollup;
  children: GroupNode[];
  issue_ids: IssueId[]; // direct child issues only
}

export interface NeedsYouItem {
  issue: IssueId;
  issue_title: string;
  id: RequestId;
  question: string;
  from: Handle;
  to: Handle;
  kind: RequestKind;
  urgency: Urgency;
  asked: Ts;
  options: string[];
  ref?: string; // "[[#D-7f3k2]]" as written
  answered: boolean; // ticked, waiting for `wf resolve`
  answer?: string;
  answered_by?: Handle;
  answered_at?: Ts;
  edit: EditRef;
}

export interface LibrarySummary {
  id: LibId;
  title: string;
  kind: LibraryKind;
  description: string; // "Use when…"
  status: LibraryStatus;
  tags: string[];
  applies_to: string[];
  authors: Handle[];
  created: DateStr;
  last_reviewed?: DateStr;
  review_after?: DateStr;
  review_overdue: boolean; // Q013
  used_by: number; // issues that cite it
  path: string;
}

export interface WorkspaceSnapshot {
  wf_format: WfFormat;
  rev: Rev;
  config: WorkspaceConfig;
  groups: GroupNode; // the root group (issues_dir)
  issues: IssueSummary[];
  inbox: NeedsYouItem[];
  library: LibrarySummary[];
  authors: Author[];
  diagnostics_count: LintCounts;
}

// ---------------------------------------------------------------- issue detail

export interface Goal {
  context_md: string;
  criteria_heading: string; // "Success criteria"
  out_of_scope_md?: string;
  links_md?: string;
  /** Unknown frontmatter keys, kept and shown (F006). */
  extra: Record<string, string>;
  /** False when frontmatter failed to parse (F001): the UI shows `raw` plus the finding. */
  frontmatter_ok: boolean;
  raw?: string; // whole file text, present when frontmatter_ok is false
  edit: EditRef;
}

export interface EarsInfo {
  pattern: EarsPattern;
  /** Keyword spans inside `text` ("When", "the", "shall", "If", "then"…), for small caps. */
  keywords: { word: string; start: number; end: number }[];
  measurable: boolean;
}

export interface Criterion {
  id: CriterionId;
  text: string; // the EARS sentence (inline markdown, no "SC-n:" prefix)
  checked: boolean;
  state: CriterionState; // open | claimed (ticked, no evidence) | verified (ticked + evidence)
  ears: EarsInfo;
  verify?: string; // shell command or "manual"
  evidence?: string;
  verified_by?: Handle;
  scenario?: string; // "Given … / When … / Then …"
  satisfied_by: TaskId[]; // tasks whose `satisfies` lists this criterion
  edit: EditRef;
}

export interface Assumption {
  id: string; // "A1"
  text: string;
  state: "open" | "confirmed";
}

export interface Step {
  index: number; // 1-based → anchor "T-3.2"
  text: string;
  checked: boolean;
  edit: EditRef;
}

export interface Task {
  id: TaskId;
  title: string;
  status: TaskStatus;
  lane: string;
  phase: string;
  depends_on: string[]; // "T-1" or "wf-…#T-n"
  owns: string[];
  satisfies: CriterionId[];
  assignee?: string; // handle or "role:<name>"
  claimed_by?: Handle;
  lease_until?: Ts;
  lease: LeaseState;
  verify?: string;
  brief_md?: string;
  steps: Step[];
  ready: boolean; // contract 1.5 "ready"
  stale: boolean;
  level: number; // dependency depth (0 = no deps); PlanLanes column
  edit: EditRef;
}

export interface Phase {
  name: string; // "Live updates" ("Unphased" for tasks before the first phase)
  index: number; // N in "## Phase N: …" (0 for Unphased)
  tasks: Task[];
}

export interface Plan {
  updated_at: Ts;
  updated_by: Handle;
  revision: number;
  approach_md: string;
  assumptions: Assumption[];
  prior_art: Ref[];
  phases: Phase[];
  edit: EditRef;
}

export interface CurrentState {
  summary: string; // ≤120 chars, present tense
  updated_at: Ts;
  updated_by: Handle;
  phase?: string;
  library_refs: LibId[];
  session?: string;
  done_md?: string; // pointers only
  in_flight_md?: string;
  in_flight_tasks: TaskId[]; // task refs found in In flight
  blocked_md?: string;
  needs_you: NeedsYouItem[];
  failed_attempts: string[]; // one line each, with the error signature
  handoff_md?: string;
  next_steps: string[]; // item 1 is the one next action
  word_count: number; // Q008 above 400
  edit: EditRef;
}

interface EntryBase {
  id: EntryId;
  ts: Ts;
  author: Handle;
  title: string;
  body_md: string;
  /** Every meta key as written, including unknown ones (F006). */
  meta: Record<string, string>;
  line: number;
  edit: EditRef;
}

export interface ChangeEntry extends EntryBase {
  type: "change";
  kind: ChangeKind;
  task?: TaskId;
  criteria: CriterionId[];
  result?: "pass" | "fail";
  evidence?: string;
  commit?: string;
  pr?: string;
  files: string[];
  session?: string;
  model?: string;
}

export interface DecisionEntry extends EntryBase {
  type: "decision";
  status: DecisionStatus;
  topic?: string;
  supersedes?: EntryId;
  superseded_by?: EntryId; // derived from a later entry's `supersedes`
  affects: CriterionId[];
  decided_by: Handle[];
  decision_md?: string;
  because_md?: string;
  rejected_md?: string;
  consequences_md?: string;
  revisit_md?: string;
}

export interface LearningEntry extends EntryBase {
  type: "learning";
  kind: LearningKind;
  tags: string[];
  applies_to: string[];
  promote: "no" | "candidate";
  promoted_to?: LibId; // derived from a library item's `source:` backlink
  rule_md?: string; // first paragraph: the rule
  evidence_md?: string; // ≤3 lines
}

export type Entry = ChangeEntry | DecisionEntry | LearningEntry;

export interface DocFile {
  path: string; // relative to the issue folder: "notes/research.md", "evidence/sc2.png"
  kind: "markdown" | "image" | "other";
  size: number; // bytes
  rev: Rev;
  title?: string;
  body_md?: string; // markdown docs only
  url: string; // GET /api/files/{*path}
}

export interface DiagramError {
  path: string; // JSON path, e.g. "edges[3].to"
  msg: string;
}

export interface Diagram {
  id: string; // `id=` slug or the hash
  hash: string;
  type: DiagramType;
  title: string;
  file: string; // "goal.md"
  line: number;
  nodes: number;
  status: DiagramStatus;
  errors: DiagramError[];
  source: string; // the archify JSON candidate, as written
  url: string; // GET /api/diagrams/{hash}.html (bridge injected)
}

export interface IssueDetail {
  summary: IssueSummary;
  goal: Goal;
  criteria: Criterion[];
  plan: Plan | null; // null when plan.md is missing
  state: CurrentState | null; // null when current_state.md is missing
  changes: ChangeEntry[];
  decisions: DecisionEntry[];
  learnings: LearningEntry[];
  docs: DocFile[];
  diagrams: Diagram[];
  diagnostics: Diagnostic[];
  backlinks: Ref[];
  files_rev: Record<string, Rev>; // "goal.md" → rev
}

// ---------------------------------------------------------------- library

export interface LibrarySection {
  heading: string; // "Rule", "Symptom", "Procedure"…
  body_md: string;
}

export interface LibraryItemDetail {
  summary: LibrarySummary;
  source: Ref[];
  reviewed_by?: Handle;
  superseded_by?: LibId;
  sections: LibrarySection[];
  backlinks: Ref[]; // issues that cite it
  diagnostics: Diagnostic[];
  edit: EditRef;
}

export interface GlossaryTerm {
  term: string;
  kind: "noun" | "verb" | "adj";
  means: string;
  avoid: string[];
  see: string[];
}

export interface SearchHit {
  kind: "issue" | "library" | "entry" | "doc" | "term";
  id: string;
  title: string;
  snippet: string;
  score: number;
  path: string;
  issue?: IssueId;
}

export interface Health {
  version: string;
  wf_format: WfFormat;
  archify: "available" | "unavailable";
  rev: Rev;
}

// ---------------------------------------------------------------- ops (POST /api/ops)

/**
 * One Workdatabase item linked from an issue: a bullet under `## Links` in goal.md.
 * The markdown it becomes (`links.ts` in `features/context` is the grammar):
 * - `library`: `- [[lib-4tz7c]] <label>`; `target` is the library id.
 * - `entry`: `- [[wf-3k9x2#D-7f3k2]] <label>`; `target` is `<issue>#<entry id>`.
 * - `term`: `- Glossary: <target> — <label>`; `target` is the term, `label` what it means.
 * - `file`: `- [<label>](<path relative to the issue folder>)`; `target` is the
 *   workspace-relative path of the file.
 */
export interface ContextLink {
  kind: "library" | "entry" | "term" | "file";
  target: string;
  label: string;
}

export type Op =
  | { op: "set_status"; base_rev: Rev; issue: IssueId; status: IssueStatus; force?: boolean }
  | { op: "toggle_criterion"; base_rev: Rev; issue: IssueId; id: CriterionId; checked: boolean }
  | { op: "set_task_status"; base_rev: Rev; issue: IssueId; task: TaskId; status: TaskStatus }
  | {
      op: "toggle_step";
      base_rev: Rev;
      issue: IssueId;
      task: TaskId;
      index: number;
      checked: boolean;
    }
  | { op: "answer_request"; base_rev: Rev; issue: IssueId; id: RequestId; answer: string }
  | {
      op: "promote";
      base_rev: Rev;
      issue: IssueId;
      entry: EntryId;
      kind: LibraryKind;
      slug?: string;
    }
  | {
      op: "new_issue";
      base_rev: Rev;
      group: GroupId;
      slug: string;
      title: string;
      template: "default" | "bug" | "research" | "doc";
      size?: Size;
      /** Prose for `## Context` of the new goal.md. Empty: the template's own text. */
      context_md?: string;
      /** Workdatabase items to link under `## Links`, in order (see `ContextLink`). */
      links?: ContextLink[];
    }
  | {
      op: "new_group";
      base_rev: Rev;
      parent: GroupId;
      slug: string;
      title: string;
      color?: number;
    }
  | { op: "approve_library"; base_rev: Rev; id: LibId }
  /** Append Workdatabase items to `## Links` of goal.md. Items already linked are skipped. */
  | { op: "add_links"; base_rev: Rev; issue: IssueId; links: ContextLink[] };

export type OpName = Op["op"];

export interface OpResult {
  rev: Rev; // workspace rev after the write
  file_rev: Rev; // rev of the written file
  issue?: IssueSummary;
  /** Present for promote / new_issue / new_group: the created id. */
  created?: string;
}

/** 409 body: the target changed since the client read it. */
export interface Conflict {
  reason: string; // "goal.md changed by @codex"
  file: string;
  by?: Handle;
  current: unknown; // the target's current value
}

/** 422 body: the op would write an invalid file, or the move is illegal / gated. */
export interface Unprocessable {
  diagnostics: Diagnostic[];
  /** Done gate / illegal transition: human-readable gaps. */
  gaps?: string[];
}

// ---------------------------------------------------------------- SSE (GET /api/events)

export interface DeltaEvent {
  rev: Rev;
  issues_upserted: IssueSummary[];
  issues_removed: IssueId[];
  groups?: GroupNode;
  inbox?: NeedsYouItem[];
  library_upserted: LibrarySummary[];
  library_removed: LibId[];
  details_changed: IssueId[];
}

export interface ActivityEvent {
  rev: Rev;
  issue_id: IssueId;
  kind: ActivityKind;
  author: Handle;
  title: string;
  ts: Ts;
  /** UI hint: toast only for needs-you, blocked and expired-lease events. */
  notable?: "needs_you" | "blocked" | "lease_expired";
}

export interface DiagramEvent {
  hash: string;
  status: DiagramStatus;
  errors: DiagramError[];
}

export type ServerEvent =
  | { event: "snapshot"; id: Rev; data: WorkspaceSnapshot }
  | { event: "delta"; id: Rev; data: DeltaEvent }
  | { event: "activity"; id: Rev; data: ActivityEvent }
  | { event: "diagram"; id: Rev; data: DiagramEvent }
  | { event: "resync"; id: Rev; data: Record<string, never> };
