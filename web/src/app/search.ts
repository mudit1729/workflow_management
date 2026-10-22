// Search-param validators for the route tree. Each returns every key the route
// knows, set to `undefined` when the value is missing or invalid, so a bad value
// in the URL (`?swim=sideways`) never reaches a component.
import type { FilesSearch } from "@/features/files";
import type { LibraryKind } from "@/gen/types";
import {
  type BoardSearch,
  ISSUE_TABS,
  type IssueSearch,
  type IssueTab,
  type LibrarySearch,
  type LogView,
} from "@/lib/nav";

type Raw = Record<string, unknown>;

const LOG_VIEWS: LogView[] = ["changes", "decisions", "learnings"];
const LIBRARY_KINDS: LibraryKind[] = ["pattern", "playbook", "gotcha", "decision"];

/** A non-empty string. Numbers are accepted because the default parser turns `?q=42` into 42. */
function str(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s === "" ? undefined : s;
}

/**
 * Free text typed into a filter box. Kept exactly as typed, spaces included, so a control bound
 * to it never loses the space in "live bo"; only text that is all whitespace counts as empty.
 * Matchers trim when they compare.
 */
function text(v: unknown): string | undefined {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  return typeof s === "string" && s.trim() !== "" ? s : undefined;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function validateBoardSearch(raw: Raw): BoardSearch {
  const author = str(raw.author);
  return {
    group: str(raw.group),
    swim: oneOf(raw.swim, ["child", "none"] as const),
    // Handles are stored without "@"; accept "@codex" from a pasted link.
    author: author?.replace(/^@/, ""),
    q: text(raw.q),
    show: oneOf(raw.show, ["cancelled"] as const),
  };
}

export function validateIssueSearch(raw: Raw): IssueSearch {
  return {
    tab: oneOf<IssueTab>(raw.tab, ISSUE_TABS),
    log: oneOf<LogView>(raw.log, LOG_VIEWS),
  };
}

export function validateLibrarySearch(raw: Raw): LibrarySearch {
  return {
    tab: oneOf(raw.tab, ["items", "glossary"] as const),
    kind: oneOf<LibraryKind>(raw.kind, LIBRARY_KINDS),
    q: text(raw.q),
  };
}

export function validateFilesSearch(raw: Raw): FilesSearch {
  // A path is kept exactly as typed: no trimming, no case change.
  return { path: text(raw.path) };
}
