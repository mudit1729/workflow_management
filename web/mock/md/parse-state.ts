// current_state.md: frontmatter plus the seven sections in a fixed order (contract 1.5).
import type { RequestKind, Urgency } from "@/gen/types";
import type { RequestSrc, StateSrc } from "../source";
import { toTs } from "../time";
import { hashId } from "../util";
import { h2Sections, metaList, oneOf } from "./blocks";
import { anchorKeys, asHandle, asList, asString, readFrontmatter } from "./frontmatter";
import { bare, fenceMask, splitList } from "./text";
import type { FileCtx } from "./types";

/** The sections in the order the contract fixes. */
export const STATE_SECTIONS = [
  "Done",
  "In flight",
  "Blocked",
  "Needs you",
  "Failed attempts",
  "Handoff notes",
  "Next steps",
] as const;
type SectionKey = (typeof STATE_SECTIONS)[number];

const SECTION_RE: Record<SectionKey, RegExp> = {
  Done: /^done$/i,
  "In flight": /^in[ _-]?flight$/i,
  Blocked: /^blocked$/i,
  "Needs you": /^needs[ _-]?you$/i,
  "Failed attempts": /^failed[ _-]?attempts?$/i,
  "Handoff notes": /^hand-?off( notes)?$/i,
  "Next steps": /^next[ _-]?steps?$/i,
};

const STATE_KEYS = new Set([
  "summary",
  "updated_at",
  "updated_by",
  "phase",
  "library_refs",
  "session",
]);
const REQUEST_KEYS = new Set([
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
]);
const REQUEST_KINDS: readonly RequestKind[] = ["question", "approval", "input"];
const URGENCIES: readonly Urgency[] = ["blocking", "fyi"];

const REQUEST = /^- \[([ xX])\]\s+(?:(Q-[0-9A-Za-z]+):\s*)?(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

export interface StateInput {
  now: number;
  /** The acting author: the default for a request without `to`. */
  author: string;
}

export function parseState(ctx: FileCtx, input: StateInput): StateSrc {
  const L = ctx.L;
  const fm = readFrontmatter(L);
  const mask = fenceMask(L.lines);
  anchorKeys(ctx, fm);
  ctx.anchor("state", 0, L.lines.length - 1);
  if (fm.problem)
    ctx.report(
      "F001",
      "error",
      fm.problem.line - 1,
      fm.problem.message,
      fm.problem.fix,
      fm.problem.col - 1,
    );
  const d = fm.data;
  for (const k of Object.keys(d))
    if (!STATE_KEYS.has(k))
      ctx.report(
        "F006",
        "info",
        fm.keyLine[k] ?? 0,
        `Unknown frontmatter key \`${k}\`. wf keeps it and shows it.`,
      );
  for (const k of ["summary", "updated_at", "updated_by"])
    if (!asString(d[k]))
      ctx.report(
        "F002",
        "error",
        0,
        `Required frontmatter key \`${k}\` is missing.`,
        `Add \`${k}: …\` to the frontmatter.`,
      );

  const updated_at = asString(d.updated_at) ?? toTs(input.now);
  const updated_by = asHandle(d.updated_by) ?? input.author;
  const state: StateSrc = {
    summary: asString(d.summary) ?? "",
    updated_at,
    updated_by,
    needs_you: [],
    next_steps: [],
  };
  if (asString(d.phase)) state.phase = asString(d.phase);
  const refs = asList(d.library_refs);
  if (refs.length) state.library_refs = refs;
  if (asString(d.session)) state.session = asString(d.session);

  const sections = h2Sections(L, mask, fm.bodyStart);
  let lastRank = -1;
  for (const s of sections) {
    const key = STATE_SECTIONS.find((k) => SECTION_RE[k].test(s.title.trim()));
    if (!key) {
      ctx.report(
        "F005",
        "warn",
        s.heading,
        `Unknown section \`## ${s.title}\` in current_state.md.`,
        `Use ${STATE_SECTIONS.map((k) => `\`## ${k}\``).join(", ")}.`,
      );
      continue;
    }
    const rank = STATE_SECTIONS.indexOf(key);
    if (rank < lastRank)
      ctx.report(
        "F005",
        "warn",
        s.heading,
        `Section \`## ${key}\` is out of order. The order is ${STATE_SECTIONS.join(" → ")}.`,
      );
    lastRank = Math.max(lastRank, rank);
    ctx.anchor(key, s.heading, Math.max(s.heading, lastNonBlank(ctx, s.start, s.end)));
    switch (key) {
      case "Done":
        state.done = bulletItems(ctx, s.start, s.end);
        break;
      case "In flight":
        state.in_flight = bulletItems(ctx, s.start, s.end);
        break;
      case "Blocked":
        state.blocked = bulletItems(ctx, s.start, s.end);
        break;
      case "Failed attempts":
        state.failed_attempts = bulletItems(ctx, s.start, s.end);
        break;
      case "Handoff notes":
        state.handoff = bulletItems(ctx, s.start, s.end);
        break;
      case "Next steps":
        state.next_steps = numberedItems(ctx, s.start, s.end);
        break;
      case "Needs you":
        readRequests(ctx, s.start, s.end, state, input);
        break;
    }
  }
  for (const k of ["done", "in_flight", "blocked", "failed_attempts", "handoff"] as const)
    if (state[k]?.length === 0) delete state[k];
  return state;
}

function lastNonBlank(ctx: FileCtx, from: number, to: number): number {
  let i = to - 1;
  while (i >= from && ctx.L.lines[i].trim() === "") i--;
  return i;
}

/** List items of a section; a wrapped item continues on indented lines. */
function bulletItems(ctx: FileCtx, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i < to; i++) {
    const line = ctx.L.lines[i];
    if (line.trim() === "") continue;
    const m = BULLET.exec(line);
    if (m) out.push(m[1]);
    else if (/^\s{2,}\S/.test(line) && out.length) out[out.length - 1] += `\n${line.trim()}`;
    else out.push(line.trim());
  }
  return out;
}

function numberedItems(ctx: FileCtx, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i < to; i++) {
    const line = ctx.L.lines[i];
    if (line.trim() === "") continue;
    const m = NUMBERED.exec(line) ?? BULLET.exec(line);
    if (m) out.push(m[1]);
    else if (/^\s{2,}\S/.test(line) && out.length) out[out.length - 1] += `\n${line.trim()}`;
    else out.push(line.trim());
  }
  return out;
}

function readRequests(
  ctx: FileCtx,
  from: number,
  to: number,
  state: StateSrc,
  input: StateInput,
): void {
  const L = ctx.L;
  let i = from;
  while (i < to) {
    const m = REQUEST.exec(L.lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const first = i;
    const nested = metaList(L, i + 1, to, true);
    i = nested.next;
    const meta: Record<string, string> = {};
    const at: Record<string, number> = {};
    for (const it of nested.items) {
      if (!REQUEST_KEYS.has(it.key)) {
        ctx.report(
          "F006",
          "info",
          it.line,
          `Unknown meta key \`${it.key}\` in a request. wf keeps it.`,
        );
        continue;
      }
      if (!(it.key in meta)) {
        meta[it.key] = it.value;
        at[it.key] = it.line;
      }
    }
    let id = m[2];
    if (!id) {
      id = `Q-${hashId(m[3])}`;
      ctx.report(
        "F005",
        "warn",
        first,
        "Request has no `Q-xxxxx` id.",
        `Write it as \`- [ ] ${id}: …\`.`,
      );
    }
    if (state.needs_you.some((r) => r.id === id))
      ctx.report("F004", "error", first, `Duplicate request id ${id}.`);
    for (const k of ["from", "to"])
      if (!meta[k])
        ctx.report(
          "F002",
          "error",
          first,
          `Request ${id} has no \`${k}:\` line.`,
          `Add \`- ${k}: @handle\`.`,
        );
    const req: RequestSrc = {
      id,
      question: m[3].trim(),
      from: meta.from ? bare(meta.from) : state.updated_by,
      to: meta.to ? bare(meta.to) : input.author,
      kind: oneOf(ctx, at.kind ?? first, "kind", meta.kind, REQUEST_KINDS, "question"),
      urgency: oneOf(ctx, at.urgency ?? first, "urgency", meta.urgency, URGENCIES, "fyi"),
      asked: meta.asked ?? state.updated_at,
    };
    const options = splitList(meta.options ?? "");
    if (options.length) req.options = options;
    if (meta.ref) req.ref = meta.ref;
    if (m[1] !== " ") req.answered = true;
    if (meta.answer) req.answer = meta.answer;
    if (meta.answered_by) req.answered_by = bare(meta.answered_by);
    if (meta.answered_at) req.answered_at = meta.answered_at;
    state.needs_you.push(req);
    ctx.anchor(id, first, Math.max(first, i - 1));
  }
}
