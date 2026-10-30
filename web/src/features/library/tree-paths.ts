// Paths of a page tree. Pure.

/** The folder paths that hold a path, outermost first: `a/b/c.md` → `a`, `a/b`. */
export function foldersOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean).slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}
