// Render sources as the exact file text an agent or `wf` would write (contract 1.3–1.5).
// `export.ts` uses these functions to write the workspace files, `edit.ts` to write new
// entries, and the parser in this folder is their exact inverse. Nothing here reads seed data:
// archify blocks come from the `lookup` a caller passes, and fences stay as they are without one.
import type { Author, DiagramType, GlossaryTerm, WorkspaceConfig } from "@/gen/types";
import type {
  ChangeSrc,
  CriterionSrc,
  DecisionSrc,
  GroupSrc,
  IssueSrc,
  LearningSrc,
  LibrarySrc,
  PlanSrc,
  RequestSrc,
  StateSrc,
  TaskSrc,
} from "../source";

export const at = (h: string) => `@${h}`;
/** A handle as a YAML string: `"@codex"`. */
export const quoted = (h: string) => `"@${h}"`;
const tick = (s: string) => `\`${s}\``;

const YAML_WORDS = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
const YAML_NUMBER =
  /^[-+]?(\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|\.\d+|0x[\da-f]+|0o[0-7]+|\.inf|\.nan)$/i;

/** YAML scalar: plain when safe, a double-quoted string otherwise. */
export function scalar(v: string): string {
  const plain =
    v !== "" &&
    v === v.trim() &&
    !/^[-?:,[\]{}#&*!|>'"%@`]/.test(v) &&
    !/: |:$| #|[\n\t]/.test(v) &&
    !YAML_WORDS.test(v) &&
    !YAML_NUMBER.test(v);
  return plain ? v : JSON.stringify(v);
}

/** A scalar inside a flow list: the same, and no commas or brackets. */
const flowItem = (v: string) => (/[,[\]{}]/.test(v) ? JSON.stringify(v) : scalar(v));
/** A YAML flow list: `[a, b]`. */
export const flow = (xs: string[]) => `[${xs.map(flowItem).join(", ")}]`;

/** Bullet list items; a continuation line is indented under its bullet. */
const bullets = (xs: string[]) => xs.map((x) => `- ${x.replace(/\n/g, "\n  ")}`);

// ---------------------------------------------------------------- diagrams

const DIAGRAM_FENCE = /```wf-diagram\n([\w-]+)\n```/g;

/** What a diagram lookup returns: enough to expand a fence or print a stub. */
export type DiagramLookup = (
  id: string,
) => { type: DiagramType; title: string; nodes: number; source: string } | undefined;

/** Diagram IDs referenced by a markdown fragment, in order. */
export function diagramIds(md: string | undefined): string[] {
  if (!md) return [];
  return [...md.matchAll(DIAGRAM_FENCE)].map((m) => m[1]);
}

/** Replace ```wf-diagram fences (API form) with the archify blocks the file holds. */
export function expandDiagrams(md: string, lookup?: DiagramLookup): string {
  return md.replace(DIAGRAM_FENCE, (whole, id: string) => {
    const d = lookup?.(id);
    if (!d) return whole;
    return `\`\`\`archify ${d.type} id=${id}\n${d.source.trim()}\n\`\`\``;
  });
}

/** Replace ```wf-diagram fences with the `wf context` stub. `file` is the file that holds it. */
export function stubDiagrams(
  md: string,
  file: string,
  text: string,
  lookup?: DiagramLookup,
): string {
  return md.replace(DIAGRAM_FENCE, (whole, id: string) => {
    const d = lookup?.(id);
    if (!d) return whole;
    const lineNo =
      text.split("\n").findIndex((l) => l.startsWith("```archify") && l.includes(`id=${id}`)) + 1;
    return `[diagram ${d.type} "${d.title}" · ${d.nodes} nodes · ${file}:${lineNo}]`;
  });
}

function meta(lines: string[], key: string, value: string | undefined, indent = "") {
  if (value === undefined || value === "") return;
  lines.push(`${indent}- ${key}: ${value}`);
}

// ---------------------------------------------------------------- goal.md

function criterionLines(c: CriterionSrc, n: number): string[] {
  const out = [`- [${c.checked ? "x" : " "}] SC-${n}: ${c.text}`];
  meta(out, "verify", c.verify, "  ");
  meta(out, "evidence", c.evidence, "  ");
  meta(out, "verified_by", c.verified_by && at(c.verified_by), "  ");
  meta(out, "scenario", c.scenario, "  ");
  return out;
}

export function renderGoal(src: IssueSrc, lookup?: DiagramLookup): string {
  const g = src.goal;
  const handle = (key: "owner" | "claimed_by", h: string) =>
    src.yaml_error?.key === key ? at(h) : quoted(h);
  const fm = ["---", `id: ${g.id}`, `title: ${scalar(g.title)}`, `status: ${g.status}`];
  fm.push(`priority: ${g.priority}`, `size: ${g.size}`);
  if (g.owner) fm.push(`owner: ${handle("owner", g.owner)}`);
  fm.push(`labels: ${flow(g.labels)}`);
  if (g.claimed_by) fm.push(`claimed_by: ${handle("claimed_by", g.claimed_by)}`);
  if (g.lease_until) fm.push(`lease_until: ${g.lease_until}`);
  fm.push(`blocked_by: ${flow(g.blocked_by)}`);
  if (g.due) fm.push(`due: ${g.due}`);
  fm.push(`created: ${g.created}`);
  for (const [k, v] of Object.entries(g.extra ?? {})) fm.push(`${k}: ${scalar(v)}`);
  fm.push("---");

  const body = ["", "## Context", "", expandDiagrams(src.context.trim(), lookup), ""];
  body.push(`## ${src.criteria_heading ?? "Success criteria"}`, "");
  src.criteria.forEach((c, i) => {
    body.push(...criterionLines(c, i + 1));
  });
  if (src.out_of_scope)
    body.push("", "## Out of scope", "", expandDiagrams(src.out_of_scope.trim(), lookup));
  if (src.links) body.push("", "## Links", "", expandDiagrams(src.links.trim(), lookup));
  return `${[...fm, ...body].join("\n")}\n`;
}

// ---------------------------------------------------------------- plan.md

export function taskLines(t: TaskSrc): string[] {
  const out = [`### ${t.id}: ${t.title}`];
  meta(out, "status", t.status);
  meta(out, "lane", t.lane);
  meta(out, "depends_on", t.depends_on?.join(", "));
  meta(out, "owns", t.owns?.map(tick).join(", "));
  meta(out, "satisfies", t.satisfies?.join(", "));
  meta(
    out,
    "assignee",
    t.assignee && (t.assignee.startsWith("role:") ? t.assignee : at(t.assignee)),
  );
  meta(out, "claimed_by", t.claimed_by && at(t.claimed_by));
  meta(out, "lease_until", t.lease_until);
  meta(out, "verify", t.verify);
  if (t.brief || t.steps?.length) out.push("");
  if (t.brief) out.push(t.brief.trim());
  for (const s of t.steps ?? []) out.push(`- [${s.done ? "x" : " "}] ${s.text}`);
  return out;
}

export function renderPlan(p: PlanSrc, lookup?: DiagramLookup): string {
  const out = [
    "---",
    `updated_at: ${p.updated_at}`,
    `updated_by: ${quoted(p.updated_by)}`,
    `revision: ${p.revision}`,
    "---",
    "",
    "## Approach",
    "",
    expandDiagrams(p.approach.trim(), lookup),
  ];
  if (p.assumptions.length) {
    out.push("", "## Assumptions", "");
    for (const a of p.assumptions) out.push(`- ${a.id}: ${a.text} [${a.state}]`);
  }
  if (p.prior_art.length) {
    out.push("", "## Prior art", "");
    for (const r of p.prior_art) out.push(`- [[${r.ref}]]: ${r.why}`);
  }
  // Tasks before the first phase belong to "Unphased" (contract 1.4): they carry no heading.
  for (const ph of [...p.phases].sort((a, b) => Number(a.index > 0) - Number(b.index > 0))) {
    if (ph.index > 0) out.push("", `## Phase ${ph.index}: ${ph.name}`);
    for (const t of ph.tasks) out.push("", ...taskLines(t));
  }
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------- current_state.md

export function requestLines(r: RequestSrc): string[] {
  const out = [`- [${r.answered ? "x" : " "}] ${r.id}: ${r.question}`];
  meta(out, "from", at(r.from), "  ");
  meta(out, "to", at(r.to), "  ");
  meta(out, "kind", r.kind, "  ");
  meta(out, "urgency", r.urgency, "  ");
  meta(out, "asked", r.asked, "  ");
  meta(out, "options", r.options?.join(", "), "  ");
  meta(out, "ref", r.ref, "  ");
  out.push(`  - answer:${r.answer ? ` ${r.answer}` : ""}`);
  meta(out, "answered_by", r.answered_by && at(r.answered_by), "  ");
  meta(out, "answered_at", r.answered_at, "  ");
  return out;
}

export function renderState(s: StateSrc): string {
  const fm = [
    "---",
    `summary: ${JSON.stringify(s.summary)}`,
    `updated_at: ${s.updated_at}`,
    `updated_by: ${quoted(s.updated_by)}`,
  ];
  if (s.phase) fm.push(`phase: ${scalar(s.phase)}`);
  if (s.library_refs?.length) fm.push(`library_refs: ${flow(s.library_refs)}`);
  if (s.session) fm.push(`session: ${scalar(s.session)}`);
  fm.push("---");
  const out = [...fm];
  const section = (title: string, lines: string[] | undefined) => {
    if (!lines?.length) return;
    out.push("", `## ${title}`, ...lines);
  };
  section("Done", s.done && bullets(s.done));
  section("In flight", s.in_flight && bullets(s.in_flight));
  section("Blocked", s.blocked && bullets(s.blocked));
  section("Needs you", s.needs_you.flatMap(requestLines));
  section("Failed attempts", s.failed_attempts && bullets(s.failed_attempts));
  section("Handoff notes", s.handoff && bullets(s.handoff));
  section(
    "Next steps",
    s.next_steps.map((l, i) => `${i + 1}. ${l}`),
  );
  return `${out.join("\n")}\n`;
}

/** The body of current_state.md without frontmatter (for word counts and context). */
export function stateBody(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

// ---------------------------------------------------------------- logs

function heading(ts: string, author: string, title: string, id: string): string {
  return `## ${ts} @${author} — ${title} {#${id}}`;
}

export function changeLines(c: ChangeSrc): string[] {
  const out = [heading(c.ts, c.author, c.title, c.id)];
  meta(out, "kind", c.kind);
  meta(out, "task", c.task);
  meta(out, "criteria", c.criteria?.join(", "));
  meta(out, "result", c.result);
  meta(out, "evidence", c.evidence);
  meta(out, "commit", c.commit);
  meta(out, "pr", c.pr);
  meta(out, "files", c.files?.map(tick).join(", "));
  meta(out, "session", c.session);
  meta(out, "model", c.model);
  for (const [k, v] of Object.entries(c.extra ?? {})) meta(out, k, v);
  out.push("", c.body.trim());
  return out;
}

export function decisionLines(d: DecisionSrc): string[] {
  const out = [heading(d.ts, d.author, d.title, d.id)];
  meta(out, "status", d.status);
  meta(out, "topic", d.topic);
  meta(out, "supersedes", d.supersedes);
  meta(out, "affects", d.affects?.join(", "));
  meta(out, "decided_by", d.decided_by?.map(at).join(", "));
  out.push("", `**Decision:** ${d.decision}`, `**Because:** ${d.because}`);
  if (d.rejected) out.push(`**Rejected:** ${d.rejected}`);
  if (d.consequences) out.push(`**Consequences:** ${d.consequences}`);
  if (d.revisit) out.push(`**Revisit when:** ${d.revisit}`);
  return out;
}

export function learningLines(l: LearningSrc): string[] {
  const out = [heading(l.ts, l.author, l.title, l.id)];
  meta(out, "kind", l.kind);
  meta(out, "tags", l.tags?.join(", "));
  meta(out, "applies_to", l.applies_to?.map((a) => (/[/*.]/.test(a) ? tick(a) : a)).join(", "));
  meta(out, "promote", l.promote);
  out.push("", l.rule.trim());
  if (l.evidence) out.push("", `Evidence: ${l.evidence.trim()}`);
  return out;
}

function renderLog<T>(title: string, entries: T[], lines: (e: T) => string[]): string {
  const out = [`# ${title}`];
  for (const e of entries) out.push("", ...lines(e));
  return `${out.join("\n")}\n`;
}

export const renderChanges = (xs: ChangeSrc[]) => renderLog("Changes", xs, changeLines);
export const renderDecisions = (xs: DecisionSrc[]) => renderLog("Decisions", xs, decisionLines);
export const renderLearnings = (xs: LearningSrc[]) => renderLog("Learnings", xs, learningLines);

// ---------------------------------------------------------------- library

export function renderLibraryItem(l: LibrarySrc): string {
  const fm = [
    "---",
    `id: ${l.id}`,
    `title: ${scalar(l.title)}`,
    `kind: ${l.kind}`,
    `description: ${scalar(l.description)}`,
    `status: ${l.status}`,
    `tags: ${flow(l.tags)}`,
    `applies_to: ${flow(l.applies_to)}`,
    l.source.length ? "source:" : "source: []",
    ...l.source.map((s) => `  - "${s}"`),
    `authors: ${flow(l.authors.map(at))}`,
  ];
  if (l.reviewed_by) fm.push(`reviewed_by: ${quoted(l.reviewed_by)}`);
  fm.push(`created: ${l.created}`);
  if (l.last_reviewed) fm.push(`last_reviewed: ${l.last_reviewed}`);
  if (l.review_after) fm.push(`review_after: ${l.review_after}`);
  if (l.superseded_by) fm.push(`superseded_by: ${l.superseded_by}`);
  fm.push("---");
  const body = l.sections.flatMap((s) => ["", `## ${s.heading}`, "", s.body_md.trim()]);
  return `${[...fm, ...body].join("\n")}\n`;
}

/** Workspace-relative path of a library item. */
export function libraryPath(l: Pick<LibrarySrc, "kind" | "slug">): string {
  return `library/${l.kind}s/${l.slug}.md`;
}

// ---------------------------------------------------------------- groups, glossary, authors, config

/** `_group.md` of an explicit group. The body is free markdown; a new group starts empty. */
export function renderGroup(g: GroupSrc): string {
  const fm = ["---", `id: ${g.id}`, `title: ${scalar(g.title)}`];
  if (g.goal) fm.push(`goal: ${scalar(g.goal)}`);
  if (g.owner) fm.push(`owner: ${quoted(g.owner)}`);
  if (g.color !== undefined) fm.push(`color: ${g.color}`);
  fm.push(`order: ${g.order}`);
  if (g.definition_of_done?.length) {
    fm.push("definition_of_done:", ...g.definition_of_done.map((d) => `  - ${JSON.stringify(d)}`));
  }
  fm.push("---");
  return `${fm.join("\n")}\n`;
}

export function renderGlossary(terms: GlossaryTerm[]): string {
  const out = ["# Glossary"];
  for (const t of terms) {
    out.push("", `## ${t.term}`);
    meta(out, "kind", t.kind);
    meta(out, "means", t.means);
    meta(out, "avoid", t.avoid.join(", "));
    meta(out, "see", t.see.join(", "));
  }
  return `${out.join("\n")}\n`;
}

export function renderAuthors(authors: Author[]): string {
  const out = ["# Authors"];
  for (const a of authors) {
    out.push("", `## @${a.handle}`);
    meta(out, "kind", a.kind);
    meta(out, "name", a.name);
    meta(out, "runtime", a.runtime);
    meta(out, "model", a.model);
    meta(out, "color", String(a.color));
    meta(out, "lanes", a.lanes.join(", "));
    meta(out, "max_leases", String(a.max_leases));
  }
  return `${out.join("\n")}\n`;
}

const toml = (v: string) => JSON.stringify(v);

export interface TomlOptions {
  /** `[lint] disable`: rule ids the workspace turns off. */
  lintDisable?: string[];
  /** A comment line written above `[lint]`. */
  lintNote?: string;
}

/** workflow.toml (contract 1.4). Keys the prototype does not read keep their defaults. */
export function renderWorkflowToml(c: WorkspaceConfig, opts: TomlOptions = {}): string {
  const disabled = opts.lintDisable ?? [];
  return `${[
    `wf_format = ${c.wf_format}`,
    "",
    "[workspace]",
    `name = ${toml(c.name)}`,
    `issues_dir = ${toml(c.issues_dir)}`,
    `library_dir = ${toml(c.library_dir)}`,
    `id_prefix = ${toml(c.id_prefix)}`,
    "",
    "[leases]",
    `minutes = ${c.leases_minutes}`,
    "",
    "[staleness]",
    `issue_hours = ${c.staleness.issue_hours}`,
    `task_hours = ${c.staleness.task_hours}`,
    "",
    "[context]",
    "budget_tokens = 6000",
    "changes = 5",
    "library = 3",
    "",
    "[archify]",
    'home = "~/.claude/skills/archify"',
    'quality = "showcase"',
    "concurrency = 2",
    "timeout_s = 90",
    "",
    ...(opts.lintNote ? [`# ${opts.lintNote}`] : []),
    "[lint]",
    `disable = [${disabled.map(toml).join(", ")}]`,
    "severity = {}",
    "",
    "[server]",
    "port = 7777",
    `author = ${toml(c.author)}`,
  ].join("\n")}\n`;
}
