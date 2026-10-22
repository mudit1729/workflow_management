// Prose extraction for the writing-standard rules (S01–S13): turns a markdown file into
// units (a paragraph, a list item, a step) of masked text with a map back to lines and columns.
// Code spans, fenced blocks, tables, link targets and references never count as prose.
import { readFrontmatter } from "./frontmatter";
import { fenceMask, type Lines } from "./text";

export type UnitKind = "paragraph" | "item" | "step" | "criterion" | "request";

export interface ProseUnit {
  kind: UnitKind;
  /** Masked text: same length as the source text, code and references blanked to `▮`. */
  text: string;
  /** Where each stretch of `text` came from: joined offset → line and column. */
  parts: { at: number; line: number; col: number }[];
  /** 0-based first line. */
  line: number;
}

/** Position (0-based line, column) of offset `at` of a unit's text. */
export function unitPos(u: ProseUnit, at: number): { line: number; col: number } {
  let part = u.parts[0];
  for (const p of u.parts) {
    if (p.at <= at) part = p;
    else break;
  }
  return { line: part.line, col: part.col + (at - part.at) };
}

const MASK = "▮";
const blank = (s: string) => MASK.repeat(s.length);

/** Blank out inline code, references and link targets; same length as the input. */
export function maskInline(s: string): string {
  return s
    .replace(/`[^`]*`/g, blank)
    .replace(/\[\[[^\]]*\]\]/g, blank)
    .replace(/\]\([^)]*\)/g, (m) => `]${blank(m.slice(1))}`)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/https?:\/\/\S+/g, blank);
}

/** Blank out quoted strings too: a hedge word that is mentioned in quotes is not used. */
export function maskQuotes(s: string): string {
  return s.replace(/“[^”]*”|"[^"\n]*"|‘[^’]*’/g, blank);
}

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const CHECKBOX = /^\[[ xX]\]\s+(.*)$/;
const META_LINE = /^\s*(?:[-*]\s+)?[a-z_]+:\s/;
const ENTRY_OR_HEADING = /^#{1,6}\s/;

export interface ProseOptions {
  /** Skip lines before this one (0-based). Default: after the frontmatter. */
  from?: number;
  /** Treat `- [ ] SC-n:` items as criteria, `- [ ] Q-…:` as requests, other checkboxes as steps. */
  checkboxKinds?: boolean;
}

/** Split a file into prose units. */
export function proseUnits(L: Lines, opts: ProseOptions = {}): ProseUnit[] {
  const fm = readFrontmatter(L);
  const from = opts.from ?? fm.bodyStart;
  const mask = fenceMask(L.lines);
  const units: ProseUnit[] = [];
  let cur: ProseUnit | undefined;
  let curIndent = 0;
  const flush = () => {
    if (cur && cur.text.trim() !== "") units.push(cur);
    cur = undefined;
  };
  const push = (kind: UnitKind, line: number, col: number, raw: string) => {
    cur = { kind, text: maskInline(raw), parts: [{ at: 0, line, col }], line };
  };
  const append = (line: number, col: number, raw: string) => {
    if (!cur) return;
    const at = cur.text.length + 1;
    cur.text += ` ${maskInline(raw)}`;
    cur.parts.push({ at, line, col });
  };

  for (let i = from; i < L.lines.length; i++) {
    const line = L.lines[i];
    if (mask[i] || line.trim() === "") {
      flush();
      continue;
    }
    if (ENTRY_OR_HEADING.test(line) || /^\s*\|/.test(line) || /^\s*(?:---|\*\*\*)\s*$/.test(line)) {
      flush();
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      flush();
      continue;
    }
    const li = LIST_ITEM.exec(line);
    if (li) {
      flush();
      const indent = li[1].length;
      let rest = li[2];
      let col = line.length - rest.length;
      let kind: UnitKind = "item";
      const cb = CHECKBOX.exec(rest);
      if (cb) {
        col += rest.length - cb[1].length;
        rest = cb[1];
        kind = "step";
        const idm = /^((?:SC-\d+|Q-[0-9a-z]{5}|T-\d+(?:\.\d+)?|A\d+):\s*)/.exec(rest);
        if (idm && opts.checkboxKinds) {
          kind = idm[1].startsWith("SC-")
            ? "criterion"
            : idm[1].startsWith("Q-")
              ? "request"
              : "step";
        }
        if (idm) {
          col += idm[1].length;
          rest = rest.slice(idm[1].length);
        }
      } else if (META_LINE.test(line)) {
        // `- key: value` meta lines hold commands, ids and timestamps, not prose.
        continue;
      }
      curIndent = indent;
      push(kind, i, col, rest);
      continue;
    }
    if (META_LINE.test(line) && /^\s+- /.test(line)) continue;
    // A paragraph line, or the continuation of a list item.
    const lead = line.length - line.trimStart().length;
    // A bold label (`**Because:**`) opens a new unit, so each label is its own paragraph.
    const labelled = /^\*\*[^*]+:\*\*/.test(line.trim());
    if (cur && !labelled && (cur.kind !== "paragraph" ? lead > curIndent : true)) {
      append(i, lead, line.trim());
    } else {
      flush();
      push("paragraph", i, lead, line.trim());
    }
  }
  flush();
  return units;
}

// ---------------------------------------------------------------- sentences

export interface Sentence {
  /** Start offset and text inside the unit. */
  at: number;
  text: string;
  /** Words by whitespace; a masked code span counts as one word. */
  words: number;
}

const ABBREV = /(?:\b(?:e\.g|i\.e|vs|etc|approx|cf|no|fig)\.)$/i;
const WORDY = /[\p{L}\p{N}▮]/u;

const SENTENCE_CACHE = new Map<string, Sentence[]>();

/** Split masked unit text into sentences (the result is cached by text). */
export function sentences(text: string): Sentence[] {
  const known = SENTENCE_CACHE.get(text);
  if (known) return known;
  const out = splitSentences(text);
  if (SENTENCE_CACHE.size > 5000) SENTENCE_CACHE.clear();
  SENTENCE_CACHE.set(text, out);
  return out;
}

function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const t = raw.trim();
    if (t) {
      const words = t.split(/\s+/).filter((w) => WORDY.test(w)).length;
      out.push({ at: start + (raw.length - raw.trimStart().length), text: t, words });
    }
  };
  const re = /[.!?]+(?=\s+["“([*_▮A-Z0-9])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    if (ABBREV.test(text.slice(0, end))) continue;
    push(end);
    start = end;
  }
  push(text.length);
  return out;
}
