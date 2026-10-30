// A library source becomes a page tree (spec 4.2). Folders are sections; `index.md`, `README.md`
// or `_group.md` is a section's own page. A page is titled by its frontmatter `title`, else its
// first `#` heading, else its file name. Order: the manifest's `nav.order`, then the page's
// `order:` frontmatter, then alphabetical by title.
import { nameOf, normalizePath, pageCandidates } from "@/features/library/address";
import { foldersOf } from "@/features/library/tree-paths";
import type { LibraryMedia, LibrarySource, LibraryTree, LibraryTreeNode } from "@/lib/api/types";
import { findLibraryRoot, type LibraryManifest, readManifest } from "./manifest";

/** What a library source holds, relative to the library root. */
export interface Layout {
  alias: string;
  /** The folder of the repo that holds the library; "" is the repo root. */
  root: string;
  manifest: LibraryManifest;
  /** Markdown pages by root-relative path. */
  pages: Map<string, string>;
  media: Map<string, LibraryMedia>;
  /** Root-relative paths of the files that are neither markdown nor media. */
  others: string[];
}

/** Files that configure a library; they are not "other files". */
const CONFIG = new Set(["wf-library.toml", "library.toml", "libraries.toml"]);

const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);
const isHidden = (path: string) =>
  path.split("/").some((s) => s.startsWith(".") || s === "node_modules");

/** Sort the files of a source into pages, media and others, under the library root. */
export function layoutOf(source: LibrarySource): Layout {
  const files = Object.fromEntries(
    Object.entries(source.files).map(([p, t]) => [normalizePath(p), t]),
  );
  const manifest = readManifest(files);
  const root =
    source.root !== undefined
      ? normalizePath(source.root)
      : findLibraryRoot(Object.keys(files), { manifest }).root;
  const inside = (path: string): string | undefined => {
    if (!root) return path;
    return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
  };

  const pages = new Map<string, string>();
  const others: string[] = [];
  for (const path of Object.keys(files).sort()) {
    const rel = inside(path);
    if (rel === undefined || isHidden(rel) || path in source.media) continue;
    if (isMarkdown(rel)) pages.set(rel, files[path] as string);
    else if (!CONFIG.has(nameOf(rel))) others.push(rel);
  }
  for (const path of source.others ?? []) {
    const rel = inside(normalizePath(path));
    if (rel !== undefined && !isHidden(rel) && !CONFIG.has(nameOf(rel)) && !others.includes(rel))
      others.push(rel);
  }
  const media = new Map<string, LibraryMedia>();
  for (const [path, m] of Object.entries(source.media)) {
    const rel = inside(normalizePath(path));
    if (rel !== undefined && !isHidden(rel)) media.set(rel, m);
  }
  return { alias: source.alias, root, manifest, pages, media, others: others.sort() };
}

// ---------------------------------------------------------------- titles

/** `rotate-keys.md` → `Rotate keys`: the file name read as words. */
export function humanize(name: string): string {
  const words = name
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? words[0]?.toUpperCase() + words.slice(1) : name;
}

/** What the tree needs to know about a page, read from its text once. */
export interface PageFacts {
  path: string;
  title: string;
  /** Where the title came from: the frontmatter, the first `#` heading, or the file name. */
  titleFrom: "frontmatter" | "heading" | "name";
  kind?: string;
  status?: string;
  order?: number;
}

// ---------------------------------------------------------------- the tree

const SECTION_PAGES = ["index.md", "readme.md", "_group.md"];

/** The section's own page among the files of its folder, `index.md` first. */
export function sectionPageOf(pages: string[]): string | undefined {
  for (const name of SECTION_PAGES) {
    const hit = pages.find((p) => nameOf(p).toLowerCase() === name);
    if (hit) return hit;
  }
  return undefined;
}

interface Dir {
  path: string;
  pages: string[];
  dirs: Map<string, Dir>;
}

function dirTree(paths: string[]): Dir {
  const root: Dir = { path: "", pages: [], dirs: new Map() };
  for (const path of paths) {
    let dir = root;
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i] as string;
      let next = dir.dirs.get(seg);
      if (!next) {
        next = { path: dir.path ? `${dir.path}/${seg}` : seg, pages: [], dirs: new Map() };
        dir.dirs.set(seg, next);
      }
      dir = next;
    }
    dir.pages.push(path);
  }
  return root;
}

const collate = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** The home page of a library: the manifest's `home`, else the root's own page, else none. */
export function homeOf(layout: Layout): string | null {
  const named = layout.manifest.home ? normalizePath(layout.manifest.home) : undefined;
  if (named) {
    const hit = pageCandidates(named).find((p) => layout.pages.has(p));
    if (hit) return hit;
  }
  return sectionPageOf([...layout.pages.keys()].filter((p) => !p.includes("/"))) ?? null;
}

/** Build the tree of a library from its layout and the facts of each page. */
export function buildTree(layout: Layout, facts: Map<string, PageFacts>): LibraryTree {
  const home = homeOf(layout);
  const order = layout.manifest.order;
  const factsOf = (path: string): PageFacts =>
    facts.get(path) ?? { path, title: humanize(nameOf(path)), titleFrom: "name" };

  /** Position in the manifest's order, matched by name or by path; unlisted names come last. */
  const listed = (name: string, path: string) => {
    const i = order.findIndex((o) => o === name || o === path || o === path.replace(/\.md$/i, ""));
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };

  type Keyed = { node: LibraryTreeNode; key: [number, number, string]; path: string };
  const keyed = (node: LibraryTreeNode, name: string, own: PageFacts | undefined): Keyed => ({
    node,
    path: node.path,
    key: [listed(name, node.path), own?.order ?? Number.POSITIVE_INFINITY, node.title],
  });
  const compare = (a: Keyed, b: Keyed) =>
    a.key[0] - b.key[0] ||
    a.key[1] - b.key[1] ||
    collate.compare(a.key[2], b.key[2]) ||
    collate.compare(a.path, b.path);

  function pageNode(path: string): Keyed {
    const f = factsOf(path);
    const node: LibraryTreeNode = {
      type: "page",
      path,
      title: f.title,
      chars: layout.pages.get(path)?.length ?? 0,
    };
    if (f.kind) node.kind = f.kind;
    if (f.status) node.status = f.status;
    return keyed(node, nameOf(path).replace(/\.(md|markdown)$/i, ""), f);
  }

  function sectionNode(dir: Dir): Keyed | undefined {
    const own = sectionPageOf(dir.pages);
    const children: Keyed[] = [];
    for (const sub of dir.dirs.values()) {
      const child = sectionNode(sub);
      if (child) children.push(child);
    }
    for (const page of dir.pages) if (page !== own) children.push(pageNode(page));
    if (children.length === 0) return own ? pageNode(own) : undefined;
    children.sort(compare);
    const f = own ? factsOf(own) : undefined;
    const name = nameOf(dir.path);
    const title = f && f.titleFrom !== "name" ? f.title : humanize(name);
    const nodes = children.map((c) => c.node);
    const node: LibraryTreeNode = {
      type: "section",
      path: dir.path,
      title,
      count: nodes.reduce((n, c) => n + (c.type === "section" ? (c.count ?? 0) : 1), own ? 1 : 0),
      chars: nodes.reduce(
        (n, c) => n + (c.chars ?? 0),
        own ? (layout.pages.get(own)?.length ?? 0) : 0,
      ),
      children: nodes,
    };
    if (own) node.page = own;
    if (f?.kind) node.kind = f.kind;
    return keyed(node, name, f);
  }

  const top = dirTree([...layout.pages.keys()].filter((p) => p !== home));
  const children: Keyed[] = [];
  for (const sub of top.dirs.values()) {
    const child = sectionNode(sub);
    if (child) children.push(child);
  }
  for (const page of top.pages) children.push(pageNode(page));
  children.sort(compare);
  const nodes = children.map((c) => c.node);
  const root: LibraryTreeNode = {
    type: "section",
    path: "",
    title: "",
    count: layout.pages.size,
    children: nodes,
  };
  if (home) root.page = home;

  const reading: string[] = home ? [home] : [];
  const walk = (list: LibraryTreeNode[]) => {
    for (const n of list) {
      if (n.type === "page") reading.push(n.path);
      else {
        if (n.page) reading.push(n.page);
        walk(n.children ?? []);
      }
    }
  };
  walk(nodes);
  return { alias: layout.alias, root, home, pages: reading, others: layout.others };
}

/** The sections that hold a page, from the root down (not the root, not the page's own section). */
export function trailOf(
  tree: LibraryTree,
  path: string,
): { title: string; path: string; page?: string }[] {
  const out: { title: string; path: string; page?: string }[] = [];
  let nodes = tree.root.children ?? [];
  for (const folder of foldersOf(path)) {
    const section = nodes.find((n) => n.type === "section" && n.path === folder);
    // A section's own page sits in its folder, but it is the section, not inside it.
    if (!section || section.page === path) break;
    out.push({
      title: section.title,
      path: section.path,
      ...(section.page ? { page: section.page } : {}),
    });
    nodes = section.children ?? [];
  }
  return out;
}
