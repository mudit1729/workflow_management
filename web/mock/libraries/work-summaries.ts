// Work summaries of the personal library (spec 3): a page for each group and each issue of the
// loaded workspace, `work/<workspace>/<group path>/_group.md` and `<issue-id>.md`. In the product
// an agent writes them with the `summarizing-work` skill; the prototype writes the same pages from
// the parsed workspace, so a Refresh in the dashboard changes a real markdown file and the file
// is all the viewer reads.
//
// The generator is deterministic: the same files and the same `now` give the same text. A page
// holds only what the files say. It never holds a time, an age or a lease, which change while the
// files do not.
//
// The rev follows the skill: the first 7 hex characters of the SHA-256 of one stream, for every
// wf file at or below the folder in byte order of its path, the line `== <path>` and the text.
// One difference from the shell script (`wf-rev.sh`): times are neutral in the stream (see
// `neutralTimes`), because the prototype moves the clock of the sample at every load and a lease
// renewal rewrites a time without changing the work.

import {
  PRIORITY_RANK,
  type SummaryMeta,
  WORK_ROOT,
  WORK_STATUS_ORDER,
  type WorkList,
  type WorkTarget,
} from "@/features/library/personal/work";
import type {
  ChangeEntry,
  DecisionEntry,
  GroupNode,
  IssueDetail,
  IssueStatus,
  LearningEntry,
  NeedsYouItem,
  Task,
} from "@/gen/types";
import { STATUS_LABEL } from "@/lib/status";
import type { Store } from "../store";
import { toTs } from "../time";
import { readPage, str } from "./frontmatter";
import { workspaceAlias } from "./workspace";

// ---------------------------------------------------------------- the rev

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of the UTF-8 text as 64 hex characters. Synchronous, so a rev can be read in a render. */
export function sha256Hex(text: string): string {
  const data = new TextEncoder().encode(text);
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0;
    }
    let a = h[0] as number;
    let b = h[1] as number;
    let c = h[2] as number;
    let d = h[3] as number;
    let e = h[4] as number;
    let f = h[5] as number;
    let g = h[6] as number;
    let hh = h[7] as number;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + (K[i] as number) + (w[i] as number)) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    const next = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = ((h[i] as number) + (next[i] as number)) | 0;
  }
  return [...h].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

const TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g;
const DATE_LINE = /^(\s*(?:due|created|last_reviewed|review_after):\s*["']?)\d{4}-\d{2}-\d{2}/gm;

/** The text with every time and every date field made neutral, so a clock shift changes nothing. */
export function neutralTimes(text: string): string {
  return text.replace(TIME, "<time>").replace(DATE_LINE, "$1<date>");
}

/** The wf files of an issue or a group folder; `notes/` and `evidence/` are not read. */
const WF_FILES = new Set([
  "goal.md",
  "plan.md",
  "current_state.md",
  "changes.md",
  "decisions.md",
  "learnings.md",
  "_group.md",
]);

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const dirname = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The rev of a folder: 7 hex characters that change when a wf file at or below it changes.
 * `files` are workspace files by path; `folder` is a workspace path such as `issues/wf/web`.
 */
export function folderRev(files: Record<string, string>, folder: string): string {
  const prefix = `${folder}/`;
  const paths = Object.keys(files)
    .filter((p) => p.startsWith(prefix) && WF_FILES.has(basename(p)))
    .map((p) => p.slice(prefix.length))
    .filter((p) => !/(^|\/)(notes|evidence)\//.test(p))
    .sort(byBytes);
  const stream = paths.map((p) => `== ${p}\n${neutralTimes(files[prefix + p] as string)}`).join("");
  return sha256Hex(stream).slice(0, 7);
}

// ---------------------------------------------------------------- the world

/** What the generator reads: the group tree, every issue in full, and the wf files for the revs. */
export interface WorkWorld {
  /** The alias of the workspace library: the folder under `work/`. */
  workspace: string;
  issuesDir: string;
  /** The root group (`issues_dir`). */
  groups: GroupNode;
  details: Map<string, IssueDetail>;
  /** The wf files of the workspace by path. */
  files: Record<string, string>;
}

export function workWorld(store: Store): WorkWorld {
  const snapshot = store.derived.snapshot;
  const files: Record<string, string> = {};
  for (const path of store.paths()) {
    if (!WF_FILES.has(basename(path))) continue;
    const text = store.text(path);
    if (text !== undefined) files[path] = text;
  }
  return {
    workspace: workspaceAlias(store),
    issuesDir: snapshot.config.issues_dir,
    groups: snapshot.groups,
    details: store.derived.details,
    files,
  };
}

/** A workspace folder as a group path: `issues/wf/web` → `wf/web`; the issues folder itself → "". */
function groupPathOf(world: WorkWorld, folder: string): string {
  return folder === world.issuesDir ? "" : folder.slice(world.issuesDir.length + 1);
}

/** The page of a group, or of an issue when `issue` is given. */
export function summaryPath(world: WorkWorld, group: string, issue?: string): string {
  return [WORK_ROOT, world.workspace, group, issue ? `${issue}.md` : "_group.md"]
    .filter(Boolean)
    .join("/");
}

// ---------------------------------------------------------------- words

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** The first sentence of a text without its full stop, at most 100 characters. */
export function oneLine(text: string | undefined): string {
  if (!text) return "";
  const s = flat(text.replace(/\*\*/g, ""));
  const m = /^(.+?[.!?])(?=\s|$)/.exec(s);
  const sentence = (m?.[1] ?? s).replace(/[.!?]+$/, "");
  if (sentence.length <= 100) return sentence;
  const cut = sentence.slice(0, 99);
  const at = cut.lastIndexOf(" ");
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[\s,;:]+$/, "")}…`;
}

/** A table cell: no pipes, no line breaks. */
const cell = (s: string) => flat(s).replace(/\|/g, "\\|");

/** `a`, `a and b`, `a, b and c`. */
function and(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `[[#T-3]]` in a page of the issue becomes `[[wf-3k9x2#T-3]]` in a page outside it. */
const outside = (id: string, text: string) => text.replace(/\[\[#/g, `[[${id}#`);

const firstParagraph = (md: string | undefined) =>
  (md ?? "").split(/\n\s*\n/).find((p) => p.trim() && !p.trimStart().startsWith("```")) ?? "";

/** Frontmatter values that YAML could misread are quoted. */
function yaml(value: string): string {
  return /^[\s'"&*!|>%@`[{#-]|:\s|\s#|\s$|^(?:true|false|null|yes|no|~)$/i.test(value) ||
    value === ""
    ? JSON.stringify(value)
    : value;
}

const frontmatter = (pairs: [string, string | undefined][]) =>
  `---\n${pairs
    .filter((p): p is [string, string] => p[1] !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n`;

const tasksOf = (d: IssueDetail): Task[] => d.plan?.phases.flatMap((p) => p.tasks) ?? [];

const blockingRequests = (d: IssueDetail): NeedsYouItem[] =>
  (d.state?.needs_you ?? []).filter((r) => r.urgency === "blocking" && !r.answered);

// ---------------------------------------------------------------- an issue

/** The sentence the group table repeats, and the page starts with. */
export function leadOf(d: IssueDetail): string {
  return oneLine(d.state?.summary || firstParagraph(d.goal.context_md));
}

function standing(d: IssueDetail): string {
  const s = d.summary;
  const facts: string[] = [];
  const claims = tasksOf(d).filter((t) => t.status === "in_progress" && t.claimed_by);
  if (claims.length > 0)
    facts.push(and(claims.slice(0, 2).map((t) => `@${t.claimed_by} has claimed ${t.id}`)));
  for (const r of blockingRequests(d).slice(0, 2))
    facts.push(`the issue waits for @${r.to} on ${r.id}`);
  if (s.status === "blocked" && s.blocked_by.length > 0)
    facts.push(`the issue is blocked by ${and(s.blocked_by.map((id) => `[[${id}]]`))}`);
  const sentences = [`${leadOf(d)}.`];
  if (facts.length > 0) {
    const joined = facts.length === 2 ? facts.join(", and ") : facts.join("; ");
    sentences.push(`${joined[0]?.toUpperCase()}${joined.slice(1)}.`);
  }
  const idle = d.changes.length === 0 && (s.status === "backlog" || s.status === "planned");
  if (idle && facts.length === 0) sentences.push("No work has started.");
  const total = d.criteria.length;
  const verified = d.criteria.filter((c) => c.state === "verified").length;
  if (total > 0) {
    if (s.status === "done" && verified < total)
      sentences.push(
        `The issue is done although ${verified === 0 ? "no criterion is" : `${total - verified} of ${total} criteria are not`} verified.`,
      );
    else
      sentences.push(`${verified} of ${total} criteria ${verified === 1 ? "is" : "are"} verified.`);
  }
  return sentences.join(" ");
}

const DONE_KINDS = new Set(["progress", "fix", "refactor", "test", "verify"]);

function doneSoFar(d: IssueDetail): string[] {
  const id = d.summary.id;
  const entries = d.changes
    .filter((c: ChangeEntry) => DONE_KINDS.has(c.kind) && c.result !== "fail")
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.ts < b.c.ts ? 1 : a.c.ts > b.c.ts ? -1 : a.i - b.i))
    .slice(0, 8);
  return entries.map(({ c }) => {
    const parts = [c.title];
    if (c.commit) parts.push(`\`${c.commit}\``);
    if (c.pr) parts.push(`PR ${c.pr.startsWith("#") ? c.pr : `#${c.pr}`}`);
    parts.push(`[[${id}#${c.id}]]`);
    return `- ${parts.join(" · ")}`;
  });
}

function decisionsOf(d: IssueDetail): string[] {
  const id = d.summary.id;
  return d.decisions
    .filter((x: DecisionEntry) => !x.superseded_by)
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.ts < b.x.ts ? -1 : a.x.ts > b.x.ts ? 1 : a.i - b.i))
    .map(({ x }) => {
      const replaces = x.supersedes ? `, replaces [[${id}#${x.supersedes}]]` : "";
      return `- [[${id}#${x.id}]] ${x.title} (${x.status}${replaces})`;
    });
}

function learningsOf(d: IssueDetail): string[] {
  const id = d.summary.id;
  return d.learnings
    .map((x: LearningEntry, i) => ({ x, i }))
    .sort((a, b) => (a.x.ts < b.x.ts ? -1 : a.x.ts > b.x.ts ? 1 : a.i - b.i))
    .slice(0, 8)
    .map(({ x }) => `- [[${id}#${x.id}]] ${x.title}`);
}

/** What to do next, in words and without a time: at most 5 lines. */
export function nextOf(d: IssueDetail): string[] {
  const id = d.summary.id;
  const out: string[] = blockingRequests(d).map(
    (r) => `@${r.to} answers ${r.id}: ${flat(r.question)}`,
  );
  const steps = (d.state?.next_steps ?? []).map((s) => outside(id, flat(s)));
  out.push(...steps);
  if (steps.length === 0) {
    const open = d.criteria.find((c) => c.state !== "verified");
    const status = d.summary.status;
    if ((status === "backlog" || status === "planned") && !d.summary.has_plan)
      out.push("Plan the issue with `planning-issues`.");
    else if (open && status === "done") out.push(`Verify ${open.id}, or reopen the issue.`);
    else if (open && status !== "cancelled")
      out.push(
        `Verify [[${id}#${open.id}]]${open.verify && open.verify !== "manual" ? ` with \`${open.verify}\`` : ""}.`,
      );
  }
  return out.slice(0, 5);
}

const numbered = (lines: string[]) => lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
const bullets = (lines: string[]) => (lines.length > 0 ? lines.join("\n") : "None.");

export interface WriteOptions {
  /** `YYYY-MM-DDTHH:MM+05:30`, written as `summarized_at`. */
  now: string;
  /** The handle that summarized, with its `@`. */
  by: string;
}

/** The agent the prototype pretends to be, and the store's clock. */
export function writeOptions(store: Store, by = "@claude-sonnet"): WriteOptions {
  return { now: toTs(store.now()), by };
}

export function issuePage(world: WorkWorld, d: IssueDetail, opts: WriteOptions): string {
  const s = d.summary;
  const group = groupPathOf(world, dirname(s.path));
  const rev = folderRev(world.files, s.path);
  const next = nextOf(d);
  return [
    frontmatter([
      ["title", yaml(s.title)],
      ["kind", "issue-summary"],
      ["issue", s.id],
      ["workspace", world.workspace],
      ["group", group ? yaml(group) : undefined],
      ["status", s.status],
      ["rev", JSON.stringify(rev)],
      ["summarized_at", opts.now],
      ["summarized_by", JSON.stringify(opts.by)],
    ]),
    "## Where it stands",
    "",
    standing(d),
    "",
    "## Done so far",
    "",
    bullets(doneSoFar(d)),
    "",
    "## Decisions",
    "",
    bullets(decisionsOf(d)),
    "",
    "## Learnings",
    "",
    bullets(learningsOf(d)),
    "",
    "## Next",
    "",
    next.length > 0 ? numbered(next) : "None.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- a group

const COUNT_WORDS: Record<IssueStatus, string> = {
  in_progress: "in progress",
  blocked: "blocked",
  review: "in review",
  planned: "planned",
  backlog: "in the backlog",
  done: "done",
  cancelled: "cancelled",
};

/** The issues a group holds directly, in table order: status, then priority, then id. */
export function issuesOf(world: WorkWorld, node: GroupNode): IssueDetail[] {
  const out: IssueDetail[] = [];
  for (const id of node.issue_ids) {
    const d = world.details.get(id);
    if (d) out.push(d);
  }
  const rank = (s: IssueStatus) => WORK_STATUS_ORDER.indexOf(s);
  return out.sort(
    (a, b) =>
      rank(a.summary.status) - rank(b.summary.status) ||
      PRIORITY_RANK[a.summary.priority] - PRIORITY_RANK[b.summary.priority] ||
      byBytes(a.summary.id, b.summary.id),
  );
}

function outcome(node: GroupNode): string {
  const parts: string[] = [];
  if (node.goal) parts.push(/[.!?]$/.test(node.goal) ? node.goal : `${node.goal}.`);
  const total = node.rollup.issues;
  if (total === 0) parts.push("No issues yet.");
  else {
    const counts = WORK_STATUS_ORDER.filter((s) => node.rollup.by_status[s] > 0).map(
      (s) => `${node.rollup.by_status[s]} ${COUNT_WORDS[s]}`,
    );
    parts.push(`${plural(total, "issue")}: ${and(counts)}.`);
  }
  if (node.definition_of_done.length > 0) {
    const items = node.definition_of_done.map((x) => {
      const t = x.replace(/[.\s]+$/, "");
      return /^[A-Z]/.test(t) ? `${t[0]?.toLowerCase()}${t.slice(1)}` : t;
    });
    parts.push(`Done means: ${items.join("; ")}.`);
  }
  return parts.join(" ");
}

function risksOf(issues: IssueDetail[]): string[] {
  const out: string[] = [];
  for (const d of issues) {
    const s = d.summary;
    const link = `[[${s.id}]]`;
    for (const r of blockingRequests(d)) out.push(`- ${link} waits for @${r.to} on ${r.id}.`);
    if (s.status === "blocked" && s.blocked_by.length > 0)
      out.push(`- ${link} is blocked by ${and(s.blocked_by.map((id) => `[[${id}]]`))}.`);
    if (s.status === "done" || s.status === "review") {
      const open = d.criteria.filter((c) => c.state !== "verified").map((c) => c.id);
      if (open.length > 0)
        out.push(
          `- ${link} is ${s.status === "done" ? "done" : "in review"} with ${
            open.length <= 3 ? and(open) : plural(open.length, "criterion", "criteria")
          } not verified.`,
        );
    }
    const errors = d.diagnostics.filter((x) => x.severity === "error");
    if (errors.length > 0) {
      const where = [...new Set(errors.map((x) => `${x.rule} in \`${basename(x.file)}\``))];
      out.push(
        `- ${link} has ${plural(errors.length, "error")} the workspace linter rejects: ${and(where.slice(0, 2))}.`,
      );
    }
  }
  return out;
}

export function groupPage(world: WorkWorld, node: GroupNode, opts: WriteOptions): string {
  const group = groupPathOf(world, node.path);
  const issues = issuesOf(world, node);
  const rev = folderRev(world.files, node.path);
  const sections: string[] = [
    frontmatter([
      ["title", yaml(node.title)],
      ["kind", "group-summary"],
      ["workspace", world.workspace],
      ["group", yaml(group)],
      ["rev", JSON.stringify(rev)],
      ["summarized_at", opts.now],
      ["summarized_by", JSON.stringify(opts.by)],
    ]),
    "## Outcome",
    "",
    outcome(node),
    "",
  ];
  if (node.children.length > 0)
    sections.push(
      "## Groups",
      "",
      "| Group | Issues | In one line |",
      "|---|---|---|",
      ...node.children.map(
        (c) =>
          `| [${cell(c.title)}](${basename(c.path)}/_group.md) | ${c.rollup.issues} | ${cell(oneLine(c.goal)) || "—"} |`,
      ),
      "",
    );
  sections.push(
    "## Issues",
    "",
    ...(issues.length === 0
      ? ["None."]
      : [
          "| Issue | Status | In one line |",
          "|---|---|---|",
          ...issues.map(
            (d) =>
              `| [${cell(d.summary.title)}](${d.summary.id}.md) | ${STATUS_LABEL[d.summary.status]} | ${cell(leadOf(d)) || "—"} |`,
          ),
        ]),
    "",
    "## Risks",
    "",
    bullets(risksOf(issues)),
    "",
    "## Next",
    "",
  );
  const next = issues
    .filter((d) => d.summary.status !== "done" && d.summary.status !== "cancelled")
    .flatMap((d) => {
      const first = nextOf(d)[0];
      return first ? [`[[${d.summary.id}]]: ${first}`] : [];
    })
    .slice(0, 5);
  sections.push(next.length > 0 ? numbered(next) : "None.", "");
  return sections.join("\n");
}

// ---------------------------------------------------------------- all of it

/** A group below another, deepest first: the order a skill writes them in. */
function groupsBelow(node: GroupNode): GroupNode[] {
  return [...node.children.flatMap(groupsBelow), node];
}

function findGroup(node: GroupNode, group: string, world: WorkWorld): GroupNode | undefined {
  if (groupPathOf(world, node.path) === group && node.path !== world.issuesDir) return node;
  for (const c of node.children) {
    const hit = findGroup(c, group, world);
    if (hit) return hit;
  }
  return undefined;
}

export interface SummarizeScope {
  kind: "issue" | "group";
  /** The issue id, or the group path (`wf/web`). */
  key: string;
}

/**
 * The pages a skill run writes: one issue, or a group with every issue below it and every group
 * below it, deepest first. Without a scope, the whole workspace. Pages by their path.
 */
export function summarizeWork(
  world: WorkWorld,
  opts: WriteOptions,
  scope?: SummarizeScope,
): Record<string, string> {
  const out: Record<string, string> = {};
  const writeIssue = (d: IssueDetail) => {
    out[summaryPath(world, groupPathOf(world, dirname(d.summary.path)), d.summary.id)] = issuePage(
      world,
      d,
      opts,
    );
  };
  const writeGroup = (n: GroupNode) => {
    for (const d of issuesOf(world, n)) writeIssue(d);
    out[summaryPath(world, groupPathOf(world, n.path))] = groupPage(world, n, opts);
  };
  if (scope?.kind === "issue") {
    const d = world.details.get(scope.key);
    if (d) writeIssue(d);
    return out;
  }
  const roots =
    scope?.kind === "group"
      ? [findGroup(world.groups, scope.key, world)].filter((n): n is GroupNode => !!n)
      : world.groups.children;
  for (const root of roots) for (const n of groupsBelow(root)) writeGroup(n);
  // Issues that sit in no group.
  if (!scope)
    for (const id of world.groups.issue_ids) {
      const d = world.details.get(id);
      if (d) writeIssue(d);
    }
  return out;
}

// ---------------------------------------------------------------- what is written

/** The `rev`, time and author of a summary page, or undefined when the page has no `rev`. */
export function summaryMeta(text: string | undefined): SummaryMeta | undefined {
  if (!text) return undefined;
  const data = readPage(text).data;
  const rev = str(data, "rev");
  if (!rev) return undefined;
  const at = str(data, "summarized_at");
  const by = str(data, "summarized_by");
  return { rev, ...(at ? { summarizedAt: at } : {}), ...(by ? { summarizedBy: by } : {}) };
}

/**
 * The targets of the Work section: every group and issue of the workspace with the rev of its
 * folder now and the summary written for it, if any. `written` reads a page of the personal library.
 */
export function workList(
  world: WorkWorld,
  written: (path: string) => string | undefined,
): WorkList {
  const targets: WorkTarget[] = [];
  const meta = (path: string) => summaryMeta(written(path));
  const addIssue = (d: IssueDetail, parent: string) => {
    const s = d.summary;
    const path = summaryPath(world, parent, s.id);
    const summary = meta(path);
    targets.push({
      kind: "issue",
      key: s.id,
      title: s.title,
      path,
      parent,
      status: s.status,
      priority: s.priority,
      rev: folderRev(world.files, s.path),
      ...(summary ? { summary } : {}),
    });
  };
  const addGroup = (n: GroupNode, parent: string) => {
    const group = groupPathOf(world, n.path);
    const path = summaryPath(world, group);
    const summary = meta(path);
    targets.push({
      kind: "group",
      key: group,
      title: n.title,
      path,
      parent,
      issues: n.rollup.issues,
      rev: folderRev(world.files, n.path),
      ...(summary ? { summary } : {}),
    });
    for (const d of issuesOf(world, n)) addIssue(d, group);
    for (const c of n.children) addGroup(c, group);
  };
  for (const n of world.groups.children) addGroup(n, "");
  for (const id of world.groups.issue_ids) {
    const d = world.details.get(id);
    if (d) addIssue(d, "");
  }
  return { workspace: world.workspace, targets };
}
