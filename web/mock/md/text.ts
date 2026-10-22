// Text helpers shared by the parser, the linter and the editor: line tables with byte
// offsets, fenced-block detection and list splitting. Pure functions, no I/O.

const encoder = new TextEncoder();

/** UTF-8 length of a string. */
export const bytes = (s: string): number => encoder.encode(s).length;

/** A text split into lines, with the start of every line in characters and in bytes. */
export interface Lines {
  text: string;
  /** Line content without the line break (a trailing `\r` is dropped). */
  lines: string[];
  /** Offset of the first character of each line, in UTF-16 code units. */
  start: number[];
  /** Offset of the first byte of each line. */
  byte: number[];
}

export function toLines(text: string): Lines {
  const lines: string[] = [];
  const start: number[] = [];
  const byte: number[] = [];
  // A byte order mark belongs to no line: it is skipped, but its three bytes are counted.
  const bom = text.charCodeAt(0) === 0xfeff;
  let at = bom ? 1 : 0;
  let b = bom ? 3 : 0;
  for (;;) {
    const nl = text.indexOf("\n", at);
    const end = nl < 0 ? text.length : nl;
    const raw = text.slice(at, end);
    lines.push(raw.endsWith("\r") ? raw.slice(0, -1) : raw);
    start.push(at);
    byte.push(b);
    if (nl < 0) break;
    b += bytes(raw) + 1;
    at = nl + 1;
  }
  return { text, lines, start, byte };
}

/** Byte span of columns [from, to) of line `i` (0-based), `to` defaulting to the line end. */
export function spanOf(l: Lines, i: number, from = 0, to?: number): [number, number] {
  const line = l.lines[i] ?? "";
  const a = l.byte[i] + bytes(line.slice(0, from));
  const b = l.byte[i] + bytes(line.slice(0, to ?? line.length));
  return [a, b];
}

/** Byte span covering lines [first, last] inclusive, trailing line break excluded. */
export function blockSpan(l: Lines, first: number, last: number): [number, number] {
  return [l.byte[first] ?? 0, (l.byte[last] ?? 0) + bytes(l.lines[last] ?? "")];
}

// ---------------------------------------------------------------- fences

export interface Fence {
  /** 0-based index of the opening fence line. */
  open: number;
  /** 0-based index of the closing fence line, or the last line when it is missing. */
  close: number;
  closed: boolean;
  /** The info string after the opening backticks, trimmed. */
  info: string;
  /** Body lines, between the fences. */
  body: string[];
}

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})\s*(.*)$/;

/** All fenced code blocks of a line list, in order. */
export function findFences(lines: string[], from = 0, to = lines.length): Fence[] {
  const out: Fence[] = [];
  let i = from;
  while (i < to) {
    const m = FENCE_OPEN.exec(lines[i]);
    if (!m || (m[2][0] === "`" && m[3].includes("`"))) {
      i++;
      continue;
    }
    const ch = m[2][0];
    const len = m[2].length;
    const closeRe = new RegExp(`^ {0,3}\\${ch}{${len},}\\s*$`);
    let j = i + 1;
    while (j < to && !closeRe.test(lines[j])) j++;
    const closed = j < to;
    out.push({
      open: i,
      close: closed ? j : to - 1,
      closed,
      info: m[3].trim(),
      body: lines.slice(i + 1, closed ? j : to),
    });
    i = j + 1;
  }
  return out;
}

/** `true` for every line inside a fenced block, fences included. */
export function computeFenceMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  for (const f of findFences(lines)) for (let i = f.open; i <= f.close; i++) mask[i] = true;
  return mask;
}

const MASKS = new WeakMap<string[], boolean[]>();

/** Like `computeFenceMask`, cached per line list: the list must not change afterwards. */
export function fenceMask(lines: string[]): boolean[] {
  let mask = MASKS.get(lines);
  if (!mask) {
    mask = computeFenceMask(lines);
    MASKS.set(lines, mask);
  }
  return mask;
}

// ---------------------------------------------------------------- strings

/** Split a comma list; commas inside backticks or `[[…]]` do not split. Backticks are stripped. */
export function splitList(value: string): string[] {
  const out: string[] = [];
  let cur = "";
  let tick = false;
  let ref = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "`") tick = !tick;
    else if (!tick && c === "[" && value[i + 1] === "[") ref++;
    else if (!tick && c === "]" && value[i + 1] === "]" && ref > 0) ref--;
    if (c === "," && !tick && ref === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => stripTicks(s.trim())).filter((s) => s !== "");
}

/** Strip backticks around a value that is exactly one code span (contract 1.3). */
export function stripTicks(v: string): string {
  return /^`[^`]*`$/.test(v) ? v.slice(1, -1) : v;
}

/** Remove a leading `@` from a handle. */
export const bare = (h: string): string => h.trim().replace(/^@/, "");

/** Trim blank lines from both ends of a line list. */
export function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b);
}

/** Join a line range as markdown text, blank lines trimmed at both ends. */
export function joinBlock(lines: string[]): string {
  return trimBlank(lines).join("\n");
}

export const WORD = /[\p{L}\p{N}]/u;
