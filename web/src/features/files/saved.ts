// What a saved file changes, in words: which screen read it again and where to look. A library
// item shows in the Library, glossary.md in the Glossary, everything else drives the Workflow
// board. Pure, so the toast copy can be tested without a router.

export type SavedTarget =
  | { kind: "board" }
  // `id` is the item's id from its frontmatter, when the text has one.
  | { kind: "library"; id?: string }
  | { kind: "glossary" };

/** The `id:` of a library item's frontmatter, e.g. `lib-4tz7c`. */
function libraryIdOf(text: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  return /^id:\s*["']?(lib-[0-9a-z]+)["']?\s*$/m.exec(frontmatter)?.[1];
}

/** Where the change of `path` shows. `text` is what was saved (it names the library item's id). */
export function savedTarget(path: string, text: string, libraryDir = "library"): SavedTarget {
  if (path === "glossary.md") return { kind: "glossary" };
  const dir = `${libraryDir.replace(/\/+$/, "")}/`;
  if (path.startsWith(dir) && path.endsWith(".md")) {
    return { kind: "library", id: libraryIdOf(text) };
  }
  return { kind: "board" };
}

/** The tail of the toast ("Saved goal.md · the board re-read it") and the label of its action. */
export function savedCopy(target: SavedTarget): { reread: string; action: string } {
  switch (target.kind) {
    case "library":
      return {
        reread: "the library re-read it",
        action: target.id ? "Open library item" : "Open Library",
      };
    case "glossary":
      return { reread: "the glossary re-read it", action: "Open Glossary" };
    case "board":
      return { reread: "the board re-read it", action: "Open Workflow" };
  }
}
