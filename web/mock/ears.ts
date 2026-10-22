// EARS classifier: a port of the five parser steps of contract 1.5 (wf-parse::ears).
//   1. The caller strips the checkbox and the `SC-n:` prefix.
//   2. Strip each leading `(while|when|if|where) … ,` clause, then `then`.
//   3. Match `(?:the )?<system> (shall|must)( not)? <response>`.
//   4. Classify from the stripped keywords; no match = freeform (S08).
//   5. measurable = number with a unit, a date, a backticked literal, or a `verify:` child.
import type { EarsInfo, EarsPattern } from "@/gen/types";

type Keyword = EarsInfo["keywords"][number];

const LEAD = /^(while|when|if|where)\b[^,]*,\s*/i;
const THEN = /^then\b\s*/i;
const BODY = /^(?:the\s+)?(.+?)\s+(shall|must)(\s+not)?\s+(.+)$/i;
const UNIT = /\d+(\.\d+)?\s*(ms|s|min|h|d|%|KB|MB|GB|x)\b/;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const LITERAL = /`[^`]+`/;

const PATTERN_OF: Record<string, EarsPattern> = {
  when: "event",
  while: "state",
  where: "optional",
  if: "unwanted",
};

export function classifyEars(text: string, hasVerify: boolean): EarsInfo {
  const keywords: Keyword[] = [];
  const leads = new Set<string>();
  let offset = 0;
  let rest = text;

  // Step 2: strip leading condition clauses, then `then`.
  for (;;) {
    const m = rest.match(LEAD);
    if (!m) break;
    const word = m[1];
    leads.add(word.toLowerCase());
    keywords.push({ word, start: offset, end: offset + word.length });
    offset += m[0].length;
    rest = rest.slice(m[0].length);
  }
  const then = rest.match(THEN);
  if (then) {
    keywords.push({ word: rest.slice(0, 4), start: offset, end: offset + 4 });
    offset += then[0].length;
    rest = rest.slice(then[0].length);
  }

  // Step 3: the main clause.
  const body = rest.match(BODY);
  let pattern: EarsPattern;
  let response = "";
  if (body) {
    const modal = body[2];
    const modalAt = offset + rest.search(new RegExp(`\\s${modal}\\b`)) + 1;
    keywords.push({ word: modal, start: modalAt, end: modalAt + modal.length });
    if (body[3]) {
      const notAt = text.indexOf("not", modalAt + modal.length);
      if (notAt >= 0) keywords.push({ word: "not", start: notAt, end: notAt + 3 });
    }
    response = body[4];
    // Step 4: classify.
    pattern =
      leads.size === 0 ? "ubiquitous" : leads.size > 1 ? "complex" : PATTERN_OF[[...leads][0]];
  } else {
    pattern = "freeform";
    response = rest;
  }

  // Step 5: measurable.
  const measurable =
    hasVerify || UNIT.test(response) || DATE.test(response) || LITERAL.test(response);

  keywords.sort((a, b) => a.start - b.start);
  return { pattern, keywords, measurable };
}
