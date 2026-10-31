// The links of a page and where they go. Every form of spec section 5:
//
//   [text](../runbooks/x.md)       relative      a page in the same library
//   [[runbooks/x]]  [[runbooks/x#rotate]]   wiki  a page or heading in the same library
//   [[platform:runbooks/x]]        alias         a page in another library
//   [[wf-3k9x2]]                   issue         an issue (and `#D-7f3k2`, an entry of it)
//   [[lib-6pm4c]]                  library-item  a workspace library item
//   [[#rotate]]  [text](#rotate)   anchor        a heading of this page
//   [text](https://…)              external
//
// `extractLinks` reads them from a body (code is skipped), `resolveLink` says where one goes.
import {
  anchorOf,
  formatAddress,
  linkForm,
  mediaKind,
  normalizePath,
  pageCandidates,
  parseAddress,
  resolveRelative,
} from "@/features/library/address";
import { slugify } from "@/features/library/anchors";
import type { LibraryMedia, LinkForm, PageLink, PageMedia } from "@/lib/api/types";

export interface RawLink {
  syntax: "md" | "wiki";
  /** The href, or the text inside `[[ ]]` without its label. */
  raw: string;
  /** The text of a markdown link, or the label of `[[target|label]]`. */
  label?: string;
}

export interface RawImage {
  alt: string;
  src: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const MD_LINK = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
// The same grammar as `remark-wf`: no spaces in the target, an optional `|label`.
const WIKI_LINK = /\[\[([^[\]\s|]+)(?:\|([^[\]]+))?\]\]/g;

/** The prose lines of a body: fenced code and inline code spans blanked out. */
function proseLines(body: string): string[] {
  const out: string[] = [];
  let fence: string | undefined;
  for (const line of body.split("\n")) {
    const open = FENCE.exec(line);
    if (open) {
      const mark = (open[1] ?? "```")[0] as string;
      if (!fence) fence = mark;
      else if (fence === mark && line.trim().length === (open[1] ?? "").length) fence = undefined;
      out.push("");
      continue;
    }
    out.push(fence ? "" : line.replace(/`+[^`]*`+/g, (m) => " ".repeat(m.length)));
  }
  return out;
}

/** Every link of a body in reading order, each distinct one once. Images are not links. */
export function extractLinks(body: string): RawLink[] {
  const seen = new Set<string>();
  const out: RawLink[] = [];
  const add = (link: RawLink) => {
    const key = `${link.syntax}:${link.raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(link);
  };
  for (const line of proseLines(body)) {
    // An image inside a link (`[![poster](p.png)](https://…)`) leaves its alt text as the label.
    const flat = line.replace(IMAGE, "$1");
    const found: { at: number; link: RawLink }[] = [];
    for (const m of flat.matchAll(MD_LINK))
      found.push({ at: m.index ?? 0, link: { syntax: "md", raw: m[2] as string, label: m[1] } });
    for (const m of flat.matchAll(WIKI_LINK))
      found.push({
        at: m.index ?? 0,
        link: { syntax: "wiki", raw: m[1] as string, ...(m[2] ? { label: m[2] } : {}) },
      });
    for (const { link } of found.sort((a, b) => a.at - b.at)) add(link);
  }
  return out;
}

/** Every image of a body (`![alt](src)`), each distinct `src` once. */
export function extractImages(body: string): RawImage[] {
  const seen = new Set<string>();
  const out: RawImage[] = [];
  for (const line of proseLines(body)) {
    for (const m of line.matchAll(IMAGE)) {
      const src = m[2] as string;
      if (seen.has(src)) continue;
      seen.add(src);
      out.push({ alt: m[1] ?? "", src });
    }
  }
  return out;
}

// ---------------------------------------------------------------- where a link goes

/** The page of a library as the resolver needs it. */
export interface PageEntry {
  title: string;
  /** The anchors of its headings. */
  anchors: string[];
}

export interface ResolveEnv {
  /** A library by alias: its name, its pages by root-relative path, its media and other files. */
  library(alias: string):
    | {
        name: string;
        pages: ReadonlyMap<string, PageEntry>;
        media: ReadonlyMap<string, LibraryMedia>;
        others: readonly string[];
      }
    | undefined;
  issue(id: string): { title: string } | undefined;
  /** A workspace library item by its id. */
  item(id: string): { alias: string; path: string; title: string } | undefined;
}

export interface LinkSite {
  alias: string;
  /** The page the link is written in. */
  path: string;
}

/** The first page the target may mean: `x` is `x.md`, or the page of the folder `x`. */
function findPage(
  pages: ReadonlyMap<string, PageEntry>,
  path: string,
): { path: string; entry: PageEntry } | undefined {
  for (const candidate of pageCandidates(path)) {
    const entry = pages.get(candidate);
    if (entry) return { path: candidate, entry };
  }
  return undefined;
}

const hasAnchor = (entry: PageEntry, anchor: string) =>
  entry.anchors.includes(anchor) || entry.anchors.includes(slugify(anchor));

/** Resolve a link written in the page at `from`. Never throws; a link that goes nowhere is `ok: false`. */
export function resolveLink(link: RawLink, from: LinkSite, env: ResolveEnv): PageLink {
  const raw = link.raw.trim();
  const form = linkForm(raw, link.syntax);
  const base: PageLink = {
    raw: link.raw,
    form,
    ok: false,
    ...(link.label ? { label: link.label } : {}),
  };

  /** A page of `alias` at `path` (a heading optional): the shared tail of three forms. */
  const toPage = (alias: string, path: string, anchor: string, tryFrom?: string): PageLink => {
    const lib = env.library(alias);
    if (!lib) return { ...base, missing: "library", alias };
    let hit = findPage(lib.pages, path);
    if (!hit && tryFrom !== undefined) hit = findPage(lib.pages, resolveRelative(tryFrom, path));
    if (!hit) {
      // Not a page: a media or other file of the library still counts as there.
      const file = normalizePath(path);
      const media = lib.media.get(file);
      if (media) return { ...base, ok: true, alias, path: file, href: media.url };
      if (lib.others.includes(file)) return { ...base, ok: true, alias, path: file };
      return { ...base, missing: "page", alias, path: normalizePath(path) };
    }
    const found = anchor ? hasAnchor(hit.entry, anchor) : true;
    const anchorName =
      anchor && found ? (hit.entry.anchors.includes(anchor) ? anchor : slugify(anchor)) : anchor;
    return {
      ...base,
      ok: found,
      ...(found ? {} : { missing: "heading" as const }),
      alias,
      path: hit.path,
      ...(anchorName ? { anchor: anchorName } : {}),
      address: formatAddress({
        alias,
        path: hit.path,
        ...(anchorName ? { anchor: anchorName } : {}),
      }),
      title: hit.entry.title,
    };
  };

  switch (form) {
    case "external":
      return { ...base, ok: true, href: raw };
    case "anchor":
      return toPage(from.alias, from.path, anchorOf(raw));
    case "relative":
      return toPage(from.alias, resolveRelative(from.path, raw), anchorOf(raw));
    case "wiki": {
      const hash = raw.indexOf("#");
      const path = hash === -1 ? raw : raw.slice(0, hash);
      return toPage(from.alias, normalizePath(path), anchorOf(raw), from.path);
    }
    case "alias": {
      const addr = parseAddress(raw);
      if (!addr) return { ...base, missing: "page" };
      return toPage(addr.alias, addr.path, addr.anchor ?? "");
    }
    case "library-item": {
      const item = env.item(raw.toLowerCase());
      if (!item) return { ...base, missing: "item", item: raw };
      return {
        ...base,
        ok: true,
        item: raw,
        alias: item.alias,
        path: item.path,
        address: formatAddress(item),
        title: item.title,
      };
    }
    case "issue": {
      const hash = raw.indexOf("#");
      const id = hash === -1 ? raw : raw.slice(0, hash);
      const issue = env.issue(id);
      if (issue)
        return {
          ...base,
          ok: true,
          issue: id,
          ...(hash === -1 ? {} : { entry: raw.slice(hash + 1) }),
          title: issue.title,
        };
      // `quick-start` looks like an issue id: a page of that name wins over a missing issue.
      const page = toPage(
        from.alias,
        normalizePath(id),
        hash === -1 ? "" : anchorOf(raw),
        from.path,
      );
      return page.missing === "page" ? { ...base, missing: "issue", issue: id } : page;
    }
  }
}

// ---------------------------------------------------------------- media

/** Resolve the images of a page against the library's media. */
export function resolveMedia(
  images: RawImage[],
  from: LinkSite,
  env: Pick<ResolveEnv, "library">,
): Record<string, PageMedia> {
  const out: Record<string, PageMedia> = {};
  const lib = env.library(from.alias);
  for (const { src } of images) {
    const kind = mediaKind(src) ?? "image";
    if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) {
      out[src] = { src, kind, url: src, external: true };
      continue;
    }
    const file = resolveRelative(from.path, src);
    const media = lib?.media.get(file);
    out[src] = media
      ? { src, kind: mediaKind(file) ?? kind, url: media.url, bytes: media.bytes }
      : { src, kind, missing: true };
  }
  return out;
}

export type { LinkForm };
