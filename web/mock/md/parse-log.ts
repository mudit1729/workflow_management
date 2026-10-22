// changes.md, decisions.md, learnings.md: append-only logs of H2 entries (contract 1.3, 1.5).
// Entry heading: `## <ts> @<author> — <title> {#<id>}`, then a meta list, a blank line, the body.
import type { ChangeKind, DecisionStatus, LearningKind } from "@/gen/types";
import type { ChangeSrc, DecisionSrc, LearningSrc } from "../source";
import { toTs } from "../time";
import { blockMeta, DATE_RE, handles, type MetaItem, oneOf, TS_RE } from "./blocks";
import { fenceMask, joinBlock, splitList, stripTicks, trimBlank } from "./text";
import type { FileCtx } from "./types";

/** The contract 1.3 entry heading, with the dash written either way. */
export const ENTRY_HEADING =
  /^## (\S+) @([a-z0-9][a-z0-9._-]*) (?:—|-) (.+?) \{#([CDL]-[0-9a-hjkmnp-tv-z]{5})\}$/;
/** The same heading without an author: F016. */
const NO_AUTHOR = /^## (\S+) (?:—|-) (.+?) \{#([CDL]-[0-9a-hjkmnp-tv-z]{5})\}$/;

export const CHANGE_KINDS: readonly ChangeKind[] = [
  "progress",
  "fix",
  "refactor",
  "docs",
  "test",
  "research",
  "review",
  "verify",
  "failure",
  "answer",
];
const DECISION_STATUSES: readonly DecisionStatus[] = ["proposed", "accepted", "rejected"];
const LEARNING_KINDS: readonly LearningKind[] = ["tip", "gotcha", "pattern"];

const CHANGE_KEYS = new Set([
  "kind",
  "task",
  "criteria",
  "result",
  "evidence",
  "commit",
  "pr",
  "files",
  "session",
  "model",
]);
const DECISION_KEYS = new Set(["status", "topic", "supersedes", "affects", "decided_by"]);
const LEARNING_KEYS = new Set(["kind", "tags", "applies_to", "promote"]);

interface RawEntry {
  id: string;
  ts: string;
  author: string;
  title: string;
  heading: number;
  meta: MetaItem[];
  body: string[];
  last: number;
}

interface LogInput {
  now: number;
}

/** Cut a log file into entries. Stray `##` blocks fold into the entry above (F005). */
function splitEntries(
  ctx: FileCtx,
  prefix: "C" | "D" | "L",
  known: ReadonlySet<string>,
  input: LogInput,
): RawEntry[] {
  const L = ctx.L;
  const mask = fenceMask(L.lines);
  const isH2 = (i: number) => !mask[i] && /^## /.test(L.lines[i]);
  const heads: { line: number; entry?: RegExpExecArray; noAuthor?: RegExpExecArray }[] = [];
  for (let i = 0; i < L.lines.length; i++) {
    if (!isH2(i)) continue;
    const entry = ENTRY_HEADING.exec(L.lines[i]);
    const noAuthor = entry ? null : NO_AUTHOR.exec(L.lines[i]);
    heads.push({ line: i, entry: entry ?? undefined, noAuthor: noAuthor ?? undefined });
  }

  const out: RawEntry[] = [];
  const seen = new Set<string>();
  let current: { raw: RawEntry; to: number } | undefined;
  heads.forEach((h, k) => {
    const to = heads[k + 1]?.line ?? L.lines.length;
    const m = h.entry ?? h.noAuthor;
    if (!m) {
      // An unparseable heading becomes an untitled block inside the previous entry.
      ctx.report(
        "F005",
        "warn",
        h.line,
        "Entry heading does not match `## <ts> @<author> — <title> {#<id>}`. wf shows it as an untitled block.",
        "Write the heading as `## 2026-10-22T14:05+05:30 @codex — Title {#C-7k2q9}`.",
      );
      if (current) {
        current.raw.body.push(...L.lines.slice(h.line, to));
        current.raw.last = to - 1;
      }
      return;
    }
    const noAuthor = !h.entry;
    const ts = m[1];
    const author = noAuthor ? "unknown" : (m[2] as string);
    const title = (noAuthor ? m[2] : m[3]) as string;
    const id = (noAuthor ? m[3] : m[4]) as string;
    if (noAuthor)
      ctx.report(
        "F016",
        "error",
        h.line,
        "Entry has no author.",
        "Write `@handle` after the timestamp.",
      );
    if (!id.startsWith(`${prefix}-`))
      ctx.report(
        "F005",
        "warn",
        h.line,
        `Entry id ${id} does not start with \`${prefix}-\` in this file.`,
      );
    if (seen.has(id))
      ctx.report("F004", "error", h.line, `Duplicate entry id ${id}.`, "Give the entry a new id.");
    seen.add(id);
    let when = ts;
    if (!TS_RE.test(ts) && !DATE_RE.test(ts)) {
      ctx.report(
        "F005",
        "warn",
        h.line,
        `\`${ts}\` is not an RFC 3339 timestamp.`,
        "Use `2026-10-22T14:05+05:30`.",
      );
      when = toTs(input.now);
    }
    const { items, next } = blockMeta(ctx, h.line, to, known);
    const raw: RawEntry = {
      id,
      ts: when,
      author,
      title,
      heading: h.line,
      meta: items,
      body: L.lines.slice(next, to),
      last: to - 1,
    };
    out.push(raw);
    current = { raw, to };
  });

  // Anchors span the heading to the last non-blank line of the entry.
  for (const e of out) {
    let last = e.last;
    while (last > e.heading && L.lines[last].trim() === "") last--;
    ctx.anchor(e.id, e.heading, last);
  }
  return out;
}

function metaOf(items: MetaItem[]): Record<string, MetaItem> {
  const out: Record<string, MetaItem> = {};
  for (const it of items) if (!(it.key in out)) out[it.key] = it;
  return out;
}

// ---------------------------------------------------------------- changes.md

export function parseChanges(ctx: FileCtx, input: LogInput): ChangeSrc[] {
  return splitEntries(ctx, "C", CHANGE_KEYS, input).map((e) => {
    const m = metaOf(e.meta);
    const c: ChangeSrc = {
      id: e.id,
      ts: e.ts,
      author: e.author,
      title: e.title,
      body: joinBlock(e.body),
    };
    if (m.kind) c.kind = oneOf(ctx, m.kind.line, "kind", m.kind.value, CHANGE_KINDS, "progress");
    if (m.task?.value) c.task = m.task.value;
    const criteria = splitList(m.criteria?.value ?? "");
    if (criteria.length) c.criteria = criteria;
    if (m.result)
      c.result = oneOf(
        ctx,
        m.result.line,
        "result",
        m.result.value,
        ["pass", "fail"] as const,
        "pass",
      );
    if (m.evidence?.value) c.evidence = m.evidence.value;
    if (m.commit?.value) c.commit = m.commit.value;
    if (m.pr?.value) c.pr = m.pr.value;
    const files = splitList(m.files?.value ?? "");
    if (files.length) c.files = files;
    if (m.session?.value) c.session = m.session.value;
    if (m.model?.value) c.model = m.model.value;
    for (const it of e.meta) {
      if (CHANGE_KEYS.has(it.key)) continue;
      c.extra ??= {};
      c.extra[it.key] = it.value;
      ctx.report(
        "F006",
        "info",
        it.line,
        `Unknown meta key \`${it.key}\` in ${e.id}. wf keeps it.`,
      );
    }
    return c;
  });
}

// ---------------------------------------------------------------- decisions.md

const DECISION_LABEL = /^\*\*(Decision|Because|Rejected|Consequences|Revisit when):\*\*\s*(.*)$/i;
const LABEL_KEY: Record<string, "decision" | "because" | "rejected" | "consequences" | "revisit"> =
  {
    decision: "decision",
    because: "because",
    rejected: "rejected",
    consequences: "consequences",
    "revisit when": "revisit",
  };

export function parseDecisions(ctx: FileCtx, input: LogInput): DecisionSrc[] {
  return splitEntries(ctx, "D", DECISION_KEYS, input).map((e, n) => {
    const m = metaOf(e.meta);
    const parts: Record<string, string[]> = {};
    let label: string | undefined;
    const body = trimBlank(e.body);
    for (const line of body) {
      const lm = DECISION_LABEL.exec(line);
      if (lm) {
        label = LABEL_KEY[lm[1].toLowerCase()];
        parts[label] ??= [];
        parts[label].push(lm[2]);
      } else if (label) parts[label].push(line);
    }
    const text = (k: string) => {
      const v = joinBlock(parts[k] ?? []);
      return v === "" ? undefined : v;
    };
    if (!parts.decision) {
      ctx.report(
        "F005",
        "warn",
        e.heading,
        `${e.id} has no \`**Decision:**\` label.`,
        "Start the body with `**Decision:** …`, then `**Because:** …`.",
      );
    }
    const d: DecisionSrc = {
      id: e.id,
      ts: e.ts,
      author: e.author,
      title: e.title,
      status: oneOf(
        ctx,
        m.status?.line ?? e.heading,
        "status",
        m.status?.value,
        DECISION_STATUSES,
        "proposed",
      ),
      decision: text("decision") ?? (parts.decision ? "" : joinBlock(body)),
      because: text("because") ?? "",
    };
    if (m.topic?.value) d.topic = m.topic.value;
    if (m.supersedes?.value) d.supersedes = m.supersedes.value;
    const affects = splitList(m.affects?.value ?? "");
    if (affects.length) d.affects = affects;
    const by = handles(m.decided_by?.value);
    if (by.length) d.decided_by = by;
    const rejected = text("rejected");
    if (rejected) d.rejected = rejected;
    const consequences = text("consequences");
    if (consequences) d.consequences = consequences;
    const revisit = text("revisit");
    if (revisit) d.revisit = revisit;
    for (const it of e.meta)
      if (!DECISION_KEYS.has(it.key))
        ctx.report(
          "F006",
          "info",
          it.line,
          `Unknown meta key \`${it.key}\` in ${e.id}. wf keeps it.`,
        );
    void n;
    return d;
  });
}

// ---------------------------------------------------------------- learnings.md

const EVIDENCE = /^Evidence:\s*/i;

export function parseLearnings(ctx: FileCtx, input: LogInput): LearningSrc[] {
  return splitEntries(ctx, "L", LEARNING_KEYS, input).map((e) => {
    const m = metaOf(e.meta);
    const body = trimBlank(e.body);
    // The body is a rule, then (optionally) a paragraph that starts with `Evidence:`.
    let evidenceAt = -1;
    for (let i = 1; i < body.length; i++) {
      if (EVIDENCE.test(body[i]) && body[i - 1].trim() === "") {
        evidenceAt = i;
        break;
      }
    }
    const rule = joinBlock(evidenceAt < 0 ? body : body.slice(0, evidenceAt));
    const evidence =
      evidenceAt < 0
        ? undefined
        : joinBlock([body[evidenceAt].replace(EVIDENCE, ""), ...body.slice(evidenceAt + 1)]);
    const l: LearningSrc = {
      id: e.id,
      ts: e.ts,
      author: e.author,
      title: e.title,
      kind: oneOf(ctx, m.kind?.line ?? e.heading, "kind", m.kind?.value, LEARNING_KINDS, "tip"),
      rule,
    };
    const tags = splitList(m.tags?.value ?? "");
    if (tags.length) l.tags = tags;
    const applies = splitList(m.applies_to?.value ?? "");
    if (applies.length) l.applies_to = applies.map(stripTicks);
    if (m.promote)
      l.promote = oneOf(
        ctx,
        m.promote.line,
        "promote",
        m.promote.value,
        ["no", "candidate"] as const,
        "no",
      );
    if (evidence) l.evidence = evidence;
    for (const it of e.meta)
      if (!LEARNING_KEYS.has(it.key))
        ctx.report(
          "F006",
          "info",
          it.line,
          `Unknown meta key \`${it.key}\` in ${e.id}. wf keeps it.`,
        );
    return l;
  });
}
