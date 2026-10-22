// goal.md: frontmatter, `## Context`, the criteria checklist, `## Out of scope`, `## Links`.
import type { IssueStatus, Priority, Size } from "@/gen/types";
import type { CriterionSrc, GoalFront } from "../source";
import { toTs } from "../time";
import { type DiagramBlock, findDiagramBlocks, proseOf } from "./archify";
import { h2Sections, metaList, oneOf, type Section } from "./blocks";
import {
  anchorKeys,
  asHandle,
  asList,
  asString,
  type Frontmatter,
  readFrontmatter,
  type YamlProblem,
} from "./frontmatter";
import { bare, fenceMask, joinBlock } from "./text";
import type { FileCtx } from "./types";

export const STATUSES: readonly IssueStatus[] = [
  "backlog",
  "planned",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
];
export const PRIORITIES: readonly Priority[] = ["urgent", "high", "medium", "low", "none"];
export const SIZES: readonly Size[] = ["xs", "s", "m", "l"];

const GOAL_KEYS = new Set([
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
]);

const CRITERION_KEYS = new Set(["verify", "evidence", "verified_by", "scenario"]);

export interface GoalParse {
  front: GoalFront;
  context: string;
  criteria_heading?: string;
  criteria: CriterionSrc[];
  out_of_scope?: string;
  links?: string;
  /** The frontmatter could not be parsed as YAML (F001). */
  problem?: YamlProblem;
  yaml_error?: { key: "owner" | "claimed_by"; message: string; fix: string };
  blocks: DiagramBlock[];
}

export interface GoalInput {
  /** Folder name of the issue (the fallback title). */
  folder: string;
  /** Deterministic id for a goal.md without one. */
  fallbackId: string;
  now: number;
  takenDiagrams: Set<string>;
}

export function parseGoal(ctx: FileCtx, input: GoalInput): GoalParse {
  const L = ctx.L;
  const fm = readFrontmatter(L);
  const mask = fenceMask(L.lines);
  const front = readFront(ctx, fm, input);
  anchorKeys(ctx, fm);

  // ---- body
  const sections = h2Sections(L, mask, fm.bodyStart);
  const find = (re: RegExp): Section | undefined => sections.find((s) => re.test(s.title.trim()));
  const blocks = findDiagramBlocks(L, "goal.md", input.takenDiagrams);
  for (const b of blocks) {
    if (!b.problem) continue;
    const col = Math.max(L.lines[b.open].indexOf("id="), 0);
    ctx.report(b.problem.rule, "error", b.open, b.problem.message, b.problem.fix, col);
  }
  const prose = (s: Section | undefined) => (s ? proseOf(L, s.start, s.end, blocks) : undefined);

  const ctxSection = find(/^context$/i);
  let context = prose(ctxSection) ?? "";
  if (!ctxSection) {
    // No `## Context`: the text before the first H2 (minus an H1) is the context.
    const first = sections[0]?.heading ?? L.lines.length;
    const pre = L.lines.slice(fm.bodyStart, first).filter((l) => !/^#\s/.test(l));
    context = joinBlock(pre);
    ctx.report(
      "F002",
      "error",
      Math.max(fm.bodyStart, 0),
      "Required section `## Context` is missing.",
      "Add `## Context` with 1–2 paragraphs: why this issue exists.",
    );
  }

  const critSection = find(/success criteria|acceptance/i);
  const criteria: CriterionSrc[] = [];
  let criteria_heading: string | undefined;
  if (critSection) {
    const heading = critSection.title.trim();
    if (heading !== "Success criteria") criteria_heading = heading;
    readCriteria(ctx, critSection, criteria);
  } else {
    ctx.report(
      "F002",
      "error",
      Math.max(fm.bodyStart, 0),
      "Required section `## Success criteria` is missing.",
      "Add `## Success criteria` with `- [ ] SC-1: …` items.",
    );
  }

  const out = prose(find(/^out of scope$/i));
  const links = prose(find(/^links$/i));
  ctx.anchor("goal", 0, L.lines.length - 1);

  const parse: GoalParse = {
    front,
    context,
    criteria_heading,
    criteria,
    out_of_scope: out || undefined,
    links: links || undefined,
    blocks,
  };
  if (fm.problem) {
    ctx.report(
      "F001",
      "error",
      fm.problem.line - 1,
      fm.problem.message,
      fm.problem.fix,
      fm.problem.col - 1,
    );
    parse.problem = fm.problem;
    const key = fm.problem.key;
    parse.yaml_error = {
      key: key === "claimed_by" ? "claimed_by" : "owner",
      message: fm.problem.message,
      fix: fm.problem.fix ?? "Fix the YAML on this line.",
    };
  }
  return parse;
}

function readFront(ctx: FileCtx, fm: Frontmatter, input: GoalInput): GoalFront {
  const d = fm.data;
  /** 0-based file line of a frontmatter key, or the first line. */
  const line = (k: string) => fm.keyLine[k] ?? 0;
  const missing = (k: string, why: string) =>
    ctx.report(
      "F002",
      "error",
      0,
      `Required frontmatter key \`${k}\` is missing.${why ? ` ${why}` : ""}`,
      `Add \`${k}: …\` to the frontmatter.`,
    );

  const idRaw = asString(d.id);
  if (!idRaw) missing("id", "wf generates one on the first write.");
  const titleRaw = asString(d.title);
  if (!titleRaw) missing("title", "");
  if (!asString(d.created)) missing("created", "");

  // Extra keys are kept as written (F006).
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (GOAL_KEYS.has(k)) continue;
    extra[k] = asString(v) ?? "";
    ctx.report(
      "F006",
      "info",
      line(k),
      `Unknown frontmatter key \`${k}\`. wf keeps it and shows it.`,
    );
  }

  const st = oneOf(ctx, line("status"), "status", asString(d.status), STATUSES, "backlog");
  const front: GoalFront = {
    id: idRaw ?? input.fallbackId,
    title: titleRaw ?? input.folder,
    status: st,
    priority: oneOf(ctx, line("priority"), "priority", asString(d.priority), PRIORITIES, "none"),
    size: oneOf(ctx, line("size"), "size", asString(d.size), SIZES, "m"),
    owner: asHandle(d.owner),
    labels: asList(d.labels),
    claimed_by: asHandle(d.claimed_by),
    lease_until: asString(d.lease_until),
    blocked_by: asList(d.blocked_by),
    due: asString(d.due),
    created: asString(d.created) ?? toTs(input.now),
  };
  if (Object.keys(extra).length) front.extra = extra;
  return front;
}

const CRITERION = /^- \[([ xX])\]\s+(?:SC-(\d+):\s*)?(.*)$/;

function readCriteria(ctx: FileCtx, section: Section, out: CriterionSrc[]): void {
  const L = ctx.L;
  let i = section.start;
  while (i < section.end) {
    const m = CRITERION.exec(L.lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const first = i;
    let text = m[3].trim();
    i++;
    // A wrapped sentence continues on indented lines that are not meta items.
    while (i < section.end && /^\s{2,}\S/.test(L.lines[i]) && !/^\s+- [a-z_]+:/.test(L.lines[i])) {
      text += ` ${L.lines[i].trim()}`;
      i++;
    }
    const nested = metaList(L, i, section.end, true);
    const c: CriterionSrc = { text, checked: m[1] !== " " };
    for (const item of nested.items) {
      const v = item.value;
      if (item.key === "verify") c.verify = v;
      else if (item.key === "evidence") c.evidence = v;
      else if (item.key === "verified_by") c.verified_by = bare(v);
      else if (item.key === "scenario") c.scenario = v;
      if (!CRITERION_KEYS.has(item.key))
        ctx.report(
          "F006",
          "info",
          item.line,
          `Unknown meta key \`${item.key}\` in SC-${out.length + 1}. wf keeps it.`,
        );
    }
    i = nested.next;
    const n = m[2] ? Number(m[2]) : undefined;
    out.push(c);
    const id = n ?? out.length;
    ctx.anchor(`SC-${id}`, first, Math.max(first, i - 1));
    if (n === undefined)
      ctx.report(
        "F005",
        "warn",
        first,
        "Criterion has no `SC-n:` id.",
        `Write it as \`- [ ] SC-${out.length}: …\`.`,
      );
    else if (n !== out.length)
      ctx.report(
        "F005",
        "warn",
        first,
        `Criteria are numbered in sequence. Expected SC-${out.length}, found SC-${n}.`,
        `Renumber it to SC-${out.length}.`,
      );
  }
}
