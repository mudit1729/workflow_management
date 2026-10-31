// What the panel knows about the libraries it can ask: the pages of each, their sizes, and the
// pages the issue links. Everything is read through the library API, so it follows edits and new
// libraries live.
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { contextLinksOf } from "@/features/context/links";
import { api, qk, useIssue, useLibraries, useLibraryLive } from "@/lib/api";
import type { LibraryInfo } from "@/lib/api/types";
import { chipLibraries, type PageFact, pageOf, type ScopeFacts, treePages } from "./scope";

export interface ScopeData {
  /** Libraries that can be a chip: loaded, with pages. Personal first, then the workspace's. */
  libraries: LibraryInfo[];
  facts: ScopeFacts;
  /** The trees are still coming. */
  loading: boolean;
  /** The issue links pages (a team page, a personal page or a workspace item). */
  hasLinked: boolean;
}

export function useScopeData(issueId: string | undefined): ScopeData {
  useLibraryLive();
  const all = useLibraries().data;
  const libraries = useMemo(() => {
    const chips = chipLibraries(all ?? []);
    const rank = (l: LibraryInfo) => (l.kind === "personal" ? 0 : l.kind === "workspace" ? 1 : 2);
    return [...chips].sort((a, b) => rank(a) - rank(b));
  }, [all]);

  const trees = useQueries({
    queries: libraries.map((l) => ({
      queryKey: qk.libraryTree(l.alias),
      queryFn: () => api.libraryTree(l.alias),
      staleTime: 10_000,
    })),
  });

  // What the issue's `## Links` says: a page by its address, a workspace item by its `lib-` id.
  const detail = useIssue(issueId).data;
  const links = useMemo(
    () => contextLinksOf(detail?.goal.links_md, detail?.summary.path),
    [detail?.goal.links_md, detail?.summary.path],
  );
  const items = useMemo(
    () => links.filter((l) => l.kind === "library").map((l) => l.target),
    [links],
  );
  const resolved = useQueries({
    queries: items.map((raw) => ({
      queryKey: qk.libraryResolve(raw, ""),
      queryFn: () => api.libraryResolve(raw),
      staleTime: 10_000,
    })),
  });

  // The query results are new arrays every render; the time each last changed says when to rebuild.
  const stamp = [...trees, ...resolved].map((q) => q.dataUpdatedAt).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` stands for the results
  const facts = useMemo<ScopeFacts>(() => {
    const pages = new Map<string, PageFact>();
    const byLibrary = new Map<string, string[]>();
    for (const { data: tree } of trees) {
      if (!tree) continue;
      const list = treePages(tree);
      for (const p of list) pages.set(p.address, p);
      byLibrary.set(
        tree.alias,
        list.map((p) => p.address),
      );
    }
    const linked = new Set<string>();
    for (const l of links) if (l.kind === "page") linked.add(pageOf(l.target));
    for (const { data: r } of resolved) if (r?.ok && r.address) linked.add(pageOf(r.address));
    return { linked: [...linked], pages, byLibrary };
  }, [links, stamp]);

  return {
    libraries,
    facts,
    loading: trees.some((t) => t.isPending) || resolved.some((r) => r.isPending),
    hasLinked: facts.linked.length > 0,
  };
}
