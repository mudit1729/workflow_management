// Pure helpers of the markdown viewer: split the frontmatter off a file, read its keys the way
// they are written, keep line numbers true, and find the line of a glossary term. No React.
//
// The viewer renders the file text itself (never a parsed copy of it), so every block it shows
// can name the line that produced it. These helpers keep that promise: the frontmatter is cut
// off by lines, never re-serialized, and a replaced diagram fence keeps its line count.

export interface FrontmatterEntry {
  key: string;
  /** The value as written, without quotes and list dashes. A list has one item per line. */
  value: string;
  /** 1-based line of the key in the file. */
  line: number;
}

export interface SplitMarkdown {
  /** The frontmatter keys in file order; undefined when the file has no frontmatter block. */
  entries?: FrontmatterEntry[];
  /** Everything after the closing fence, exactly as written. */
  body: string;
  /** Lines of the file before `body` starts (0 without frontmatter). */
  lineOffset: number;
}

const FENCE = /^---\s*$/;
const KEY = /^([A-Za-z0-9_][\w.-]*)[ \t]*:[ \t]*(.*)$/;

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return t.slice(1, -1);
  }
  return t;
}

/** `[a, "b"]` → `a, b`; `- "[[x]]"` → `[[x]]`; anything else → the trimmed text. */
function plain(value: string): string {
  const t = value.trim();
  if (t.startsWith("[") && t.endsWith("]") && !t.startsWith("[[")) {
    return t.slice(1, -1).split(",").map(unquote).filter(Boolean).join(", ");
  }
  return unquote(t);
}

/**
 * Cut a leading `---` block off `text`. A file whose block never closes has no frontmatter as
 * far as the viewer is concerned (lint F001 explains it in the Source view).
 */
export function splitFrontmatter(text: string): SplitMarkdown {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = source.split("\n");
  // Carriage returns stay in the body (the renderer reads them) but not in the keys.
  const bare = (i: number) => (lines[i] ?? "").replace(/\r$/, "");
  if (!lines[0] || !FENCE.test(bare(0))) return { body: source, lineOffset: 0 };
  const close = lines.findIndex((_, i) => i > 0 && FENCE.test(bare(i)));
  if (close === -1) return { body: source, lineOffset: 0 };

  const entries: FrontmatterEntry[] = [];
  let open: { key: string; parts: string[]; line: number } | undefined;
  const flush = () => {
    if (!open) return;
    entries.push({ key: open.key, value: open.parts.filter(Boolean).join("\n"), line: open.line });
    open = undefined;
  };
  for (let i = 1; i < close; i++) {
    const raw = bare(i);
    const m = KEY.exec(raw);
    if (m?.[1]) {
      flush();
      open = { key: m[1], parts: [plain(m[2] ?? "")], line: i + 1 };
    } else if (open && raw.trim() !== "" && !raw.trim().startsWith("#")) {
      open.parts.push(plain(raw.trim().replace(/^-\s+/, "")));
    }
  }
  flush();
  return { entries, body: lines.slice(close + 1).join("\n"), lineOffset: close + 1 };
}

/**
 * The `[[…]]` targets a frontmatter key lists, as written in the file (`source:` of a library item).
 * The server drops one that no longer resolves; the file still names it.
 */
export function frontmatterRefs(text: string, key: string): string[] {
  const entry = splitFrontmatter(text).entries?.find((e) => e.key === key);
  if (!entry) return [];
  return [...entry.value.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1] ?? "").filter(Boolean);
}

const OPEN = /^( {0,3})(`{3,}|~{3,})[ \t]*archify\b(.*)$/;

/**
 * Turn each ```` ```archify <type> id=<id> ```` block into the ```` ```wf-diagram ```` fence the
 * prose renderer knows. The fence keeps its line count (blank lines pad the id), so every block
 * after it keeps its true line number. A block without an id, or never closed, stays as it is.
 */
export function fenceDiagrams(md: string): string {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = OPEN.exec(lines[i] ?? "");
    if (!m) continue;
    const mark = m[2] ?? "```";
    const close = new RegExp(`^ {0,3}${mark[0] === "`" ? "`" : "~"}{${mark.length},}[ \\t]*$`);
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (close.test(lines[j] ?? "")) {
        end = j;
        break;
      }
    }
    if (end === -1) continue;
    const id = /(?:^|\s)id=([^\s]+)/.exec(m[3] ?? "")?.[1];
    if (id && end - i >= 2) {
      lines[i] = "```wf-diagram";
      lines[i + 1] = id;
      for (let j = i + 2; j < end; j++) lines[j] = "";
      lines[end] = "```";
    }
    i = end;
  }
  return lines.join("\n");
}

/** 1-based line of each `## term` heading of glossary.md, keyed by the lowercase term. */
export function glossaryLines(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const lines = text.split("\n");
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (m?.[1]) out.set(m[1].trim().toLowerCase(), i + 1);
  }
  return out;
}

/** Where the document puts its left gutter, given the width around it and the text column. */
export interface TraceLayout {
  /** Width of the gutter the line marker lives in; 0 hides the marker. */
  gutter: number;
  /** How far the gutter hangs into the margin to the left of the text column. */
  hang: number;
}

/** Below this width there is no pointer to hover with and no room to spare: no marker. */
const NARROW = 360;
/** The least room that holds the line number ("Open :14"). */
const MIN_GUTTER = 20;

/**
 * The gutter of a document. The marker hangs into the margin left of the text, so the text keeps
 * its measure and stays aligned with the title above it. `outer` is the width the document has,
 * `inner` the width of its text column, `margin` the empty space the host leaves to its left
 * (its padding). A wide page has a wide margin and shows the whole path; a pane only has its
 * padding and shows the line number (the whole path opens when the pointer reaches it). A phone
 * has neither.
 */
export function traceLayout(outer: number, inner: number, margin = 0): TraceLayout {
  if (outer < NARROW) return { gutter: 0, hang: 0 };
  const room = Math.floor((outer - inner) / 2) + margin - 4;
  if (room < MIN_GUTTER) return { gutter: 0, hang: 0 };
  const gutter = Math.min(room, 260);
  return { gutter, hang: gutter };
}
