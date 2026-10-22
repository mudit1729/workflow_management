// Which lines of a file changed, for the brief highlight after a save. A common-prefix and
// common-suffix trim is enough here: edits are local, and a wrong guess only colors a few
// extra lines for a second.
import { splitLines } from "./highlight";

/** 1-based line numbers in `after` that differ from `before`. Empty when nothing changed. */
export function changedLines(before: string, after: string): number[] {
  if (before === after) return [];
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const out: number[] = [];
  // Lines only removed leave nothing to color; mark the line the cut landed on.
  const to = Math.max(endB, start + 1);
  for (let n = start; n < Math.min(to, b.length); n++) out.push(n + 1);
  return out;
}

/** The 1-based line holding character offset `index` of `text`. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** The character offset where the 1-based `line` of `text` starts; the end of the text past the last line. */
export function lineStart(text: string, line: number): number {
  let at = 0;
  for (let n = 1; n < line; n++) {
    const next = text.indexOf("\n", at);
    if (next === -1) return text.length;
    at = next + 1;
  }
  return at;
}
