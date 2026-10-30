// Add work (plan D6): what Codex proposes when a group is split into issues, and the `goal.md`
// that `create_work` writes for each issue the person keeps.
//
// The split is deterministic: keyword templates for the common kinds of work (a bug, research,
// a migration, a document, a screen, a service) and one generic fallback. The same input always
// gives the same 3 to 5 proposals. Real Codex runs `codex exec` with the `adding-work` skill.
// Every title and one-line "why" follows `writing-readable-bulk-text`: the imperative verb comes
// first, the list has one shape, and the words that tell the lines apart come before the shared
// subject. Every criterion is an EARS sentence (contract 1.5).
import type { ContextLink, Priority, Size, Ts } from "@/gen/types";
import { ApiError } from "@/lib/api/error";
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
  return subject || "this work";
}

// ---------------------------------------------------------------- templates

interface Slot {
  /** `S` is the subject. */
  title: (s: string) => string;
  /** An EARS sentence. */
  criterion: (s: string) => string;
  /** One line, imperative verb first. */
  why: string;
}

const GENERIC: Slot[] = [
  {
    title: (s) => `Define the ${s} behavior`,
    criterion: (s) => `The ${s} spec shall state the inputs, the outputs and the failure cases.`,
    why: "Settle the behavior first; every other issue reads it.",
  },
  {
    title: (s) => `Build the ${s} core`,
    criterion: (s) =>
      `When a person uses the ${s}, the system shall complete the main path without an error.`,
    why: "Deliver the main path so the rest has something to build on.",
  },
  {
    title: (s) => `Connect the ${s} to the existing flow`,
    criterion: (s) =>
      `When the change for the ${s} merges, the system shall pass the existing tests.`,
    why: "Wire it in early so a clash shows up before release.",
  },
  {
    title: (s) => `Handle failures in the ${s}`,
    criterion: (s) =>
      `If the ${s} flow fails, then the system shall show the cause and leave the data unchanged.`,
    why: "Show the cause of a failure so nobody has to guess.",
  },
  {
    title: (s) => `Test the ${s} end to end`,
    criterion: (s) => `The ${s} tests shall cover the main path and each failure case.`,
    why: "Cover the main path and each failure case before release.",
  },
];

/** A bug group is named after the defect ("Fix tab-title count"): these say "the … problem". */
const BUG: Slot[] = [
  {
    title: (s) => `Reproduce the ${s} problem`,
    criterion: (s) => `A test for the ${s} problem shall fail before the fix and pass after it.`,
    why: "Pin the failure in a test before anyone changes code.",
  },
  {
    title: (s) => `Find the cause of the ${s} problem`,
    criterion: (s) => `The change entry shall name the cause of the ${s} problem.`,
    why: "Name the root cause so the fix does not hide it.",
  },
  {
    title: (s) => `Fix the ${s} problem`,
    criterion: (s) => `When the failing step runs, the ${s} problem shall not occur.`,
    why: "Change the least code that makes the test pass.",
  },
  {
    title: (s) => `Add a regression test for the ${s} problem`,
    criterion: (s) => `The regression test for the ${s} problem shall run in CI.`,
    why: "Keep the failure from coming back unseen.",
  },
  {
    title: () => "Check the fix in a release build",
    criterion: (s) => `When the release build runs, the ${s} problem shall not occur.`,
    why: "Confirm the fix outside the dev server.",
  },
];

const RESEARCH: Slot[] = [
  {
    title: (s) => `Frame the question for ${s}`,
    criterion: (s) => `The ${s} note shall state the question and who decides.`,
    why: "Agree on the question before anyone collects answers.",
  },
  {
    title: (s) => `Compare the options for ${s}`,
    criterion: (s) => `The ${s} note shall compare 3 options on cost and risk.`,
    why: "Put the options side by side on the same measures.",
  },
  {
    title: (s) => `Try the likeliest option for ${s}`,
    criterion: (s) => `The ${s} spike shall run the likeliest option on one real case.`,
    why: "Test the front runner on real data, not on paper.",
  },
  {
    title: (s) => `Recommend an option for ${s}`,
    criterion: (s) => `The ${s} note shall end with one recommendation and its trade-offs.`,
    why: "Give the decider one answer and what it costs.",
  },
  {
    title: (s) => `Record the decision on ${s}`,
    criterion: (s) => `The decision entry for ${s} shall hold the choice and its reasons.`,
    why: "Write the choice down so nobody reopens it by accident.",
  },
];

/** A migration group is named after the move ("Migrate the index to SQLite"): "the migration". */
const MIGRATION: Slot[] = [
  {
    title: () => "Inventory what the migration touches",
    criterion: () =>
      "The inventory shall list each caller, file and setting the migration touches.",
    why: "List every caller before the first move.",
  },
  {
    title: () => "Pilot the migration on one slice",
    criterion: () => "When the first slice moves, the system shall pass its tests.",
    why: "Prove the route on the smallest slice.",
  },
  {
    title: () => "Move the rest of the migration",
    criterion: () => "When the last slice moves, the old path shall have no callers.",
    why: "Finish the move slice by slice, with the tests green each time.",
  },
  {
    title: () => "Remove the old path",
    criterion: () => "The old path shall be deleted once no caller uses it.",
    why: "Delete the old path so nobody uses it again.",
  },
  {
    title: () => "Check the results after the move",
    criterion: () => "When the migrated code runs, the system shall match the old results.",
    why: "Compare the results with the old path before you close the issue.",
  },
];

const DOCS: Slot[] = [
  {
    title: (s) => `Outline the ${s}`,
    criterion: (s) => `The ${s} outline shall list each section and the reader it serves.`,
    why: "Fix the sections before anyone writes prose.",
  },
  {
    title: (s) => `Draft the ${s}`,
    criterion: (s) => `The ${s} draft shall cover each step a new reader needs.`,
    why: "Write every step once, in the order a reader takes them.",
  },
  {
    title: (s) => `Run the ${s} steps as written`,
    criterion: (s) => `Each step in the ${s} shall run as written on a clean machine.`,
    why: "Follow the text exactly; every gap is a defect.",
  },
  {
    title: (s) => `Review the ${s} with a new reader`,
    criterion: (s) => `The ${s} review shall record each place the reader got stuck.`,
    why: "Watch a newcomer use it and note where they stop.",
  },
  {
    title: (s) => `Release the ${s} with the next version`,
    criterion: (s) => `When the next version ships, the ${s} shall match it.`,
    why: "Ship the text with the code so they stay in step.",
  },
];

const UI: Slot[] = [
  {
    title: (s) => `Sketch the states of the ${s}`,
    criterion: (s) => `The ${s} design shall show the empty, loading and error states.`,
    why: "Draw every state first so the build has no guesses.",
  },
  {
    title: (s) => `Build the ${s} view`,
    criterion: (s) => `When a person opens the ${s}, the view shall show the data within 1 s.`,
    why: "Put real data on screen so the rest can be reviewed.",
  },
  {
    title: (s) => `Wire the ${s} to the data layer`,
    criterion: (s) => `When the data changes, the ${s} shall update without a reload.`,
    why: "Read and write through the data layer, never around it.",
  },
  {
    title: (s) => `Reach the ${s} by keyboard`,
    criterion: (s) =>
      `Where a person uses only the keyboard, the ${s} shall let them finish every step.`,
    why: "Cover keyboard use before the polish starts.",
  },
  {
    title: (s) => `Test the ${s} in the browser`,
    criterion: (s) => `The ${s} flow shall pass a browser test in CI.`,
    why: "Prove the flow in a real browser before release.",
  },
];

const SERVICE: Slot[] = [
  {
    title: (s) => `Define the ${s} contract`,
    criterion: (s) => `The ${s} contract shall list each request, response and error.`,
    why: "Fix the request and response shapes before any code.",
  },
  {
    title: (s) => `Build the ${s} route`,
    criterion: (s) =>
      `When a client calls the ${s}, the server shall return the documented response.`,
    why: "Deliver the happy path so clients can start against it.",
  },
  {
    title: (s) => `Guard the ${s} against bad input`,
    criterion: () => "If the input is invalid, then the server shall name the field and refuse it.",
    why: "Refuse bad input at the edge, with the field named.",
  },
  {
    title: (s) => `Cover the ${s} with integration tests`,
    criterion: (s) => `The ${s} tests shall cover each response and each error.`,
    why: "Run the route the way a client does.",
  },
  {
    title: (s) => `Document the ${s} calls`,
    criterion: (s) => `The ${s} guide shall show one request and one response for each call.`,
    why: "Show one real call for each route.",
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
  const subject = subjectOf(input.title);
  // The title decides the kind of work; the outcome only breaks a tie when the title says nothing.
  const builds = BUILDING.has((input.title.trim().split(/\s+/)[0] ?? "").toLowerCase());
  const kindOf = (text: string) =>
    FAMILIES.find((f) => !(builds && f.slots === BUG) && f.words.test(text.toLowerCase()))?.slots;
  const slots = kindOf(input.title) ?? kindOf(input.outcome) ?? GENERIC;
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
    why: i === 0 && read ? `Read ${read}, then settle the behavior.` : slot.why,
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

/** The `## Context` text of a new `goal.md` that came without one (the default template's). */
const DEFAULT_CONTEXT =
  "Why this matters, who feels the problem today and what changes when it is done.\n\nRun the `write-goal` skill to fill in this section.";

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
    context: keepInSection(issue.context?.replace(/\r\n/g, "\n").trim() ?? "") || DEFAULT_CONTEXT,
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
