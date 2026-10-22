// The Workdatabase item a person picks as context. It carries what the UI shows (title, a
// second line, a status) and the three facts that become the markdown bullet: kind, target
// and label. Everything else is derived from the workspace files and is not stored.
import type {
  ContextLink,
  DecisionEntry,
  GlossaryTerm,
  IssueSummary,
  LibraryKind,
  LibraryStatus,
  LibrarySummary,
} from "@/gen/types";
import type { WorkspaceFileInfo } from "@/lib/api";
import { baseName, type ContextKind, FILE_EXCERPT_CHARS, linkKey } from "./links";

export interface ContextItem {
  kind: ContextKind;
  /** library: `lib-4tz7c`; entry: `wf-3k9x2#D-7f3k2`; term: the term; file: workspace path. */
  target: string;
  /** The words written after the link in goal.md. */
  label: string;
  /** What the row and the chip show. */
  title: string;
  /** Faint mono id after the title: `lib-4tz7c`, `D-7f3k2`. */
  id?: string;
  /** Second line: the "Use when…" line, what a term means, the issue a file belongs to. */
  detail?: string;
  /** Library items: the kind picks the icon, the status decides what agents get. */
  libKind?: LibraryKind;
  status?: LibraryStatus;
  /** Size of what the agent reads, in characters, when the list already knows it. */
  chars?: number;
}

/** The text a draft shows next to its chip. */
export const DRAFT_NOTE = "Draft — agents don't get it until it's reviewed";

/** A draft is linked and listed, but `wf context` does not inject it. */
export const isDraft = (item: Pick<ContextItem, "kind" | "status">) =>
  item.kind === "library" && item.status === "draft";

export const itemKey = (item: Pick<ContextItem, "kind" | "target">): string => linkKey(item);

export const toLink = (item: ContextItem): ContextLink => ({
  kind: item.kind,
  target: item.target,
  label: item.label,
});

// ---------------------------------------------------------------- builders

/** "A time-limited claim: `claimed_by` plus `lease_until`. It expires…" → "a time-limited claim: …" */
export function termLabel(means: string): string {
  const flat = means.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  let first = (end < 0 ? flat : flat.slice(0, end)).trim();
  if (first.length > 140) first = `${first.slice(0, 137).trimEnd()}…`;
  // A sentence start becomes a phrase: "The git repo" → "the git repo". "UI" and "I/O" stay.
  return /^[A-Z](?:[a-z]|\s)/.test(first) ? first[0].toLowerCase() + first.slice(1) : first;
}

export function libraryItem(l: LibrarySummary): ContextItem {
  return {
    kind: "library",
    target: l.id,
    label: l.title,
    title: l.title,
    id: l.id,
    detail: l.description,
    libKind: l.kind,
    status: l.status,
  };
}

export function termItem(t: GlossaryTerm): ContextItem {
  return {
    kind: "term",
    target: t.term,
    label: termLabel(t.means),
    title: t.term,
    id: t.kind,
    detail: t.means,
    chars: t.term.length + t.means.length + 20,
  };
}

const ISSUE_FILES = new Set([
  "goal.md",
  "plan.md",
  "current_state.md",
  "changes.md",
  "decisions.md",
  "learnings.md",
]);

/** `Research` from `notes/research.md`; the issue's own files read as `Title (plan.md)`. */
function fileLabel(name: string, issue?: IssueSummary, docTitle?: string): string {
  if (ISSUE_FILES.has(name)) return issue ? `${issue.title} (${name})` : name;
  if (docTitle) return docTitle;
  const stem = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  return stem ? stem[0].toUpperCase() + stem.slice(1) : name;
}

/** A file inside an issue folder. `rel` is its path from that folder. */
export function fileItem(
  file: Pick<WorkspaceFileInfo, "path" | "bytes">,
  issue: IssueSummary | undefined,
  docTitle?: string,
): ContextItem {
  const rel = issue ? file.path.slice(issue.path.length + 1) : file.path;
  return {
    kind: "file",
    target: file.path,
    label: fileLabel(baseName(file.path), issue, docTitle),
    title: rel,
    detail: issue?.title,
    chars: Math.min(file.bytes, FILE_EXCERPT_CHARS) + 80,
  };
}

export function decisionItem(issue: IssueSummary, d: DecisionEntry): ContextItem {
  return {
    kind: "entry",
    target: `${issue.id}#${d.id}`,
    label: d.title,
    title: d.title,
    id: d.id,
    detail: issue.title,
    chars: d.title.length + (d.decision_md?.length ?? 0) + (d.because_md?.length ?? 0) + 60,
  };
}

/** Is this file one the picker offers? Markdown inside an issue folder: its files and its docs. */
export const isContextFile = (f: Pick<WorkspaceFileInfo, "kind" | "issue">): boolean =>
  f.kind === "md" && !!f.issue;
