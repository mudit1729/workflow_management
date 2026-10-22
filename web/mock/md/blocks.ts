// Block-level grammar shared by every file parser: headings that are not inside a fence,
// meta lists (contract 1.3), and the small value readers that turn meta text into data.
import type { Severity } from "@/gen/types";
import { bare, type Lines, splitList } from "./text";
import type { FileCtx } from "./types";

// ---------------------------------------------------------------- headings

export interface Heading {
  /** 0-based line of the heading. */
  line: number;
  level: number;
  /** Heading text, trailing `#`s removed. */
  title: string;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Every ATX heading outside a fenced block. `mask` marks the fenced lines. */
export function headings(L: Lines, mask: boolean[], from = 0, to = L.lines.length): Heading[] {
  const out: Heading[] = [];
  for (let i = from; i < to; i++) {
    if (mask[i]) continue;
    const m = HEADING.exec(L.lines[i]);
    if (m) out.push({ line: i, level: m[1].length, title: m[2] });
  }
  return out;
}

export interface Section {
  title: string;
  /** Line of the heading, first body line, and the line after the last body line. */
  heading: number;
  start: number;
  end: number;
}

/** H2 sections of the range [from, to). A section ends at the next H1 or H2. */
export function h2Sections(L: Lines, mask: boolean[], from = 0, to = L.lines.length): Section[] {
  const hs = headings(L, mask, from, to).filter((h) => h.level <= 2);
  const out: Section[] = [];
  hs.forEach((h, k) => {
    if (h.level !== 2) return;
    out.push({ title: h.title, heading: h.line, start: h.line + 1, end: hs[k + 1]?.line ?? to });
  });
  return out;
}

// ---------------------------------------------------------------- meta lists

export interface MetaItem {
  key: string;
  value: string;
  /** 0-based line. */
  line: number;
}

const META_TOP = /^- ([a-z_]+):(?:[ \t]+(.*?))?[ \t]*$/;
const META_NESTED = /^[ \t]+- ([a-z_]+):(?:[ \t]+(.*?))?[ \t]*$/;

/**
 * The meta list that starts exactly at line `from` (no blank line before it). It ends at the
 * first blank or non-matching line. `nested` reads the indented form under a checklist item.
 */
export function metaList(
  L: Lines,
  from: number,
  to: number,
  nested = false,
): { items: MetaItem[]; next: number } {
  const re = nested ? META_NESTED : META_TOP;
  const items: MetaItem[] = [];
  let i = from;
  while (i < to) {
    const m = re.exec(L.lines[i]);
    if (!m) break;
    items.push({ key: m[1], value: m[2] ?? "", line: i });
    i++;
  }
  return { items, next: i };
}

/**
 * Meta list of a heading-led block (entry, task, term, author). A list that starts after a
 * blank line is still read, when its keys are known, and reported as F017.
 */
export function blockMeta(
  ctx: FileCtx,
  heading: number,
  to: number,
  known: ReadonlySet<string>,
): { items: MetaItem[]; next: number } {
  const L = ctx.L;
  let first = heading + 1;
  const direct = metaList(L, first, to);
  if (direct.items.length > 0) return direct;
  let blank = first;
  while (blank < to && L.lines[blank].trim() === "") blank++;
  if (blank > first) {
    const late = metaList(L, blank, to);
    if (late.items.length > 0 && late.items.every((m) => known.has(m.key))) {
      ctx.report(
        "F017",
        "warn",
        late.items[0].line,
        "The meta list comes after a blank line, so other parsers read it as prose.",
        "Remove the blank line between the heading and the list.",
      );
      return late;
    }
  }
  first = heading + 1;
  return { items: [], next: first };
}

export function toRecord(items: MetaItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of items) if (!(m.key in out)) out[m.key] = m.value;
  return out;
}

// ---------------------------------------------------------------- values

/** A value from a closed set, or the fallback with an F003 finding at `line`. */
export function oneOf<T extends string>(
  ctx: FileCtx,
  line: number,
  key: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  severity: Severity = "error",
): T {
  if (value === undefined || value === "") return fallback;
  const v = value.trim() as T;
  if ((allowed as readonly string[]).includes(v)) return v;
  ctx.report(
    "F003",
    severity,
    line,
    `\`${key}: ${value}\` is not one of ${allowed.join(", ")}.`,
    `Use ${allowed.join(", ")}.`,
  );
  return fallback;
}

export const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Handles of a comma list, `@` removed. */
export const handles = (value: string | undefined): string[] =>
  value ? splitList(value).map(bare) : [];
