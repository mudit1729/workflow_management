// Add work (plan D6): what Codex proposes when a group is split into issues, and the `goal.md`
// that `create_work` writes for each issue the person keeps.
//
// The split is deterministic: keyword templates for the common kinds of work (a bug, research,
// a migration, a document, a screen, a service) and one generic fallback. The same input always
// gives the same 3 to 5 proposals. Real Codex runs `codex exec` with the `adding-work` skill.
// Every title follows `writing-readable-bulk-text`: the imperative verb comes first, the list has
// one shape, and the words that tell the lines apart come before the shared subject. The subject
// is a noun phrase ("board speed", "handoff bundle"), so each title reads as a sentence. The "why"
// is the reason the issue exists, as format.md asks of `## Context`. Every criterion is an EARS
// sentence (contract 1.5).
import type { ContextLink, Priority, Size, Ts } from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import { topicOf } from "@/lib/api/names";
import {
  type Proposal,
  SPLIT_STEPS,
  type SplitInput,
  type SplitResult,
  type WorkIssueInput,
} from "@/lib/api/types";
import { addLinks } from "./md/edit";
import { renderGoal } from "./md/render";
import type { IssueSrc } from "./source";

/** One step lasts this long, so a split takes about 2 s. */
export const SPLIT_STEP_MS = 650;

// ---------------------------------------------------------------- the subject

/** Verbs a group title may open with. The subject of the split is what follows the verb. */
const OPENING_VERBS = new Set(
  (
    "add allow build change choose clean compare connect convert create decide define " +
    "deliver design document draft enable evaluate explore extend fix handle improve " +
    "integrate investigate make migrate move optimize port push redesign refactor reduce " +
    "remove rename replace research review rewrite ship show speed stream study support " +
    "sync test track update upgrade write"
  ).split(" "),
);

const MAX_SUBJECT = 32;

/** Words that belong to the opening verb: "Speed up search", "Decide on the billing provider". */
const PARTICLES = new Set(
  "up down out on off in into over to with for from about back away".split(" "),
);

/** Words a title cannot end on: a cut subject drops them ("keyboard shortcuts to the"). */
const DANGLING = new Set("a an and at by for from in into of on or the to with".split(" "));

/** Lower the first letter unless the word is an acronym, a name with digits or a code word. */
function lowerFirst(text: string): string {
  const word = text.split(/\s+/)[0] ?? "";
  if (/[A-Z].*[A-Z]|\d|[_./`]/.test(word)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The words without the small words a cut leaves at the end. */
function withoutDangling(text: string): string {
  const words = text.split(" ");
  while (words.length > 1 && DANGLING.has((words.at(-1) ?? "").toLowerCase())) words.pop();
  return words.join(" ");
}

/** The thing the group is about: its title without the opening verb, short enough for a title. */
export function subjectOf(title: string): string {
  const words = title.trim().replace(/\s+/g, " ").split(" ");
  const opens = OPENING_VERBS.has((words[0] ?? "").toLowerCase());
  let rest = opens ? words.slice(1) : words;
  if (opens && PARTICLES.has((rest[0] ?? "").toLowerCase())) rest = rest.slice(1);
  // A comma would end the EARS condition clause early (`When …, the system shall …`); the
  // templates bring their own "the".
  let subject = lowerFirst(
    rest
      .join(" ")
      .replace(/[.!?]+$/, "")
      .replace(/,/g, "")
      .replace(/^(?:the|a|an|our|your|its)\s+/i, ""),
  ).trim();
  if (subject.length > MAX_SUBJECT) {
    const cut = subject.slice(0, MAX_SUBJECT);
    subject = withoutDangling(cut.slice(0, Math.max(cut.lastIndexOf(" "), 12)).trim());
  }
  return !subject || /^(?:it|this|that|them)$/i.test(subject) ? "this work" : subject;
}

/** Words after which a noun phrase gives way to the rest of the sentence. */
const PREPOSITIONS = new Set(
  "with from over in on for to by via at into across between through under using".split(" "),
);

/** The noun phrase before the first preposition: "error handling to the API" → "error handling". */
function headPhrase(subject: string): string {
  const words = subject.split(" ");
  const at = words.findIndex((w, i) => i > 0 && PREPOSITIONS.has(w.toLowerCase()));
  return at > 0 ? words.slice(0, at).join(" ") : subject;
}

/**
 * The noun phrase the titles of a split are built around. A group name that was cut from the
 * outcome sentence ("Board feel instant" from "Make the board feel instant …") is a fragment, not
 * a noun: the sentence is read again for its topic ("board speed"). A name the person wrote
 * themselves keeps their words, cut before its first preposition.
 */
export function subjectFor(input: SplitInput): string {
  const flat = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const name = flat(input.title);
  if (name && flat(input.outcome).includes(name)) {
    const topic = topicOf(input.outcome).topic.join(" ");
    if (topic) return lowerFirst(topic);
  }
  return headPhrase(subjectOf(input.title));
}

// ---------------------------------------------------------------- templates

interface Slot {
  /** `S` is the subject, a noun phrase: "weekly reports", "board speed". */
  title: (s: string) => string;
  /** An EARS sentence. */
  criterion: (s: string) => string;
  /** One line: why the issue exists. It becomes the opening of `## Context` (format.md section 4). */
  why: string;
}

const GENERIC: Slot[] = [
  {
    title: (s) => `Define the behavior of ${s}`,
    criterion: (s) =>
      `The spec for ${s} shall state the inputs, the outputs and the failure cases.`,
    why: "Every other issue reads the behavior, so settle it first.",
  },
  {
    title: (s) => `Build the core of ${s}`,
    criterion: (s) =>
      `When a person uses ${s}, the system shall complete the main path without an error.`,
    why: "The rest of the work builds on the main path, so deliver it early.",
  },
  {
    title: (s) => `Connect ${s} to the existing flow`,
    criterion: (s) => `When the change for ${s} merges, the system shall pass the existing tests.`,
    why: "Wiring it in early shows a clash with existing code before release.",
  },
  {
    title: (s) => `Handle failures in ${s}`,
    criterion: (s) =>
      `If ${s} fails, then the system shall show the cause and leave the data unchanged.`,
    why: "Failures that hide their cause make people guess, so show the cause.",
  },
  {
    title: (s) => `Test ${s} end to end`,
    criterion: (s) => `The tests for ${s} shall cover the main path and each failure case.`,
    why: "Untested paths break after release, so the tests cover each one.",
  },
];

/** A bug group is named after the defect ("Fix tab-title count"): these say "the … problem". */
const BUG: Slot[] = [
  {
    title: (s) => `Reproduce the ${s} problem`,
    criterion: (s) => `A test for the ${s} problem shall fail before the fix and pass after it.`,
    why: "Failures that no test pins come back, so reproduce this one first.",
  },
  {
    title: (s) => `Find the cause of the ${s} problem`,
    criterion: (s) => `The change entry shall name the cause of the ${s} problem.`,
    why: "Fixes that skip the root cause hide the problem, so name the cause.",
  },
  {
    title: (s) => `Fix the ${s} problem`,
    criterion: (s) => `When the failing step runs, the ${s} problem shall not occur.`,
    why: "Less changed code means less new risk, so make the smallest change.",
  },
  {
    title: (s) => `Add a regression test for the ${s} problem`,
    criterion: (s) => `The regression test for the ${s} problem shall run in CI.`,
    why: "Without a regression test the failure comes back unseen.",
  },
  {
    title: () => "Check the fix in a release build",
    criterion: (s) => `When the release build runs, the ${s} problem shall not occur.`,
    why: "Users run the release build, so confirm the fix there.",
  },
];

const RESEARCH: Slot[] = [
  {
    title: (s) => `Frame the question for ${s}`,
    criterion: (s) => `The ${s} note shall state the question and who decides.`,
    why: "Answers to different questions cannot be compared, so agree on the question first.",
  },
  {
    title: (s) => `Compare the options for ${s}`,
    criterion: (s) => `The ${s} note shall compare 3 options on cost and risk.`,
    why: "Options judged on different measures cannot be ranked, so use the same measures.",
  },
  {
    title: (s) => `Try the likeliest option for ${s}`,
    criterion: (s) => `The ${s} spike shall run the likeliest option on one real case.`,
    why: "Paper results miss real data, so test the front runner on a real case.",
  },
  {
    title: (s) => `Recommend an option for ${s}`,
    criterion: (s) => `The ${s} note shall end with one recommendation and its trade-offs.`,
    why: "The decider needs one answer and its cost, so end with a recommendation.",
  },
  {
    title: (s) => `Record the decision on ${s}`,
    criterion: (s) => `The decision entry for ${s} shall hold the choice and its reasons.`,
    why: "Choices that are not written down get reopened by accident, so record this one.",
  },
];

/** A migration group is named after the move ("Migrate the index to SQLite"): "the migration". */
const MIGRATION: Slot[] = [
  {
    title: () => "Inventory what the migration touches",
    criterion: () =>
      "The inventory shall list each caller, file and setting the migration touches.",
    why: "Callers missed in the inventory break after the move, so list every caller first.",
  },
  {
    title: () => "Pilot the migration on one slice",
    criterion: () => "When the first slice moves, the system shall pass its tests.",
    why: "The smallest slice proves the route at the lowest cost, so move it first.",
  },
  {
    title: () => "Move the rest of the migration",
    criterion: () => "When the last slice moves, the old path shall have no callers.",
    why: "Moves in slices keep the tests green, so finish it one slice at a time.",
  },
  {
    title: () => "Remove the old path",
    criterion: () => "The old path shall be deleted once no caller uses it.",
    why: "Paths that nobody deletes get used again, so remove the old one.",
  },
  {
    title: () => "Check the results after the move",
    criterion: () => "When the migrated code runs, the system shall match the old results.",
    why: "Matching results prove the move lost nothing, so compare them before closing.",
  },
];

const DOCS: Slot[] = [
  {
    title: (s) => `Outline the ${s}`,
    criterion: (s) => `The ${s} outline shall list each section and the reader it serves.`,
    why: "Prose written before the sections are fixed gets rewritten, so outline first.",
  },
  {
    title: (s) => `Draft the ${s}`,
    criterion: (s) => `The ${s} draft shall cover each step a new reader needs.`,
    why: "Readers take the steps in order, so write every step once in that order.",
  },
  {
    title: (s) => `Run the ${s} steps as written`,
    criterion: (s) => `Each step in the ${s} shall run as written on a clean machine.`,
    why: "Every gap in the text stops a reader, so follow it exactly.",
  },
  {
    title: (s) => `Review the ${s} with a new reader`,
    criterion: (s) => `The ${s} review shall record each place the reader got stuck.`,
    why: "Newcomers stop where the author sees no gap, so watch one use it.",
  },
  {
    title: (s) => `Release the ${s} with the next version`,
    criterion: (s) => `When the next version ships, the ${s} shall match it.`,
    why: "Text that ships apart from the code drifts, so release them together.",
  },
];

const UI: Slot[] = [
  {
    title: (s) => `Sketch the states for ${s}`,
    criterion: (s) => `The design for ${s} shall show the empty, loading and error states.`,
    why: "Drawing every state first leaves the build with no guesses.",
  },
  {
    title: (s) => `Build the view for ${s}`,
    criterion: (s) => `When a person opens ${s}, the view shall show the data within 1 s.`,
    why: "Real data on screen lets the rest be reviewed, so build the view early.",
  },
  {
    title: (s) => `Wire ${s} to the data layer`,
    criterion: (s) => `When the data changes, ${s} shall update without a reload.`,
    why: "Views that read around the data layer break when the data changes.",
  },
  {
    title: (s) => `Reach ${s} by keyboard`,
    criterion: (s) =>
      `Where a person uses only the keyboard, ${s} shall let them finish every step.`,
    why: "Keyboard gaps found late force rework, so cover them before the polish.",
  },
  {
    title: (s) => `Test ${s} in the browser`,
    criterion: (s) => `The flow for ${s} shall pass a browser test in CI.`,
    why: "Flows that pass in the dev server can still break in a browser, so test there.",
  },
];

const SERVICE: Slot[] = [
  {
    title: (s) => `Define the contract for ${s}`,
    criterion: (s) => `The contract for ${s} shall list each request, response and error.`,
    why: "Clients cannot start before the shapes are fixed, so define them before any code.",
  },
  {
    title: (s) => `Build the route for ${s}`,
    criterion: (s) => `When a client calls ${s}, the server shall return the documented response.`,
    why: "Clients can start against a working happy path, so deliver it early.",
  },
  {
    title: (s) => `Guard ${s} against bad input`,
    criterion: () => "If the input is invalid, then the server shall name the field and refuse it.",
    why: "Bad input that reaches the core corrupts data, so refuse it at the edge.",
  },
  {
    title: (s) => `Cover ${s} with integration tests`,
    criterion: (s) => `The tests for ${s} shall cover each response and each error.`,
    why: "Routes tested only by hand break silently, so run them the way a client does.",
  },
  {
    title: (s) => `Document the calls for ${s}`,
    criterion: (s) => `The guide for ${s} shall show one request and one response for each call.`,
    why: "Callers read the guide before the code, so show one real call for each route.",
  },
];

/** The first family whose words appear in the title or the outcome wins; the order matters. */
const FAMILIES: { words: RegExp; slots: Slot[] }[] = [
  {
    words: /\b(bug|fix|crash|error|regression|broken|fails?|failing|leak|flaky|wrong)\b/,
    slots: BUG,
  },
  {
    words: /\b(research|compare|evaluate|spike|investigate|explore|decide|choose|study)\b/,
    slots: RESEARCH,
  },
  {
    words: /\b(migrate|migration|port|upgrade|convert|rewrite|refactor|replace)\b/,
    slots: MIGRATION,
  },
  {
    words: /\b(docs?|guide|readme|tutorial|handbook|manual|documentation)\b/,
    slots: DOCS,
  },
  {
    words:
      /\b(ui|screen|page|view|board|dialog|button|panel|form|card|menu|drawer|layout|onboarding|palette)\b/,
    slots: UI,
  },
  {
    words:
      /\b(api|endpoint|server|route|service|sync|webhook|backend|daemon|database|queue|cache|auth|login|token|sso)\b/,
    slots: SERVICE,
  },
];

// ---------------------------------------------------------------- sizes and priorities

const SIZES: Size[] = ["xs", "s", "m", "l"];

/** How many issues a group of this size splits into. */
const COUNT: Record<Size, number> = { xs: 3, s: 3, m: 4, l: 5 };

/** Steps below the group size, per slot: the middle of the list carries the weight. */
const SHRINK = [2, 1, 1, 2, 2];

const PRIORITIES: Priority[] = ["high", "high", "medium", "medium", "low"];

/** A title that opens with one of these builds something: "error" in it is a feature, not a defect. */
const BUILDING = new Set(
  "add build create design enable extend implement improve introduce make show support write".split(
    " ",
  ),
);

const URGENT = /\b(urgent|asap|blocker|critical|outage|today)\b/i;

function sizeOf(parent: Size, slot: number): Size {
  return SIZES[Math.max(0, SIZES.indexOf(parent) - SHRINK[slot])];
}

// ---------------------------------------------------------------- the split

/** What a context id stands for in the list ("Rescan subtrees on every event"), if known. */
export type ResolveContext = (id: string) => string | undefined;

/** A line of "Read …" longer than this names one item and counts the others. */
const MAX_READ_CHARS = 96;

/**
 * "A", "A and B": the full titles of the first two items, never cut. When both would run the
 * line long, the first one is named and the rest are counted ("A and 2 more").
 */
function names(context: string[], resolve: ResolveContext | undefined): string {
  const all = context.map((id) => resolve?.(id) ?? id);
  const pair = all.slice(0, 2).join(" and ");
  if (all.length < 2 || pair.length <= MAX_READ_CHARS) return pair;
  return `${all[0]} and ${all.length - 1} more`;
}

/**
 * The proposals for a group: 3 to 5 issues, never more issues than the size allows, one criterion
 * each. A pure function of the input, so the same group always splits the same way.
 */
export function proposeIssues(input: SplitInput, resolve?: ResolveContext): Proposal[] {
  // The title decides the kind of work; the outcome only breaks a tie when the title says nothing.
  const builds = BUILDING.has((input.title.trim().split(/\s+/)[0] ?? "").toLowerCase());
  const kindOf = (text: string) =>
    FAMILIES.find((f) => !(builds && f.slots === BUG) && f.words.test(text.toLowerCase()))?.slots;
  const slots = kindOf(input.title) ?? kindOf(input.outcome) ?? GENERIC;
  // A bug group is named after the defect and keeps its words ("login error on Safari"); the
  // other kinds are built around a noun phrase.
  const subject = slots === BUG ? subjectOf(input.title) : subjectFor(input);
  const parent = input.size ?? "m";
  const urgent = URGENT.test(`${input.title} ${input.outcome}`);
  const read = input.context.length > 0 ? names(input.context, resolve) : "";

  return slots.slice(0, COUNT[parent]).map((slot, i) => ({
    key: `p${i + 1}`,
    title: slot.title(subject),
    size: sizeOf(parent, i),
    priority: urgent && i < 2 ? "urgent" : PRIORITIES[i],
    criterion: slot.criterion(subject),
    // The first issue reads what the person linked, so the context shows in the list.
    why: i === 0 && read ? `The behavior rests on ${read}, so settle it first.` : slot.why,
  }));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SplitOptions {
  /** Called as each of `SPLIT_STEPS` starts (0, 1, 2). */
  onStep?: (step: number) => void;
  /** Length of one step. Default `SPLIT_STEP_MS`. */
  stepMs?: number;
  resolve?: ResolveContext;
}

/** Split a group into issues. Takes about 2 s, with `SPLIT_STEPS` as the visible progress. */
export async function split(input: SplitInput, options: SplitOptions = {}): Promise<SplitResult> {
  if (!input.title.trim())
    throw new ApiError(422, { diagnostics: [], gaps: ["Give the group a title."] });
  for (let step = 0; step < SPLIT_STEPS.length; step++) {
    options.onStep?.(step);
    await sleep(options.stepMs ?? SPLIT_STEP_MS);
  }
  return { issues: proposeIssues(input, options.resolve) };
}

// ---------------------------------------------------------------- the files `create_work` writes

/**
 * The `## Context` text of a new `goal.md` that came without one: one real sentence from the title
 * and the group, never a placeholder. Add work always sends its own reason.
 */
function defaultContext(title: string, place: string | undefined): string {
  const what = title.trim().replace(/[.!?]+$/, "");
  return place ? `${what}. It belongs to ${place}.` : `${what}.`;
}

/**
 * Prose for `## Context` may not open a section of its own: a `#` or `##` heading in it (outside a
 * code fence) becomes `###`, so a pasted "## Success criteria" cannot swallow the real criteria.
 */
function keepInSection(text: string): string {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
      return !fenced && /^#{1,2}(\s|$)/.test(line) ? line.replace(/^#{1,2}/, "###") : line;
    })
    .join("\n");
}

/**
 * `goal.md` of one issue that `create_work` adds. Like `newIssueGoal`, but with the priority,
 * the status and the criteria the person kept. Each criterion is verified by hand until a
 * `verify:` command replaces it. `dir` is the folder of the new issue, for file links.
 */
export function workIssueGoal(args: {
  id: string;
  owner: string;
  created: Ts;
  dir: string;
  issue: WorkIssueInput;
  /** The group the issue goes in, named in its default context. */
  place?: string;
}): string {
  const { issue } = args;
  const src: IssueSrc = {
    slug: "",
    group: "",
    goal: {
      id: args.id,
      title: issue.title.trim(),
      status: issue.status,
      priority: issue.priority,
      size: issue.size,
      owner: args.owner,
      labels: [],
      blocked_by: [],
      created: args.created,
    },
    context:
      keepInSection(issue.context?.replace(/\r\n/g, "\n").trim() ?? "") ||
      defaultContext(issue.title, args.place),
    criteria: issue.criteria.map((text) => ({
      text: text.replace(/\s+/g, " ").trim(),
      checked: false,
      verify: "manual",
    })),
    changes: [],
    decisions: [],
    learnings: [],
  };
  const text = renderGoal(src);
  const links: ContextLink[] = issue.links ?? [];
  return links.length > 0 ? addLinks(text, links, args.dir) : text;
}
