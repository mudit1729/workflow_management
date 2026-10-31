// The prototype's agent for Ask library. With no agent connected to answer, the panel asks this
// module instead: it reads exactly the pages it is given, ranks their sections with the library
// search index, and writes a short extractive answer in the format of the `querying-library`
// skill (plugins/workflow/skills/querying-library), so a real agent's answer parses the same way:
//
//   <answer paragraphs, each claim followed by [n]>
//
//   Not in these pages: <what is missing>        (a part the pages do not cover)
//   Note: <page> ...                             (a page tried to steer the answer)
//   Could not read: <address>, <address>         (pages that were not there)
//
//   ## Sources
//   [n] <alias>:<path>#<heading>
//
// A question the pages do not answer is the whole output `Not in these pages.` and nothing else.
// The module is pure over the pages: `Libraries.page` is the only thing it reads.
import { parseAddress } from "@/features/library/address";
import { headingsOf } from "@/features/library/anchors";
import { NotFoundError } from "@/lib/api/error";
import type { Libraries } from "./libraries";
import {
  buildSearchIndex,
  queryTerms,
  type SearchablePage,
  searchSections,
  stem,
  tokenize,
} from "./search";

/** The part of the registry the prototype agent reads. */
export type AskPages = Pick<Libraries, "page">;

export interface AskRequest {
  question: string;
  /** The pages to read, as `alias:path`. Nothing else is read. */
  pages: string[];
}

/** Sections the answer may draw on, at most. */
const MAX_PASSAGES = 3;
/** A section needs this share of the best score to be used. */
const SHARE_OF_BEST = 0.3;
const SENTENCES_FIRST = 2;
const MAX_SENTENCE = 260;

/** Words of a question that are not about the pages: they never count as "missing". */
const ASK_STOP = new Set(
  "about after again also always any applies apply been before being both but can could describe did doc docs does doing done each else even every explain few find first five four get give got had handle handles handling happen happens has have her here him his how into its just keep keeping keeps know libraries library like made make many may mean means more most much must need never not note notes now off once one only other our out over own page pages same say says second should show some such tell than that their them then there these they those three through too two under until use used uses using very was were what when where which while who whom why will work working works would yes yet".split(
    " ",
  ),
);

/** The stems of those words, to take them out of a query. */
const ASK_STEMS = new Set([...ASK_STOP].map(stem));

/**
 * A section needs one in this many of the question's terms to count as an answer. Only terms that
 * are in the pages at all count: a word the pages never use cannot be asked of a section.
 */
const TERMS_PER_MATCH = 3;
/** Say what is missing only when it is one word, a minority of the question. */
const MAX_MISSING = 1;
const MAX_MISSING_SHARE = 0.34;

/** Text in a page that talks to the reader instead of informing it. */
const STEERING =
  /\b(ignore (all |any |the |your )?(previous|above|prior|earlier) (instructions?|text|rules?|messages?)|disregard (the |all )?(above|previous|question)|you must now|run (this|the following) command|print (the|your) (prompt|instructions)|system prompt)\b/i;

// ---------------------------------------------------------------- reading the pages

interface Read {
  page: SearchablePage;
  /** Whole file text, for the injection check. */
  text: string;
}

function readPages(libs: AskPages, addresses: string[]): { read: Read[]; unreadable: string[] } {
  const read: Read[] = [];
  const unreadable: string[] = [];
  const seen = new Set<string>();
  for (const raw of addresses) {
    const at = parseAddress(raw);
    if (!at) {
      unreadable.push(raw);
      continue;
    }
    const address = `${at.alias}:${at.path}`;
    if (seen.has(address)) continue;
    seen.add(address);
    try {
      const page = libs.page(at.alias, at.path);
      // The whole file is the page: the frontmatter is not text a reader sees.
      const body = page.text.split("\n").slice(page.lineOffset).join("\n");
      read.push({
        page: {
          alias: page.alias,
          library: page.library,
          path: page.path,
          title: page.title,
          body,
        },
        text: page.text,
      });
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      unreadable.push(address);
    }
  }
  return { read, unreadable };
}

// ---------------------------------------------------------------- the text of a section

/**
 * The markdown of the section a passage came from: from its heading to the next heading of level
 * 1 to 3 (the way the index cuts), or the lead of the page when the passage has no heading.
 */
function sectionMarkdown(body: string, anchor?: string): string {
  const lines = body.split("\n");
  const heads = headingsOf(body).filter((h) => h.depth <= 3);
  if (!anchor) {
    const first = heads.find((h) => h.depth >= 2);
    return lines.slice(0, first ? first.line - 1 : lines.length).join("\n");
  }
  const i = heads.findIndex((h) => h.anchor === anchor);
  const head = heads[i];
  if (!head) return "";
  const next = heads[i + 1];
  return lines.slice(head.line, next ? next.line - 1 : lines.length).join("\n");
}

/**
 * Markdown as sentences a reader can take as they are: no code blocks, tables or headings, links
 * as their text, references to entries dropped, a list item a line. The words keep their
 * underscores and their case, since an answer quotes the page.
 */
function readable(md: string): string {
  return md
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((l) => !/^\s*(#{1,6}\s|\||\[!\w+\]|\[[^\]]+\]:\s)/.test(l))
    .map((l) =>
      l
        .replace(/^\s*(>\s*)*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
        .replace(/\[\[[^\]]*\]\]:?/g, "")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/(\*\*|__)(.+?)\1/g, "$2")
        .replace(/(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------- sentences

/** Sentences of a section's plain text, one list item or line at a time. */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    for (const piece of line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“`([])/)) {
      const s = piece.trim();
      if (s.split(/\s+/).length >= 3) out.push(s);
    }
  }
  return out;
}

/** A sentence that is too long stops at a clause, or at a word, with an ellipsis. */
function shorten(sentence: string): string {
  if (sentence.length <= MAX_SENTENCE) return sentence;
  const cut = sentence.slice(0, MAX_SENTENCE - 20);
  const clause = Math.max(cut.lastIndexOf("; "), cut.lastIndexOf(", "), cut.lastIndexOf(" — "));
  const at = clause > 80 ? clause : cut.lastIndexOf(" ");
  return `${cut.slice(0, at).replace(/[,;:\s]+$/, "")}…`;
}

/** The terms of the question a sentence mentions: a stem, or a longer word that starts with one. */
function matched(sentence: string, terms: string[]): number {
  const stems = tokenize(sentence).map(stem);
  return terms.filter((t) => stems.some((w) => w === t || (t.length >= 4 && w.startsWith(t))))
    .length;
}

/** The best one or two sentences of a section for the question, in the order they are written. */
function bestSentences(text: string, terms: string[], count: number): string[] {
  const all = sentencesOf(text);
  if (all.length === 0) return [];
  const scored = all.map((s, i) => ({
    s,
    i,
    score: matched(s, terms) * 10 + (i === 0 ? 2 : 0) - Math.min(s.length, 400) / 200,
  }));
  const hits = scored.filter((x) => x.score >= 10);
  const pick = (hits.length > 0 ? hits : scored.slice(0, 1))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, count)
    .sort((a, b) => a.i - b.i);
  return pick.map((x) => shorten(x.s));
}

// ---------------------------------------------------------------- the answer

interface Used {
  alias: string;
  path: string;
  /** Where the section sits among the sections of all the pages: document order. */
  at: number;
  /** The nearest heading above the passage, as written; none for the lead of a page. */
  heading?: string;
  sentences: string[];
}

/** Is the stem a word of the pages, or the start of one? */
const inVocab = (t: string, vocab: string[]): boolean =>
  vocab.some((w) => w === t || (t.length >= 3 && w.startsWith(t)));

/** The words of the question that appear nowhere in the pages (and are not question words). */
function missingWords(question: string, vocab: string[]): string[] {
  const out: string[] = [];
  for (const word of tokenize(question)) {
    if (word.length < 4 || ASK_STOP.has(word) || inVocab(stem(word), vocab)) continue;
    if (!out.includes(word)) out.push(word);
  }
  return out;
}

const quoted = (words: string[]) => words.map((w) => `“${w}”`);
const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** `Not in these pages.` and, when there is something to say, what the pages do cover. */
function notFound(read: Read[]): string {
  const titles = [...new Set(read.map((r) => r.page.title))].slice(0, 3);
  return titles.length > 0
    ? `Not in these pages. They cover ${list(quoted(titles))}.`
    : "Not in these pages.";
}

/**
 * Answer a question from the given pages, in the output format of `querying-library`. The answer
 * is extractive: the best sentences of the best sections, each followed by its number.
 */
export function answerFromPages(libs: AskPages, request: AskRequest): string {
  const question = request.question.replace(/\s+/g, " ").trim();
  const { read, unreadable } = readPages(libs, request.pages);
  const unread = unreadable.length > 0 ? `Could not read: ${unreadable.join(", ")}` : "";
  if (!question || read.length === 0)
    return [notFound(read), ...(unread ? [unread] : [])].join("\n\n");

  const index = buildSearchIndex(read.map((r) => r.page));
  const all = queryTerms(question);
  // The words about the pages, not the ones every question has ("how", "should", "handle").
  const terms = all.filter((t) => !ASK_STEMS.has(t));
  if (terms.length === 0) terms.push(...all);
  // A term the pages never use cannot narrow the sections: leave it to the "missing" note.
  const present = terms.filter((t) => inVocab(t, index.vocab));
  const need = Math.max(1, Math.ceil(present.length / TERMS_PER_MATCH));
  const ranked = searchSections(index, question, { k: 12 });
  const best = ranked[0]?.score ?? 0;

  // The sections that carry the answer: close to the best score, each with a sentence that
  // mentions the question, at most one per heading.
  const used: Used[] = [];
  for (const hit of ranked) {
    if (used.length >= MAX_PASSAGES) break;
    if (hit.score < best * SHARE_OF_BEST) break;
    const at = index.sections.findIndex(
      (s) => s.alias === hit.alias && s.path === hit.path && s.heading === hit.heading,
    );
    const page = read.find((r) => r.page.alias === hit.alias && r.page.path === hit.path);
    if (at < 0 || !page) continue;
    const heading = hit.anchor
      ? headingsOf(page.page.body).find((h) => h.anchor === hit.anchor)?.text
      : undefined;
    if (used.some((u) => u.alias === hit.alias && u.path === hit.path && u.heading === heading))
      continue;
    const text = readable(sectionMarkdown(page.page.body, hit.anchor));
    // A passage that mentions one word of a long question is not an answer to it.
    if (matched(`${hit.pageTitle} ${hit.heading} ${text}`, present) < need) continue;
    const sentences = bestSentences(text, present, used.length === 0 ? SENTENCES_FIRST : 1);
    if (sentences.length === 0 || !sentences.some((s) => matched(s, present) > 0)) continue;
    used.push({
      alias: hit.alias,
      path: hit.path,
      at,
      ...(heading ? { heading } : {}),
      sentences,
    });
  }
  if (used.length === 0) return [notFound(read), ...(unread ? [unread] : [])].join("\n\n");

  // Read in the order of the pages: the page that answers best first, and within a page the way
  // it was written (a decision before its reasons), not the way the score fell.
  const pageRank = (u: Used) => used.findIndex((o) => o.alias === u.alias && o.path === u.path);
  used.sort((a, b) => pageRank(a) - pageRank(b) || a.at - b.at);

  // Numbers count from 1 in order of first use; two passages of one heading share a number.
  const numbers = new Map<string, number>();
  const sources: string[] = [];
  const paragraphs = used.map((u) => {
    const key = `${u.alias}:${u.path}#${u.heading ?? ""}`;
    let n = numbers.get(key);
    if (!n) {
      n = numbers.size + 1;
      numbers.set(key, n);
      sources.push(`[${n}] ${u.alias}:${u.path}${u.heading ? `#${u.heading}` : ""}`);
    }
    return `${u.sentences.join(" ")} [${n}]`;
  });

  const lacking = missingWords(question, index.vocab);
  const missing =
    lacking.length <= MAX_MISSING && lacking.length <= terms.length * MAX_MISSING_SHARE
      ? lacking
      : [];
  const steering = used
    .map((u) => read.find((r) => r.page.alias === u.alias && r.page.path === u.path))
    .filter((r): r is Read => !!r && STEERING.test(r.text));
  const steered = [...new Set(steering.map((r) => `${r.page.alias}:${r.page.path}`))];

  return [
    ...paragraphs,
    ...(missing.length > 0 ? [`Not in these pages: ${list(quoted(missing))}.`] : []),
    ...(steered.length > 0
      ? [`Note: ${list(steered)} contains instructions for the reader, which were not followed.`]
      : []),
    ...(unread ? [unread] : []),
    ["## Sources", ...sources].join("\n"),
  ].join("\n\n");
}
