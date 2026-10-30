// Text edits: every write the UI or a scripted event makes is a minimal change to the markdown
// (the `wf-edit` splice of contract 1.1 principle 4). Each function takes the file text and
// returns the new text. Only the lines that must change change: ticking SC-3 flips one
// checkbox, and nothing else moves. A target that does not exist throws `EditError`.
//
// Files are never re-serialized, with two exceptions that the contract itself overwrites as a
// whole: `current_state.md` (`overwriteState`) and a file that does not exist yet.
import { linkKeys, linkLine } from "@/features/context/links";
import type { ContextLink, IssueStatus, LibraryStatus, TaskStatus } from "@/gen/types";
import type {
  ChangeSrc,
  DecisionSrc,
  GroupSrc,
  IssueSrc,
  LearningSrc,
  LibrarySrc,
  RequestSrc,
  StateSrc,
} from "../source";
import { asList, readFrontmatter } from "./frontmatter";
import { parseState } from "./parse-state";
import {
  at,
  changeLines,
  decisionLines,
  flow,
  learningLines,
  quoted,
  renderGoal,
  renderGroup,
  renderLibraryItem,
  renderState,
  requestLines,
} from "./render";
import { computeFenceMask, toLines } from "./text";
import { FileCtx } from "./types";

export class EditError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "invalid" = "not_found",
  ) {
    super(message);
    this.name = "EditError";
  }
}

// ---------------------------------------------------------------- a mutable line list

class Doc {
  lines: string[];
  readonly eol: string;
  private final: boolean;

  constructor(text: string) {
    this.eol = text.includes("\r\n") ? "\r\n" : "\n";
    this.final = text.endsWith("\n");
    const raw = text === "" ? [] : text.split("\n");
    if (this.final) raw.pop();
    this.lines = raw.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  }

  /** Lines inside a fenced block (never headings, items or keys). */
  mask(): boolean[] {
    return computeFenceMask(this.lines);
  }

  toString(): string {
    return this.lines.length === 0 ? "" : this.lines.join(this.eol) + (this.final ? this.eol : "");
  }
}

/** Index of the first line at or after `from` that matches, outside fences. */
function find(d: Doc, re: RegExp, from = 0, to = d.lines.length): number {
  const mask = d.mask();
  for (let i = from; i < to; i++) if (!mask[i] && re.test(d.lines[i])) return i;
  return -1;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------- frontmatter

interface KeyRange {
  key: string;
  start: number;
  /** Exclusive. */
  end: number;
}

function frontmatter(d: Doc): { open: number; close: number; keys: KeyRange[] } {
  if (d.lines[0]?.trimEnd() !== "---")
    throw new EditError("The file has no frontmatter.", "invalid");
  let close = -1;
  for (let i = 1; i < d.lines.length; i++) {
    if (d.lines[i].trimEnd() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) throw new EditError("The frontmatter is not closed.", "invalid");
  const starts: { key: string; start: number }[] = [];
  for (let i = 1; i < close; i++) {
    const m = /^([A-Za-z_][\w-]*):/.exec(d.lines[i]);
    if (m) starts.push({ key: m[1], start: i });
  }
  const keys = starts.map((s, k) => ({ ...s, end: starts[k + 1]?.start ?? close }));
  return { open: 0, close, keys };
}

/** Set a frontmatter key. A missing key goes after the nearest earlier key of `order`. */
function setFront(d: Doc, key: string, value: string, order: readonly string[]): void {
  const fm = frontmatter(d);
  const line = `${key}: ${value}`;
  const cur = fm.keys.find((k) => k.key === key);
  if (cur) {
    d.lines.splice(cur.start, cur.end - cur.start, line);
    return;
  }
  const pos = order.indexOf(key);
  let insertAt = -1;
  for (let i = pos - 1; i >= 0 && insertAt < 0; i--) {
    const prev = fm.keys.find((k) => k.key === order[i]);
    if (prev) insertAt = prev.end;
  }
  for (let i = pos + 1; i < order.length && insertAt < 0; i++) {
    const next = fm.keys.find((k) => k.key === order[i]);
    if (next) insertAt = next.start;
  }
  d.lines.splice(insertAt < 0 ? fm.close : insertAt, 0, line);
}

function removeFront(d: Doc, key: string): void {
  const fm = frontmatter(d);
  const cur = fm.keys.find((k) => k.key === key);
  if (cur) d.lines.splice(cur.start, cur.end - cur.start);
}

const GOAL_ORDER = [
  "id",
  "title",
  "status",
  "priority",
  "size",
  "owner",
  "labels",
  "claimed_by",
  "lease_until",
  "blocked_by",
  "due",
  "created",
] as const;

const LIBRARY_ORDER = [
  "id",
  "title",
  "kind",
  "description",
  "status",
  "tags",
  "applies_to",
  "source",
  "authors",
  "reviewed_by",
  "created",
  "last_reviewed",
  "review_after",
  "superseded_by",
] as const;

// ---------------------------------------------------------------- meta lists

interface MetaBlock {
  /** Lines [start, end) hold the contiguous list. */
  start: number;
  end: number;
  indent: string;
}

/** The meta list that follows `heading` (or a checklist item when `nested`). */
function metaBlock(d: Doc, heading: number, nested: boolean): MetaBlock {
  const re = nested ? /^[ \t]+- [a-z_]+:(?:[ \t]|$)/ : /^- [a-z_]+:(?:[ \t]|$)/;
  let end = heading + 1;
  while (end < d.lines.length && re.test(d.lines[end])) end++;
  return { start: heading + 1, end, indent: nested ? "  " : "" };
}

const keyLine = (d: Doc, b: MetaBlock, key: string): number => {
  for (let i = b.start; i < b.end; i++)
    if (new RegExp(`^[ \\t]*- ${esc(key)}:(?:[ \\t]|$)`).test(d.lines[i])) return i;
  return -1;
};

/** Set or add `- key: value` in a meta list. An empty value writes `- key:`. */
function putMeta(d: Doc, b: MetaBlock, key: string, value: string, order: readonly string[]): void {
  const line = value === "" ? `${b.indent}- ${key}:` : `${b.indent}- ${key}: ${value}`;
  const at = keyLine(d, b, key);
  if (at >= 0) {
    d.lines[at] = line;
    return;
  }
  const pos = order.indexOf(key);
  let insertAt = -1;
  for (let i = pos - 1; i >= 0 && insertAt < 0; i--) {
    const prev = keyLine(d, b, order[i]);
    if (prev >= 0) insertAt = prev + 1;
  }
  for (let i = pos + 1; i < order.length && insertAt < 0; i++) {
    const next = keyLine(d, b, order[i]);
    if (next >= 0) insertAt = next;
  }
  if (insertAt < 0) insertAt = b.end;
  d.lines.splice(insertAt, 0, line);
  b.end += 1;
}

function dropMeta(d: Doc, b: MetaBlock, key: string): void {
  const at = keyLine(d, b, key);
  if (at < 0) return;
  d.lines.splice(at, 1);
  b.end -= 1;
}

// ---------------------------------------------------------------- goal.md

/** Move the issue to another status: one line of the frontmatter. */
export function setIssueStatus(text: string, status: IssueStatus): string {
  const d = new Doc(text);
  setFront(d, "status", status, GOAL_ORDER);
  return d.toString();
}

/** `status: blocked` and the blocker in `blocked_by`: two lines of the frontmatter. */
export function markBlocked(text: string, blocker: string): string {
  const current = asList(readFrontmatter(toLines(text)).data.blocked_by);
  const d = new Doc(text);
  setFront(d, "status", "blocked", GOAL_ORDER);
  if (!current.includes(blocker))
    setFront(d, "blocked_by", flow([...current, blocker]), GOAL_ORDER);
  return d.toString();
}

/** Take the issue as coordinator: `claimed_by` and `lease_until`. */
export function claimIssue(text: string, by: string, leaseUntil: string): string {
  const d = new Doc(text);
  setFront(d, "claimed_by", quoted(by), GOAL_ORDER);
  setFront(d, "lease_until", leaseUntil, GOAL_ORDER);
  return d.toString();
}

/** Give up the coordinator claim. */
export function releaseIssue(text: string): string {
  const d = new Doc(text);
  removeFront(d, "claimed_by");
  removeFront(d, "lease_until");
  return d.toString();
}

/** Renew or expire the coordinator lease: the value of `lease_until`. */
export function setIssueLease(text: string, leaseUntil: string): string {
  const d = new Doc(text);
  setFront(d, "lease_until", leaseUntil, GOAL_ORDER);
  return d.toString();
}

const CRITERION_LINE = (n: string) => new RegExp(`^- \\[[ xX]\\]\\s+SC-${esc(n)}:`);

/**
 * Tick or untick a criterion: the checkbox of one line. Unticking also removes the `evidence`
 * and `verified_by` lines under it, because a criterion is verified only while it is ticked.
 */
export function toggleCriterion(text: string, id: string, checked: boolean): string {
  const n = /^SC-(\d+)$/.exec(id)?.[1];
  const d = new Doc(text);
  const at = n ? find(d, CRITERION_LINE(n)) : -1;
  if (at < 0) throw new EditError(`Criterion ${id} does not exist.`);
  d.lines[at] = d.lines[at].replace(/^- \[[ xX]\]/, checked ? "- [x]" : "- [ ]");
  if (!checked) {
    const b = metaBlock(d, at, true);
    dropMeta(d, b, "evidence");
    dropMeta(d, b, "verified_by");
  }
  return d.toString();
}

const CRITERION_ORDER = ["verify", "evidence", "verified_by", "scenario"] as const;

/**
 * Tick a criterion with proof (`doing-next-step`, step 7): the checkbox, then `evidence:` and
 * `verified_by:` under it, in the key order of the contract. Ticking without proof is
 * `toggleCriterion`.
 */
export function verifyCriterion(
  text: string,
  id: string,
  proof: { evidence: string; by: string },
): string {
  const d = new Doc(toggleCriterion(text, id, true));
  const n = /^SC-(\d+)$/.exec(id)?.[1];
  const line = n ? find(d, CRITERION_LINE(n)) : -1;
  if (line < 0) throw new EditError(`Criterion ${id} does not exist.`);
  const b = metaBlock(d, line, true);
  putMeta(d, b, "evidence", proof.evidence.replace(/\s*\n\s*/g, " ").trim(), CRITERION_ORDER);
  putMeta(d, b, "verified_by", at(proof.by), CRITERION_ORDER);
  return d.toString();
}

// ---------------------------------------------------------------- plan.md

const TASK_ORDER = [
  "status",
  "lane",
  "depends_on",
  "owns",
  "satisfies",
  "assignee",
  "claimed_by",
  "lease_until",
  "verify",
] as const;

function taskBlock(d: Doc, id: string): { head: number; end: number } {
  const head = find(d, new RegExp(`^###\\s+${esc(id)}\\s*:`));
  if (head < 0) throw new EditError(`Task ${id} does not exist.`);
  const mask = d.mask();
  let end = d.lines.length;
  for (let i = head + 1; i < d.lines.length; i++) {
    if (!mask[i] && /^#{1,3}\s/.test(d.lines[i])) {
      end = i;
      break;
    }
  }
  return { head, end };
}

/** Set the `status` of a task: one line of its meta list. */
export function setTaskStatus(text: string, task: string, status: TaskStatus): string {
  const d = new Doc(text);
  const { head } = taskBlock(d, task);
  putMeta(d, metaBlock(d, head, false), "status", status, TASK_ORDER);
  return d.toString();
}

/** Claim a task: `claimed_by` and `lease_until` join its meta list. */
export function claimTask(text: string, task: string, by: string, leaseUntil: string): string {
  const d = new Doc(text);
  const { head } = taskBlock(d, task);
  const b = metaBlock(d, head, false);
  putMeta(d, b, "claimed_by", at(by), TASK_ORDER);
  putMeta(d, b, "lease_until", leaseUntil, TASK_ORDER);
  return d.toString();
}

/** Put a task back in the queue: the claim and the lease leave its meta list. */
export function releaseTask(text: string, task: string): string {
  const d = new Doc(text);
  const { head } = taskBlock(d, task);
  const b = metaBlock(d, head, false);
  dropMeta(d, b, "claimed_by");
  dropMeta(d, b, "lease_until");
  return d.toString();
}

/** Renew a task lease (a later `leaseUntil`) or let it expire (a time in the past). */
export function setTaskLease(text: string, task: string, leaseUntil: string): string {
  const d = new Doc(text);
  const { head } = taskBlock(d, task);
  putMeta(d, metaBlock(d, head, false), "lease_until", leaseUntil, TASK_ORDER);
  return d.toString();
}

/**
 * What `set_task_status` writes: the status line, and the claim that goes with the move.
 * `todo` puts the task back in the queue (claim and lease leave). `in_progress` on a task
 * nobody holds claims it for `claim.by` until `claim.leaseUntil`. Other moves keep the claim.
 */
export function moveTask(
  text: string,
  task: string,
  status: TaskStatus,
  claim?: { by: string; leaseUntil: string },
): string {
  let next = setTaskStatus(text, task, status);
  if (status === "todo") return releaseTask(next, task);
  if (status === "in_progress" && claim) {
    const d = new Doc(next);
    const { head } = taskBlock(d, task);
    if (keyLine(d, metaBlock(d, head, false), "claimed_by") < 0)
      next = claimTask(next, task, claim.by, claim.leaseUntil);
  }
  return next;
}

export const renewLease = setTaskLease;
/** Let a task lease run out: `lease_until` moves to `expiredAt`, a time in the past. */
export const expireLease = setTaskLease;

/** Tick or untick step `index` (1-based) of a task: the checkbox of one line. */
export function toggleStep(text: string, task: string, index: number, checked: boolean): string {
  const d = new Doc(text);
  const { head, end } = taskBlock(d, task);
  const mask = d.mask();
  let seen = 0;
  for (let i = head + 1; i < end; i++) {
    if (mask[i] || !/^- \[[ xX]\]\s/.test(d.lines[i])) continue;
    seen++;
    if (seen !== index) continue;
    d.lines[i] = d.lines[i].replace(/^- \[[ xX]\]/, checked ? "- [x]" : "- [ ]");
    return d.toString();
  }
  throw new EditError(`Step ${task}.${index} does not exist.`);
}

// ---------------------------------------------------------------- current_state.md

const REQUEST_ORDER = [
  "from",
  "to",
  "kind",
  "urgency",
  "asked",
  "options",
  "ref",
  "answer",
  "answered_by",
  "answered_at",
] as const;

const REQUEST_LINE = (id: string) => new RegExp(`^- \\[[ xX]\\]\\s+${esc(id)}:`);

/**
 * Answer a request: tick it, fill `answer:`, and add `answered_by` and `answered_at`.
 * Line breaks in the answer become spaces, because a meta value is one line.
 */
export function answerRequest(
  text: string,
  id: string,
  answer: { answer: string; by: string; at: string },
): string {
  const d = new Doc(text);
  const line = find(d, REQUEST_LINE(id));
  if (line < 0) throw new EditError(`Request ${id} does not exist.`);
  d.lines[line] = d.lines[line].replace(/^- \[[ xX]\]/, "- [x]");
  const b = metaBlock(d, line, true);
  putMeta(d, b, "answer", answer.answer.replace(/\s*\n\s*/g, " ").trim(), REQUEST_ORDER);
  putMeta(d, b, "answered_by", at(answer.by), REQUEST_ORDER);
  putMeta(d, b, "answered_at", answer.at, REQUEST_ORDER);
  return d.toString();
}

/**
 * Answer every open request whose `ref:` names `ref` (for example `[[lib-4tz7c]]`), as
 * `approve_library` does for the review request of a draft. Returns the new text and the
 * ids of the requests it closed; the text is unchanged when none matched.
 */
export function answerRequestsReferring(
  text: string,
  ref: string,
  answer: { answer: string; by: string; at: string },
): { text: string; closed: string[] } {
  const d = new Doc(text);
  const ids: string[] = [];
  d.lines.forEach((line, i) => {
    const m = /^- \[ \]\s+(Q-[0-9A-Za-z]+):/.exec(line);
    if (!m) return;
    const b = metaBlock(d, i, true);
    const at = keyLine(d, b, "ref");
    if (at >= 0 && d.lines[at].includes(ref)) ids.push(m[1]);
  });
  let next = text;
  for (const id of ids) next = answerRequest(next, id, answer);
  return { text: next, closed: ids };
}

const STATE_AFTER_NEEDS_YOU =
  /^## (failed[ _-]?attempts?|hand-?off( notes)?|next[ _-]?steps?)\s*$/i;
const NEEDS_YOU = /^## needs[ _-]?you\s*$/i;

/** What a new `current_state.md` holds when a request is the first thing written to it. */
export interface StateScaffold {
  summary: string;
  updated_at: string;
  updated_by: string;
  next_steps: string[];
}

/**
 * Add a request at the end of `## Needs you` (the section is created in its place when
 * missing). When the file does not exist, `scaffold` writes a new one around the request.
 */
export function addRequest(
  text: string | undefined,
  request: RequestSrc,
  scaffold?: StateScaffold,
): string {
  if (text === undefined || text.trim() === "") {
    if (!scaffold) throw new EditError("current_state.md does not exist.");
    return renderState({ ...scaffold, needs_you: [request] });
  }
  const d = new Doc(text);
  const lines = requestLines(request);
  const section = find(d, NEEDS_YOU);
  if (section >= 0) {
    const mask = d.mask();
    let end = d.lines.length;
    for (let i = section + 1; i < d.lines.length; i++) {
      if (!mask[i] && /^#{1,2}\s/.test(d.lines[i])) {
        end = i;
        break;
      }
    }
    let last = end - 1;
    while (last > section && d.lines[last].trim() === "") last--;
    d.lines.splice(last + 1, 0, ...lines);
    return d.toString();
  }
  const next = find(d, STATE_AFTER_NEEDS_YOU);
  if (next >= 0) d.lines.splice(next, 0, "## Needs you", ...lines, "");
  else {
    if (d.lines.length && d.lines[d.lines.length - 1].trim() !== "") d.lines.push("");
    d.lines.push("## Needs you", ...lines);
  }
  return d.toString();
}

/**
 * Overwrite `current_state.md` as a whole (`wf state`): the parsed file takes the changed
 * fields and is written in canonical form. Sections you do not change keep their content.
 */
export function overwriteState(
  text: string,
  patch: Partial<Omit<StateSrc, "needs_you">> & { needs_you?: RequestSrc[] },
): string {
  const ctx = new FileCtx("current_state.md", toLines(text));
  const current = parseState(ctx, { now: 0, author: "me" });
  return renderState({ ...current, ...patch });
}

/** A brand new `current_state.md`. */
export function createState(state: StateSrc): string {
  return renderState(state);
}

// ---------------------------------------------------------------- logs

function appendBlock(text: string | undefined, title: string, block: string[]): string {
  if (text === undefined || text.trim() === "")
    return `${[`# ${title}`, "", ...block].join("\n")}\n`;
  const d = new Doc(text);
  while (d.lines.length && d.lines[d.lines.length - 1].trim() === "") d.lines.pop();
  d.lines.push("", ...block);
  // The file ends with exactly one line break after an append.
  return `${d.lines.join(d.eol)}${d.eol}`;
}

/** Append a change entry at the bottom of `changes.md` (the file is created when missing). */
export const appendChange = (text: string | undefined, entry: ChangeSrc): string =>
  appendBlock(text, "Changes", changeLines(entry));

/** Append a decision at the bottom of `decisions.md`. */
export const appendDecision = (text: string | undefined, entry: DecisionSrc): string =>
  appendBlock(text, "Decisions", decisionLines(entry));

/** Does a log file already hold an entry with this id? The heading ends in `{#<id>}`. */
const hasEntry = (text: string, id: string): boolean =>
  text.split("\n").some((l) => l.startsWith("## ") && l.trimEnd().endsWith(`{#${id}}`));

/**
 * Append a learning at the bottom of `learnings.md`. An id that is already in the file is not
 * written twice: the same call again returns the text as it is (a retry after a lost reply).
 */
export const appendLearning = (text: string | undefined, entry: LearningSrc): string =>
  text !== undefined && hasEntry(text, entry.id)
    ? text
    : appendBlock(text, "Learnings", learningLines(entry));

/**
 * The `Evidence:` of a learning that was read from library pages: one `sources:` list of page
 * addresses (`alias:path`, `#anchor` for a section), each a link the dashboard opens.
 */
export const sourcesEvidence = (sources: string[]): string =>
  ["answered from the library, sources:", ...sources.map((s) => `- [[${s}]]`)].join("\n");

/** Change the `status` of a decision: the one key of an entry that may change. */
export function setDecisionStatus(
  text: string,
  id: string,
  status: "proposed" | "accepted" | "rejected",
): string {
  const d = new Doc(text);
  const head = find(d, new RegExp(`^## .*\\{#${esc(id)}\\}\\s*$`));
  if (head < 0) throw new EditError(`Decision ${id} does not exist.`);
  putMeta(d, metaBlock(d, head, false), "status", status, [
    "status",
    "topic",
    "supersedes",
    "affects",
    "decided_by",
  ]);
  return d.toString();
}

// ---------------------------------------------------------------- library

/** The file a promoted entry becomes: a draft item with a `source:` backlink. */
export function newLibraryItem(item: LibrarySrc): string {
  return renderLibraryItem(item);
}

/** Approve a library item: `status`, `reviewed_by`, `last_reviewed` and `review_after`. */
export function approveLibraryItem(
  text: string,
  review: { by: string; today: string; reviewAfter: string },
  status: LibraryStatus = "reviewed",
): string {
  const d = new Doc(text);
  setFront(d, "status", status, LIBRARY_ORDER);
  setFront(d, "reviewed_by", quoted(review.by), LIBRARY_ORDER);
  setFront(d, "last_reviewed", review.today, LIBRARY_ORDER);
  setFront(d, "review_after", review.reviewAfter, LIBRARY_ORDER);
  return d.toString();
}

// ---------------------------------------------------------------- creation

export type IssueTemplate = "default" | "bug" | "research" | "doc";

const TEMPLATES: Record<IssueTemplate, { context: string; criteria: string[]; labels: string[] }> =
  {
    default: {
      context:
        "Why this matters, who feels the problem today and what changes when it is done.\n\nWrite this section before the issue is planned.",
      criteria: ["When the work is complete, the system shall behave as the context describes."],
      labels: [],
    },
    bug: {
      context:
        "What happens today, what should happen and the steps to reproduce it.\n\nWrite this section before the issue is planned.",
      criteria: [
        "When the failing step runs, the system shall behave as the context describes.",
        "A regression test shall cover the failing step.",
      ],
      labels: ["bug"],
    },
    research: {
      context:
        "The question to answer, why it matters and who decides.\n\nWrite this section before the issue is planned.",
      criteria: [
        "The research note shall answer the question with a recommendation and its trade-offs.",
      ],
      labels: ["research"],
    },
    doc: {
      context:
        "Who reads this document and what they can do once they have read it.\n\nWrite this section before the issue is planned.",
      criteria: ["The document shall explain each step a new reader needs to finish the task."],
      labels: ["docs"],
    },
  };

/**
 * `goal.md` of a new issue: backlog, a scaffold of the sections, no plan and no state.
 * `context` replaces the template's placeholder in `## Context`. `links` become the bullets of
 * `## Links`, in order; a file link is written relative to `dir`, the folder of the new issue.
 */
export function newIssueGoal(args: {
  id: string;
  title: string;
  owner?: string;
  size?: IssueSrc["goal"]["size"];
  template?: IssueTemplate;
  created: string;
  context?: string;
  links?: ContextLink[];
  dir?: string;
}): string {
  const t = TEMPLATES[args.template ?? "default"];
  const context = args.context?.replace(/\r\n/g, "\n").trim();
  const links = dedupeLinks(args.links ?? []).map((l) => linkLine(l, args.dir ?? ""));
  const src: IssueSrc = {
    slug: "",
    group: "",
    goal: {
      id: args.id,
      title: args.title.trim(),
      status: "backlog",
      priority: "none",
      size: args.size ?? "m",
      owner: args.owner,
      labels: [...t.labels],
      blocked_by: [],
      created: args.created,
    },
    context: context || t.context,
    criteria: t.criteria.map((text) => ({ text, checked: false, verify: "manual" })),
    links: links.length ? links.join("\n") : undefined,
    changes: [],
    decisions: [],
    learnings: [],
  };
  return renderGoal(src);
}

// ---------------------------------------------------------------- links

const LINKS_HEADING = /^##\s+links\s*$/i;
const OUT_OF_SCOPE_HEADING = /^##\s+out of scope\s*$/i;
const CRITERIA_HEADING = /^##\s+.*(?:success criteria|acceptance)/i;
const H2 = /^##\s/;
const BULLET = /^\s*[-*+]\s/;

/** The same item twice is one bullet. */
function dedupeLinks(links: ContextLink[]): ContextLink[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const key = `${l.kind}:${l.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** First line after `head` that starts an H2 section (or the end of the file). */
function sectionEnd(d: Doc, head: number): number {
  const mask = d.mask();
  for (let i = head + 1; i < d.lines.length; i++) if (!mask[i] && H2.test(d.lines[i])) return i;
  return d.lines.length;
}

/** The last line of `[head, end)` that holds text. */
function lastContent(d: Doc, head: number, end: number): number {
  let last = end - 1;
  while (last > head && d.lines[last].trim() === "") last--;
  return last;
}

/**
 * Add context links to `## Links` of a goal.md: one bullet per item at the end of the section,
 * in order, skipping items the section already links. A goal.md without the section gets it
 * after `## Out of scope`, else after the success criteria, else at the end of the file
 * (contract 1.3 order). Nothing else in the file moves. `fromDir` is the folder of the issue.
 */
export function addLinks(text: string, links: ContextLink[], fromDir: string): string {
  const d = new Doc(text);
  const head = find(d, LINKS_HEADING);
  // What the section links already, with file links resolved against the issue folder.
  const present =
    head >= 0
      ? linkKeys(d.lines.slice(head + 1, sectionEnd(d, head)).join("\n"), fromDir)
      : new Set<string>();
  const fresh = dedupeLinks(links)
    .filter((l) => !present.has(`${l.kind}:${l.target}`))
    .map((l) => linkLine(l, fromDir));
  if (fresh.length === 0) return text;

  if (head >= 0) {
    const last = lastContent(d, head, sectionEnd(d, head));
    if (last === head) d.lines.splice(head + 1, 0, "", ...fresh);
    else d.lines.splice(last + 1, 0, ...(BULLET.test(d.lines[last]) ? [] : [""]), ...fresh);
    return d.toString();
  }

  // The section is new: it follows the nearest earlier section of the contract order.
  const prev =
    find(d, OUT_OF_SCOPE_HEADING) >= 0 ? find(d, OUT_OF_SCOPE_HEADING) : find(d, CRITERIA_HEADING);
  const at =
    prev >= 0 ? lastContent(d, prev, sectionEnd(d, prev)) : lastContent(d, -1, d.lines.length);
  d.lines.splice(at + 1, 0, "", "## Links", "", ...fresh);
  return d.toString();
}

/** `_group.md` of a new group. */
export function newGroupFile(group: GroupSrc): string {
  return renderGroup(group);
}

/** Everything `promote` writes: the draft item, and the review request in the issue's state. */
export function promote(args: {
  stateText: string | undefined;
  item: LibrarySrc;
  request: RequestSrc;
  by: string;
  now: string;
}): { library: string; state: string } {
  return {
    library: newLibraryItem(args.item),
    state: addRequest(args.stateText, args.request, {
      summary: "A library draft waits for review.",
      updated_at: args.now,
      updated_by: args.by,
      next_steps: [`Review the draft [[${args.item.id}]].`],
    }),
  };
}
