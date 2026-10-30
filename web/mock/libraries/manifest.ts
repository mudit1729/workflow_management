// The optional manifest of a library repo (`wf-library.toml`, spec 4.2) and the personal library's
// own `library.toml`, plus the rules that find the library inside a repo. A repo works without
// either: the manifest only names things and gives an order.
//
//   name = "Platform handbook"
//   description = "How the platform team builds, ships and runs things."
//   root = "docs"
//   home = "README.md"
//   [nav]
//   order = ["getting-started", "runbooks", "architecture"]
//   [owners]
//   handles = ["@ana", "@li"]
import { parse } from "smol-toml";
import { normalizePath } from "@/features/library/address";

export interface LibraryManifest {
  name?: string;
  description?: string;
  /** The folder of the repo that holds the library. */
  root?: string;
  /** The home page, root-relative. */
  home?: string;
  /** Names (a folder, or a file without `.md`) in the order the tree shows them. */
  order: string[];
  owners: string[];
  /** A personal library: whose it is. */
  owner?: string;
  url?: string;
  kind?: string;
  /** Why the file could not be read, when it could not. */
  problem?: string;
}

const text = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const texts = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/** Read a manifest's text. A file that is not valid TOML gives an empty manifest with a `problem`. */
export function parseManifest(source: string | undefined): LibraryManifest {
  const empty: LibraryManifest = { order: [], owners: [] };
  if (source === undefined) return empty;
  let data: Record<string, unknown>;
  try {
    data = parse(source) as Record<string, unknown>;
  } catch (err) {
    return { ...empty, problem: err instanceof Error ? err.message : String(err) };
  }
  const nav = (data.nav ?? {}) as Record<string, unknown>;
  const owners = (data.owners ?? {}) as Record<string, unknown>;
  return {
    name: text(data.name),
    description: text(data.description),
    root: typeof data.root === "string" ? normalizePath(data.root) : undefined,
    home: text(data.home),
    order: texts(nav.order),
    owners: texts(owners.handles),
    owner: text(data.owner),
    url: text(data.url),
    kind: text(data.kind),
  };
}

/** The manifest of a repo: `wf-library.toml`, else a personal `library.toml`, at its root. */
export function readManifest(files: Record<string, string>): LibraryManifest {
  const own = files["wf-library.toml"] ?? files["library.toml"];
  return parseManifest(own);
}

/** Folders that may hold a library, in the order spec 4.2 tries them. */
export const KNOWN_ROOTS = ["library", "docs", "wiki", "handbook"];

const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);

export interface RootChoice {
  /** The folder; "" is the repo root. */
  root: string;
  /** How it was found. */
  by: "link" | "manifest" | "folder" | "repo";
}

/** Folders of the known names that hold markdown, with how many pages each holds. */
export function rootCandidates(paths: string[]): { root: string; pages: number }[] {
  return KNOWN_ROOTS.map((root) => ({
    root,
    pages: paths.filter((p) => p.startsWith(`${root}/`) && isMarkdown(p)).length,
  })).filter((c) => c.pages > 0);
}

/**
 * Where the library is in a repo (spec 4.2): the path in the link, else the manifest's `root`,
 * else the first of `library/`, `docs/`, `wiki/`, `handbook/` that holds markdown, else the
 * repo root. A path or a root that holds no markdown is skipped.
 */
export function findLibraryRoot(
  paths: string[],
  options: { hint?: string; manifest?: LibraryManifest } = {},
): RootChoice {
  const holds = (root: string) =>
    paths.some((p) => isMarkdown(p) && (root === "" || p.startsWith(`${root}/`)));
  const hint = options.hint === undefined ? undefined : normalizePath(options.hint);
  if (hint && holds(hint)) return { root: hint, by: "link" };
  const root = options.manifest?.root;
  if (root !== undefined && root !== "" && holds(root)) return { root, by: "manifest" };
  const known = rootCandidates(paths)[0];
  if (known) return { root: known.root, by: "folder" };
  return { root: "", by: "repo" };
}
