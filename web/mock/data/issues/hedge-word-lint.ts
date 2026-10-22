// issues/wf/core/hedge-word-lint: wf-k8dv6, the lint showcase. It carries S01, S03, S05, S06,
// S07, S08, Q006, Q007 and Q010, so the lint panel and the lint dot have real content.
import type { IssueSrc } from "../../source";
import { daysAgo } from "../../time";

export function hedgeWordLint(): IssueSrc {
  return {
    slug: "hedge-word-lint",
    group: "g-core1",
    goal: {
      id: "wf-k8dv6",
      title: "Lint hedge words (S06)",
      status: "planned",
      priority: "low",
      size: "s",
      owner: "mudit",
      labels: ["lint", "writing"],
      blocked_by: [],
      created: daysAgo(8, 16, 45),
    },
    context: `Hedge words such as "maybe" and "probably" make a goal or a step impossible to check. An agent that reads "this might need a retry" cannot tell whether to retry. The writing standard bans them, but no rule enforces the ban, and the first drafts of this workspace still hold dozens of them because nobody reads the standard before they write a goal.

Rule S06 flags a hedge word in prose and in criteria. It is probably the cheapest rule to build, because the word list is short and the matcher of S09 already exists. The team may want to extend the list later. Hedge words that appear inside code spans are being skipped by the matcher, which is why the lint on this file looks noisy.`,
    criteria: [
      {
        text: "The linter shall flag hedge words.",
        checked: false,
      },
      {
        text: "Flagged hedge words are easy to fix.",
        checked: false,
      },
      {
        text: "When `wf lint` finds a hedge word, the linter shall print the word, its line and a fix.",
        checked: true,
        verify: "`cargo test -p wf-lint s06_prints_line`",
      },
      {
        text: "If a hedge word sits inside a code span, then the linter shall ignore the word.",
        checked: false,
        verify: "`cargo test -p wf-lint s06_skips_code`",
      },
    ],
    out_of_scope: `- Rewriting the hedged sentence. The linter prints a fix and changes no file.
- Hedge words in other languages.`,
    links: `- [[wf-9gr4k]]: the S09 matcher that S06 reuses.
- [[lib-k2s7b]]: write criteria as EARS sentences.`,
    plan: {
      updated_at: daysAgo(7, 10, 30),
      updated_by: "mudit",
      revision: 1,
      approach:
        "Collect the hedge words, then reuse the whole-word matcher of S09. Run the rule on prose and criteria. The rule is warn level, and it can be disabled per file.",
      assumptions: [
        { id: "A1", text: "The word list stays under 40 entries.", state: "open" },
        { id: "A2", text: "The matcher of S09 is enough for S06.", state: "open" },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Rule",
          tasks: [
            {
              id: "T-1",
              title: "Collect the hedge word list",
              status: "todo",
              lane: "core",
              owns: ["crates/wf-lint/data/hedge_words.txt"],
              assignee: "role:backend",
              brief:
                "Read the writing standard and the first drafts of the workspace. The list is probably short, and most entries are adverbs.",
              steps: [
                { text: "The list gets read from the writing standard.", done: false },
                { text: "Add each word with its plain-English fix.", done: false },
              ],
            },
            {
              id: "T-2",
              title: "Write the S06 rule",
              status: "todo",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-lint/src/s06.rs"],
              satisfies: ["SC-3"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-lint s06_prints_line`",
              brief:
                "Match every word of the list with the matcher of S09, print the line and the fix for each match, skip the code spans and keep the rule at warn level.",
            },
          ],
        },
      ],
    },
    changes: [
      {
        id: "C-5yd8e",
        ts: daysAgo(7, 10, 45),
        author: "mudit",
        title: "Counted hedge words in the first drafts",
        kind: "research",
        body: "Searched the 26 issues of the dogfood workspace. Found 41 hedge words in 14 files. The words `probably`, `maybe` and `should` made up 30 of them.",
      },
    ],
    decisions: [],
    learnings: [],
    findings: [
      {
        rule: "S06",
        severity: "warn",
        file: "goal.md",
        find: "probably the cheapest",
        message: "Hedge word “probably”. State the fact, or list it as an assumption.",
        fix: "It is the cheapest rule to build, because the word list is short.",
      },
      {
        rule: "S06",
        severity: "warn",
        file: "goal.md",
        find: "may want to extend",
        message: "Hedge word “may”. Say who decides, and when.",
        fix: "The team extends the list after the first dogfood run.",
      },
      {
        rule: "S01",
        severity: "warn",
        file: "goal.md",
        find: "The writing standard bans them, but no rule enforces the ban",
        message: "Sentence has 33 words (limit 25). Split it into two sentences.",
      },
      {
        rule: "S03",
        severity: "info",
        file: "goal.md",
        find: "are being skipped by the matcher",
        message: "Passive voice. Name the actor: “the matcher skips hedge words in code spans”.",
      },
      {
        rule: "S06",
        severity: "warn",
        file: "plan.md",
        find: "is probably short",
        message: "Hedge word “probably”. State the fact, or list it as an assumption.",
        fix: "The list is short, and most entries are adverbs.",
      },
      {
        rule: "S05",
        severity: "warn",
        file: "plan.md",
        find: "The list gets read from the writing standard.",
        message: "Step does not start with an imperative verb.",
        fix: "Read the list from the writing standard.",
      },
      {
        rule: "S01",
        severity: "warn",
        file: "plan.md",
        find: "Match every word of the list with the matcher of S09, print the line",
        message: "Sentence has 31 words (limit 25). Split it into two sentences.",
      },
    ],
  };
}
