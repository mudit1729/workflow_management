// The mock world is modelled as "sources": plain objects that mirror what the
// workspace FILES say (frontmatter keys, sections, checklist items, entries).
// `serialize.ts` renders them back to file text and `derive.ts` turns them into
// the API shapes of `@/gen/types`. Ops mutate sources and re-derive, so every
// view stays consistent after a write.
import type {
  ActivityKind,
  Author,
  ChangeKind,
  CriterionId,
  DateStr,
  DecisionStatus,
  GlossaryTerm,
  GroupId,
  Handle,
  IssueId,
  IssueStatus,
  LearningKind,
  LibId,
  LibraryKind,
  LibrarySection,
  LibraryStatus,
  Priority,
  RequestKind,
  Severity,
  Size,
  TaskId,
  TaskStatus,
  Ts,
  Urgency,
  WorkspaceConfig,
} from "@/gen/types";

/** goal.md frontmatter, in canonical key order. */
export interface GoalFront {
  id: IssueId;
  title: string;
  status: IssueStatus;
  priority: Priority;
  size: Size;
  owner?: Handle;
  labels: string[];
  claimed_by?: Handle;
  lease_until?: Ts;
  blocked_by: IssueId[];
  due?: DateStr;
  created: Ts;
  /** Unknown frontmatter keys, kept as written (F006). */
  extra?: Record<string, string>;
}

/** `- [x] SC-n: …` plus its nested meta list. */
export interface CriterionSrc {
  text: string;
  checked: boolean;
  verify?: string;
  evidence?: string;
  verified_by?: Handle;
  scenario?: string;
}

export interface StepSrc {
  text: string;
  done: boolean;
}

/** `### T-n: …` in plan.md. */
export interface TaskSrc {
  id: TaskId;
  title: string;
  status: TaskStatus;
  lane?: string;
  depends_on?: string[];
  owns?: string[];
  satisfies?: CriterionId[];
  assignee?: string;
  claimed_by?: Handle;
  lease_until?: Ts;
  verify?: string;
  brief?: string;
  steps?: StepSrc[];
}

export interface PhaseSrc {
  index: number; // N of "## Phase N: …"
  name: string;
  tasks: TaskSrc[];
}

export interface AssumptionSrc {
  id: string; // "A1"
  text: string;
  state: "open" | "confirmed";
}

export interface PlanSrc {
  updated_at: Ts;
  updated_by: Handle;
  revision: number;
  approach: string;
  assumptions: AssumptionSrc[];
  prior_art: { ref: LibId; why: string }[];
  phases: PhaseSrc[];
}

/** A needs-you request inside `## Needs you` of current_state.md. */
export interface RequestSrc {
  id: string; // Q-xxxxx
  question: string;
  from: Handle;
  to: Handle;
  kind: RequestKind;
  urgency: Urgency;
  asked: Ts;
  options?: string[];
  ref?: string; // "[[#D-7f3k2]]"
  answered?: boolean;
  answer?: string;
  answered_by?: Handle;
  answered_at?: Ts;
}

/** current_state.md: frontmatter plus the seven sections, each a list of markdown lines. */
export interface StateSrc {
  summary: string;
  updated_at: Ts;
  updated_by: Handle;
  phase?: string;
  library_refs?: LibId[];
  session?: string;
  done?: string[];
  in_flight?: string[];
  blocked?: string[];
  needs_you: RequestSrc[];
  failed_attempts?: string[];
  handoff?: string[];
  next_steps: string[];
}

export interface ChangeSrc {
  id: string; // C-xxxxx
  ts: Ts;
  author: Handle;
  title: string;
  kind?: ChangeKind;
  task?: TaskId;
  criteria?: CriterionId[];
  result?: "pass" | "fail";
  evidence?: string;
  commit?: string;
  pr?: string;
  files?: string[];
  session?: string;
  model?: string;
  /** Unknown meta keys (F006). */
  extra?: Record<string, string>;
  body: string;
}

export interface DecisionSrc {
  id: string; // D-xxxxx
  ts: Ts;
  author: Handle;
  title: string;
  status: DecisionStatus;
  topic?: string;
  supersedes?: string;
  affects?: CriterionId[];
  decided_by?: Handle[];
  decision: string;
  because: string;
  rejected?: string;
  consequences?: string;
  revisit?: string;
}

export interface LearningSrc {
  id: string; // L-xxxxx
  ts: Ts;
  author: Handle;
  title: string;
  kind: LearningKind;
  tags?: string[];
  applies_to?: string[];
  promote?: "no" | "candidate";
  rule: string;
  evidence?: string;
}

/** An extra file in the issue folder. `bytes` is set for binary assets. */
export interface DocSrc {
  path: string; // relative to the issue folder
  title?: string;
  body?: string;
  bytes?: number;
}

/** An explicit lint finding, located by searching `find` in the rendered file. */
export interface FindingSrc {
  rule: string;
  severity: Severity;
  file: "goal.md" | "plan.md" | "current_state.md" | "changes.md" | "decisions.md" | "learnings.md";
  find: string;
  message: string;
  fix?: string;
}

/** Activity that is not an entry (status moves, leases, requests). Feeds `last_activity`. */
export interface ActivitySrc {
  ts: Ts;
  author: Handle;
  kind: ActivityKind;
  title: string;
}

export interface IssueSrc {
  slug: string;
  group: GroupId;
  goal: GoalFront;
  context: string;
  criteria_heading?: string;
  criteria: CriterionSrc[];
  out_of_scope?: string;
  links?: string;
  /** When set, goal.md has invalid YAML: this key is written with a bare `@handle` (F001). */
  yaml_error?: { key: "owner" | "claimed_by"; message: string; fix: string };
  plan?: PlanSrc;
  state?: StateSrc;
  changes: ChangeSrc[];
  decisions: DecisionSrc[];
  learnings: LearningSrc[];
  docs?: DocSrc[];
  findings?: FindingSrc[];
  activity?: ActivitySrc[];
}

export interface GroupSrc {
  id: GroupId;
  title: string;
  slug: string;
  parent?: GroupId; // undefined for the root group (issues/)
  goal?: string;
  owner?: Handle;
  color?: number;
  order: number;
  implicit: boolean;
  definition_of_done?: string[];
}

export interface LibrarySrc {
  id: LibId;
  slug: string;
  title: string;
  kind: LibraryKind;
  description: string;
  status: LibraryStatus;
  tags: string[];
  applies_to: string[];
  source: string[]; // "[[wf-3k9x2#L-2gk7r]]"
  authors: Handle[];
  reviewed_by?: Handle;
  created: DateStr;
  last_reviewed?: DateStr;
  review_after?: DateStr;
  superseded_by?: LibId;
  sections: LibrarySection[];
}

export interface WorldSrc {
  config: WorkspaceConfig;
  authors: Author[];
  groups: GroupSrc[];
  issues: IssueSrc[];
  library: LibrarySrc[];
  glossary: GlossaryTerm[];
}
