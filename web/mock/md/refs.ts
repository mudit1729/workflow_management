// References (contract 1.3): `[[wf-3k9x2]]`, `[[wf-3k9x2#D-7f3k2]]`, `[[#T-4]]`, `[[lib-4tz7c]]`.
import { fenceMask, type Lines } from "./text";

const REF_RE =
  /\[\[(lib-[0-9a-hjkmnp-tv-z]{5}|[a-z]+-[0-9a-z]{5})?(?:#((?:SC|T)-\d+(?:\.\d+)?|[CDLQ]-[0-9a-z]{5}))?\]\]/g;

export interface RefMatch {
  /** As written, without the brackets. */
  target: string;
  issue?: string;
  lib?: string;
  anchor?: string;
  index: number;
}

/** All references in a text. */
export function findRefs(text: string): RefMatch[] {
  const out: RefMatch[] = [];
  for (const m of text.matchAll(REF_RE)) {
    if (!m[1] && !m[2]) continue;
    const head = m[1];
    out.push({
      target: m[0].slice(2, -2),
      issue: head && !head.startsWith("lib-") ? head : undefined,
      lib: head?.startsWith("lib-") ? head : undefined,
      anchor: m[2],
      index: m.index ?? 0,
    });
  }
  return out;
}

export interface LineRef extends RefMatch {
  /** 0-based line and 0-based column of the opening brackets. */
  line: number;
  col: number;
}

/**
 * References per line, with positions. Fenced blocks and code spans are skipped, because a
 * `[[ref]]` written as an example is not a link. `from` skips frontmatter when it is wanted.
 */
export function refsByLine(l: Lines, opts: { skipCode?: boolean } = {}): LineRef[] {
  const mask = fenceMask(l.lines);
  const out: LineRef[] = [];
  l.lines.forEach((line, i) => {
    if (opts.skipCode && mask[i]) return;
    const text = opts.skipCode ? line.replace(/`[^`]*`/g, (s) => " ".repeat(s.length)) : line;
    for (const m of findRefs(text)) out.push({ ...m, line: i, col: m.index });
  });
  return out;
}
