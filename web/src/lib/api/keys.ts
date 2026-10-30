// Query keys, in one place so live updates and writes invalidate the same entries.
import type { SearchScope } from "./types";

export const qk = {
  snapshot: () => ["snapshot"] as const,
  issue: (id: string) => ["issue", id] as const,
  library: (id: string) => ["library", id] as const,
  glossary: () => ["glossary"] as const,
  search: (q: string, scope: SearchScope, k: number) => ["search", scope, k, q] as const,
  context: (id: string, budget: number) => ["context", id, budget] as const,
  files: () => ["files"] as const,
  file: (path: string) => ["file", path] as const,
  /** Commits, pull requests and CI runs of one issue. */
  delivery: (issue: string) => ["delivery", issue] as const,
  /** Codex runs of one issue, or of all. */
  codexRuns: (issue?: string) => ["codex", "runs", issue ?? "all"] as const,
};
