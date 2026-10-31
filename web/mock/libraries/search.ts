// Section-level search over libraries: BM25 over a page's title, the headings above a section and
// the section's text. A section runs from one heading (levels 1 to 3) to the next, so a hit is a
// passage with an address (`alias:path#heading`), not a whole page. The query returns ranked
// passages with the matching words marked.
//
// It is pure (no store, no React) and shared: the library search box calls it through the API,
// and the Ask panel builds its five best passages from the same function.
import { formatAddress } from "@/features/library/address";
import { headingsOf } from "@/features/library/anchors";
import type { LibraryPassage } from "@/lib/api/types";

/** What the index needs to know about a page. */
export interface SearchablePage {
  alias: string;
  /** The library's name, for the results. */
  library: string;
  path: string;
  title: string;
  /** The markdown after the frontmatter. */
  body: string;
}

interface Section {
  alias: string;
  library: string;
  path: string;
  pageTitle: string;
  /** `Procedure › Step 2`; empty for the lead of a page. */
  heading: string;
  anchor?: string;
  /** Plain text of the section, headings excluded. */
  text: string;
  /** Weighted term counts of title, heading and text. */
  tf: Map<string, number>;
  /** Words in the section, the title and the heading, unweighted. */
  length: number;
}

export interface SearchIndex {
  sections: Section[];
  avgLength: number;
  /** Every stem in the index. */
  vocab: string[];
}

// ---------------------------------------------------------------- words

const STOP = new Set(
  "a an and are as at be by for from how i in into is it of on or that the this to was we what when where which with you your".split(
    " ",
  ),
);

/** The words of a text, lowercased. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** A light stem, so `rotating`, `rotated` and `rotates` meet `rotate`, and `keys` meets `key`. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("es") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) w = w.slice(0, -1);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

/** Markdown reduced to the words a reader sees. */
export function plainText(md: string): string {
  return md
    .replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^[\]\s|]+)\|([^[\]]+)\]\]/g, "$2")
    .replace(/\[\[([^[\]\s]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?(\[![A-Z]+\])?/gm, "")
    .replace(/^[ \t]*([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/gm, "")
    .replace(/[|]/g, " ")
    .replace(/(\*\*|__|\*|_|`|~~)/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ---------------------------------------------------------------- sections

const W_TITLE = 3;
const W_HEADING = 2;
/** Headings of these levels start a new section. */
const SECTION_DEPTH = 3;

/** Split a page into the sections that are searched. */
export function sectionsOf(page: SearchablePage): Omit<Section, "tf" | "length">[] {
  const lines = page.body.split("\n");
  const heads = headingsOf(page.body).filter((h) => h.depth <= SECTION_DEPTH);
  const out: Omit<Section, "tf" | "length">[] = [];
  const base = { alias: page.alias, library: page.library, path: page.path, pageTitle: page.title };

  const stack: { depth: number; text: string }[] = [];
  const take = (from: number, to: number) => plainText(lines.slice(from, to).join("\n"));

  const first = heads[0];
  const lead = take(0, first ? first.line - 1 : lines.length);
  if (lead || !first) out.push({ ...base, heading: "", text: lead });

  heads.forEach((h, i) => {
    while (stack.length && (stack[stack.length - 1]?.depth ?? 0) >= h.depth) stack.pop();
    stack.push({ depth: h.depth, text: h.text });
    const next = heads[i + 1];
    const text = take(h.line, next ? next.line - 1 : lines.length);
    // A level-1 heading is the page's title: its section is the lead of the page.
    const path = stack.filter((s) => s.depth >= 2).map((s) => s.text);
    out.push({
      ...base,
      heading: path.join(" › "),
      ...(h.depth >= 2 ? { anchor: h.anchor } : {}),
      text,
    });
  });
  return out;
}

/** Build the index of a set of pages. */
export function buildSearchIndex(pages: SearchablePage[]): SearchIndex {
  const sections: Section[] = [];
  const vocab = new Set<string>();
  for (const page of pages) {
    for (const s of sectionsOf(page)) {
      const tf = new Map<string, number>();
      const bump = (words: string[], weight: number) => {
        for (const w of words) {
          const t = stem(w);
          vocab.add(t);
          tf.set(t, (tf.get(t) ?? 0) + weight);
        }
      };
      const title = tokenize(s.pageTitle);
      const heading = tokenize(s.heading);
      const text = tokenize(s.text);
      bump(title, W_TITLE);
      bump(heading, W_HEADING);
      bump(text, 1);
      sections.push({ ...s, tf, length: title.length + heading.length + text.length });
    }
  }
  const total = sections.reduce((n, s) => n + s.length, 0);
  return { sections, avgLength: sections.length ? total / sections.length : 1, vocab: [...vocab] };
}

// ---------------------------------------------------------------- query

const K1 = 1.2;
const B = 0.75;
/** A match by prefix (`rota` for `rotate`) counts for less than a whole word. */
const PREFIX_WEIGHT = 0.5;

export interface SearchOptions {
  /** Look in these libraries only. */
  aliases?: string[];
  /** Look in these pages only, as `alias:path`. */
  pages?: string[];
  /** How many passages to return. Default 10. */
  k?: number;
}

/** The query terms: stems, stop words dropped unless nothing else is left. */
export function queryTerms(query: string): string[] {
  const all = tokenize(query);
  const kept = all.filter((w) => !STOP.has(w));
  return [...new Set((kept.length ? kept : all).map(stem))];
}

/** The index stems a query stem matches, with how much each counts. */
function expand(term: string, vocab: string[]): Map<string, number> {
  const out = new Map<string, number>([[term, 1]]);
  if (term.length >= 3)
    for (const w of vocab) if (w !== term && w.startsWith(term)) out.set(w, PREFIX_WEIGHT);
  return out;
}

const normalized = (text: string) => tokenize(text).join(" ");

/** Rank the sections of an index for a query. Passages come best first. */
export function searchSections(
  index: SearchIndex,
  query: string,
  options: SearchOptions = {},
): LibraryPassage[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const aliases = options.aliases ? new Set(options.aliases) : undefined;
  const pages = options.pages ? new Set(options.pages) : undefined;
  const pool = index.sections.filter(
    (s) => (!aliases || aliases.has(s.alias)) && (!pages || pages.has(`${s.alias}:${s.path}`)),
  );
  if (pool.length === 0) return [];

  const phrase =
    terms.length > 1
      ? tokenize(query)
          .filter((w) => !STOP.has(w))
          .join(" ")
      : "";
  const expanded = terms.map((t) => expand(t, index.vocab));
  const scores = new Array<number>(pool.length).fill(0);
  const covered = new Array<number>(pool.length).fill(0);

  expanded.forEach((matches) => {
    const tfs = pool.map((s) => {
      let tf = 0;
      for (const [w, weight] of matches) tf += (s.tf.get(w) ?? 0) * weight;
      return tf;
    });
    const df = tfs.filter((tf) => tf > 0).length;
    if (df === 0) return;
    const idf = Math.log(1 + (pool.length - df + 0.5) / (df + 0.5));
    tfs.forEach((tf, i) => {
      if (tf === 0) return;
      const s = pool[i] as Section;
      const norm = tf + K1 * (1 - B + (B * s.length) / Math.max(1, index.avgLength));
      scores[i] = (scores[i] ?? 0) + idf * ((tf * (K1 + 1)) / norm);
      covered[i] = (covered[i] ?? 0) + 1;
    });
  });

  const ranked: { s: Section; score: number }[] = [];
  pool.forEach((s, i) => {
    let score = scores[i] ?? 0;
    if (score <= 0) return;
    score *= 0.6 + (0.4 * (covered[i] ?? 0)) / terms.length;
    if (phrase && normalized(`${s.pageTitle} ${s.heading} ${s.text}`).includes(phrase))
      score *= 1.3;
    ranked.push({ s, score });
  });
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.s.path.localeCompare(b.s.path) ||
      a.s.heading.localeCompare(b.s.heading),
  );

  const matchers = expanded.map((m) => [...m.keys()]);
  return ranked.slice(0, options.k ?? 10).map(({ s, score }) => {
    const { snippet, marks } = snippetOf(s.text || s.heading || s.pageTitle, matchers);
    const address = formatAddress({
      alias: s.alias,
      path: s.path,
      ...(s.anchor ? { anchor: s.anchor } : {}),
    });
    return {
      address,
      alias: s.alias,
      path: s.path,
      ...(s.anchor ? { anchor: s.anchor } : {}),
      library: s.library,
      pageTitle: s.pageTitle,
      heading: s.heading,
      snippet,
      marks,
      score: Math.round(score * 1000) / 1000,
    };
  });
}

// ---------------------------------------------------------------- snippets

const WINDOW = 200;

/**
 * About 200 characters of `text` around the best cluster of matching words, whitespace folded,
 * with the character ranges of the matches. A word matches when its stem is, or starts with, a
 * matching stem.
 */
export function snippetOf(
  text: string,
  matchers: string[][],
): { snippet: string; marks: [number, number][] } {
  const flat = text.replace(/\s+/g, " ").trim();
  const wanted = new Set(matchers.flat());
  const hits: [number, number][] = [];
  for (const m of flat.matchAll(/[\p{L}\p{N}]+/gu)) {
    const at = m.index ?? 0;
    if (wanted.has(stem(m[0]))) hits.push([at, at + m[0].length]);
  }
  if (flat.length <= WINDOW) return { snippet: flat, marks: hits };

  // The window that holds the most matches, starting at one of them.
  let best = 0;
  let bestCount = -1;
  hits.forEach(([start], i) => {
    const count = hits.filter(([s2]) => s2 >= start && s2 < start + WINDOW).length;
    if (count > bestCount) {
      bestCount = count;
      best = i;
    }
  });
  let from = hits.length ? Math.max(0, (hits[best]?.[0] ?? 0) - 40) : 0;
  // Start at a word.
  if (from > 0) {
    const space = flat.indexOf(" ", from);
    if (space !== -1 && space < (hits[best]?.[0] ?? flat.length)) from = space + 1;
  }
  let to = Math.min(flat.length, from + WINDOW);
  if (to < flat.length) {
    const space = flat.lastIndexOf(" ", to);
    if (space > from) to = space;
  }
  const lead = from > 0 ? "… " : "";
  const tail = to < flat.length ? " …" : "";
  const snippet = lead + flat.slice(from, to) + tail;
  const shift = lead.length - from;
  const marks = hits
    .filter(([s, e]) => s >= from && e <= to)
    .map(([s, e]): [number, number] => [s + shift, e + shift]);
  return { snippet, marks };
}
