// + Add work: the flow as plain data. Which questions a path asks, what a screen needs before it
// lets the person continue, the names and the priorities Codex's split starts from, and the
// arguments `useCreateWork` takes. No React here, so the rules are easy to test.
import type { ContextItem } from "@/features/context/types";
import { toLink } from "@/features/context/types";
import type { GroupId, GroupNode, Priority, Size } from "@/gen/types";
import type { Proposal, WorkGroup, WorkIssueInput } from "@/lib/api";

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

/** One question per screen. The group path ends with Codex's split and a review. */
export const GROUP_STEPS: readonly StepId[] = [
  "kind",
  "where",
  "outcome",
  "name",
  "size",
  "priority",
  "context",
  "split",
  "review",
];

/** The single-issue path asks the same things, minus the split, and asks the status itself. */
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

export function keptRows(draft: Draft): SplitRow[] {
  return draft.split?.rows.filter((r) => r.keep) ?? [];
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

/** More places than this and the question becomes a searchable list. */
export const MAX_WHERE_BUTTONS = 8;

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

const PARTICLES = new Set(
  "up down out on off in into over to with for from about back away".split(" "),
);
const PREPOSITIONS = new Set(
  "with over from in on for to of by via at into across between through under".split(" "),
);
const DETERMINERS = new Set(
  "the a an our your its their this that all every each any some".split(" "),
);
const DANGLING = new Set("a an and at by for from in into of on or the to with".split(" "));
/** Words that end a phrase without being its subject ("onboarding smoother"). */
const COMPARATIVES = new Set(
  "better faster smoother easier clearer simpler quicker safer cleaner cheaper".split(" "),
);
const ADJECTIVES = new Set(
  "new single simple basic quick better faster improved custom automatic live real full".split(" "),
);

const MAX_NAME = 32;

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

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Drop the small words a cut leaves at the end ("board updates over"). */
function trimEnd(tokens: string[]): string[] {
  const out = [...tokens];
  while (out.length > 1 && DANGLING.has((out.at(-1) ?? "").toLowerCase())) out.pop();
  return out;
}

const LEAD_IN =
  /^(?:(?:we|i)\s+(?:want|need|would like)\s+to\s+|so\s+that\s+|(?:let|allow|enable|help)\s+(?:(?:people|users|everyone|anyone|someone|teams?|the team|them|us|you)\s+)?(?:to\s+)?|to\s+)/i;

const CLAUSE =
  /\s+(?:so that|so|because|when|while|which|that|if|without|instead of)\s+|[,;:]|\s[—–-]\s/i;

/** The noun phrase an outcome is about: "Push board updates over SSE so …" → "board updates over SSE". */
export function subjectPhrase(outcome: string): string[] {
  let text = outcome
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  text = text.replace(LEAD_IN, "");
  const cut = text.split(CLAUSE)[0] ?? text;
  let tokens = cut.split(" ").filter(Boolean);
  while (tokens.length > 1 && DETERMINERS.has(tokens[0].toLowerCase())) tokens = tokens.slice(1);
  if (tokens.length > 1 && VERBS.has(tokens[0].toLowerCase())) {
    tokens = tokens.slice(1);
    if (tokens.length > 1 && PARTICLES.has(tokens[0].toLowerCase())) tokens = tokens.slice(1);
  }
  while (
    tokens.length > 1 &&
    (PREPOSITIONS.has(tokens[0].toLowerCase()) || DETERMINERS.has(tokens[0].toLowerCase()))
  )
    tokens = tokens.slice(1);
  return tokens;
}

/**
 * Up to three group names for an outcome, nouns and not verbs: the subject, the subject with
 * what it is about, and the thing it is about. `taken` names are skipped (a sibling group).
 */
export function suggestNames(outcome: string, taken: readonly string[] = []): string[] {
  const phrase = subjectPhrase(outcome);
  if (phrase.length === 0 || !phrase[0]) return [];
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));

  // A comparative ends the subject: "Workdatabase easier to browse" is about the Workdatabase.
  const compare = phrase.findIndex((t, i) => i > 0 && COMPARATIVES.has(t.toLowerCase()));
  if (compare > 0) phrase.length = compare;
  const preposition = phrase.findIndex((t, i) => i > 0 && PREPOSITIONS.has(t.toLowerCase()));
  let core = phrase.slice(0, preposition > 0 ? Math.min(preposition, 3) : 3);
  while (core.length > 1 && COMPARATIVES.has((core.at(-1) ?? "").toLowerCase())) core.pop();
  core = trimEnd(core);

  const long = trimEnd(phrase.slice(0, 5));
  let object: string[] = [];
  if (preposition > 0) {
    object = phrase.slice(preposition + 1, preposition + 5);
    while (object.length > 1 && DETERMINERS.has(object[0].toLowerCase())) object = object.slice(1);
    object = trimEnd(object.slice(0, 3));
  }
  const head = [...core].reverse().find((t) => !ADJECTIVES.has(t.toLowerCase()) && t.length >= 4);

  const out: string[] = [];
  for (const candidate of [core, long, object, head ? [head] : []]) {
    const name = upperFirst(candidate.join(" ").replace(/[,;:.]+$/, ""));
    const key = name.toLowerCase();
    if (
      !name ||
      name.length > MAX_NAME ||
      used.has(key) ||
      out.some((o) => o.toLowerCase() === key)
    )
      continue;
    out.push(name);
    if (out.length === 3) break;
  }
  return out;
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
      return draft.kind === "issue" ? !titleProblem(draft.title) : keptRows(draft).length > 0;
    default:
      return true;
  }
}

// ---------------------------------------------------------------- what is created

const ISSUE_CRITERION =
  "When the work is complete, the system shall behave as the context describes.";

/** The arguments of `useCreateWork` for the draft. */
export function createArgs(draft: Draft): { group: WorkGroup; issues: WorkIssueInput[] } | null {
  if (!draft.where) return null;
  const links = draft.context.map(toLink);
  if (draft.kind === "issue") {
    return {
      group: draft.where,
      issues: [
        {
          title: draft.title.trim(),
          priority: draft.priority,
          size: draft.size,
          status: draft.status,
          criteria: [ISSUE_CRITERION],
          ...(links.length > 0 ? { links } : {}),
        },
      ],
    };
  }
  const outcome = draft.outcome.trim();
  return {
    group: { parent: draft.where, title: draft.name.trim() },
    issues: keptRows(draft).map((r) => ({
      title: r.title.trim(),
      priority: r.priority,
      size: r.size,
      status: draft.status,
      criteria: [r.criterion],
      context: `${r.why}\n\nGroup outcome: ${outcome}`,
      ...(links.length > 0 ? { links } : {}),
    })),
  };
}

/** "4 issues". */
export function countIssues(n: number): string {
  return plural(n, "issue");
}
