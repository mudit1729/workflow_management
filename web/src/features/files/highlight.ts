// A light, line-based highlighter for the workspace's markdown and TOML. It colors with tone
// names only (the renderer maps them to tokens), and keeps state across lines for frontmatter
// and fenced blocks. It is a reading aid, not a parser: the daemon's parser is the authority.

export type Tone = "plain" | "faint" | "muted" | "strong" | "accent" | "ok";

export interface Token {
  text: string;
  tone: Tone;
}

export type LineKind =
  | "blank"
  | "text"
  | "frontmatter-fence"
  | "frontmatter"
  | "heading"
  | "fence"
  | "code"
  | "archify-fence"
  | "archify-code"
  | "toml-table"
  | "toml"
  | "comment";

export interface HighlightedLine {
  kind: LineKind;
  tokens: Token[];
}

export type Lang = "md" | "toml" | "plain";

// ---------------------------------------------------------------- inline

const ID5 = "[0-9a-hjkmnp-tv-z]{5}";
const INLINE = new RegExp(
  [
    // timestamps and dates
    String.raw`(?<ts>\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?\b)`,
    // [[refs]]
    String.raw`(?<ref>\[\[[^\]\n]+\]\])`,
    // {#C-7k2q9}
    String.raw`(?<hid>\{#[CDL]-${ID5}\})`,
    // @handles (not inside emails, paths or other handles)
    String.raw`(?<handle>(?<![\w@./])@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)`,
    // wf-3k9x2, lib-4tz7c, g-8m2qa, SC-3, T-4, T-3.2, C-7k2q9, Q-4m2pz
    String.raw`(?<id>\b(?:wf|lib|g)-${ID5}\b|\b(?:SC|T)-\d+(?:\.\d+)?\b|\b[CDLQ]-${ID5}\b)`,
  ].join("|"),
  "g",
);

const INLINE_TONE: Record<string, Tone> = {
  ts: "faint",
  hid: "faint",
  id: "faint",
  ref: "accent",
  handle: "accent",
};

function push(out: Token[], text: string, tone: Tone) {
  if (text === "") return;
  const last = out[out.length - 1];
  if (last && last.tone === tone) last.text += text;
  else out.push({ text, tone });
}

/** Split text into tokens: timestamps, ids, @handles and [[refs]] stand out; the rest is `base`. */
export function inlineTokens(text: string, base: Tone = "plain"): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const groups = m.groups ?? {};
    const name = Object.keys(groups).find((k) => groups[k] !== undefined);
    if (!name) continue;
    push(out, text.slice(last, m.index), base);
    push(out, m[0], INLINE_TONE[name] ?? base);
    last = m.index + m[0].length;
  }
  push(out, text.slice(last), base);
  return out;
}

const line = (kind: LineKind, tokens: Token[]): HighlightedLine => ({ kind, tokens });
const one = (kind: LineKind, text: string, tone: Tone): HighlightedLine =>
  line(kind, text === "" ? [] : [{ text, tone }]);

// ---------------------------------------------------------------- markdown

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})(\s+)(.*)$/;
const LIST = /^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/;
const CHECKBOX = /^\[( |x|X)\](\s+|$)(.*)$/;
const META = /^([a-z_]+:)(\s.*|)$/;
const YAML_KEY = /^(\s*)([A-Za-z_][\w.-]*)(\s*:)(\s*)(.*)$/;

interface OpenFence {
  char: string;
  length: number;
  archify: boolean;
}

function listLine(m: RegExpMatchArray): HighlightedLine {
  const [, indent, bullet, gap, rest] = m;
  const tokens: Token[] = [];
  push(tokens, indent, "plain");
  push(tokens, bullet + gap, "faint");
  const box = rest.match(CHECKBOX);
  if (box) {
    const checked = box[1] !== " ";
    push(tokens, `[${box[1]}]`, checked ? "ok" : "muted");
    push(tokens, box[2], "plain");
    for (const t of inlineTokens(box[3])) push(tokens, t.text, t.tone);
    return line("text", tokens);
  }
  const meta = rest.match(META);
  if (meta) {
    push(tokens, meta[1], "faint");
    for (const t of inlineTokens(meta[2])) push(tokens, t.text, t.tone);
    return line("text", tokens);
  }
  for (const t of inlineTokens(rest)) push(tokens, t.text, t.tone);
  return line("text", tokens);
}

function headingLine(m: RegExpMatchArray): HighlightedLine {
  const tokens: Token[] = [];
  push(tokens, m[1] + m[2], "faint");
  for (const t of inlineTokens(m[3], "strong")) push(tokens, t.text, t.tone);
  return line("heading", tokens);
}

function frontmatterLine(text: string): HighlightedLine {
  const key = text.match(YAML_KEY);
  if (key) {
    const [, indent, name, colon, gap, value] = key;
    const tokens: Token[] = [];
    push(tokens, indent, "plain");
    push(tokens, name + colon, "faint");
    push(tokens, gap, "plain");
    if (value.startsWith("#")) push(tokens, value, "faint");
    else for (const t of inlineTokens(value)) push(tokens, t.text, t.tone);
    return line("frontmatter", tokens);
  }
  if (/^\s*#/.test(text)) return one("frontmatter", text, "faint");
  const item = text.match(/^(\s*-\s+)(.*)$/);
  if (item) {
    const tokens: Token[] = [];
    push(tokens, item[1], "faint");
    for (const t of inlineTokens(item[2])) push(tokens, t.text, t.tone);
    return line("frontmatter", tokens);
  }
  return line("frontmatter", inlineTokens(text));
}

function highlightMarkdown(lines: string[]): HighlightedLine[] {
  const out: HighlightedLine[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let fence: OpenFence | null = null;

  lines.forEach((text, i) => {
    if (inFrontmatter) {
      if (i === 0) {
        out.push(one("frontmatter-fence", text, "faint"));
        return;
      }
      if (text.trim() === "---" || text.trim() === "...") {
        inFrontmatter = false;
        out.push(one("frontmatter-fence", text, "faint"));
        return;
      }
      out.push(frontmatterLine(text));
      return;
    }

    if (fence) {
      const close = text.trim();
      if (
        close.length >= fence.length &&
        close[0] === fence.char &&
        close === fence.char.repeat(close.length)
      ) {
        out.push(one(fence.archify ? "archify-fence" : "fence", text, "faint"));
        fence = null;
        return;
      }
      out.push(fence.archify ? one("archify-code", text, "muted") : one("code", text, "plain"));
      return;
    }

    const open = text.match(FENCE);
    if (open) {
      const info = open[3].trim();
      const archify = /^(archify\b|wf-diagram\b)/.test(info);
      fence = { char: open[2][0], length: open[2].length, archify };
      const tokens: Token[] = [];
      push(tokens, open[1] + open[2], "faint");
      push(tokens, open[3], archify ? "accent" : "muted");
      out.push(line(archify ? "archify-fence" : "fence", tokens));
      return;
    }

    if (text.trim() === "") {
      out.push(line("blank", []));
      return;
    }
    const heading = text.match(HEADING);
    if (heading) {
      out.push(headingLine(heading));
      return;
    }
    const list = text.match(LIST);
    if (list) {
      out.push(listLine(list));
      return;
    }
    if (/^\s*>/.test(text)) {
      const tokens: Token[] = [];
      const q = text.match(/^(\s*>+\s?)(.*)$/);
      if (q) {
        push(tokens, q[1], "faint");
        for (const t of inlineTokens(q[2])) push(tokens, t.text, t.tone);
      }
      out.push(line("text", tokens));
      return;
    }
    if (/^\s*<!--.*-->\s*$/.test(text)) {
      out.push(one("comment", text, "faint"));
      return;
    }
    out.push(line("text", inlineTokens(text)));
  });
  return out;
}

// ---------------------------------------------------------------- toml

/** Index of the `#` that starts a trailing comment, outside quotes, or -1. */
function commentStart(value: string): number {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#") return i;
  }
  return -1;
}

function highlightToml(lines: string[]): HighlightedLine[] {
  return lines.map((text) => {
    if (text.trim() === "") return line("blank", []);
    if (/^\s*#/.test(text)) return one("comment", text, "faint");
    if (/^\s*\[\[?[^\]]+\]\]?\s*(#.*)?$/.test(text)) {
      const at = commentStart(text);
      const tokens: Token[] = [];
      push(tokens, at === -1 ? text : text.slice(0, at), "strong");
      if (at !== -1) push(tokens, text.slice(at), "faint");
      return line("toml-table", tokens);
    }
    const kv = text.match(/^(\s*)([A-Za-z0-9_."'-]+)(\s*=\s*)(.*)$/);
    if (kv) {
      const tokens: Token[] = [];
      push(tokens, kv[1], "plain");
      push(tokens, kv[2] + kv[3], "faint");
      const at = commentStart(kv[4]);
      push(tokens, at === -1 ? kv[4] : kv[4].slice(0, at), "plain");
      if (at !== -1) push(tokens, kv[4].slice(at), "faint");
      return line("toml", tokens);
    }
    return line("toml", [{ text, tone: "plain" }]);
  });
}

// ---------------------------------------------------------------- entry

/** The lines of a text as the editor numbers them: a final newline does not add a line. */
export function splitLines(text: string): string[] {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function langOf(path: string): Lang {
  if (path.endsWith(".md")) return "md";
  if (path.endsWith(".toml")) return "toml";
  return "plain";
}

export function highlightSource(text: string, lang: Lang): HighlightedLine[] {
  const lines = splitLines(text);
  if (lang === "md") return highlightMarkdown(lines);
  if (lang === "toml") return highlightToml(lines);
  return lines.map((l) => (l === "" ? line("blank", []) : one("text", l, "plain")));
}
