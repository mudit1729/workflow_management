// Helpers for the tests of the markdown layer: the workspace files on disk, a stopped clock,
// a line diff and the canonical re-rendering of a loaded file.
import { vi } from "vitest";
import {
  type DiagramLookup,
  renderChanges,
  renderDecisions,
  renderGoal,
  renderGroup,
  renderLearnings,
  renderLibraryItem,
  renderPlan,
  renderState,
} from "./render";
import type { LoadedWorkspace } from "./types";

/**
 * Every text file under web/mock/sample (the sample world: 26 issues, the library, the
 * glossary), keyed by workspace-relative path. The markdown tests read the sample, not the
 * shipped workspace, because the shipped workspace has no issues.
 */
export function diskFiles(): Record<string, string> {
  const raw = import.meta.glob("../sample/**/*.{md,toml}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  return stripReadme(raw, "../sample/");
}

/** Every text file under web/mock/workspace (the shipped workspace: groups, library, glossary). */
export function shippedFiles(): Record<string, string> {
  const raw = import.meta.glob("../workspace/**/*.{md,toml}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  return stripReadme(raw, "../workspace/");
}

function stripReadme(raw: Record<string, string>, root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(raw)) {
    const path = key.replace(root, "");
    if (path !== "README.md") out[path] = text;
  }
  return out;
}

/** Run `fn` with the clock stopped at `ms`. */
export function at<T>(ms: number, fn: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ms);
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
}

/** Lines that differ between two texts: what a reviewer sees in a diff. */
export function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const a = before.split("\n");
  const b = after.split("\n");
  // Longest common subsequence of the two line lists.
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < a.length) removed.push(a[i++]);
  while (j < b.length) added.push(b[j++]);
  return { removed, added };
}

/**
 * The canonical text of one file, rendered from what the loader read out of it. A file that
 * is already canonical comes back unchanged (the parser is the inverse of the renderer).
 */
export function rerender(loaded: LoadedWorkspace, path: string): string | undefined {
  const lookup: DiagramLookup = (id) => loaded.diagrams[id];
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const id = Object.entries(loaded.issueDirs).find(([, d]) => d === dir)?.[0];
  const src = loaded.world.issues.find((i) => i.goal.id === id);
  if (src) {
    switch (name) {
      case "goal.md":
        return renderGoal(src, lookup);
      case "plan.md":
        return src.plan && renderPlan(src.plan, lookup);
      case "current_state.md":
        return src.state && renderState(src.state);
      case "changes.md":
        return src.changes.length ? renderChanges(src.changes) : undefined;
      case "decisions.md":
        return src.decisions.length ? renderDecisions(src.decisions) : undefined;
      case "learnings.md":
        return src.learnings.length ? renderLearnings(src.learnings) : undefined;
    }
  }
  const libId = Object.entries(loaded.libraryPaths).find(([, p]) => p === path)?.[0];
  const item = loaded.world.library.find((l) => l.id === libId);
  if (item) return renderLibraryItem(item);
  const groupId = Object.entries(loaded.groupDirs).find(([, d]) => `${d}/_group.md` === path)?.[0];
  const group = loaded.world.groups.find((g) => g.id === groupId);
  if (group) return renderGroup(group);
  return undefined;
}
