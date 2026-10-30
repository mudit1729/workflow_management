// + Add work: the flow as plain data. Which questions a path asks, what a screen needs before it
// lets the person continue, the names and the priorities Codex's split starts from, and the
// arguments `useCreateWork` takes. No React here, so the rules are easy to test.
import type { ContextItem } from "@/features/context/types";
import { toLink } from "@/features/context/types";
import type { GroupId, GroupNode, Priority, Size } from "@/gen/types";
import {
  type Proposal,
  type SPLIT_STEPS,
  suggestGroupNames,
  type WorkGroup,
  type WorkIssueInput,
} from "@/lib/api";

export type WorkKind = "group" | "issue";
export type WorkStatus = "backlog" | "planned";

export type StepId =
  | "kind"
  | "where"
  | "outcome"
  | "title"
  | "name"
  | "size"
  | "priority"
  | "status"
  | "context"
  | "split"
  | "review";

/**
 * One question per screen. The group path ends with Codex's split, which is also where the
 * proposals are kept or dropped, where they start (Backlog or Planned) and where they are added:
 * there is no separate review.
 */
export const GROUP_STEPS: readonly StepId[] = [
  "kind",
  "where",
  "outcome",
  "name",
  "size",
  "priority",
  "context",
  "split",
];

/**
 * The single-issue path asks the same things, minus the split, and asks the status itself. A lone
 * issue keeps a review: it is the one place its answers are checked before it is written.
 */
export const ISSUE_STEPS: readonly StepId[] = [
  "kind",
  "where",
  "title",
  "priority",
  "size",
  "status",
  "context",
  "review",
];

/** The steps of a path. `skipKind` drops the first question (the caller already knows). */
export function stepsFor(kind: WorkKind | undefined, skipKind: boolean): StepId[] {
  const all = kind === "issue" ? ISSUE_STEPS : GROUP_STEPS;
  return skipKind ? all.filter((s) => s !== "kind") : [...all];
}

/** The screens whose answer is typed. Every other screen is answered with one click. */
const TYPED_STEPS: readonly StepId[] = ["outcome", "title"];

/** What adding a group may cost: clicks, counting the one that opens the dialog, and typed lines. */
export const GROUP_CLICK_BUDGET = 8;
export const GROUP_TYPED_LINES = 1;

/**
 * Clicks it takes to add work with the default answers: one to open the dialog, one per screen
 * that is answered with a button (a typed screen is answered with Enter), and the last screen's
 * button counts as that screen's click. Choosing Planned instead of Backlog is one more.
 */
export function clicksToAdd(kind: WorkKind | undefined, skipKind: boolean): number {
  return 1 + stepsFor(kind, skipKind).filter((s) => !TYPED_STEPS.includes(s)).length;
}

/** Typed lines on a path. */
export function typedLines(kind: WorkKind | undefined, skipKind: boolean): number {
  return stepsFor(kind, skipKind).filter((s) => TYPED_STEPS.includes(s)).length;
}

/** The word on a progress dot and in the dot's tooltip. */
export const STEP_LABEL: Record<StepId, string> = {
  kind: "What",
  where: "Where",
  outcome: "Outcome",
  title: "Title",
  name: "Name",
  size: "Size",
  priority: "Priority",
  status: "Status",
  context: "Context",
  split: "Split",
  review: "Review",
};

// ---------------------------------------------------------------- the draft

/** One issue Codex proposed, with the choices the person made on its card. */
export interface SplitRow {
  key: string;
  title: string;
  why: string;
  criterion: string;
  size: Size;
  priority: Priority;
  keep: boolean;
}

export interface SplitDraft {
  /** The inputs the rows were made from; the rows are valid while this still matches. */
  signature: string;
  rows: SplitRow[];
}

/**
 * What Codex drafted for a lone issue: the criterion (one EARS sentence, measurable) and the
 * reason the issue exists, which becomes its `## Context`. The person may edit the criterion on
 * the review screen. Valid while `signature` matches the answers it was drafted from.
 */
export interface IssueDraft {
  signature: string;
  criterion: string;
  why: string;
}

/** Everything the person has answered so far. */
export interface Draft {
  kind?: WorkKind;
  /** The group path: the parent of the new group. The issue path: the group of the issue. */
  where?: GroupId;
  /** The group's outcome: the one typed line. */
  outcome: string;
  /** The group's name (a suggestion or the person's own). */
  name: string;
  /** "Write my own" is picked on the Name screen. */
  ownName: boolean;
  /** The single issue's title. */
  title: string;
  size: Size;
  priority: Priority;
  status: WorkStatus;
  context: ContextItem[];
  split?: SplitDraft;
  /** The single issue's criterion and context, drafted on its review screen. */
  issue?: IssueDraft;
}

export const DEFAULT_SIZE: Size = "m";
export const DEFAULT_PRIORITY: Priority = "medium";
export const DEFAULT_STATUS: WorkStatus = "backlog";

export function emptyDraft(over: Partial<Draft> = {}): Draft {
  return {
    outcome: "",
    name: "",
    ownName: false,
    title: "",
    size: DEFAULT_SIZE,
    priority: DEFAULT_PRIORITY,
    status: DEFAULT_STATUS,
    context: [],
    ...over,
  };
}

/**
 * True once the person typed or picked something they would lose by closing. The first two
 * questions (what, where) are one click each and not worth a "discard?".
 */
export function isDirty(draft: Draft): boolean {
  return (
    draft.outcome.trim() !== "" ||
    draft.title.trim() !== "" ||
    draft.name.trim() !== "" ||
    draft.context.length > 0 ||
    !!draft.split
  );
}

// ---------------------------------------------------------------- questions

export const SIZES_GROUP: { value: Size; label: string; hint: string }[] = [
  { value: "s", label: "S", hint: "Small: a few days of work" },
  { value: "m", label: "M", hint: "Medium: about a week" },
  { value: "l", label: "L", hint: "Large: weeks of work" },
];

export const SIZES_ISSUE: { value: Size; label: string; hint: string }[] = [
  { value: "xs", label: "XS", hint: "A few hours" },
  { value: "s", label: "S", hint: "About a day" },
  { value: "m", label: "M", hint: "A few days" },
  { value: "l", label: "L", hint: "A week or more" },
];

export const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: "urgent", label: "Urgent", hint: "Drop everything else" },
  { value: "high", label: "High", hint: "Do it this cycle" },
  { value: "medium", label: "Medium", hint: "Do it soon" },
  { value: "low", label: "Low", hint: "Do it when there is time" },
  { value: "none", label: "None", hint: "No priority yet" },
];

export const STATUSES: { value: WorkStatus; label: string; hint: string }[] = [
  { value: "backlog", label: "Backlog", hint: "Not scheduled yet" },
  { value: "planned", label: "Planned", hint: "Scheduled, ready to start" },
];

export const SIZE_LABEL: Record<Size, string> = { xs: "XS", s: "S", m: "M", l: "L" };

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low", "none"];

/**
 * The priority of the nth issue of a group. The first half takes the group's priority and the
 * rest one step less, so the issues Codex lists first lead the group. The person can change each.
 */
export function priorityFor(group: Priority, index: number, count: number): Priority {
  const rank = PRIORITY_ORDER.indexOf(group);
  const later = index >= Math.ceil(count / 2);
  return PRIORITY_ORDER[Math.min(PRIORITY_ORDER.length - 1, rank + (later ? 1 : 0))];
}

/** Turn Codex's proposals into the rows the person reviews. */
export function rowsFrom(proposals: Proposal[], groupPriority: Priority): SplitRow[] {
  return proposals.map((p, i) => ({
    key: p.key,
    title: p.title,
    why: p.why,
    criterion: p.criterion,
    size: p.size,
    priority: priorityFor(groupPriority, i, proposals.length),
    keep: true,
  }));
}

/** What the split read. The same signature means the same proposals, so the screen keeps them. */
export function splitSignature(draft: Draft): string {
  return JSON.stringify([
    draft.name.trim(),
    draft.outcome.trim(),
    draft.size,
    draft.context.map((c) => `${c.kind}:${c.target}`),
  ]);
}

/**
 * Codex's proposals for the answers as they stand, or undefined while they are missing or were
 * made for answers the person has since changed (they went back and edited one). Everything that
 * reads the rows (the button, the count, what is written) goes through this, so stale proposals
 * can never be added.
 */
export function currentSplit(draft: Draft): SplitDraft | undefined {
  return draft.split?.signature === splitSignature(draft) ? draft.split : undefined;
}

export function keptRows(draft: Draft): SplitRow[] {
  return currentSplit(draft)?.rows.filter((r) => r.keep) ?? [];
}

// ---------------------------------------------------------------- the lone issue's draft

/** What Codex reads to draft a lone issue: the title and the linked context, not the size. */
export function issueSignature(draft: Draft): string {
  return JSON.stringify([draft.title.trim(), draft.context.map((c) => `${c.kind}:${c.target}`)]);
}

/** The lone issue's draft, or undefined while it is missing or stale (see `currentSplit`). */
export function currentIssue(draft: Draft): IssueDraft | undefined {
  return draft.issue?.signature === issueSignature(draft) ? draft.issue : undefined;
}

type OneLinePerStep<T extends readonly unknown[]> = { readonly [K in keyof T]: string };

/**
 * The progress lines of the draft, one per step of the split Codex runs underneath (the type
 * keeps the two lists the same length).
 */
export const ISSUE_DRAFT_STEPS: OneLinePerStep<typeof SPLIT_STEPS> = [
  "Reading the issue",
  "Reading linked context",
  "Drafting the criterion",
];

const firstWord = (text: string) =>
  text
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z-]/g, "") ?? "";

/**
 * The proposal that says what the person's title says. Codex splits the title the way it splits a
 * group, and a lone issue is one slot of that split: the one that opens with the same verb ("Fix
 * the … problem" for "Fix flaky login test"), else the second, the slot that carries the work
 * ("Build the core of …"). The first is usually groundwork (a spec, a question), not the issue.
 */
export function pickIssueSlot(title: string, proposals: readonly Proposal[]): Proposal | undefined {
  const verb = firstWord(title);
  return (
    (verb ? proposals.find((p) => firstWord(p.title) === verb) : undefined) ??
    proposals[1] ??
    proposals[0]
  );
}

/** The draft a lone issue starts from: one proposal's criterion and reason. */
export function draftIssue(
  signature: string,
  title: string,
  proposals: readonly Proposal[],
): IssueDraft | undefined {
  const slot = pickIssueSlot(title, proposals);
  return slot ? { signature, criterion: slot.criterion, why: slot.why } : undefined;
}

/**
 * `## Context` of a lone issue: why it exists (Codex's line) and where it sits. Never a
 * placeholder: a person who opens the file reads a real sentence.
 */
export function issueContext(why: string, place: string | undefined): string {
  return place ? `${why}\n\nIt belongs to ${place}.` : why;
}

// ---------------------------------------------------------------- where

export interface WhereOption {
  id: GroupId;
  node: GroupNode;
  depth: number;
  /** Titles from the top-level group down; empty for the root. */
  titles: string[];
  root: boolean;
  /** The button's main line. */
  label: string;
  /** The faint line under it. */
  sub: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The places an answer to "Where?" can name, root first, then every group in tree order.
 * For a new group the buttons read "Inside wf / web"; for an issue they name the group.
 */
export function whereOptions(root: GroupNode, kind: WorkKind): WhereOption[] {
  const out: WhereOption[] = [];
  const top = [...root.children]
    .sort((a, b) => a.order - b.order)
    .map((g) => g.title)
    .slice(0, 3);
  out.push({
    id: root.id,
    node: root,
    depth: 0,
    titles: [],
    root: true,
    label: "Top level",
    sub:
      kind === "group"
        ? top.length > 0
          ? `Beside ${top.join(", ")}`
          : "The first group of the workspace"
        : "Not in a group",
  });
  const walk = (nodes: GroupNode[], depth: number, titles: string[]) => {
    for (const node of [...nodes].sort((a, b) => a.order - b.order)) {
      const path = [...titles, node.title];
      const label = kind === "group" ? `Inside ${path.join(" / ")}` : path.join(" / ");
      out.push({
        id: node.id,
        node,
        depth,
        titles: path,
        root: false,
        label,
        sub: plural(node.rollup.issues, "issue"),
      });
      walk(node.children, depth + 1, path);
    }
  };
  walk(root.children, 1, []);
  return out;
}

/**
 * More places than this and the question becomes a searchable list. Adding a group adds a place,
 * so a workspace at the limit would make its next "Where?" worse: the limit leaves room, and the
 * buttons scroll. The number keys reach the first nine; the rest are one click or arrow keys.
 */
export const MAX_WHERE_BUTTONS = 12;

/** The first candidate that names a place in `options`. */
export function pickWhere(
  options: WhereOption[],
  candidates: (GroupId | undefined)[],
): GroupId | undefined {
  const ids = new Set(options.map((o) => o.id));
  return candidates.find((id): id is GroupId => !!id && ids.has(id));
}

// ---------------------------------------------------------------- names

/** Words a title or a name can open with when it says what to do. */
const VERBS = new Set(
  (
    "add allow archive automate browse build change check choose clean compare configure connect " +
    "convert copy create cut decide define delete deliver design display document download draft " +
    "edit enable evaluate explore export extend find fix get give handle import improve install " +
    "integrate investigate let list load log make merge migrate monitor move open optimize parse " +
    "port print publish push reduce redesign refactor remove rename render replace research review " +
    "rewrite run save scan schedule send set share ship show sign speed split stop stream study " +
    "support sync test track try turn update upgrade upload use validate verify write"
  ).split(" "),
);

/** True when a title opens with a verb the board's scan can use ("Fix …", "Add …"). */
export function startsWithVerb(title: string): boolean {
  const first =
    title
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z-]/g, "") ?? "";
  return VERBS.has(first);
}

/**
 * Up to three group names for an outcome, nouns and not verbs ("Board speed", "Handoff bundle"):
 * the same reading the split titles are built around (`@/lib/api` names). `taken` names are
 * skipped (a sibling group).
 */
export function suggestNames(outcome: string, taken: readonly string[] = []): string[] {
  return suggestGroupNames(outcome, taken);
}

/** The folder name a group title becomes: lowercase words joined by hyphens. */
export function slugOf(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Why a name cannot be used under a parent, or undefined when it can. */
export function nameProblem(name: string, parent: GroupNode | undefined): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Give the group a name.";
  const slug = slugOf(trimmed);
  if (!slug) return "Use letters or digits in the name.";
  if (trimmed.length > 48) return "Keep the name under 48 characters.";
  if (parent?.children.some((c) => c.slug === slug))
    return `${parent.title} already has a group named “${trimmed}”. Pick another name.`;
  return undefined;
}

// ---------------------------------------------------------------- what the screens need

export function titleProblem(title: string): string | undefined {
  const trimmed = title.trim();
  if (trimmed.length < 3) return "Say what needs doing.";
  if (trimmed.length > 120) return "Keep the title under 120 characters.";
  return undefined;
}

export function outcomeProblem(outcome: string): string | undefined {
  const trimmed = outcome.trim();
  if (trimmed.length < 3) return "Say what the group should achieve.";
  if (trimmed.length > 240) return "Keep it to one line, under 240 characters.";
  return undefined;
}

/** Can the person leave this screen? `parent` is the group the new group goes into. */
export function canContinue(draft: Draft, step: StepId, parent: GroupNode | undefined): boolean {
  switch (step) {
    case "kind":
      return !!draft.kind;
    case "where":
      return !!draft.where;
    case "outcome":
      return !outcomeProblem(draft.outcome);
    case "title":
      return !titleProblem(draft.title);
    case "name":
      return !nameProblem(draft.name, parent);
    case "split":
      return keptRows(draft).length > 0;
    case "review":
      return !titleProblem(draft.title) && !!currentIssue(draft)?.criterion.trim();
    default:
      return true;
  }
}

// ---------------------------------------------------------------- what is created

/**
 * The arguments of `useCreateWork` for the draft, or null while there is nothing to write: no
 * place, no kept issue, or proposals made for answers the person has since changed.
 * `place` names the group of a lone issue ("wf / auth"), for its `## Context`; undefined at the top level.
 */
export function createArgs(
  draft: Draft,
  place?: string,
): { group: WorkGroup; issues: WorkIssueInput[] } | null {
  if (!draft.where) return null;
  const links = draft.context.map(toLink);
  if (draft.kind === "issue") {
    const issue = currentIssue(draft);
    const criterion = issue?.criterion.replace(/\s+/g, " ").trim();
    if (!issue || !criterion) return null;
    return {
      group: draft.where,
      issues: [
        {
          title: draft.title.trim(),
          priority: draft.priority,
          size: draft.size,
          status: draft.status,
          criteria: [criterion],
          context: issueContext(issue.why, place),
          ...(links.length > 0 ? { links } : {}),
        },
      ],
    };
  }
  const outcome = draft.outcome.trim();
  const rows = keptRows(draft);
  if (rows.length === 0) return null;
  return {
    // The outcome is the group's goal line (`_group.md`, adding-work step 5).
    group: { parent: draft.where, title: draft.name.trim(), goal: outcome },
    issues: rows.map((r) => ({
      title: r.title.trim(),
      priority: r.priority,
      size: r.size,
      status: draft.status,
      criteria: [r.criterion],
      context: r.why,
      ...(links.length > 0 ? { links } : {}),
    })),
  };
}

/** "4 issues". */
export function countIssues(n: number): string {
  return plural(n, "issue");
}
