// remark plugin: turns `[[target]]` references and `@handle` mentions inside text into link
// nodes with private protocols, which MarkdownProse renders as RefLink / AuthorChip.
// Walks the mdast tree by hand (no extra deps). Skips code, links and raw HTML.

export const REF_PROTOCOL = "wf-ref:";
export const AUTHOR_PROTOCOL = "wf-author:";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
}

const SKIP = new Set(["link", "linkReference", "definition", "code", "inlineCode", "html"]);

// [[wf-3k9x2]], [[wf-3k9x2#D-7f3k2]], [[#T-4]], [[lib-4tz7c]]
// @handle per contract 1.3, not preceded by a word char, dot, slash or @ (so no emails/paths),
// and never ending in "." "_" or "-" (sentence punctuation stays text).
const TOKEN = /\[\[([^[\]\s]+)\]\]|(?<![\w.@/+-])@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/g;

function link(url: string, text: string): MdNode {
  return { type: "link", url, title: null, children: [{ type: "text", value: text }] };
}

function split(value: string): MdNode[] | null {
  let out: MdNode[] | null = null;
  let last = 0;
  for (const m of value.matchAll(TOKEN)) {
    out ??= [];
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: value.slice(last, start) });
    if (m[1]) out.push(link(REF_PROTOCOL + m[1], m[1]));
    else out.push(link(AUTHOR_PROTOCOL + m[2], `@${m[2]}`));
    last = start + m[0].length;
  }
  if (out && last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function walk(node: MdNode): void {
  const children = node.children;
  if (!children || SKIP.has(node.type)) return;
  const next: MdNode[] = [];
  let changed = false;
  for (const child of children) {
    const parts = child.type === "text" && child.value ? split(child.value) : null;
    if (parts) {
      next.push(...parts);
      changed = true;
    } else {
      walk(child);
      next.push(child);
    }
  }
  if (changed) node.children = next;
}

export function remarkWfRefs() {
  return (tree: MdNode) => {
    walk(tree);
  };
}

/** Parse a reference target into its parts. `[[#T-4]]` resolves against `issueId`. */
export interface ParsedRef {
  kind: "issue" | "entry" | "library";
  issue?: string;
  /** Entry, criterion, task or request id after "#". */
  sub?: string;
  library?: string;
}

export function parseRef(target: string, issueId?: string): ParsedRef {
  const t = target.trim();
  if (/^lib-/i.test(t)) return { kind: "library", library: t };
  const hash = t.indexOf("#");
  if (hash >= 0) {
    const issue = hash === 0 ? issueId : t.slice(0, hash);
    return { kind: "entry", issue, sub: t.slice(hash + 1) };
  }
  return { kind: "issue", issue: t };
}
