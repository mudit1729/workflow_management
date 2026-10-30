// The answer of Ask library, as the `querying-library` skill prints it
// (plugins/workflow/skills/querying-library, "The output"). A connected agent writes it, and so
// does the prototype's own agent (`mock/libraries/ask.ts`), so one parser reads both:
//
//   Treat each event as a dirty hint [1]. After a rename the old path stays in the index [2].
//
//   Not in these pages: how many renames fit in one debounce window.
//
//   ## Sources
//   [1] wf:gotchas/notify-macos-rescan-subtrees.md#Fix
//   [2] wf:gotchas/notify-macos-rescan-subtrees.md#Symptom
//
// Pure text, no React. It is also where the prompt of a real agent is built.

/** A line of `## Sources`: the page a citation `[n]` stands for, and its section. */
export interface AnswerSource {
  n: number;
  /** `alias:path` (no heading). */
  address: string;
  alias: string;
  path: string;
  /** The nearest heading above the passage, as written. None: the lead of the page. */
  heading?: string;
}

export interface ParsedAnswer {
  /** The words of the answer: what is above `## Sources`, without the lines below. */
  answer: string;
  /** The first paragraph: it answers alone. */
  summary: string;
  sources: AnswerSource[];
  /** The whole answer is `Not in these pages.`: no citations, nothing to link. */
  notFound: boolean;
  /** What a part of the answer lacks: the text of a `Not in these pages:` paragraph. */
  missing?: string;
  /** Pages the agent could not read. */
  couldNotRead: string[];
  /** A page tried to steer the answer: the sentence after `Note:`. */
  note?: string;
  /** What is off in the format. The answer is still shown; the panel says so quietly. */
  problems: string[];
}

const SOURCE = /^\[(\d+)\] ([a-z0-9][a-z0-9_-]*):([^#\s][^#]*?\.md)(?:#(.+))?$/;
const FENCE = /```[\s\S]*?```/g;
const CODE_SPAN = /`[^`\n]*`/g;

/** A citation outside code: `[1]`, not `[1](…)` and not `[1]:`. */
const CITATION = /\[(\d+)\](?![(:])/g;

/** The numbers an answer cites, in the order they are first used. */
export function citedNumbers(answer: string): number[] {
  const prose = answer.replace(FENCE, "").replace(CODE_SPAN, "");
  return [...new Set([...prose.matchAll(CITATION)].map((m) => Number(m[1])))];
}

/** Read what a connected agent (or the prototype) printed. Never throws. */
export function parseAnswer(raw: string): ParsedAnswer {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let cut = -1;
  lines.forEach((l, i) => {
    if (l.trim() === "## Sources") cut = i;
  });
  const above = (cut < 0 ? lines : lines.slice(0, cut)).join("\n").trim();
  const problems: string[] = [];
  const sources: AnswerSource[] = [];
  if (cut >= 0)
    for (const line of lines.slice(cut + 1).map((l) => l.trim())) {
      if (!line) continue;
      const m = SOURCE.exec(line);
      if (!m) {
        problems.push(`Sources line not understood: ${line}`);
        continue;
      }
      const alias = m[2] as string;
      const path = m[3] as string;
      sources.push({
        n: Number(m[1]),
        address: `${alias}:${path}`,
        alias,
        path,
        ...(m[4] ? { heading: m[4] } : {}),
      });
    }

  // The lines that are not the answer: pages that could not be read, and the note about steering.
  let couldNotRead: string[] = [];
  let note: string | undefined;
  const kept: string[] = [];
  for (const line of above.split("\n")) {
    const read = /^Could not read: (.+)$/.exec(line.trim());
    if (read) couldNotRead = (read[1] as string).split(/,\s*/).filter(Boolean);
    else if (/^Note: /.test(line.trim())) note = line.trim().slice("Note: ".length);
    else kept.push(line);
  }
  const body = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paragraphs = body.split(/\n\s*\n/);
  const first = paragraphs[0]?.trim() ?? "";
  const notFound = /^Not in these pages\.(\s|$)/.test(first);
  let missing: string | undefined;
  const answerParagraphs = notFound
    ? paragraphs
    : paragraphs.filter((p) => {
        const m = /^Not in these pages: ([\s\S]+)$/.exec(p.trim());
        if (m) missing = (m[1] as string).trim();
        return !m;
      });
  const answer = answerParagraphs.join("\n\n").trim();

  const cited = citedNumbers(answer);
  if (notFound) {
    if (cut >= 0 || cited.length > 0)
      problems.push("A whole “Not in these pages.” answer has no citations or sources.");
  } else {
    sources.forEach((s, i) => {
      if (s.n !== i + 1)
        problems.push(`Sources must count from 1 in order: [${s.n}] is line ${i + 1}.`);
    });
    for (const n of cited)
      if (!sources.some((s) => s.n === n)) problems.push(`[${n}] has no source.`);
    for (const s of sources) if (!cited.includes(s.n)) problems.push(`[${s.n}] is never cited.`);
    if (cited.some((n, i) => i > 0 && n < (cited[i - 1] as number)))
      problems.push("Citations are not numbered in the order they are first used.");
  }

  return {
    answer,
    summary: notFound ? first : (answerParagraphs[0]?.trim() ?? ""),
    sources,
    notFound,
    ...(missing ? { missing } : {}),
    couldNotRead,
    ...(note ? { note } : {}),
    problems,
  };
}

/** The source a citation number stands for. */
export const sourceOf = (parsed: ParsedAnswer, n: number): AnswerSource | undefined =>
  parsed.sources.find((s) => s.n === n);

/**
 * The answer with each `[n]` that has a source turned into a link `[n](#cite-n "<title>")`, which
 * the panel draws as a small numbered chip and opens as a preview. Code is left alone, and so is
 * a number that has no source.
 */
export function linkCitations(
  answer: string,
  parsed: Pick<ParsedAnswer, "sources">,
  titleOf: (source: AnswerSource) => string = (s) => s.address,
): string {
  // Walk the text outside fences and code spans only.
  const parts = answer.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(CITATION, (whole, n: string) => {
        const source = parsed.sources.find((s) => s.n === Number(n));
        if (!source) return whole;
        const title = titleOf(source)
          .replace(/["\n\\]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return `[${n}](#cite-${n} "${title}")`;
      });
    })
    .join("");
}

/** The answer's summary for a log entry: the first paragraph, without its `[n]` marks. */
export function plainSummary(summary: string): string {
  return summary
    .replace(CITATION, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** The heading of a source as an anchor, for a link to the section (`#fix`). */
export { slugify as headingAnchor } from "@/features/library/anchors";

// ---------------------------------------------------------------- the prompt

/**
 * What a real agent is given: the pages, one per line, and the question in a block. The bridge
 * builds it from a validated scope, never from browser text (spec 8); this is the same shape, for
 * an agent that has no bridge and for a person who pastes it by hand. A page is `alias:path`, and
 * `@<sha>` after a team page pins the commit.
 */
export function askPrompt(args: { pages: string[]; question: string }): string {
  const question = args.question.trim().replace(/<\/?question>/gi, "");
  return ["Pages:", ...args.pages.map((p) => `- ${p}`), "<question>", question, "</question>"].join(
    "\n",
  );
}
