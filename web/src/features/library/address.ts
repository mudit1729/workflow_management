// Page addresses and the forms a link can take. Pure, no React: the mock library model resolves
// links with it and the viewer builds URLs from it.
//
//   <alias>:<path>#<heading>      platform:runbooks/rotate-keys.md#rotate
//
// The personal library's alias is `me`. Paths are relative to the library root and use `/`.
import type { LinkForm } from "@/lib/api/types";

/** The alias of the person's own library. */
export const PERSONAL_ALIAS = "me";

export interface PageAddress {
  alias: string;
  path: string;
  anchor?: string;
}

/** `platform:runbooks/rotate-keys.md#rotate`. */
export function formatAddress({ alias, path, anchor }: PageAddress): string {
  return `${alias}:${path}${anchor ? `#${anchor}` : ""}`;
}

const ADDRESS = /^([A-Za-z0-9][\w-]*):(?!\/\/)(.*)$/;

/** Split an address into its parts. `undefined` when it has no `alias:` in front. */
export function parseAddress(raw: string): PageAddress | undefined {
  const m = ADDRESS.exec(raw.trim());
  if (!m) return undefined;
  const rest = m[2] ?? "";
  const hash = rest.indexOf("#");
  const path = normalizePath(hash === -1 ? rest : rest.slice(0, hash));
  const anchor = hash === -1 ? "" : rest.slice(hash + 1);
  return { alias: m[1] as string, path, ...(anchor ? { anchor: decode(anchor) } : {}) };
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** A path with `/` separators, no `./`, `..` or doubled slashes, and no slash at either end. */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** The folder of a path: `runbooks/x.md` → `runbooks`; a top-level file → "". */
export function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

/** The last segment of a path. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The path a relative href names when it is written in the page at `from`. `/x.md` is root-relative. */
export function resolveRelative(from: string, href: string): string {
  const clean = decode(href.split(/[?#]/)[0] ?? "");
  return normalizePath(clean.startsWith("/") ? clean : `${dirOf(from)}/${clean}`);
}

/** The `#anchor` of an href or a wiki target, decoded; empty when it has none. */
export function anchorOf(raw: string): string {
  const hash = raw.indexOf("#");
  return hash === -1 ? "" : decode(raw.slice(hash + 1));
}

/** An issue id (`wf-3k9x2`), alone or with an entry (`wf-3k9x2#D-7f3k2`). */
const ISSUE_REF = /^[a-z][a-z0-9]*-[0-9a-hjkmnp-tv-z]{5}(?:#.+)?$/i;
const ITEM_REF = /^lib-[0-9a-hjkmnp-tv-z]{5}$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export const isIssueRef = (s: string) => ISSUE_REF.test(s) && !ITEM_REF.test(s);
export const isItemRef = (s: string) => ITEM_REF.test(s);

/**
 * Which form a link is. `syntax` says how it was written: `md` for `[text](href)` and `wiki` for
 * `[[target]]`. Anything with a scheme in a markdown link is external.
 */
export function linkForm(raw: string, syntax: "md" | "wiki"): LinkForm {
  const t = raw.trim();
  if (syntax === "md") {
    if (SCHEME.test(t) || t.startsWith("//")) return "external";
    return t.startsWith("#") ? "anchor" : "relative";
  }
  if (t.startsWith("#")) return "anchor";
  if (isItemRef(t)) return "library-item";
  if (isIssueRef(t)) return "issue";
  return parseAddress(t) ? "alias" : "wiki";
}

/** The page paths a link target may mean: `x` → `x.md`, or the page of the folder `x`. */
export function pageCandidates(path: string): string[] {
  const p = normalizePath(path);
  if (!p) return ["index.md", "README.md", "readme.md", "_group.md"];
  if (/\.(md|markdown)$/i.test(p)) return [p];
  return [`${p}.md`, `${p}/index.md`, `${p}/README.md`, `${p}/readme.md`, `${p}/_group.md`, p];
}

/** A media file's kind from its name: `gif`, `video` (mp4, webm, mov, ogv, m4v) or `image`. */
export function mediaKind(path: string): "image" | "gif" | "video" | undefined {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(path)?.[1]?.toLowerCase();
  if (!ext) return undefined;
  if (ext === "gif") return "gif";
  if (["mp4", "webm", "mov", "ogv", "m4v"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "svg", "webp", "avif", "bmp", "ico"].includes(ext)) return "image";
  return undefined;
}

/**
 * Where a file of a library is on GitHub: `https://github.com/o/r/blob/<ref>/<root>/<path>`.
 * `path` is root-relative; a library without a GitHub address has none.
 */
export function githubFile(
  library: { url?: string; ref?: string; root?: string },
  path: string,
): string | undefined {
  if (!library.url || !/^https?:\/\/(www\.)?github\.com\//i.test(library.url)) return undefined;
  const root = library.root ? `${library.root.replace(/^\/+|\/+$/g, "")}/` : "";
  return `${library.url.replace(/\/+$/, "")}/blob/${library.ref ?? "HEAD"}/${root}${path}`;
}

/** Media files above this size are linked, not loaded (spec L7). */
export const LARGE_MEDIA_BYTES = 25 * 1024 * 1024;
