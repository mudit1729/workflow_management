// The grammar of context links: one bullet under `## Links` in goal.md per Workdatabase item.
// Pure text, no React: the mock editor (`mock/md/edit.ts`), the `wf context` bundle and the Goal
// tab all read and write the same four shapes.
//
//   - [[lib-4tz7c]] Rescan subtrees instead of trusting notify on macOS      library item
//   - [[wf-3k9x2#D-7f3k2]] Push board updates over SSE                      entry of an issue
//   - Glossary: lease — a time-boxed claim on a task                         glossary term
//   - [research notes](../../web/live-board-updates/notes/research.md)      workspace file
//
// A file path is relative to the folder of the issue, so the link also works in an editor and on
// a git host. Older bullets such as `- [[wf-7p4dn]]: index scan.` still read: the colon is
// optional and a plain issue reference is an `issue` link.
import type { ContextLink } from "@/gen/types";

export type { ContextLink };

export type ContextKind = ContextLink["kind"];

/** What a bullet of `## Links` can be. `text` is any bullet this grammar does not know. */
export type LinkKind = ContextKind | "issue" | "url" | "text";

export interface ParsedLink {
  kind: LinkKind;
  /** library: `lib-4tz7c`; entry: `wf-3k9x2#D-7f3k2` (or `#D-7f3k2`); issue: `wf-7p4dn`;
   *  term: the term; file: workspace-relative path; url: the address; text: the whole line. */
  target: string;
  /** The words after the link, without the bullet and the separator. */
  label: string;
  /** The line as written. */
  line: string;
}

/** Characters of a linked file that `wf context` includes. The picker estimates with it too. */
export const FILE_EXCERPT_CHARS = 1200;

/** Rough token count: four characters per token, the rule of thumb `wf context` uses. */
export const estimateTokens = (chars: number): number => Math.ceil(Math.max(0, chars) / 4);

/** The key two links share when they point at the same thing. */
export const linkKey = (link: { kind: LinkKind; target: string }): string =>
  `${link.kind}:${link.target}`;

// ---------------------------------------------------------------- paths

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** `notes/research.md` → `research.md`. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The path of `to`, seen from the folder `fromDir` (both workspace-relative, no slashes at the ends). */
export function relativePath(fromDir: string, to: string): string {
  const a = fromDir.split("/").filter(Boolean);
  const b = to.split("/").filter(Boolean);
  let i = 0;
  // The last segment of `to` is the file: it is never "common".
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...new Array<string>(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

/** The workspace-relative path that `rel` names when it is written in a file of `fromDir`. */
export function resolvePath(fromDir: string, rel: string): string {
  const out = rel.startsWith("/") ? [] : fromDir.split("/").filter(Boolean);
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

const encodeHref = (path: string) =>
  path
    .split("/")
    .map((seg) => (seg === ".." ? seg : encodeURIComponent(seg)))
    .join("/")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

// ---------------------------------------------------------------- write

/**
 * The bullet for one item. `fromDir` is the folder of the issue that holds the goal.md (a file
 * link is relative to it). A label is one line; markdown brackets in a file label would end the
 * link text early, so they are dropped.
 */
export function linkLine(link: ContextLink, fromDir = ""): string {
  const label = oneLine(link.label);
  switch (link.kind) {
    case "library":
    case "entry":
      return `- [[${link.target}]]${label ? ` ${label}` : ""}`;
    case "term":
      return `- Glossary: ${oneLine(link.target)}${label ? ` — ${label}` : ""}`;
    case "file": {
      const text = oneLine((label || baseName(link.target)).replace(/[[\]]/g, ""));
      return `- [${text}](${encodeHref(relativePath(fromDir, link.target))})`;
    }
  }
}

/**
 * The text of a goal.md without one bullet of its `## Links` section: the first line there that
 * reads like `line`. Nothing else changes; when it was the last bullet the empty heading goes too.
 * `undefined` when the bullet is not in the section (the file moved on).
 */
export function withoutLink(goal: string, line: string): string | undefined {
  const lines = goal.split("\n");
  const heading = lines.findIndex((l) => /^##\s+Links\s*$/.test(l));
  if (heading === -1) return undefined;
  let end = lines.findIndex((l, i) => i > heading && /^#{1,2}\s/.test(l));
  if (end === -1) end = lines.length;
  const at = lines.findIndex((l, i) => i > heading && i < end && l.trim() === line.trim());
  if (at === -1) return undefined;
  lines.splice(at, 1);
  end -= 1;
  if (lines.slice(heading + 1, end).every((l) => l.trim() === "")) {
    // The last bullet: the heading goes with it, and the blank lines around, but one is kept
    // between what came before and what follows (or the file's final newline).
    let from = heading;
    while (from > 0 && lines[from - 1].trim() === "") from--;
    lines.splice(from, end - from, ...(from > 0 ? [""] : []));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- read

const BULLET = String.raw`^\s*[-*+]\s+`;
const REF_LINE = new RegExp(
  `${BULLET}\\[\\[([^\\]\\s]+)\\]\\]\\s*(?:[:\\u2014\\u2013-]\\s+|:\\s*)?(.*)$`,
);
const TERM_LINE = new RegExp(`${BULLET}Glossary:\\s*(.+?)(?:\\s+[\\u2014\\u2013-]+\\s+(.*))?\\s*$`);
const LINK_LINE = new RegExp(`${BULLET}\\[([^\\]]*)\\]\\(([^)\\s]+)\\)\\s*(.*)$`);
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Read one line of `## Links`. A file link resolves against `fromDir` to a workspace-relative
 * path (without `fromDir` the target keeps the relative form as written).
 */
export function parseLinkLine(line: string, fromDir?: string): ParsedLink {
  const text: ParsedLink = { kind: "text", target: line.trim(), label: "", line };

  const ref = REF_LINE.exec(line);
  if (ref) {
    const target = ref[1];
    const kind: LinkKind = /^lib-/i.test(target)
      ? "library"
      : target.includes("#")
        ? "entry"
        : "issue";
    return { kind, target, label: oneLine(ref[2]), line };
  }

  const term = TERM_LINE.exec(line);
  if (term) return { kind: "term", target: oneLine(term[1]), label: oneLine(term[2] ?? ""), line };

  const link = LINK_LINE.exec(line);
  if (link) {
    const href = decodeHref(link[2]);
    if (SCHEME.test(href)) return { kind: "url", target: href, label: oneLine(link[1]), line };
    const target = fromDir === undefined ? href : resolvePath(fromDir, href);
    return { kind: "file", target, label: oneLine(link[1]), line };
  }
  return text;
}

/** Every line of a `## Links` section, read. Blank lines are skipped. */
export function parseLinks(md: string | undefined, fromDir?: string): ParsedLink[] {
  return (md ?? "")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => parseLinkLine(l, fromDir));
}

/** The links that point at the Workdatabase (library, entry, term, file), as `ContextLink`s. */
export function contextLinksOf(md: string | undefined, fromDir?: string): ContextLink[] {
  const out: ContextLink[] = [];
  for (const p of parseLinks(md, fromDir)) {
    if (p.kind === "library" || p.kind === "entry" || p.kind === "term" || p.kind === "file")
      out.push({ kind: p.kind, target: p.target, label: p.label });
  }
  return out;
}

/** Keys of the links already in a `## Links` section, to skip duplicates. */
export function linkKeys(md: string | undefined, fromDir?: string): Set<string> {
  return new Set(
    parseLinks(md, fromDir)
      .filter((p) => p.kind !== "text")
      .map(linkKey),
  );
}
