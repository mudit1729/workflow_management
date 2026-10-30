// Every library read at once: the tree and the pages of each, where each link goes, what links to
// each page (across libraries), which issues name each page, and the search index. Pure: it takes
// sources and the facts about the workspace's issues and returns a snapshot to ask questions of.
// The registry (`libraries.ts`) builds a new one whenever a source or the workspace changes.
import {
  formatAddress,
  githubFile,
  linkForm,
  nameOf,
  pageCandidates,
  parseAddress,
} from "@/features/library/address";
import { headingsOf } from "@/features/library/anchors";
import type {
  LibraryInfo,
  LibraryPage,
  LibraryPassage,
  LibraryScope,
  LibrarySource,
  LibraryTree,
  PageHeading,
  PageLink,
  PageMedia,
  PageRef,
  ResolvedAddress,
  UsedInIssue,
} from "@/lib/api/types";
import { rev } from "../util";
import { handle, list, readPage, str } from "./frontmatter";
import {
  extractImages,
  extractLinks,
  type PageEntry,
  type ResolveEnv,
  resolveLink,
  resolveMedia,
} from "./links";
import { buildSearchIndex, plainText, type SearchIndex, searchSections, tokenize } from "./search";
import { buildTree, humanize, type Layout, layoutOf, type PageFacts, trailOf } from "./tree";

/** What the corpus needs to know about the workspace's issues. */
export interface WorkspaceFacts {
  /** The alias of the workspace library. */
  alias: string;
  issues: {
    id: string;
    title: string;
    status: string;
    group_path: string[];
    /** The targets of the bullets under `## Links` in goal.md: `lib-4tz7c`, `platform:runbooks/x`. */
    links: string[];
  }[];
  /** Workspace library items cited anywhere in an issue: `lib-4tz7c` → issue ids. */
  cites: Record<string, string[]>;
}

interface IndexedPage {
  alias: string;
  path: string;
  title: string;
  titleFrom: PageFacts["titleFrom"];
  kind: string;
  section: boolean;
  text: string;
  body: string;
  lineOffset: number;
  frontmatter: Record<string, unknown>;
  headings: PageHeading[];
  links: PageLink[];
  media: Record<string, PageMedia>;
}

interface IndexedLibrary {
  source: LibrarySource;
  layout: Layout;
  tree: LibraryTree;
  pages: Map<string, IndexedPage>;
}

const UPDATED_KEYS = ["updated", "updated_at", "summarized_at", "last_reviewed"];
const AUTHOR_KEYS = ["summarized_by", "author", "owner", "reviewed_by"];

const WORDS_PER_MINUTE = 220;

export interface Corpus {
  aliases(): string[];
  info(alias: string): LibraryInfo | undefined;
  infos(): LibraryInfo[];
  tree(alias: string): LibraryTree | undefined;
  /** The page at `path` (`x` finds `x.md` or the page of the folder `x`), or undefined. */
  page(alias: string, path: string): LibraryPage | undefined;
  search(query: string, scope?: LibraryScope, k?: number): LibraryPassage[];
  backlinks(address: string): PageRef[];
  resolve(raw: string, from?: { alias: string; path: string }): ResolvedAddress;
  /** Pages of a library, as `alias:path`, in reading order. */
  addresses(alias: string): string[];
}

const refOf = (lib: IndexedLibrary, page: IndexedPage): PageRef => ({
  address: formatAddress(page),
  alias: page.alias,
  path: page.path,
  title: page.title,
  library: lib.source.name,
});

export function buildCorpus(sources: LibrarySource[], workspace?: WorkspaceFacts): Corpus {
  // ---- 1. pages: title, headings, kind
  const libs = new Map<string, IndexedLibrary>();
  for (const source of sources) {
    const layout = layoutOf(source);
    const pages = new Map<string, IndexedPage>();
    const facts = new Map<string, PageFacts>();
    for (const [path, text] of layout.pages) {
      const parsed = readPage(text);
      const headings = headingsOf(parsed.body);
      const fmTitle = str(parsed.data, "title");
      const h1 = headings.find((h) => h.depth === 1);
      const titleFrom: PageFacts["titleFrom"] = fmTitle ? "frontmatter" : h1 ? "heading" : "name";
      const title = fmTitle ?? h1?.text ?? humanize(nameOf(path));
      const order = Number(parsed.data.order);
      facts.set(path, {
        path,
        title,
        titleFrom,
        ...(str(parsed.data, "kind") ? { kind: str(parsed.data, "kind") } : {}),
        ...(str(parsed.data, "status") ? { status: str(parsed.data, "status") } : {}),
        ...(Number.isFinite(order) && parsed.data.order !== undefined ? { order } : {}),
      });
      pages.set(path, {
        alias: source.alias,
        path,
        title,
        titleFrom,
        kind: str(parsed.data, "kind") ?? (path === "glossary.md" ? "glossary" : "page"),
        section: false,
        text,
        body: parsed.body,
        lineOffset: parsed.lineOffset,
        frontmatter: parsed.data,
        headings,
        links: [],
        media: {},
      });
    }
    const tree = buildTree(layout, facts);
    // A page that is a folder's own page is that section's page.
    const stack = [...(tree.root.children ?? [])];
    while (stack.length) {
      const n = stack.pop();
      if (!n) break;
      if (n.type === "section") {
        const own = n.page ? pages.get(n.page) : undefined;
        if (own) {
          own.section = true;
          if (own.kind === "page") own.kind = "section";
        }
        stack.push(...(n.children ?? []));
      }
    }
    libs.set(source.alias, { source, layout, tree, pages });
  }

  // ---- 2. links and media, now that every page is known
  const items = new Map<string, { alias: string; path: string; title: string }>();
  if (workspace) {
    const ws = libs.get(workspace.alias);
    for (const page of ws?.pages.values() ?? []) {
      const id = str(page.frontmatter, "id");
      if (id && /^lib-/i.test(id))
        items.set(id.toLowerCase(), { alias: page.alias, path: page.path, title: page.title });
    }
  }
  const issues = new Map(workspace?.issues.map((i) => [i.id, i]));
  const entryOf = (p: IndexedPage): PageEntry => ({
    title: p.title,
    anchors: p.headings.map((h) => h.anchor),
  });
  const env: ResolveEnv = {
    library: (alias) => {
      const lib = libs.get(alias);
      if (!lib) return undefined;
      return {
        name: lib.source.name,
        pages: new Map([...lib.pages].map(([path, p]) => [path, entryOf(p)])),
        media: lib.layout.media,
        others: lib.layout.others,
      };
    },
    issue: (id) => issues.get(id),
    item: (id) => items.get(id.toLowerCase()),
  };
  // The env is rebuilt per call above; cache the map per alias so a page with many links stays cheap.
  const cache = new Map<string, ReturnType<ResolveEnv["library"]>>();
  const cached: ResolveEnv = {
    ...env,
    library: (alias) => {
      if (!cache.has(alias)) cache.set(alias, env.library(alias));
      return cache.get(alias);
    },
  };
  for (const lib of libs.values()) {
    for (const page of lib.pages.values()) {
      const site = { alias: page.alias, path: page.path };
      page.links = extractLinks(page.body).map((l) => resolveLink(l, site, cached));
      page.media = resolveMedia(extractImages(page.body), site, cached);
    }
  }

  // ---- 3. backlinks: every page that links to another, in any library
  const backlinks = new Map<string, PageRef[]>();
  for (const lib of libs.values()) {
    for (const page of lib.pages.values()) {
      const seen = new Set<string>();
      for (const link of page.links) {
        if (!link.address || !link.alias || !link.path) continue;
        const target = formatAddress({ alias: link.alias, path: link.path });
        if (target === formatAddress(page) || seen.has(target)) continue;
        seen.add(target);
        const list = backlinks.get(target) ?? [];
        list.push(refOf(lib, page));
        backlinks.set(target, list);
      }
    }
  }

  // ---- 4. used in issues: goal.md Links, and any file that cites a workspace item
  const used = new Map<string, Map<string, UsedInIssue>>();
  const mark = (address: string, issueId: string) => {
    const issue = issues.get(issueId);
    if (!issue) return;
    const byIssue = used.get(address) ?? new Map<string, UsedInIssue>();
    byIssue.set(issueId, {
      id: issue.id,
      title: issue.title,
      status: issue.status,
      group_path: issue.group_path,
    });
    used.set(address, byIssue);
  };
  if (workspace) {
    for (const issue of workspace.issues) {
      for (const target of issue.links) {
        const link = resolveLink(
          { syntax: "wiki", raw: target },
          { alias: workspace.alias, path: "" },
          cached,
        );
        if (link.ok && link.alias && link.path && link.form !== "issue")
          mark(formatAddress({ alias: link.alias, path: link.path }), issue.id);
      }
    }
    for (const [itemId, ids] of Object.entries(workspace.cites)) {
      const item = items.get(itemId.toLowerCase());
      if (item) for (const id of ids) mark(formatAddress(item), id);
    }
  }

  // ---- 5. search
  const index: SearchIndex = buildSearchIndex(
    [...libs.values()].flatMap((lib) =>
      [...lib.pages.values()].map((p) => ({
        alias: p.alias,
        library: lib.source.name,
        path: p.path,
        title: p.title,
        body: p.body,
      })),
    ),
  );

  // ---- queries
  const lookup = (
    alias: string,
    path: string,
  ): { lib: IndexedLibrary; page: IndexedPage } | undefined => {
    const lib = libs.get(alias);
    if (!lib) return undefined;
    for (const candidate of pageCandidates(path)) {
      const page = lib.pages.get(candidate);
      if (page) return { lib, page };
    }
    return undefined;
  };

  const infoOf = (lib: IndexedLibrary): LibraryInfo => {
    const s = lib.source;
    return {
      alias: s.alias,
      kind: s.kind,
      name: s.name,
      ...((s.description ?? lib.layout.manifest.description)
        ? { description: s.description ?? lib.layout.manifest.description }
        : {}),
      ...(s.url ? { url: s.url } : {}),
      ...(s.ref ? { ref: s.ref } : {}),
      ...(s.commit ? { commit: s.commit } : {}),
      ...(lib.layout.root ? { root: lib.layout.root } : {}),
      ...(s.access ? { access: s.access } : {}),
      ...(lib.layout.manifest.owner ? { owner: lib.layout.manifest.owner } : {}),
      pages: lib.pages.size,
      media: lib.layout.media.size,
      others: lib.layout.others.length,
      home: lib.tree.home,
      editable: s.kind === "personal",
      loaded: true,
    };
  };

  const pageModel = (lib: IndexedLibrary, page: IndexedPage): LibraryPage => {
    const s = lib.source;
    const address = formatAddress(page);
    const reading = lib.tree.pages;
    const at = reading.indexOf(page.path);
    const neighbour = (i: number): PageRef | null => {
      const p = lib.pages.get(reading[i] ?? "");
      return p ? refOf(lib, p) : null;
    };
    const section = lib.tree.root.children ? findSection(lib.tree, page.path) : undefined;
    const children: PageRef[] = [];
    for (const child of section?.children ?? []) {
      const path = child.type === "section" ? (child.page ?? firstPage(child)) : child.path;
      const p = path ? lib.pages.get(path) : undefined;
      if (p) children.push({ ...refOf(lib, p), title: child.title });
    }
    const links = page.links;
    const meta = s.meta?.[page.path];
    const updatedKey = UPDATED_KEYS.find((k) => str(page.frontmatter, k));
    const authorKey = AUTHOR_KEYS.find((k) => str(page.frontmatter, k));
    const authors = list(page.frontmatter, "authors");
    const author = authorKey ? str(page.frontmatter, authorKey) : (authors[0] ?? meta?.author);
    const updated = (updatedKey ? str(page.frontmatter, updatedKey) : undefined) ?? meta?.updated;
    const words = tokenize(plainText(page.body)).length;
    const id = str(page.frontmatter, "id");
    const file =
      s.origin?.[page.path] ?? (lib.layout.root ? `${lib.layout.root}/${page.path}` : page.path);
    return {
      address,
      alias: page.alias,
      path: page.path,
      title: page.title,
      kind: page.kind,
      section: page.section,
      library: s.name,
      libraryKind: s.kind,
      text: page.text,
      lineOffset: page.lineOffset,
      frontmatter: page.frontmatter,
      headings: page.headings,
      ...(updated ? { updated } : {}),
      ...(str(page.frontmatter, "created") ? { created: str(page.frontmatter, "created") } : {}),
      ...(author ? { author: handle(author) } : {}),
      read_minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
      links,
      broken: links.filter((l) => !l.ok),
      backlinks: backlinks.get(address) ?? [],
      used_in: [...(used.get(address)?.values() ?? [])],
      media: page.media,
      trail: trailOf(lib.tree, page.path),
      prev: at > 0 ? neighbour(at - 1) : null,
      next: at !== -1 && at < reading.length - 1 ? neighbour(at + 1) : null,
      children,
      file,
      rev: rev(page.text),
      ...(s.kind === "team" && githubFile({ url: s.url, ref: s.ref }, file)
        ? { github: githubFile({ url: s.url, ref: s.ref }, file) }
        : {}),
      ...(id && /^lib-/i.test(id) ? { item: id } : {}),
      ...(s.commit ? { commit: s.commit } : {}),
    };
  };

  return {
    aliases: () => [...libs.keys()],
    info: (alias) => {
      const lib = libs.get(alias);
      return lib ? infoOf(lib) : undefined;
    },
    infos: () => [...libs.values()].map(infoOf),
    tree: (alias) => libs.get(alias)?.tree,
    page: (alias, path) => {
      const hit = lookup(alias, path);
      return hit ? pageModel(hit.lib, hit.page) : undefined;
    },
    search: (query, scope = "all", k = 10) => {
      const aliases =
        scope === "all" || "pages" in scope
          ? undefined
          : "alias" in scope
            ? [scope.alias]
            : scope.aliases;
      const pages = scope !== "all" && "pages" in scope ? scope.pages.map(stripAnchor) : undefined;
      return searchSections(index, query, { aliases, pages, k });
    },
    backlinks: (address) => {
      const a = parseAddress(address);
      if (!a) return [];
      const hit = lookup(a.alias, a.path);
      return hit ? (backlinks.get(formatAddress(hit.page)) ?? []) : [];
    },
    resolve: (raw, from = { alias: workspace?.alias ?? "me", path: "" }) => {
      const link = resolveLink({ syntax: "wiki", raw }, from, cached);
      const out: ResolvedAddress = { raw, form: linkForm(raw, "wiki"), ok: link.ok };
      if (link.alias) out.alias = link.alias;
      if (link.path) out.path = link.path;
      if (link.anchor) out.anchor = link.anchor;
      if (link.address) out.address = link.address;
      if (link.title) out.title = link.title;
      if (link.issue) out.issue = link.issue;
      if (link.item) out.item = link.item;
      return out;
    },
    addresses: (alias) =>
      (libs.get(alias)?.tree.pages ?? []).map((path) => formatAddress({ alias, path })),
  };
}

const stripAnchor = (address: string) => {
  const hash = address.indexOf("#");
  return hash === -1 ? address : address.slice(0, hash);
};

function findSection(tree: LibraryTree, pagePath: string) {
  const walk = (
    nodes: NonNullable<LibraryTree["root"]["children"]>,
  ): LibraryTree["root"] | undefined => {
    for (const n of nodes) {
      if (n.type !== "section") continue;
      if (n.page === pagePath) return n;
      const hit = walk(n.children ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  if (tree.home === pagePath) return tree.root;
  return walk(tree.root.children ?? []);
}

function firstPage(node: LibraryTree["root"]): string | undefined {
  for (const c of node.children ?? []) {
    if (c.type === "page") return c.path;
    const p = c.page ?? firstPage(c);
    if (p) return p;
  }
  return undefined;
}
