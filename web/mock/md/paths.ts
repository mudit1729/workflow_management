// Workspace paths: normalising, splitting and the scanner's ignore list (contract 1.2).

/** A workspace-relative path with `/` separators and no leading `./` or `/`. */
export const normPath = (p: string) =>
  p
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");

/** The last segment of a path. */
export const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** A path without its last segment ("" for a top-level file). */
export const parentDir = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

const SKIP_DIRS = new Set([".git", ".wf", "node_modules"]);

/** Files the scanner ignores (contract 1.2). */
export function isIgnored(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  const name = parts[parts.length - 1];
  return (
    name === ".DS_Store" ||
    name === "4913" ||
    name.endsWith("~") ||
    name.endsWith(".swp") ||
    name.startsWith(".#") ||
    name.startsWith(".wf-tmp-")
  );
}
