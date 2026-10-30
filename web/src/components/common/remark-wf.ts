// remark plugins: `remarkWfRefs` turns `[[target]]` references (and `[[target|label]]`) and
// `@handle` mentions inside text into link nodes with private protocols, which MarkdownProse renders
// as RefLink / PageLink / AuthorChip; `remarkCallouts` turns GitHub's `> [!NOTE]` quotes into
// callouts. Both walk the mdast tree by hand (no extra deps). Skip code, links and raw HTML.

export const REF_PROTOCOL = "wf-ref:";
export const AUTHOR_PROTOCOL = "wf-author:";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
  /** What remark-rehype reads: the element to make and its properties. */
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const SKIP = new Set(["link", "linkReference", "definition", "code", "inlineCode", "html"]);

// [[wf-3k9x2]], [[wf-3k9x2#D-7f3k2]], [[#T-4]], [[lib-4tz7c]], and in a library page
// [[runbooks/x#rotate]], [[platform:runbooks/x]], [[runbooks/x|a label]].
// @handle per contract 1.3, not preceded by a word char, dot, slash or @ (so no emails/paths),
// and never ending in "." "_" or "-" (sentence punctuation stays text).
const TOKEN =
  /\[\[([^[\]\s|]+)(?:\|([^[\]]+))?\]\]|(?<![\w.@/+-])@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)/g;

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
    if (m[1]) out.push(link(REF_PROTOCOL + m[1], m[2]?.trim() || m[1]));
    else out.push(link(AUTHOR_PROTOCOL + m[3], `@${m[3]}`));
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

// ---------------------------------------------------------------- callouts

/** The five GitHub callouts: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`. */
export const CALLOUTS = ["note", "tip", "important", "warning", "caution"] as const;
export type CalloutKind = (typeof CALLOUTS)[number];

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n)?/i;

function callouts(node: MdNode): void {
  for (const child of node.children ?? []) {
    if (SKIP.has(child.type)) continue;
    if (child.type === "blockquote") {
      const para = child.children?.[0];
      const first = para?.type === "paragraph" ? para.children?.[0] : undefined;
      const marker = first?.type === "text" && first.value ? MARKER.exec(first.value) : null;
      if (para && first && marker) {
        first.value = (first.value ?? "").slice(marker[0].length);
        if (first.value === "") para.children = para.children?.slice(1);
        // The marker line alone leaves an empty paragraph: drop it.
        if (!para.children?.length) child.children = child.children?.slice(1);
        child.data = {
          ...child.data,
          hName: "blockquote",
          hProperties: { dataCallout: (marker[1] ?? "note").toLowerCase() },
        };
      }
    }
    callouts(child);
  }
}

/** Mark `> [!NOTE]` quotes as callouts (`data-callout="note"` on the blockquote). */
export function remarkCallouts() {
  return (tree: MdNode) => {
    callouts(tree);
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
