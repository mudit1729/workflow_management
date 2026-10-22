// What the snapshot knows about a workspace path: the issue, library item or group it belongs
// to. The tree uses it for titles and colors; SourceView for its "Open issue" link.
import { useMemo } from "react";
import type { GroupNode, IssueSummary, LibrarySummary } from "@/gen/types";
import { useSnapshot } from "@/lib/api";
import { basename, dirname } from "./paths";
import type { GroupMeta, IssueMeta, TreeContext } from "./tree";

export function flattenGroups(root: GroupNode): GroupNode[] {
  const out: GroupNode[] = [];
  const walk = (n: GroupNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

export interface FileContext {
  issue?: IssueSummary;
  /** The file's path inside its issue folder: "goal.md", "notes/research.md". */
  rel?: string;
  library?: LibrarySummary;
  group?: GroupNode;
}

export function useFileContext(path: string): FileContext {
  const snapshot = useSnapshot().data;
  return useMemo(() => {
    if (!snapshot) return {};
    const issue = snapshot.issues.find((i) => path.startsWith(`${i.path}/`));
    if (issue) return { issue, rel: path.slice(issue.path.length + 1) };
    const library = snapshot.library.find((l) => l.path === path);
    if (library) return { library };
    if (basename(path) === "_group.md") {
      const dir = dirname(path);
      const group = flattenGroups(snapshot.groups).find((g) => g.path === dir);
      if (group) return { group };
    }
    return {};
  }, [snapshot, path]);
}

/** What the tree falls back to when the snapshot cannot load: plain folders, default names. */
const PLAIN: TreeContext = {
  issues: new Map(),
  groups: new Map(),
  issuesDir: "issues",
  libraryDir: "library",
};

/** Folder metadata for the tree, keyed by folder path. */
export function useTreeContext(): TreeContext | undefined {
  const query = useSnapshot();
  const snapshot = query.data;
  const failed = query.isError;
  return useMemo(() => {
    if (!snapshot) return failed ? PLAIN : undefined;
    const issues = new Map<string, IssueMeta>();
    for (const i of snapshot.issues) {
      issues.set(i.path, { id: i.id, title: i.title, status: i.status });
    }
    const groups = new Map<string, GroupMeta>();
    for (const g of flattenGroups(snapshot.groups)) {
      groups.set(g.path, {
        id: g.id,
        title: g.title,
        color: g.color,
        implicit: g.implicit,
        order: g.order,
      });
    }
    return {
      issues,
      groups,
      issuesDir: snapshot.config.issues_dir,
      libraryDir: snapshot.config.library_dir,
    };
  }, [snapshot, failed]);
}
