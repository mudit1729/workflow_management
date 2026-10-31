// The section of a page a citation points at, as markdown: from its heading to the next heading of
// the same level or higher. A citation without a heading is the lead of the page. Pure.
import { headingsOf, plainHeading, slugify } from "@/features/library/anchors";
import type { LibraryPage } from "@/lib/api/types";

/** Longest preview, in characters. A long section is cut at a line, and the preview says so. */
export const PREVIEW_CHARS = 2400;

export interface SectionText {
  /** The section as markdown; its heading line is included. */
  md: string;
  /** The heading as found in the page (it may differ in case from the one cited). */
  heading?: string;
  /** The page has no such heading any more (it changed since the answer): the lead is shown. */
  missing: boolean;
  /** The text was cut at `PREVIEW_CHARS`. */
  cut: boolean;
}

const body = (page: Pick<LibraryPage, "text" | "lineOffset">): string =>
  page.text.split("\n").slice(page.lineOffset).join("\n");

/** A heading as the answer writes it (`Revisit when`), or as an anchor (`revisit-when`). */
const same = (text: string, wanted: string) =>
  text.trim().toLowerCase() === plainHeading(wanted).toLowerCase() ||
  slugify(text) === slugify(plainHeading(wanted));

/** The section of `page` under `heading`; the lead of the page when none is given. */
export function sectionOf(
  page: Pick<LibraryPage, "text" | "lineOffset">,
  heading?: string,
): SectionText {
  const text = body(page);
  const lines = text.split("\n");
  const heads = headingsOf(text);
  const at = heading ? heads.findIndex((h) => same(h.text, heading)) : -1;
  const found = at >= 0 ? heads[at] : undefined;

  let from = 0;
  let to = lines.length;
  if (found) {
    from = found.line - 1;
    to = heads.slice(at + 1).find((h) => h.depth <= found.depth)?.line ?? lines.length + 1;
    to -= 1;
  } else {
    // The lead: everything before the first heading of level 2 or below, the title included.
    const first = heads.find((h) => h.depth >= 2);
    to = first ? first.line - 1 : lines.length;
  }
  const md = lines.slice(from, to).join("\n").trim();
  const cut = md.length > PREVIEW_CHARS;
  return {
    md: cut ? `${md.slice(0, PREVIEW_CHARS).replace(/\n[^\n]*$/, "")}\n\n…` : md,
    ...(found ? { heading: found.text } : {}),
    missing: Boolean(heading) && !found,
    cut,
  };
}
