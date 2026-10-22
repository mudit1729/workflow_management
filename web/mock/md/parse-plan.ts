// plan.md: frontmatter, `## Approach`, `## Assumptions`, `## Prior art`, then phases whose
// H3 children are tasks (contract 1.5). Tasks before the first phase are "Unphased".
import type { TaskStatus } from "@/gen/types";
import type { AssumptionSrc, PhaseSrc, PlanSrc, StepSrc, TaskSrc } from "../source";
import { toTs } from "../time";
import { type DiagramBlock, findDiagramBlocks, proseOf } from "./archify";
import { blockMeta, headings, oneOf } from "./blocks";
import { anchorKeys, asHandle, asInt, asString, readFrontmatter } from "./frontmatter";
import { bare, fenceMask, splitList } from "./text";
import type { FileCtx } from "./types";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
];

const TASK_KEYS = new Set([
  "status",
  "lane",
  "depends_on",
  "owns",
  "satisfies",
  "assignee",
  "claimed_by",
  "lease_until",
  "verify",
]);
const PLAN_KEYS = new Set(["updated_at", "updated_by", "revision"]);

const TASK_HEADING = /^###\s+(T-\d+)\s*:\s*(.+?)\s*$/;
const TASK_LIKE = /^###\s+T-\d+/;
const PHASE_HEADING = /^Phase\s+(\d+)\s*(?:[:\-–—]\s*(.*))?$/i;
const STEP = /^- \[([ xX])\]\s+(.*?)\s*$/;
const ASSUMPTION = /^- (A\d+):\s*(.*?)\s*(?:\[(open|confirmed)\])?\s*$/;
const PRIOR = /^- \[\[([^\]]+)\]\]\s*:?\s*(.*?)\s*$/;

export interface PlanParse {
  plan: PlanSrc;
  blocks: DiagramBlock[];
}

export interface PlanInput {
  now: number;
  fallbackAuthor: string;
  takenDiagrams: Set<string>;
}

type Mode = "pre" | "approach" | "assumptions" | "prior" | "phase" | "other";

export function parsePlan(ctx: FileCtx, input: PlanInput): PlanParse {
  const L = ctx.L;
  const fm = readFrontmatter(L);
  const mask = fenceMask(L.lines);
  anchorKeys(ctx, fm);
  ctx.anchor("plan", 0, L.lines.length - 1);
  if (fm.problem) {
    ctx.report(
      "F001",
      "error",
      fm.problem.line - 1,
      fm.problem.message,
      fm.problem.fix,
      fm.problem.col - 1,
    );
  }
  const d = fm.data;
  for (const k of Object.keys(d))
    if (!PLAN_KEYS.has(k))
      ctx.report(
        "F006",
        "info",
        fm.keyLine[k] ?? 0,
        `Unknown frontmatter key \`${k}\`. wf keeps it and shows it.`,
      );
  for (const k of ["updated_at", "updated_by"])
    if (!asString(d[k]))
      ctx.report(
        "F002",
        "error",
        0,
        `Required frontmatter key \`${k}\` is missing.`,
        `Add \`${k}: …\` to the frontmatter.`,
      );

  const blocks = findDiagramBlocks(L, "plan.md", input.takenDiagrams);
  for (const b of blocks) {
    if (!b.problem) continue;
    const col = Math.max(L.lines[b.open].indexOf("id="), 0);
    ctx.report(b.problem.rule, "error", b.open, b.problem.message, b.problem.fix, col);
  }

  const plan: PlanSrc = {
    updated_at: asString(d.updated_at) ?? toTs(input.now),
    updated_by: asHandle(d.updated_by) ?? input.fallbackAuthor,
    revision: asInt(d.revision) ?? 1,
    approach: "",
    assumptions: [],
    prior_art: [],
    phases: [],
  };

  const hs = headings(L, mask, fm.bodyStart);
  const end = L.lines.length;

  // Section ranges: every H1/H2 starts a new section; task headings end a non-phase section.
  let mode: Mode = "pre";
  let sectionStart = fm.bodyStart;
  let phase: PhaseSrc | undefined;
  let unphased: PhaseSrc | undefined;
  let approachRange: [number, number] | undefined;
  const flush = (upTo: number) => {
    if (mode === "approach") approachRange = [sectionStart, upTo];
    else if (mode === "assumptions") readAssumptions(ctx, sectionStart, upTo, plan.assumptions);
    else if (mode === "prior") readPriorArt(ctx, sectionStart, upTo, plan.prior_art);
  };
  const addTask = (headingLine: number, blockEnd: number) => {
    const task = readTask(
      ctx,
      headingLine,
      blockEnd,
      plan.phases.flatMap((p) => p.tasks),
    );
    if (!task) return;
    if (!phase && !unphased) unphased = newUnphased(plan);
    (phase ?? (unphased as PhaseSrc)).tasks.push(task);
  };

  const blockEndOf = (k: number): number => {
    for (let j = k + 1; j < hs.length; j++) if (hs[j].level <= 3) return hs[j].line;
    return end;
  };

  for (let k = 0; k < hs.length; k++) {
    const h = hs[k];
    if (h.level === 3) {
      if (TASK_HEADING.test(L.lines[h.line])) {
        // A task ends the prose of the section it sits in.
        if (mode === "approach" || mode === "assumptions" || mode === "prior") {
          flush(h.line);
          mode = "other";
        }
        addTask(h.line, blockEndOf(k));
      } else if (TASK_LIKE.test(L.lines[h.line])) {
        ctx.report(
          "F005",
          "warn",
          h.line,
          "Malformed task heading.",
          "Write it as `### T-n: <imperative title>`.",
        );
      } else if (mode === "phase") {
        ctx.report(
          "F005",
          "warn",
          h.line,
          "Heading inside a phase is not a task.",
          "Write tasks as `### T-n: <imperative title>`.",
        );
      }
      continue;
    }
    if (h.level > 3) continue;
    // H1 or H2: a new section.
    flush(h.line);
    sectionStart = h.line + 1;
    if (h.level === 1) {
      mode = "pre";
      continue;
    }
    const title = h.title.trim();
    const pm = PHASE_HEADING.exec(title);
    if (/^approach$/i.test(title)) mode = "approach";
    else if (/^assumptions?$/i.test(title)) mode = "assumptions";
    else if (/^prior art$/i.test(title)) mode = "prior";
    else if (/^unphased$/i.test(title)) {
      mode = "phase";
      phase = unphased ??= newUnphased(plan);
    } else if (pm || /^phase\b/i.test(title)) {
      mode = "phase";
      const index = pm ? Number(pm[1]) : Math.max(0, ...plan.phases.map((p) => p.index)) + 1;
      if (!pm)
        ctx.report(
          "F005",
          "warn",
          h.line,
          "Malformed phase heading.",
          "Write it as `## Phase N: <name>`.",
        );
      if (plan.phases.some((p) => p.index === index))
        ctx.report("F004", "error", h.line, `Duplicate phase number ${index}.`);
      phase = { index, name: (pm?.[2] ?? title.replace(/^phase\s*:?\s*/i, "")).trim(), tasks: [] };
      plan.phases.push(phase);
    } else {
      mode = "other";
      // Tasks under an unknown section keep the phase they would have had before it.
    }
  }
  flush(end);
  if (approachRange) plan.approach = proseOf(L, approachRange[0], approachRange[1], blocks);

  // Unphased first, then phases by number, as the sections would read.
  plan.phases.sort((a, b) => a.index - b.index);
  return { plan, blocks };
}

function newUnphased(plan: PlanSrc): PhaseSrc {
  const p: PhaseSrc = { index: 0, name: "Unphased", tasks: [] };
  plan.phases.unshift(p);
  return p;
}

function readAssumptions(ctx: FileCtx, from: number, to: number, out: AssumptionSrc[]): void {
  for (let i = from; i < to; i++) {
    const m = ASSUMPTION.exec(ctx.L.lines[i]);
    if (!m) continue;
    if (!m[3])
      ctx.report(
        "F005",
        "warn",
        i,
        "Assumption has no state.",
        "End the line with `[open]` or `[confirmed]`.",
      );
    out.push({ id: m[1], text: m[2], state: m[3] === "confirmed" ? "confirmed" : "open" });
    ctx.anchor(m[1], i);
  }
}

function readPriorArt(ctx: FileCtx, from: number, to: number, out: PlanSrc["prior_art"]): void {
  for (let i = from; i < to; i++) {
    const m = PRIOR.exec(ctx.L.lines[i]);
    if (m) out.push({ ref: m[1], why: m[2] });
  }
}

function readTask(
  ctx: FileCtx,
  line: number,
  blockEnd: number,
  earlier: TaskSrc[],
): TaskSrc | undefined {
  const L = ctx.L;
  const h = TASK_HEADING.exec(L.lines[line]);
  if (!h) return undefined;
  const id = h[1];
  if (earlier.some((t) => t.id === id))
    ctx.report("F004", "error", line, `Duplicate task id ${id}.`, "Give the task a new T-n id.");

  const { items, next } = blockMeta(ctx, line, blockEnd, TASK_KEYS);
  const m: Record<string, string> = {};
  const at: Record<string, number> = {};
  for (const it of items) {
    if (!TASK_KEYS.has(it.key)) {
      ctx.report("F006", "info", it.line, `Unknown meta key \`${it.key}\` in ${id}. wf keeps it.`);
      continue;
    }
    if (!(it.key in m)) {
      m[it.key] = it.value;
      at[it.key] = it.line;
    }
  }

  const task: TaskSrc = {
    id,
    title: h[2],
    status: oneOf(ctx, at.status ?? line, "status", m.status, TASK_STATUSES, "todo"),
  };
  if (m.lane) task.lane = m.lane;
  const depends = splitList(m.depends_on ?? "");
  if (depends.length) task.depends_on = depends;
  const owns = splitList(m.owns ?? "");
  if (owns.length) task.owns = owns;
  const satisfies = splitList(m.satisfies ?? "");
  if (satisfies.length) task.satisfies = satisfies;
  if (m.assignee) task.assignee = m.assignee.startsWith("role:") ? m.assignee : bare(m.assignee);
  if (m.claimed_by) task.claimed_by = bare(m.claimed_by);
  if (m.lease_until) task.lease_until = m.lease_until;
  if (m.verify) task.verify = m.verify;

  // Brief, then steps.
  const brief: string[] = [];
  const steps: StepSrc[] = [];
  const stepLines: number[] = [];
  let i = next;
  for (; i < blockEnd; i++) {
    const s = STEP.exec(L.lines[i]);
    if (s) {
      steps.push({ text: s[2], done: s[1] !== " " });
      stepLines.push(i);
    } else if (steps.length === 0) brief.push(L.lines[i]);
  }
  const text = brief.join("\n").trim();
  if (text) task.brief = text;
  if (steps.length) task.steps = steps;
  stepLines.forEach((sl, k) => {
    ctx.anchor(`${id}.${k + 1}`, sl);
  });

  let last = blockEnd - 1;
  while (last > line && L.lines[last].trim() === "") last--;
  ctx.anchor(id, line, last);
  return task;
}
