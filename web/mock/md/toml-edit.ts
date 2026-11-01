// Text edits for TOML files (`workflow.toml`, the personal `library.toml`): the same promise as
// `edit.ts`, a minimal change to the text. A call changes the lines it must and nothing else:
// every comment, every other key, the order of the keys and the line endings stay as they are.
//
// This is a line editor, not a serializer, and it is not a TOML parser. It knows the shapes the
// files of wf use: `[table]` headers, `key = value` lines (a value may continue over lines in an
// array or a multi-line string), `#` comments and `[[array]]` headers. It has no dependency, so
// the dashboard can run it in the browser against a real `wf serve` too.
//
//   setTomlKey(text, "flow.plan", "skill", "ws:acme-planning")   change or add one key
//   removeTomlKey(text, "flow.plan", "skill")                     drop one key
//   removeTomlTable(text, "flow.custom.security-check")           drop a table and its key lines
//   readTomlTable(text, "flow.plan")                              the scalar keys of one table
//
// A table is named by its dotted path (`flow.custom.security-check`); `""` is the top level, the
// keys before the first header. A table that is missing is added at the end of the file with one
// blank line before it.

/** What a key of `workflow.toml` or `library.toml` holds in the flow: a scalar. */
export type TomlScalar = string | number | boolean;

// ---------------------------------------------------------------- lines

interface KeyEntry {
  key: string;
  /** First and last line of the key, last included (a multi-line value spans several). */
  start: number;
  end: number;
  /** The text of the first line up to the value: indent, key, ` = `. */
  prefix: string;
  /** The raw value, as written, without its trailing comment. */
  raw: string;
  /** The end of the last line from the end of the value on: spaces and a `# comment`. */
  tail: string;
}

interface HeaderEntry {
  name: string;
  array: boolean;
  line: number;
}

interface Scan {
  /** The lines without their ending. */
  lines: string[];
  /** Does line `i` end with `\r\n` (true) or `\n`? A file may mix the two. */
  cr: boolean[];
  /** The text ends with a line break. */
  final: boolean;
  headers: HeaderEntry[];
  /** The keys of each table, by its dotted name ("" for the top level). Array tables are not here. */
  keys: Map<string, KeyEntry[]>;
  /** Where each key table (by header position) ends: the line of the next header, or the end. */
  ends: number[];
}

const HEADER = /^\s*(\[\[?)\s*(.+?)\s*(\]\]?)\s*(?:#.*)?$/;
const KEY = /^(\s*(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')\s*=\s*)(.*)$/;
const KEY_NAME = /^\s*([A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')/;

/** `flow."a.b".c` → ["flow", "a.b", "c"]. Quotes are dropped. */
function segments(path: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = "";
  for (const ch of path) {
    if (quote) {
      if (ch === quote) quote = "";
      else cur += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ".") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const tableName = (path: string): string => (path === "" ? "" : segments(path).join("."));

const unquoteKey = (raw: string): string =>
  raw.startsWith('"')
    ? (readBasic(raw.slice(1, -1)) ?? raw)
    : raw.startsWith("'")
      ? raw.slice(1, -1)
      : raw;

/**
 * Where a value that starts at `col` of line `at` ends: the line, and the tail of that line from
 * the end of the value on. Follows an array or inline table over lines and a multi-line string.
 */
function valueExtent(
  lines: string[],
  at: number,
  col: number,
): { end: number; raw: string; tail: string } {
  let depth = 0;
  let str: string | undefined; // the open string's delimiter: ", ', """ or '''
  let raw = "";
  for (let i = at; i < lines.length; i++) {
    const line = lines[i] as string;
    let j = i === at ? col : 0;
    let valueEnd = -1; // index just past the last character of the value on this line
    while (j < line.length) {
      const ch = line[j] as string;
      if (str) {
        if (str.length === 3) {
          if (line.startsWith(str, j)) {
            j += 3;
            str = undefined;
            valueEnd = j;
            continue;
          }
        } else if (str === '"' && ch === "\\") {
          j += 2;
          continue;
        } else if (ch === str) {
          str = undefined;
          valueEnd = j + 1;
        }
        j += 1;
        continue;
      }
      if (ch === "#") break;
      if (ch === '"' || ch === "'") {
        str = line.startsWith(ch.repeat(3), j) ? ch.repeat(3) : ch;
        j += str.length;
        continue;
      }
      if (ch === "[" || ch === "{") depth += 1;
      else if (ch === "]" || ch === "}") depth -= 1;
      if (ch !== " " && ch !== "\t") valueEnd = j + 1;
      j += 1;
    }
    // A single-line string is closed by the end of its line.
    if (str && str.length === 1) str = undefined;
    const from = i === at ? col : 0;
    const stop = valueEnd < 0 ? from : valueEnd;
    raw += (i === at ? "" : "\n") + line.slice(from, stop);
    if (depth <= 0 && !str) return { end: i, raw: raw.trimEnd(), tail: line.slice(stop) };
  }
  return { end: lines.length - 1, raw: raw.trimEnd(), tail: "" };
}

function scan(text: string): Scan {
  const final = text.endsWith("\n");
  const rows = text === "" ? [] : text.split("\n");
  if (final) rows.pop();
  const cr = rows.map((l) => l.endsWith("\r"));
  return scanLines(
    rows.map((l, i) => (cr[i] ? l.slice(0, -1) : l)),
    final,
    cr,
  );
}

function scanLines(lines: string[], final: boolean, cr: boolean[] = []): Scan {
  const headers: HeaderEntry[] = [];
  const keys = new Map<string, KeyEntry[]>([["", []]]);
  const ends: number[] = [];
  let table = "";
  let array = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const head = HEADER.exec(line);
    if (head) {
      array = head[1] === "[[";
      table = segments(head[2] as string).join(".");
      headers.push({ name: table, array, line: i });
      if (!array && !keys.has(table)) keys.set(table, []);
      continue;
    }
    const kv = KEY.exec(line);
    if (!kv) continue;
    const prefix = kv[1] as string;
    const { end, raw, tail } = valueExtent(lines, i, prefix.length);
    const name = KEY_NAME.exec(prefix)?.[1] as string;
    if (!array) keys.get(table)?.push({ key: unquoteKey(name), start: i, end, prefix, raw, tail });
    i = end;
  }
  for (let h = 0; h < headers.length; h++) ends.push(headers[h + 1]?.line ?? lines.length);
  return { lines, cr, final, headers, keys, ends };
}

/** The lines of a scan while an edit changes them, each with the ending it was read with. */
interface Draft {
  lines: string[];
  cr: boolean[];
}

const draftOf = (s: Scan): Draft => ({
  lines: [...s.lines],
  cr: s.lines.map((_, i) => s.cr[i] === true),
});

/**
 * Replace `del` lines at `at` by `add`. A new line ends like the line at `like` (the one above the
 * place by default, else the one below), so a file that mixes `\r\n` and `\n` keeps each of its
 * lines as it was.
 */
function splice(d: Draft, at: number, del: number, add: string[], like = at - 1): void {
  const cr = d.cr[like] ?? d.cr[at] ?? d.cr[d.cr.length - 1] ?? false;
  d.lines.splice(at, del, ...add);
  d.cr.splice(at, del, ...add.map(() => cr));
}

function join(s: Scan, d: Draft): string {
  const rows = d.lines.map((l, i) => l + (d.cr[i] ? "\r" : ""));
  return rows.length === 0 ? "" : rows.join("\n") + (s.final ? "\n" : "");
}

const isBlank = (l: string | undefined) => l !== undefined && l.trim() === "";
const isComment = (l: string | undefined) => l !== undefined && /^\s*#/.test(l);

/** The first non-array header of a table, or undefined. The top level has no header. */
const headerOf = (s: Scan, name: string): HeaderEntry | undefined =>
  s.headers.find((h) => !h.array && h.name === name);

// ---------------------------------------------------------------- values

const ESCAPES: Record<string, string> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

/** The text of a basic string (the part between the quotes), or undefined when it is not valid. */
function readBasic(body: string): string | undefined {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = body[i + 1] as string;
    if (next in ESCAPES) {
      out += ESCAPES[next];
      i += 1;
    } else if (next === "u" || next === "U") {
      const n = next === "u" ? 4 : 8;
      const code = Number.parseInt(body.slice(i + 2, i + 2 + n), 16);
      if (!Number.isFinite(code)) return undefined;
      out += String.fromCodePoint(code);
      i += 1 + n;
    } else return undefined;
  }
  return out;
}

/** A string as a TOML basic string: quotes, backslashes and control characters escaped. */
function basic(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0) as number;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

/** A string can be written between single quotes: no `'`, no control character. */
const literalOk = (value: string) =>
  ![...value].some((ch) => ch === "'" || ch < " " || ch === "\u007f");

type Quote = '"' | "'";

/** How a raw value is quoted, when it is a single-line string. */
const quoteOf = (raw: string): Quote | undefined =>
  /^"(?!"")/.test(raw) ? '"' : /^'(?!'')/.test(raw) ? "'" : undefined;

/** The quoting of the strings already in `entries`: the last one's, else the majority of `fallback`. */
function houseQuote(entries: KeyEntry[], fallback: KeyEntry[]): Quote {
  const own = entries.map((e) => quoteOf(e.raw)).filter((q): q is Quote => q !== undefined);
  if (own.length > 0) return own[own.length - 1] as Quote;
  const all = fallback.map((e) => quoteOf(e.raw)).filter((q): q is Quote => q !== undefined);
  const single = all.filter((q) => q === "'").length;
  return single > all.length - single ? "'" : '"';
}

function format(value: TomlScalar, quote: Quote): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("A TOML number must be finite.");
    return String(value);
  }
  return quote === "'" && literalOk(value) ? `'${value}'` : basic(value);
}

/** A raw value as a scalar; undefined for an array, an inline table, a date or anything else. */
function readScalar(raw: string): TomlScalar | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^[+-]?\d[\d_]*$/.test(raw)) return Number(raw.replace(/_/g, ""));
  if (/^[+-]?\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d+)?$/.test(raw)) return Number(raw.replace(/_/g, ""));
  if (/^"(?!"")(?:[^"\\]|\\.)*"$/.test(raw)) return readBasic(raw.slice(1, -1));
  if (/^'[^']*'$/.test(raw) && !raw.startsWith("''")) return raw.slice(1, -1);
  if (raw === "''") return "";
  return undefined;
}

// ---------------------------------------------------------------- reading

/**
 * The scalar keys (strings, numbers, booleans) of one table, in file order. Arrays, inline tables
 * and dates are left out. `undefined` when the file has no such table; `{}` when it has one
 * without scalar keys. The top level (`""`) always exists.
 */
export function readTomlTable(text: string, table: string): Record<string, TomlScalar> | undefined {
  const s = scan(text);
  const name = tableName(table);
  if (name !== "" && !headerOf(s, name)) return undefined;
  const out: Record<string, TomlScalar> = {};
  for (const e of s.keys.get(name) ?? []) {
    const v = readScalar(e.raw);
    if (v !== undefined) out[e.key] = v;
  }
  return out;
}

/**
 * The 0-based line of a table's header, or of one of its keys when `key` is given; -1 when the
 * file has none. Takes the lines of the file, so a lint rule can point at the place.
 */
export function locateToml(lines: string[], table: string, key?: string): number {
  const s = scanLines(lines, true);
  const name = tableName(table);
  const head = headerOf(s, name);
  if (key === undefined) return head ? head.line : -1;
  if (name !== "" && !head) return -1;
  return (s.keys.get(name) ?? []).find((e) => e.key === key)?.start ?? -1;
}

/** The keys a table holds, scalar or not, in file order. Empty for a table the file does not have. */
export function listTomlKeys(text: string, table: string): string[] {
  const s = scan(text);
  const name = tableName(table);
  if (name !== "" && !headerOf(s, name)) return [];
  return (s.keys.get(name) ?? []).map((e) => e.key);
}

/** The dotted names of the tables the file declares, in file order (`[[array]]` tables left out). */
export function listTomlTables(text: string): string[] {
  const seen: string[] = [];
  for (const h of scan(text).headers) if (!h.array && !seen.includes(h.name)) seen.push(h.name);
  return seen;
}

// ---------------------------------------------------------------- writing

export interface SetOptions {
  /**
   * Comment lines (without `#`) written above the table when this call adds it. Ignored when the
   * table is already there.
   */
  comment?: string[];
}

/**
 * Set `key` of `table` to `value`. The line of an existing key keeps its indent, its spacing, its
 * quote style and its trailing comment; a new key goes after the last key of the table; a new
 * table goes at the end of the file after one blank line. A string is quoted like the strings
 * around it: single quotes only where the table or the file already uses them.
 */
export function setTomlKey(
  text: string,
  table: string,
  key: string,
  value: TomlScalar,
  opts: SetOptions = {},
): string {
  const s = scan(text);
  const name = tableName(table);
  const head = headerOf(s, name);
  const entries = s.keys.get(name) ?? [];
  const all = [...s.keys.values()].flat();

  if (name === "" || head) {
    const at = entries.find((e) => e.key === key);
    if (at) {
      const quote = quoteOf(at.raw) ?? houseQuote(entries, all);
      const d = draftOf(s);
      splice(
        d,
        at.start,
        at.end - at.start + 1,
        [`${at.prefix}${format(value, quote)}${at.tail}`],
        at.start,
      );
      return join(s, d);
    }
    const last = entries[entries.length - 1];
    const indent = /^\s*/.exec(last ? s.lines[last.start] : "")?.[0] ?? "";
    const line = `${indent}${bareKey(key)} = ${format(value, houseQuote(entries, all))}`;
    const d = draftOf(s);
    if (last) splice(d, last.end + 1, 0, [line]);
    else if (head) splice(d, head.line + 1, 0, [line]);
    else {
      // A top level with no key yet: the first line, set apart from the header that follows.
      splice(d, 0, 0, [line, ...(d.lines.length > 0 && !isBlank(d.lines[0]) ? [""] : [])]);
    }
    return join({ ...s, final: s.final || text === "" }, d);
  }

  // A table that is not in the file yet: at the end, after one blank line.
  const d = draftOf(s);
  const add: string[] = [];
  if (d.lines.length > 0 && !isBlank(d.lines[d.lines.length - 1])) add.push("");
  for (const c of opts.comment ?? []) add.push(c === "" ? "#" : `# ${c}`);
  add.push(`[${table}]`, `${bareKey(key)} = ${format(value, houseQuote([], all))}`);
  splice(d, d.lines.length, 0, add);
  return join({ ...s, final: true }, d);
}

/** A key as the file writes it: bare when it can be, else quoted. */
const bareKey = (key: string): string => (/^[A-Za-z0-9_-]+$/.test(key) ? key : basic(key));

/**
 * Remove `key` from `table`: its line, or its lines when the value spans several. A comment above
 * the key stays. Nothing changes when the key or the table is not there. The table stays even when
 * this was its last key (see `removeTomlTable`).
 */
export function removeTomlKey(text: string, table: string, key: string): string {
  const s = scan(text);
  const name = tableName(table);
  if (name !== "" && !headerOf(s, name)) return text;
  const at = (s.keys.get(name) ?? []).find((e) => e.key === key);
  if (!at) return text;
  const d = draftOf(s);
  splice(d, at.start, at.end - at.start + 1, []);
  return join(s, d);
}

export interface RemoveOptions {
  /** Also remove the tables below this one (`flow` takes `flow.plan` and `flow.custom.x`). */
  deep?: boolean;
}

/**
 * Remove a table: its header, its keys and the comment lines directly above the header (a comment
 * with no blank line between it and the header belongs to the table). The blank line that
 * separated it from its neighbour goes too, so removing the table that was added last restores the
 * file as it was. Nothing changes when the table is not there.
 */
export function removeTomlTable(text: string, table: string, opts: RemoveOptions = {}): string {
  const name = tableName(table);
  if (name === "") return text;
  let s = scan(text);
  let current = text;
  const matches = (h: HeaderEntry) =>
    !h.array && (h.name === name || (opts.deep === true && h.name.startsWith(`${name}.`)));
  // Remove from the last match to the first, so the line numbers of the rest stay valid.
  for (;;) {
    const idx = s.headers.map(matches).lastIndexOf(true);
    if (idx < 0) return current;
    const h = s.headers[idx] as HeaderEntry;
    let start = h.line;
    while (isComment(s.lines[start - 1])) start -= 1;
    // The comment lines above the next header belong to that table, not to this one.
    let end = s.ends[idx] as number;
    const next = s.headers[idx + 1];
    if (next) while (end - 1 > h.line && isComment(s.lines[end - 1])) end -= 1;
    const d = draftOf(s);
    // Keep one blank line between the neighbours; at the end of the file keep none.
    const atEnd = end >= d.lines.length;
    while (atEnd && start > 0 && isBlank(d.lines[start - 1])) start -= 1;
    splice(d, start, end - start, []);
    current = join(s, d);
    s = scan(current);
  }
}
