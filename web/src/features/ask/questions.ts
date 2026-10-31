// The three questions the panel suggests: they come from the issue itself, so one click asks what
// the person was about to type. An open request that is a question comes first, then the next
// criterion that is not verified yet, then the goal's own title. Pure.
import type { IssueDetail } from "@/gen/types";

/** The most suggestions. */
export const SUGGESTED = 3;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Inline markdown reduced to words: `code` ticks and `[[refs]]` are dropped to their text. */
const plain = (s: string) =>
  oneLine(
    s
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_]/g, ""),
  );

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]?.toLowerCase() + s.slice(1) : s);

/** The part of a sentence the question keeps: up to `max` characters, cut at a word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[,;:\s]+$/, "")}…`;
}

/**
 * "When two tabs are open, the dashboard shall hold only one connection." becomes "How do we hold
 * only one connection when two tabs are open?". A sentence that is not in the EARS shape
 * (contract 1.4) becomes "What do the pages say about “…”?".
 */
export function criterionQuestion(text: string): string {
  const t = plain(text).replace(/[.\s]+$/, "");
  const m =
    /^(when|while|where|if)\s+(.+?),\s*(?:then\s+)?(?:the|a|an)\s+.+?\s+shall\s+(.+)$/i.exec(t) ??
    /^(?:the|a|an)\s+.+?\s+shall\s+(.+)$/i.exec(t);
  if (m && m.length === 4) {
    const [, keyword, condition, action] = m;
    return `How do we ${clip(lowerFirst(action ?? ""), 90)} ${(keyword ?? "").toLowerCase()} ${clip(lowerFirst(condition ?? ""), 60)}?`;
  }
  if (m && m.length === 2) return `How do we ${clip(lowerFirst(m[1] ?? ""), 120)}?`;
  return `What do the pages say about “${clip(t, 80)}”?`;
}

/** Up to `SUGGESTED` questions drawn from an issue, without repeats. */
export function suggestQuestions(detail: IssueDetail): string[] {
  const out: string[] = [];
  const add = (q: string | undefined) => {
    const question = q ? oneLine(q) : "";
    if (question && !out.some((o) => o.toLowerCase() === question.toLowerCase()))
      out.push(question);
  };

  // A request that waits on someone and ends in "?" is already the question.
  const request = detail.state?.needs_you.find((r) => !r.answered && /\?\s*$/.test(r.question));
  add(request && plain(request.question));

  const open = detail.criteria.filter((c) => c.state !== "verified");
  add(open[0] && criterionQuestion(open[0].text));
  if (!request) add(open[1] && criterionQuestion(open[1].text));

  const title = plain(detail.summary.title).replace(/[.\s]+$/, "");
  add(`What do our pages say about ${lowerFirst(clip(title, 80))}?`);

  // An issue with little to go on still gets three.
  add("Which gotchas should I know before I start?");
  add("Which decisions already cover this?");
  return out.slice(0, SUGGESTED);
}
