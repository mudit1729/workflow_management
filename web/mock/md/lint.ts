// Lint from text (contract Part 3 §4): the S rules of the writing standard, plus the checks that
// read raw lines (F012 conflict markers, S13 date-only timestamps, inline disables). Every rule
// reads the file text and the parsed sources; nothing here is declared by hand.
// Q rules (workflow signals) stay in `derive()`.
import type { GlossaryTerm } from "@/gen/types";
import { classifyEars } from "../ears";
import type { IssueSrc, LibrarySrc } from "../source";
import { maskQuotes, type ProseUnit, proseUnits, sentences, unitPos } from "./prose";
import { fenceMask } from "./text";
import { type FileCtx, ISSUE_FILES, type IssueFileName } from "./types";

export interface LintDeps {
  glossary: GlossaryTerm[];
  /** Rules `[lint] disable` turns off: they are not computed at all. */
  disabled?: ReadonlySet<string>;
}

const enabled = (deps: LintDeps, rule: string) => !deps.disabled?.has(rule);

// ---------------------------------------------------------------- word lists

/** Hedge words (S06) with the advice that fits each. Words in quotes or code are ignored. */
const HEDGES: Record<string, string> = {
  maybe: "State the fact, or list it as an assumption.",
  probably: "State the fact, or list it as an assumption.",
  perhaps: "State the fact, or list it as an assumption.",
  possibly: "State the fact, or list it as an assumption.",
  likely: "State the fact, or list it as an assumption.",
  might: "Say who decides, and when.",
  may: "Say who decides, and when.",
  somewhat: "Give the number, or remove the word.",
  hopefully: "State what you checked, or remove the word.",
  basically: "Remove the word.",
};

const WORD_LIMIT = 25;
const STEP_WORD_LIMIT = 20;

const DETERMINER = new Set([
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "they",
  "we",
  "i",
  "you",
  "he",
  "she",
  "there",
  "each",
  "every",
  "all",
  "some",
  "any",
  "no",
  "my",
  "our",
  "your",
  "their",
  "his",
  "her",
  "when",
  "if",
  "once",
  "after",
  "before",
  "while",
]);

// ---------------------------------------------------------------- helpers

function sentenceAt(u: ProseUnit, at: number) {
  return unitPos(u, at);
}

const STEP_KINDS = new Set(["step"]);

/** S01: sentences over the word limit. */
function ruleS01(ctx: FileCtx, units: ProseUnit[]): void {
  for (const u of units) {
    const limit = u.kind === "step" ? STEP_WORD_LIMIT : WORD_LIMIT;
    for (const s of sentences(u.text)) {
      if (s.words <= limit) continue;
      const p = sentenceAt(u, s.at);
      ctx.report(
        "S01",
        "warn",
        p.line,
        `Sentence has ${s.words} words (limit ${limit}). Split it into two sentences.`,
        undefined,
        p.col,
        p.col + Math.min(s.text.length, 40),
      );
    }
  }
}

/** S06: hedge words in prose. */
function ruleS06(ctx: FileCtx, units: ProseUnit[]): void {
  for (const u of units) {
    const text = maskQuotes(u.text);
    for (const m of text.matchAll(/\b([A-Za-z]+)\b/g)) {
      const word = m[1].toLowerCase();
      const advice = HEDGES[word];
      if (!advice) continue;
      const p = unitPos(u, m.index ?? 0);
      ctx.report(
        "S06",
        "warn",
        p.line,
        `Hedge word “${word}”. ${advice}`,
        `Remove “${word}”, or write the claim under \`## Assumptions\`.`,
        p.col,
        p.col + m[1].length,
      );
    }
  }
}

const IRREGULAR =
  "written|done|made|known|shown|seen|given|taken|kept|held|built|sent|found|run|left|read|set|put|got|gotten|chosen|broken|spoken|driven|begun|lost|paid|told|thought|brought|drawn|grown|thrown|worn|eaten|fallen|hidden|ridden|risen|stolen|woken|forgotten";
const PASSIVE = new RegExp(
  `\\b(?:is|are|was|were|be|been|being|gets?|got)\\s+(?:(?:not|also|already|only|still|never|always|then|usually)\\s+)*(?:being\\s+)?((?:[a-z]{3,}ed)|${IRREGULAR})\\s+by\\s+(?:the\\s+|a\\s+|an\\s+)?([a-z][a-z-]*(?:\\s+[a-z][a-z-]*)?)`,
  "i",
);

/** The active form of "skipped by the matcher": a short hint for the message. */
function activeHint(participle: string, agent: string): string {
  const p = participle.toLowerCase();
  let verb = p;
  if (p.endsWith("ed")) {
    verb = p.slice(0, -2);
    if (/([^aeiou])\1$/.test(verb)) verb = verb.slice(0, -1);
    else if (/[cgsvz]$|[^aeiou][aeiou]?[ul]$/.test(verb) && !/[aeiou]{2}$/.test(verb)) verb += "e";
  }
  const third = /(s|x|z|ch|sh)$/.test(verb)
    ? `${verb}es`
    : verb.endsWith("y")
      ? `${verb.slice(0, -1)}ies`
      : `${verb}s`;
  const subject =
    agent.trim().split(/\s+/)[0] === "a" ? agent : `the ${agent.replace(/^the\s+/, "")}`;
  return `“${subject} ${third} …”`;
}

/** S03: passive voice with an actor ("is skipped by the matcher"). */
function ruleS03(ctx: FileCtx, units: ProseUnit[]): void {
  for (const u of units) {
    for (const s of sentences(maskQuotes(u.text))) {
      const m = PASSIVE.exec(s.text);
      if (!m) continue;
      const p = sentenceAt(u, s.at + m.index);
      ctx.report(
        "S03",
        "info",
        p.line,
        `Passive voice. Name the actor: ${activeHint(m[1], m[2])}.`,
        undefined,
        p.col,
        p.col + m[0].length,
      );
    }
  }
}

/** S05: a step must start with an imperative verb. */
function ruleS05(ctx: FileCtx, units: ProseUnit[]): void {
  for (const u of units) {
    if (!STEP_KINDS.has(u.kind)) continue;
    const first = /^[^\s▮]+/.exec(u.text.replace(/^[*_]+/, ""))?.[0];
    if (!first) continue;
    const w = first.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) continue;
    const gerund = w.length > 4 && w.endsWith("ing");
    const past = w.length > 4 && w.endsWith("ed");
    if (!DETERMINER.has(w) && !gerund && !past) continue;
    const p = unitPos(u, 0);
    ctx.report(
      "S05",
      "warn",
      p.line,
      "Step does not start with an imperative verb.",
      "Start the step with a verb such as Add, Run or Read.",
      p.col,
      p.col + first.length,
    );
  }
}

const AVOID_CACHE = new WeakMap<GlossaryTerm[], [RegExp, string][]>();

/** One whole-word matcher per word on an avoid list, built once per glossary. */
function avoidMatchers(glossary: GlossaryTerm[]): [RegExp, string][] {
  let list = AVOID_CACHE.get(glossary);
  if (!list) {
    list = glossary.flatMap((t) =>
      t.avoid.map(
        (word) =>
          [
            new RegExp(
              `(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?(?![\\w-])`,
              "gi",
            ),
            t.term,
          ] as [RegExp, string],
      ),
    );
    AVOID_CACHE.set(glossary, list);
  }
  return list;
}

/** S09: words the glossary says to avoid. */
function ruleS09(ctx: FileCtx, units: ProseUnit[], glossary: GlossaryTerm[]): void {
  const matchers = avoidMatchers(glossary);
  if (matchers.length === 0) return;
  for (const u of units) {
    const text = maskQuotes(u.text);
    for (const [re, term] of matchers) {
      for (const m of text.matchAll(re)) {
        const p = unitPos(u, m.index ?? 0);
        ctx.report(
          "S09",
          "warn",
          p.line,
          `“${m[0]}” is on the avoid list. The glossary term is “${term}”.`,
          `Replace “${m[0]}” with “${term}”.`,
          p.col,
          p.col + m[0].length,
        );
      }
    }
  }
}

/** S11: an entry starts with "It" or "This", or uses a contraction. */
function ruleS11(ctx: FileCtx, units: ProseUnit[]): void {
  const contraction =
    /\b(?:[A-Za-z]+n['’]t|(?:I|you|we|they|it|that|there|here|what|who|he|she)['’](?:s|re|ve|ll|d|m))\b/gi;
  for (const u of units) {
    for (const m of maskQuotes(u.text).matchAll(contraction)) {
      const p = unitPos(u, m.index ?? 0);
      ctx.report(
        "S11",
        "warn",
        p.line,
        `Contraction “${m[0]}”. Write the words out.`,
        undefined,
        p.col,
        p.col + m[0].length,
      );
    }
  }
  // The first paragraph of each entry must not open with "It" or "This".
  for (const [id, a] of Object.entries(ctx.anchors)) {
    if (!/^[CDL]-/.test(id)) continue;
    const first = units.find((u) => u.line >= a.line && u.line < a.end && u.kind === "paragraph");
    const m = first && /^(It|This)\b/.exec(first.text.replace(/^[*_]+/, ""));
    if (!first || !m) continue;
    const p = unitPos(first, 0);
    ctx.report(
      "S11",
      "warn",
      p.line,
      `${id} starts with “${m[1]}”. Name the subject.`,
      undefined,
      p.col,
      p.col + m[1].length,
    );
  }
}

/** S02: a paragraph of more than six sentences. */
function ruleS02(ctx: FileCtx, units: ProseUnit[]): void {
  for (const u of units) {
    if (u.kind !== "paragraph") continue;
    const n = sentences(u.text).length;
    if (n <= 6) continue;
    const p = unitPos(u, 0);
    ctx.report(
      "S02",
      "info",
      p.line,
      `Paragraph has ${n} sentences (limit 6). Split it, or cut it.`,
      undefined,
      p.col,
    );
  }
}

// ---------------------------------------------------------------- criteria (S07, S08)

function ruleCriteria(ctx: FileCtx, src: IssueSrc, deps: LintDeps): void {
  const L = ctx.L;
  src.criteria.forEach((c, i) => {
    const id = `SC-${i + 1}`;
    const a = ctx.anchors[id];
    if (!a) return;
    const line = a.line - 1;
    const col = Math.max(L.lines[line].indexOf(`${id}:`), 0);
    const ears = classifyEars(c.text, !!c.verify);
    if (ears.pattern === "freeform" && enabled(deps, "S08"))
      ctx.report(
        "S08",
        "info",
        line,
        `${id} does not match an EARS pattern.`,
        "Rewrite it as “When …, the <system> shall …”.",
        col,
        col + `${id}: `.length,
      );
    if (!ears.measurable && enabled(deps, "S07"))
      ctx.report(
        "S07",
        "warn",
        line,
        `${id} cannot be measured.`,
        "Add a number with a unit, a backticked literal or a `verify:` line.",
        col,
        col + `${id}: `.length,
      );
  });
}

// ---------------------------------------------------------------- entry points

/** Writing-standard rules for one file of an issue. */
export function lintIssueFile(
  name: IssueFileName,
  ctx: FileCtx,
  src: IssueSrc,
  deps: LintDeps,
): void {
  const units = proseUnits(ctx.L, { checkboxKinds: true });
  if (enabled(deps, "S01")) ruleS01(ctx, units);
  if (enabled(deps, "S02")) ruleS02(ctx, units);
  if (enabled(deps, "S03")) ruleS03(ctx, units);
  if (name === "plan.md" && enabled(deps, "S05")) ruleS05(ctx, units);
  if (enabled(deps, "S06")) ruleS06(ctx, units);
  if (enabled(deps, "S09")) ruleS09(ctx, units, deps.glossary);
  if (name === "goal.md") ruleCriteria(ctx, src, deps);
  if (
    enabled(deps, "S11") &&
    (name === "changes.md" || name === "decisions.md" || name === "learnings.md")
  )
    ruleS11(ctx, units);
}

/** Writing-standard rules for a library item. */
export function lintLibraryFile(ctx: FileCtx, _lib: LibrarySrc, deps: LintDeps): void {
  const units = proseUnits(ctx.L);
  if (enabled(deps, "S01")) ruleS01(ctx, units);
  if (enabled(deps, "S06")) ruleS06(ctx, units);
  if (enabled(deps, "S09")) ruleS09(ctx, units, deps.glossary);
}

const DATE_ONLY_TS =
  /^(\s*(?:-\s+)?(?:created|lease_until|updated_at|asked|answered_at):\s*)(\d{4}-\d{2}-\d{2})\s*$/;
const DATE_ONLY_HEADING = /^## (\d{4}-\d{2}-\d{2}) @/;
const CONFLICT = /^(<{7}|={7}|>{7})(?:\s|$)/;
const DISABLE = /<!--\s*wf-lint-disable\s+([A-Z0-9,\s]+?)\s*-->/;

/** Checks that read raw lines, then the inline disables. Runs after every other rule. */
export function lintCommon(ctx: FileCtx): void {
  const L = ctx.L;
  const mask = fenceMask(L.lines);
  const isIssueFile = (ISSUE_FILES as readonly string[]).includes(
    ctx.path.slice(ctx.path.lastIndexOf("/") + 1),
  );
  for (let i = 0; i < L.lines.length; i++) {
    const line = L.lines[i];
    if (!mask[i] && CONFLICT.test(line)) {
      ctx.report(
        "F012",
        "error",
        i,
        "The file holds git conflict markers.",
        "Resolve the merge, then delete the `<<<<<<<`, `=======` and `>>>>>>>` lines.",
      );
    }
    if (!isIssueFile || mask[i]) continue;
    const kv = DATE_ONLY_TS.exec(line);
    const head = kv ? undefined : DATE_ONLY_HEADING.exec(line);
    if (kv || head) {
      const date = (kv?.[2] ?? head?.[1]) as string;
      const from = kv ? kv[1].length : 3;
      ctx.report(
        "S13",
        "info",
        i,
        `Date-only timestamp ${date}. Write the time and the offset.`,
        `Use ${date}T09:00+05:30.`,
        from,
        from + date.length,
      );
    }
  }
  applyInlineDisables(ctx);
}

/** `<!-- wf-lint-disable S06 -->` silences the rule on its own line and on the next text line. */
function applyInlineDisables(ctx: FileCtx): void {
  const L = ctx.L;
  const off: { rule: string; lines: Set<number> }[] = [];
  L.lines.forEach((line, i) => {
    const m = DISABLE.exec(line);
    if (!m) return;
    let next = i + 1;
    while (next < L.lines.length && L.lines[next].trim() === "") next++;
    const lines = new Set([i + 1, next + 1]);
    for (const rule of m[1].split(/[,\s]+/).filter(Boolean)) off.push({ rule, lines });
  });
  if (off.length === 0) return;
  ctx.findings.splice(
    0,
    ctx.findings.length,
    ...ctx.findings.filter((f) => !off.some((o) => o.rule === f.rule && o.lines.has(f.line))),
  );
}
