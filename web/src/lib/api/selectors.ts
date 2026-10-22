// Derived views over the snapshot. They return stable references while the snapshot is
// unchanged, so components that read them do not re-render for unrelated deltas.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Author, GroupNode, IssueSummary, NeedsYouItem } from "@/gen/types";
import { snapshotQuery } from "./queries";

const EMPTY_ISSUES: IssueSummary[] = [];
const EMPTY_INBOX: NeedsYouItem[] = [];

export function useAuthors(): Map<string, Author> {
  const authors = useQuery({ ...snapshotQuery(), select: (s) => s.authors }).data;
  return useMemo(() => new Map((authors ?? []).map((a) => [a.handle, a])), [authors]);
}

export function useAuthor(handle?: string): Author | undefined {
  return useQuery({
    ...snapshotQuery(),
    select: (s) => s.authors.find((a) => a.handle === handle),
  }).data;
}

/** The acting author (`config.author`). Empty until the snapshot loads. */
export function useMe(): string {
  return useQuery({ ...snapshotQuery(), select: (s) => s.config.author }).data ?? "";
}

export function useIssueSummary(id?: string): IssueSummary | undefined {
  return useQuery({
    ...snapshotQuery(),
    select: (s) => s.issues.find((i) => i.id === id),
  }).data;
}

export function useIssueMap(): Map<string, IssueSummary> {
  const issues = useQuery({ ...snapshotQuery(), select: (s) => s.issues }).data ?? EMPTY_ISSUES;
  return useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
}

/** The root group (the issues folder) with the whole tree below it. */
export function useGroupTree(): GroupNode | undefined {
  return useQuery({ ...snapshotQuery(), select: (s) => s.groups }).data;
}

export function useGroupIndex(): Map<string, GroupNode> {
  const root = useGroupTree();
  return useMemo(() => {
    const index = new Map<string, GroupNode>();
    const walk = (g: GroupNode) => {
      index.set(g.id, g);
      for (const c of g.children) walk(c);
    };
    if (root) walk(root);
    return index;
  }, [root]);
}

export function useGroup(id?: string): GroupNode | undefined {
  const index = useGroupIndex();
  return id ? index.get(id) : undefined;
}

/** Every issue in a group and in the groups below it. */
export function issuesInGroup(root: GroupNode, issues: IssueSummary[]): IssueSummary[] {
  const ids = new Set<string>();
  const walk = (g: GroupNode) => {
    ids.add(g.id);
    for (const c of g.children) walk(c);
  };
  walk(root);
  return issues.filter((i) => ids.has(i.group));
}

export interface Inbox {
  /** Requests addressed to the acting author, open and answered. */
  mine: NeedsYouItem[];
  /** Every request in the workspace, open ones first. */
  all: NeedsYouItem[];
  /** Open requests addressed to the acting author (the tab title badge). */
  count: number;
}

export function useInbox(): Inbox {
  const all = useQuery({ ...snapshotQuery(), select: (s) => s.inbox }).data ?? EMPTY_INBOX;
  const me = useMe();
  return useMemo(() => {
    const mine = all.filter((i) => i.to === me);
    return { mine, all, count: mine.filter((i) => !i.answered).length };
  }, [all, me]);
}
