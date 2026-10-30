// Small pure helpers of the page view: what the body shows, how the meta line reads dates.

/** A date written without a time (`2026-10-20`), as frontmatter has it. */
export const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A time `RelativeTime` can read: a bare date becomes noon that day, so "3 days ago" is stable. */
export const asTimestamp = (s: string) => (isDateOnly(s) ? `${s}T12:00:00` : s);

/**
 * The body without its leading `# Title` when that heading says what the page header already
 * says. Only the first non-blank line counts, and only when it equals the title.
 */
export function withoutTitleHeading(body: string, title: string): string {
  const lines = body.split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first === -1) return body;
  const m = /^ {0,3}#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(lines[first] ?? "");
  if (!m || (m[1] ?? "").trim().toLowerCase() !== title.trim().toLowerCase()) return body;
  // Keep the blank lines out of the way: the body starts at the next block.
  let next = first + 1;
  while (next < lines.length && (lines[next] ?? "").trim() === "") next++;
  return lines.slice(next).join("\n");
}

/**
 * The headings the "On this page" list shows: levels 2 and 3 (level 1 is the title). A glossary
 * lists its terms in alphabetical order, which is how its page shows them.
 */
export function outlineOf<T extends { depth: number; text: string }>(
  headings: T[],
  alphabetical = false,
): T[] {
  const shown = headings.filter((h) => h.depth >= 2 && h.depth <= 3);
  return alphabetical ? shown.sort((a, b) => a.text.localeCompare(b.text)) : shown;
}

/** `Library / This workspace / Playbooks`: the parts, from the library down to the page's section. */
export function crumbsOf(library: string, trail: { title: string }[]): string[] {
  return ["Library", library, ...trail.map((t) => t.title)];
}
