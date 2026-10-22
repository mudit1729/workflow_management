// The Workdatabase as a list of things to pick: library items, glossary terms, files and the
// decisions of other issues. Built from the same queries the rest of the app uses, so a picker
// shows what the library, glossary and file views show.
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import type { IssueDetail } from "@/gen/types";
import { api, qk, useGlossary, useSnapshot, useWorkspaceFiles } from "@/lib/api";
import {
  type ContextItem,
  decisionItem,
  fileItem,
  isContextFile,
  libraryItem,
  termItem,
} from "./types";

export type ContextGroup = "library" | "glossary" | "files" | "decisions";

export const GROUP_LABEL: Record<ContextGroup, string> = {
  library: "Library",
  glossary: "Glossary",
  files: "Files",
  decisions: "Decisions",
};

export const GROUP_ORDER: ContextGroup[] = ["library", "glossary", "files", "decisions"];

/** A pickable item with the lowercase text a query is matched against. */
export interface Candidate {
  item: ContextItem;
  hay: string;
}

export type Workdatabase = Record<ContextGroup, Candidate[]> & {
  loading: boolean;
  /** Retired library items the Library group leaves out: agents no longer read them. */
  retiredHidden: number;
};

const candidate = (item: ContextItem, ...extra: (string | undefined)[]): Candidate => ({
  item,
  hay: [item.title, item.id, item.detail, item.target, ...extra].join(" ").toLowerCase(),
});

const ISSUE_FILE_ORDER = [
  "goal.md",
  "plan.md",
  "current_state.md",
  "changes.md",
  "decisions.md",
  "learnings.md",
];

/**
 * Everything the picker can offer. `enabled` holds back the per-issue fetches (decisions and
 * doc titles) until the picker opens. `issueId` is the issue that will hold the links: its own
 * decisions and its own six files are left out, because `wf context` already carries them.
 */
export function useWorkdatabase({
  enabled = true,
  issueId,
}: {
  enabled?: boolean;
  issueId?: string;
} = {}): Workdatabase {
  const snapshot = useSnapshot().data;
  const glossary = useGlossary().data;
  const files = useWorkspaceFiles().data;

  const issues = snapshot?.issues;
  const details = useQueries({
    queries: (issues ?? []).map((i) => ({
      queryKey: qk.issue(i.id),
      queryFn: () => api.issue(i.id),
      enabled,
      staleTime: 30_000,
    })),
    combine: (results) => ({
      list: results.map((r) => r.data as IssueDetail | undefined),
      pending: results.some((r) => r.isPending && r.fetchStatus !== "idle"),
    }),
  });

  return useMemo(() => {
    const library = (snapshot?.library ?? [])
      .filter((l) => l.status !== "retired")
      // Reviewed first: they are what agents can read. Then by how many issues use them.
      .sort(
        (a, b) =>
          Number(b.status === "reviewed") - Number(a.status === "reviewed") ||
          b.used_by - a.used_by ||
          a.title.localeCompare(b.title),
      )
      .map((l) => candidate(libraryItem(l), l.tags.join(" "), l.applies_to.join(" ")));

    const terms = [...(glossary ?? [])]
      .sort((a, b) => a.term.localeCompare(b.term))
      .map((t) => candidate(termItem(t), t.avoid.join(" ")));

    const byId = new Map((issues ?? []).map((i) => [i.id, i]));
    const detailById = new Map(
      details.list.flatMap((d) => (d ? [[d.summary.id, d] as const] : [])),
    );
    const fileRows: { issueTitle: string; order: number; c: Candidate }[] = [];
    for (const f of files ?? []) {
      if (!isContextFile(f) || !f.issue) continue;
      const issue = byId.get(f.issue);
      if (!issue) continue;
      const name = f.path.slice(f.path.lastIndexOf("/") + 1);
      const own = ISSUE_FILE_ORDER.indexOf(name);
      // The six files of the issue that holds the links are already in its bundle.
      if (f.issue === issueId && f.path === `${issue.path}/${name}` && own >= 0) continue;
      const rel = f.path.slice(issue.path.length + 1);
      const docTitle = detailById.get(f.issue)?.docs.find((d) => d.path === rel)?.title;
      fileRows.push({
        issueTitle: issue.title,
        // Notes and docs first, then the issue's own files in their usual order.
        order: own < 0 ? -1 : own,
        c: candidate(fileItem(f, issue, docTitle), issue.title, issue.id),
      });
    }
    fileRows.sort(
      (a, b) =>
        a.order - b.order ||
        a.issueTitle.localeCompare(b.issueTitle) ||
        a.c.item.target.localeCompare(b.c.item.target),
    );

    const decisions: Candidate[] = [];
    for (const issue of [...(issues ?? [])].sort((a, b) => a.title.localeCompare(b.title))) {
      if (issue.id === issueId) continue;
      for (const d of detailById.get(issue.id)?.decisions ?? []) {
        // A rejected or replaced decision is no longer what the issue went with.
        if (d.status !== "accepted" || d.superseded_by) continue;
        decisions.push(candidate(decisionItem(issue, d), issue.id, d.topic));
      }
    }

    return {
      library,
      glossary: terms,
      files: fileRows.map((r) => r.c),
      decisions,
      retiredHidden: (snapshot?.library ?? []).filter((l) => l.status === "retired").length,
      loading: !snapshot || !glossary || !files || (enabled && details.pending),
    };
  }, [snapshot, glossary, files, issues, details, issueId, enabled]);
}

// ---------------------------------------------------------------- matching

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** `word` occurs in `text` at the start of a word: "lease" is in "the lease_until", not in "release". */
export function hasWordStart(text: string, word: string): boolean {
  let at = text.indexOf(word);
  while (at !== -1) {
    if (at === 0 || !LETTER_OR_DIGIT.test(text.charAt(at - 1))) return true;
    at = text.indexOf(word, at + 1);
  }
  return false;
}

/**
 * Every word of the query starts a word somewhere in the item; titles and ids weigh more. A word
 * matches from its first letter, so "sse" does not find "addresses" nor "lease" find "release".
 */
export function score(c: Candidate, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const title = c.item.title.toLowerCase();
  const id = (c.item.id ?? "").toLowerCase();
  let total = 0;
  for (const w of words) {
    if (!hasWordStart(c.hay, w)) return 0;
    total += title.startsWith(w) ? 4 : hasWordStart(title, w) ? 3 : id.includes(w) ? 3 : 1;
  }
  return total;
}

/** The candidates of one group that match, best first, in list order among equals. */
export function rank(list: Candidate[], query: string): Candidate[] {
  if (!query.trim()) return list;
  return list
    .map((c, i) => ({ c, i, s: score(c, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}
