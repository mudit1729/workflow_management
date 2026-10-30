// What an answer can do for the issue: link the pages it cites (`add_links`), or save it to the
// log (`add_learning`). Both are one write to the issue's markdown, and each says what it did in
// one line of the panel, not in a toast.
import { useCallback } from "react";
import { contextLinksOf } from "@/features/context/links";
import type { ContextLink, IssueDetail } from "@/gen/types";
import { api, useAddLearning, useAddLinks } from "@/lib/api";
import type { LibraryPage } from "@/lib/api/types";
import { headingAnchor, type ParsedAnswer, plainSummary } from "./answer";
import { pageOf } from "./scope";

/** The why of a link: the question it was cited for, in one line. */
export function whyLine(question: string): string {
  const q = question
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!\s]+$/, "");
  return `Cited for “${q}”.`;
}

/** The pages an answer cites, once each, in the order of its sources. */
export function citedPages(parsed: Pick<ParsedAnswer, "sources">): string[] {
  return [...new Set(parsed.sources.map((s) => pageOf(s.address)))];
}

/** The addresses a learning keeps as its `sources:`: a section's link carries its anchor. */
export function learningSources(parsed: Pick<ParsedAnswer, "sources">): string[] {
  const out: string[] = [];
  for (const s of parsed.sources) {
    const address = s.heading ? `${s.address}#${headingAnchor(s.heading)}` : s.address;
    if (!out.includes(address)) out.push(address);
  }
  return out;
}

export interface LinkOutcome {
  /** Pages added to `## Links`. */
  added: number;
  /** Pages the issue already linked. */
  present: number;
  /** Cited pages that are retired library items: they are not linked (`add_links` refuses them). */
  retired: number;
}

export interface LinkPlan {
  links: ContextLink[];
  retired: number;
}

/**
 * The links `add_links` writes for the cited pages. A workspace library item keeps its `lib-` id,
 * as the Link to an issue button writes it; a retired one is left out.
 */
export async function planLinks(
  pages: string[],
  question: string,
  read: (alias: string, path: string) => Promise<LibraryPage> = (a, p) => api.libraryPage(a, p),
): Promise<LinkPlan> {
  const why = whyLine(question);
  const found = await Promise.all(
    pages.map(async (address) => {
      const at = address.indexOf(":");
      const page = await read(address.slice(0, at), address.slice(at + 1)).catch(() => undefined);
      return { address, page };
    }),
  );
  const links: ContextLink[] = [];
  let retired = 0;
  for (const { address, page } of found) {
    if (page?.item && page.frontmatter.status === "retired") retired += 1;
    else if (page?.item) links.push({ kind: "library", target: page.item, label: why });
    else links.push({ kind: "page", target: address, label: why });
  }
  return { links, retired };
}

const pagesOf = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

/** What "Link cited pages" did, in one line. */
export function linkedLine(issueId: string, o: LinkOutcome, cited: number): string {
  const parts: string[] = [];
  if (o.added > 0) parts.push(`Linked ${pagesOf(o.added)} to ${issueId}.`);
  else if (o.present > 0 && o.retired === 0)
    return `${issueId} already links ${cited === 1 ? "this page" : "these pages"}.`;
  else parts.push(`Nothing to link in ${issueId}.`);
  if (o.present > 0 && o.added > 0)
    parts.push(`${pagesOf(o.present)} ${o.present === 1 ? "was" : "were"} already there.`);
  if (o.retired > 0)
    parts.push(`${pagesOf(o.retired)} ${o.retired === 1 ? "is" : "are"} retired and left out.`);
  return parts.join(" ");
}

/** How many of these links the issue's `## Links` has already. */
export function alreadyLinked(detail: IssueDetail | undefined, links: ContextLink[]): number {
  const have = new Set(
    contextLinksOf(detail?.goal.links_md, detail?.summary.path).map((l) => `${l.kind}:${l.target}`),
  );
  return links.filter((l) => have.has(`${l.kind}:${l.target}`)).length;
}

/** Link the cited pages to the issue. Resolves to what changed, or `undefined` after a toast. */
export function useLinkCited(issue: string) {
  const addLinks = useAddLinks(issue);
  return useCallback(
    async (
      parsed: Pick<ParsedAnswer, "sources">,
      question: string,
      detail: IssueDetail | undefined,
    ): Promise<LinkOutcome | undefined> => {
      const { links, retired } = await planLinks(citedPages(parsed), question);
      const present = alreadyLinked(detail, links);
      if (present === links.length) return { added: 0, present, retired };
      const done = await addLinks({ links });
      return done ? { added: links.length - present, present, retired } : undefined;
    },
    [addLinks],
  );
}

/** Save an answer as a learning of the issue: titled by the question, the summary as its rule. */
export function useSaveToLog(issue: string) {
  const addLearning = useAddLearning(issue);
  return useCallback(
    async (question: string, parsed: ParsedAnswer): Promise<string | undefined> => {
      const done = await addLearning({
        title: question,
        rule: plainSummary(parsed.summary),
        sources: learningSources(parsed),
        tags: ["library"],
      });
      return done?.created;
    },
    [addLearning],
  );
}
