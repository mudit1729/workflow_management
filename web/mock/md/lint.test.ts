// (d) The writing-standard rules, one by one: what each flags, what it leaves alone, where it
// points. The seeded findings are checked against the seed workspace in roundtrip.test.ts.
import { describe, expect, test } from "vitest";
import type { Diagnostic } from "@/gen/types";
import { loadWorkspace } from "./index";

const NOW = Date.parse("2026-10-22T10:00+05:30");
const TOML = 'wf_format = 1\n[server]\nauthor = "shruti"\n';
const GLOSSARY =
  "# Glossary\n\n## issue\n- kind: noun\n- means: A folder with goal.md.\n- avoid: ticket, card, story\n";

const front =
  "---\nid: wf-aaaaa\ntitle: A\nstatus: planned\ncreated: 2026-10-22T10:00+05:30\n---\n\n";
const goalWith = (
  context: string,
  criteria = "- [ ] SC-1: The system shall respond within 2 s.\n",
) => `${front}## Context\n\n${context}\n\n## Success criteria\n\n${criteria}`;

const GOAL = "issues/a/goal.md";
const PLAN = "issues/a/plan.md";
const planWith = (body: string) =>
  `---\nupdated_at: 2026-10-22T10:00+05:30\nupdated_by: "@shruti"\n---\n\n## Phase 1: One\n\n### T-1: Do it\n- status: todo\n\n${body}`;

function lint(files: Record<string, string>, extraToml = ""): Record<string, Diagnostic[]> {
  return loadWorkspace(
    { "workflow.toml": TOML + extraToml, "glossary.md": GLOSSARY, ...files },
    { now: NOW },
  ).diagnostics;
}

const of = (d: Record<string, Diagnostic[]>, path: string, rule: string) =>
  (d[path] ?? []).filter((x) => x.rule === rule);

const words = (n: number, w = "word") => Array.from({ length: n }, () => w).join(" ");

describe("S01 sentence length", () => {
  test("25 words pass, 26 are flagged with the count and the place", () => {
    const ok = of(lint({ [GOAL]: goalWith(`${words(25)}.`) }), GOAL, "S01");
    expect(ok).toEqual([]);
    const text = goalWith(`Short one. ${words(26, "Word")}.`);
    const hit = of(lint({ [GOAL]: text }), GOAL, "S01");
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({
      severity: "warn",
      message: "Sentence has 26 words (limit 25). Split it into two sentences.",
    });
    // the finding sits on the sentence start: line 10, after "Short one. "
    expect(hit[0].line).toBe(10);
    expect(hit[0].col).toBe("Short one. ".length + 1);
  });

  test("steps have a limit of 20 words", () => {
    const step = (n: number) => planWith(`- [ ] Add ${words(n - 1)}.\n`);
    expect(of(lint({ [GOAL]: goalWith("Why."), [PLAN]: step(20) }), PLAN, "S01")).toEqual([]);
    const hit = of(lint({ [GOAL]: goalWith("Why."), [PLAN]: step(21) }), PLAN, "S01");
    expect(hit).toHaveLength(1);
    expect(hit[0].message).toBe("Sentence has 21 words (limit 20). Split it into two sentences.");
  });

  test("a code span or a reference counts as one word", () => {
    const text = goalWith(
      `Run \`cargo test -p wf-index --all-features live_append\` and see [[wf-3k9x2#D-7f3k2]] now ${words(18)}.`,
    );
    expect(of(lint({ [GOAL]: text }), GOAL, "S01")).toEqual([]);
  });

  test("code blocks, tables and headings are not prose", () => {
    const text = goalWith(
      `\`\`\`\n${words(40)}.\n\`\`\`\n\n| a | b |\n|---|---|\n| ${words(40)} | x |`,
    );
    expect(of(lint({ [GOAL]: text }), GOAL, "S01")).toEqual([]);
  });

  test("a full stop inside an abbreviation does not end a sentence", () => {
    const text = goalWith(`Use tools e.g. the CLI or i.e. the API ${words(10)}. Next sentence.`);
    expect(of(lint({ [GOAL]: text }), GOAL, "S01")).toEqual([]);
  });
});

describe("S02, S03, S05, S06", () => {
  test("S02 flags a paragraph of seven sentences", () => {
    const seven = Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is here.`).join(
      " ",
    );
    const six = Array.from({ length: 6 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
    expect(of(lint({ [GOAL]: goalWith(six) }), GOAL, "S02")).toEqual([]);
    const hit = of(lint({ [GOAL]: goalWith(seven) }), GOAL, "S02");
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({
      severity: "info",
      message: "Paragraph has 7 sentences (limit 6). Split it, or cut it.",
    });
  });

  test("S03 flags a passive with an actor and names the active form", () => {
    const hit = of(
      lint({ [GOAL]: goalWith("The words are being skipped by the matcher.") }),
      GOAL,
      "S03",
    );
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe("info");
    expect(hit[0].message).toBe("Passive voice. Name the actor: “the matcher skips …”.");
  });

  test("S03 leaves quotes, code and plain adjectives alone", () => {
    const text = goalWith(
      'The note says "is skipped by the matcher". Also `was run by cargo`. The issue is done and the list is ready.',
    );
    expect(of(lint({ [GOAL]: text }), GOAL, "S03")).toEqual([]);
  });

  test("S05 flags a step that starts with an article, a pronoun or a gerund", () => {
    const hits = of(
      lint({
        [GOAL]: goalWith("Why."),
        [PLAN]: planWith(
          "- [ ] The list gets read.\n- [ ] Adding the route.\n- [ ] It works.\n- [ ] Add the route.\n- [x] Run `cargo test`.\n",
        ),
      }),
      PLAN,
      "S05",
    );
    expect(hits.map((h) => h.line)).toEqual([11, 12, 13]);
    expect(hits[0].message).toBe("Step does not start with an imperative verb.");
  });

  test("S05 only applies to plan steps", () => {
    const text = goalWith(
      "Text.",
      "- [ ] SC-1: The system shall respond within 2 s.\n- [ ] The checklist item.\n",
    );
    expect(of(lint({ [GOAL]: text }), GOAL, "S05")).toEqual([]);
  });

  test("S06 flags hedge words with advice", () => {
    const text = goalWith("It is probably fine. The team may want to look. Maybe later.");
    const hits = of(lint({ [GOAL]: text }), GOAL, "S06");
    expect(hits.map((h) => h.message)).toEqual([
      "Hedge word “probably”. State the fact, or list it as an assumption.",
      "Hedge word “may”. Say who decides, and when.",
      "Hedge word “maybe”. State the fact, or list it as an assumption.",
    ]);
    expect(hits.every((h) => h.severity === "warn")).toBe(true);
    expect(hits[0].col).toBe("It is ".length + 1);
  });

  test("S06 ignores quoted words, code spans and words that only contain a hedge", () => {
    const text = goalWith(
      'The word "probably" is banned. Use `maybe` in code. The mayor said Mayday. A mayfly.',
    );
    expect(of(lint({ [GOAL]: text }), GOAL, "S06")).toEqual([]);
  });
});

describe("S07 and S08 from the EARS parser", () => {
  test("a freeform criterion is S08 and, with nothing measurable, S07", () => {
    const d = lint({
      [GOAL]: goalWith("Why.", "- [ ] SC-1: Flagged hedge words are easy to fix.\n"),
    });
    expect(of(d, GOAL, "S08").map((x) => x.message)).toEqual([
      "SC-1 does not match an EARS pattern.",
    ]);
    expect(of(d, GOAL, "S07").map((x) => x.message)).toEqual(["SC-1 cannot be measured."]);
    expect(of(d, GOAL, "S08")[0]).toMatchObject({
      severity: "info",
      fix: "Rewrite it as “When …, the <system> shall …”.",
    });
    expect(of(d, GOAL, "S07")[0].severity).toBe("warn");
  });

  test("a verify line, a number with a unit or a literal makes it measurable", () => {
    for (const criteria of [
      "- [ ] SC-1: The linter shall flag hedge words.\n  - verify: `cargo test`\n",
      "- [ ] SC-1: The board shall show the entry within 2 s.\n",
      "- [ ] SC-1: The linter shall print `S06`.\n",
    ]) {
      expect(of(lint({ [GOAL]: goalWith("Why.", criteria) }), GOAL, "S07")).toEqual([]);
    }
  });

  test("an EARS sentence is not S08", () => {
    const ok = [
      "When an agent appends, the board shall show it within 2 s.",
      "While the stream is down, the board shall show a badge for 5 s.",
      "If the file is invalid, then the drawer shall show `F001`.",
      "The daemon shall ignore its own writes within 1 s.",
      "Where archify is present, the card shall show `ready`.",
    ];
    for (const sentence of ok)
      expect(
        of(lint({ [GOAL]: goalWith("Why.", `- [ ] SC-1: ${sentence}\n`) }), GOAL, "S08"),
        sentence,
      ).toEqual([]);
  });

  test("the finding points at the criterion line", () => {
    const text = goalWith(
      "Why.",
      "- [ ] SC-1: The system shall respond within 2 s.\n- [ ] SC-2: It is nice.\n",
    );
    const hit = of(lint({ [GOAL]: text }), GOAL, "S08")[0];
    expect(text.split("\n")[hit.line - 1]).toMatch(/^- \[ \] SC-2: /);
  });
});

describe("S09 glossary synonyms", () => {
  const text = goalWith(
    'Open a ticket. Two tickets, no `ticket` here, and "story" quoted. See [[wf-aaaaa]] for the card.',
  );

  test("flags avoided words outside code and quotes, with a replacement", () => {
    const hits = of(lint({ [GOAL]: text }), GOAL, "S09");
    expect(hits.map((h) => h.message)).toEqual([
      "“ticket” is on the avoid list. The glossary term is “issue”.",
      "“tickets” is on the avoid list. The glossary term is “issue”.",
      "“card” is on the avoid list. The glossary term is “issue”.",
    ]);
    expect(hits[0]).toMatchObject({ severity: "warn", fix: "Replace “ticket” with “issue”." });
  });

  test("[lint] disable turns the rule off", () => {
    const d = lint({ [GOAL]: text }, '[lint]\ndisable = ["S09"]\n');
    expect(of(d, GOAL, "S09")).toEqual([]);
  });

  test("without an avoid list there is nothing to flag", () => {
    const d = loadWorkspace({ "workflow.toml": TOML, [GOAL]: text }, { now: NOW }).diagnostics;
    expect(of(d, GOAL, "S09")).toEqual([]);
  });
});

describe("S11, S13, F012 and inline disables", () => {
  const changes = (body: string) =>
    `# Changes\n\n## 2026-10-22T10:00+05:30 @shruti — Did a thing {#C-aaaaa}\n- kind: fix\n\n${body}\n`;
  const CH = "issues/a/changes.md";

  test("S11 flags an entry that starts with It or This, and contractions", () => {
    const d = lint({
      [GOAL]: goalWith("Why."),
      [CH]: changes("It didn't work. The fix wasn't small."),
    });
    const hits = of(d, CH, "S11").map((h) => h.message);
    expect(hits).toContain("C-aaaaa starts with “It”. Name the subject.");
    expect(hits).toContain("Contraction “didn't”. Write the words out.");
    expect(hits).toContain("Contraction “wasn't”. Write the words out.");
    expect(
      of(
        lint({ [GOAL]: goalWith("Why."), [CH]: changes("Fixed the lock. The test passes.") }),
        CH,
        "S11",
      ),
    ).toEqual([]);
  });

  test("S13 flags a date-only timestamp in a field and in an entry heading", () => {
    const g = `---\nid: wf-aaaaa\ntitle: A\nstatus: planned\ncreated: 2026-10-22\n---\n\n## Context\n\nWhy.\n\n## Success criteria\n\n- [ ] SC-1: The system shall respond within 2 s.\n`;
    const c = "# Changes\n\n## 2026-10-22 @shruti — Did it {#C-aaaaa}\n\nDone.\n";
    const d = lint({ [GOAL]: g, [CH]: c });
    expect(of(d, GOAL, "S13")).toHaveLength(1);
    expect(of(d, GOAL, "S13")[0]).toMatchObject({ severity: "info", line: 5 });
    expect(of(d, CH, "S13")).toHaveLength(1);
    // a full timestamp is fine
    expect(of(lint({ [GOAL]: goalWith("Why.") }), GOAL, "S13")).toEqual([]);
  });

  test("S13 does not apply to the date fields of a library item", () => {
    const lib =
      "---\nid: lib-aaaaa\ntitle: X\nkind: pattern\ndescription: Use when x.\nstatus: draft\nsource: []\nauthors: [shruti]\ncreated: 2026-10-22\n---\n\n## Rule\n\nDo x.\n";
    expect(of(lint({ "library/patterns/x.md": lib }), "library/patterns/x.md", "S13")).toEqual([]);
  });

  test("an inline disable silences a rule on the next text line only", () => {
    const text = goalWith(
      "It is probably fine.\n\n<!-- wf-lint-disable S06 -->\nIt is maybe fine.\n\nIt is perhaps fine.",
    );
    const hits = of(lint({ [GOAL]: text }), GOAL, "S06");
    expect(hits.map((h) => text.split("\n")[h.line - 1])).toEqual([
      "It is probably fine.",
      "It is perhaps fine.",
    ]);
  });

  test("F012 flags each conflict marker line", () => {
    const text = `${goalWith("Why.")}\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other\n`;
    const hits = of(lint({ [GOAL]: text }), GOAL, "F012");
    expect(hits).toHaveLength(3);
    expect(hits[0].severity).toBe("error");
  });

  test("Q rules are never reported by the loader", () => {
    const d = lint({ [GOAL]: goalWith("Why.") });
    for (const list of Object.values(d)) for (const x of list) expect(x.rule).not.toMatch(/^Q/);
  });
});
