// YAML frontmatter, read the tolerant way (contract 1.1 principle 3). A file with valid
// YAML gives its keys. A file with invalid YAML still gives every `key: value` line that
// parses on its own, so the issue stays on the board, and the error is reported (F001) at
// the line the YAML parser names.
import { parseDocument } from "yaml";
import { bare, type Lines, splitList } from "./text";
import type { FileCtx } from "./types";

export interface YamlProblem {
  /** 1-based line in the whole file, and 1-based column. */
  line: number;
  col: number;
  message: string;
  /** The key of the offending line, when the line looks like `key: value`. */
  key?: string;
  /** A hint for the writer. */
  fix?: string;
}

export interface Frontmatter {
  /** The file starts with a `---` fence. */
  present: boolean;
  /** The closing `---` fence exists. */
  closed: boolean;
  /** 0-based line of the opening and closing fence (−1 when absent). */
  open: number;
  close: number;
  /** First body line (0-based): the line after the closing fence, or 0. */
  bodyStart: number;
  /** Top-level keys with their parsed values, in file order. */
  data: Record<string, unknown>;
  /** 0-based line of each top-level key. */
  keyLine: Record<string, number>;
  problem?: YamlProblem;
}

const KEY_LINE = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/;

const CACHE = new WeakMap<Lines, Frontmatter>();

/** Find the frontmatter block and parse it. Never throws. The result is cached per `Lines`. */
export function readFrontmatter(l: Lines): Frontmatter {
  let known = CACHE.get(l);
  if (!known) {
    known = parseFrontmatter(l);
    CACHE.set(l, known);
  }
  return known;
}

function parseFrontmatter(l: Lines): Frontmatter {
  const none: Frontmatter = {
    present: false,
    closed: false,
    open: -1,
    close: -1,
    bodyStart: 0,
    data: {},
    keyLine: {},
  };
  if (l.lines[0]?.trimEnd() !== "---") return none;
  let close = -1;
  for (let i = 1; i < l.lines.length; i++) {
    if (l.lines[i].trimEnd() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) {
    return {
      ...none,
      present: true,
      open: 0,
      problem: {
        line: 1,
        col: 1,
        message: "Frontmatter is not closed. Add a `---` line after the keys.",
      },
    };
  }

  const yamlLines = l.lines.slice(1, close);
  const out: Frontmatter = {
    ...none,
    present: true,
    closed: true,
    open: 0,
    close,
    bodyStart: close + 1,
  };
  const doc = parseDocument(yamlLines.join("\n"), { uniqueKeys: true });
  let data: Record<string, unknown> = {};
  let js: unknown;
  let failure: string | undefined;
  if (doc.errors.length === 0) {
    try {
      js = doc.toJS({ maxAliasCount: 20 });
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }
  }
  if (doc.errors.length === 0 && failure === undefined) {
    if (js && typeof js === "object" && !Array.isArray(js)) data = js as Record<string, unknown>;
  } else if (failure !== undefined) {
    // An alias bomb or similar: the frontmatter is unreadable as a whole.
    out.problem = {
      line: 2,
      col: 1,
      message: `Invalid YAML at line 2, column 1: ${failure.split("\n")[0]}`,
      fix: "Fix the YAML, or remove the aliases.",
    };
    data = recover(yamlLines);
  } else {
    const err = doc.errors[0];
    const at = err.linePos?.[0];
    const line = (at?.line ?? 1) + 1; // +1 for the opening fence
    const col = at?.col ?? 1;
    const text = yamlLines[(at?.line ?? 1) - 1] ?? "";
    const key = KEY_LINE.exec(text)?.[1];
    const value = KEY_LINE.exec(text)?.[2] ?? "";
    const bareHandle = /^@[\w.-]+$/.test(value.trim());
    out.problem = {
      line,
      col,
      key,
      message: bareHandle
        ? `Invalid YAML at line ${line}, column ${col}: found character \`@\` that cannot start any token.`
        : `Invalid YAML at line ${line}, column ${col}: ${err.message.split("\n")[0].replace(/\s+at line \d+, column \d+:?$/, "")}`,
      fix:
        bareHandle && key
          ? `Quote the handle: \`${key}: "${value.trim()}"\`.`
          : "Fix the YAML on this line, or quote the value.",
    };
    data = recover(yamlLines);
  }

  out.data = data;
  yamlLines.forEach((text, i) => {
    const m = /^([A-Za-z_][\w-]*):/.exec(text);
    if (m && !(m[1] in out.keyLine)) out.keyLine[m[1]] = i + 1;
  });
  return out;
}

/** Read what can be read from broken YAML: each top-level `key: value` line on its own. */
function recover(yamlLines: string[]): Record<string, unknown> {
  try {
    return recoverKeys(yamlLines);
  } catch {
    return {};
  }
}

function recoverKeys(yamlLines: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let i = 0;
  while (i < yamlLines.length) {
    const m = KEY_LINE.exec(yamlLines[i]);
    if (!m) {
      i++;
      continue;
    }
    // A key with indented lines below it (a block list) is read together with them.
    let j = i + 1;
    while (j < yamlLines.length && /^(\s+\S|\s*-\s)/.test(yamlLines[j])) j++;
    const chunk = yamlLines.slice(i, j).join("\n");
    const one = parseDocument(chunk, { uniqueKeys: false });
    let js: Record<string, unknown> | null | undefined;
    if (one.errors.length === 0) {
      try {
        js = one.toJS({ maxAliasCount: 20 }) as Record<string, unknown> | null;
      } catch {
        js = undefined; // an alias to a key that is not in this chunk
      }
    }
    if (js && typeof js === "object") Object.assign(data, js);
    else if (one.errors.length > 0 && /^@[\w.-]+$/.test((m[2] ?? "").trim())) {
      data[m[1]] = (m[2] ?? "").trim();
    }
    i = j;
  }
  return data;
}

// ---------------------------------------------------------------- typed getters

export const asString = (v: unknown): string | undefined =>
  v === undefined || v === null
    ? undefined
    : typeof v === "string"
      ? v
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);

export const asInt = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isInteger(n) ? n : undefined;
};

/** A list value: a YAML sequence, or a comma list written as a plain string. */
export function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asString(x) ?? "").filter((x) => x !== "");
  const s = asString(v);
  return s ? splitList(s) : [];
}

/** A handle value, with or without the leading `@`. */
export const asHandle = (v: unknown): string | undefined => {
  const s = asString(v);
  return s ? bare(s) : undefined;
};

/** Register one anchor per top-level key; a key's span runs to the line before the next key. */
export function anchorKeys(ctx: FileCtx, fm: Frontmatter): void {
  if (!fm.closed) return;
  const keys = Object.entries(fm.keyLine).sort((a, b) => a[1] - b[1]);
  keys.forEach(([key, line], k) => {
    const next = keys[k + 1]?.[1] ?? fm.close;
    ctx.anchor(key, line, Math.max(line, next - 1));
  });
}
