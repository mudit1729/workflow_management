// Where Ask library looks (spec section 6): chips that stand for sets of pages, the pages they
// add up to, and the size line beside them ("12 pages · ~9k tokens"). Pure: the panel reads the
// libraries and hands the facts in.
import { estimateTokens } from "@/features/context/links";
import { tokenCount } from "@/features/issue/handoff";
import type { LibraryInfo, LibraryTree, LibraryTreeNode } from "@/lib/api/types";

/** What the person chose. */
export interface Selection {
  /** "Linked to this issue": the pages of its `## Links`. */
  linked: boolean;
  /** One chip per library: the whole library. */
  libraries: string[];
  /** "Pick pages…" and "Ask about this page": single pages, as `alias:path`. */
  pages: string[];
}

export const EMPTY_SELECTION: Selection = { linked: false, libraries: [], pages: [] };

/** `alias:path` of a page, without a `#heading` (the heading is a section of the page). */
export const pageOf = (address: string): string => address.split("#")[0] ?? address;

export interface PageFact {
  address: string;
  title: string;
  /** Characters of the file. */
  chars: number;
}

/**
 * Every page of a library tree, in reading order, with its size. A section's own page is not a
 * node of the tree: its size is what the section holds beyond its children. The home page has no
 * size in the tree and counts as empty.
 */
export function treePages(tree: LibraryTree): PageFact[] {
  const facts = new Map<string, { title: string; chars: number }>();
  const walk = (n: LibraryTreeNode) => {
    const children = n.children ?? [];
    if (n.type === "page") facts.set(n.path, { title: n.title, chars: n.chars ?? 0 });
    else if (n.page) {
      const below = children.reduce((sum, c) => sum + (c.chars ?? 0), 0);
      facts.set(n.page, { title: n.title, chars: Math.max(0, (n.chars ?? 0) - below) });
    }
    for (const c of children) walk(c);
  };
  walk(tree.root);
  return tree.pages.map((path) => ({
    address: `${tree.alias}:${path}`,
    title: facts.get(path)?.title || path,
    chars: facts.get(path)?.chars ?? 0,
  }));
}

export interface ScopeFacts {
  /** The pages of "Linked to this issue", resolved (a `lib-` item is its page). */
  linked: string[];
  /** Every page of the libraries the person may choose, by address. */
  pages: Map<string, PageFact>;
  /** The pages of each library, in reading order. */
  byLibrary: Map<string, string[]>;
}

/** The pages a selection stands for, once each, in the order chips come. */
export function scopeAddresses(selection: Selection, facts: ScopeFacts): string[] {
  const out = new Set<string>();
  if (selection.linked) for (const a of facts.linked) out.add(pageOf(a));
  for (const alias of selection.libraries)
    for (const a of facts.byLibrary.get(alias) ?? []) out.add(a);
  for (const a of selection.pages) out.add(pageOf(a));
  return [...out];
}

export interface ScopeSize {
  pages: number;
  tokens: number;
}

export function scopeSize(addresses: string[], facts: Pick<ScopeFacts, "pages">): ScopeSize {
  let chars = 0;
  for (const a of addresses) chars += facts.pages.get(a)?.chars ?? 0;
  return { pages: addresses.length, tokens: estimateTokens(chars) };
}

/** "12 pages · ~9k tokens". */
export function sizeLine({ pages, tokens }: ScopeSize): string {
  return `${pages} ${pages === 1 ? "page" : "pages"} · ${tokenCount(tokens)} tokens`;
}

/** More than this and the agent reads a lot: the line says so. */
export const LARGE_SCOPE_TOKENS = 40_000;
/** The most pages one question reads. */
export const MAX_SCOPE_PAGES = 150;

/** Libraries in the order chips come: the workspace library first (as the nav lists them). */
export const chipLibraries = (libraries: LibraryInfo[]): LibraryInfo[] =>
  libraries.filter((l) => l.loaded && l.pages > 0);
