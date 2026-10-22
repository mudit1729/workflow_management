// issues/wf/core/glossary-synonym-lint: wf-9gr4k, in review. Its learning L-3nz8w is
// promoted as the draft lib-7nq3d, and a review request waits for the library reviewer.
import type { IssueSrc } from "../../source";
import { ago, daysAgo } from "../../time";

export function glossarySynonymLint(): IssueSrc {
  return {
    slug: "glossary-synonym-lint",
    group: "g-core1",
    goal: {
      id: "wf-9gr4k",
      title: "Glossary synonym lint (S09)",
      status: "review",
      priority: "medium",
      size: "s",
      owner: "mudit",
      labels: ["lint", "glossary"],
      claimed_by: "claude-sonnet",
      blocked_by: [],
      created: daysAgo(6, 12, 30),
    },
    context: `\`glossary.md\` lists the words a team avoids, such as \`ticket\` for \`issue\`. Nothing checks the text against that list. The avoided words spread through goals, plans and entries, and two people name one thing in two ways.

Rule S09 flags a word from an \`avoid\` list and offers the preferred term as the fix.`,
    criteria: [
      {
        text: "When a file uses a word from an `avoid` list, the linter shall report S09 with the preferred term as the fix.",
        checked: true,
        verify: "`cargo test -p wf-lint s09_reports_synonym`",
        evidence: "`cargo test -p wf-lint s09_reports_synonym` passed at `6e1c8d5`",
        verified_by: "claude-sonnet",
      },
      {
        text: "The linter shall match whole words only and ignore case.",
        checked: true,
        verify: "`cargo test -p wf-lint s09_whole_words`",
        evidence: "`cargo test -p wf-lint s09_whole_words` passed at `6e1c8d5`",
        verified_by: "claude-sonnet",
      },
      {
        text: "If a word sits inside a code span or a link, then the linter shall skip it.",
        checked: true,
        verify: "`cargo test -p wf-lint s09_skips_code`",
        evidence: "`cargo test -p wf-lint s09_skips_code` passed at `b20f7a4`",
        verified_by: "claude-sonnet",
      },
    ],
    out_of_scope: `- Rewriting the text. The linter prints a fix and changes no file.
- Synonyms in code comments.`,
    links: `- [[lib-7nq3d]]: match glossary synonyms on whole words.
- [[wf-k8dv6]]: the S06 rule shares the word matcher.`,
    plan: {
      updated_at: daysAgo(6, 13, 0),
      updated_by: "claude-sonnet",
      revision: 1,
      approach:
        "Build a matcher from the `avoid` lists of `glossary.md`. Run it over prose only, then print the preferred term as the fix.",
      assumptions: [
        { id: "A1", text: "A glossary holds fewer than 200 avoided words.", state: "confirmed" },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Rule",
          tasks: [
            {
              id: "T-1",
              title: "Match avoided words on word boundaries",
              status: "done",
              lane: "core",
              owns: ["crates/wf-lint/src/s09.rs"],
              satisfies: ["SC-1", "SC-2"],
              assignee: "role:backend",
              claimed_by: "claude-sonnet",
              verify: "`cargo test -p wf-lint s09_whole_words`",
              brief:
                "Build one regex per `avoid` word with `\\b` anchors. Compare case-insensitively.",
            },
            {
              id: "T-2",
              title: "Skip code spans and links",
              status: "done",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-lint/src/prose.rs"],
              satisfies: ["SC-3"],
              assignee: "role:backend",
              claimed_by: "claude-sonnet",
              verify: "`cargo test -p wf-lint s09_skips_code`",
              brief: "Mask code spans, fenced blocks and link targets before the match.",
            },
            {
              id: "T-3",
              title: "Print the preferred term as the fix",
              status: "review",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-lint/src/fix.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "claude-sonnet",
              verify: "`cargo test -p wf-lint s09_reports_synonym`",
              brief: "Read the term name from the glossary entry and write it into `fix`.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "The rule passes its tests; @shruti reviews the new library draft.",
      updated_at: ago(50),
      updated_by: "claude-sonnet",
      phase: "Rule",
      session: "cc-5a90",
      done: [
        "[[#T-1]] and [[#T-2]] match avoided words in prose. See [[#C-8tv2c]].",
        "[[#SC-1]], [[#SC-2]] and [[#SC-3]] have evidence from `wf verify`.",
      ],
      in_flight: ["[[#T-3]] The fix text waits for a code review by @mudit."],
      needs_you: [
        {
          id: "Q-3bw7m",
          question:
            'Approve the draft `lib-7nq3d`, "Match glossary synonyms on whole words", as a pattern?',
          from: "claude-sonnet",
          to: "shruti",
          kind: "approval",
          urgency: "fyi",
          asked: ago(55),
          options: ["approve", "reject"],
          ref: "[[lib-7nq3d]]",
        },
      ],
      handoff: [
        "The matcher lives in `crates/wf-lint/src/s09.rs`. [[wf-k8dv6]] reuses it for S06.",
      ],
      next_steps: [
        "Wait for the review of [[#T-3]] by @mudit.",
        "Move the issue to done after the review and the answer to [[#Q-3bw7m]].",
      ],
    },
    changes: [
      {
        id: "C-3qy7n",
        ts: daysAgo(5, 15, 0),
        author: "claude-sonnet",
        title: "Matched avoided words on word boundaries",
        kind: "progress",
        task: "T-1",
        commit: "6e1c8d5",
        files: ["crates/wf-lint/src/s09.rs"],
        model: "claude-sonnet-5-5",
        body: "Built one regex per `avoid` word. The first version matched `story` inside `history`, so the regex now uses `\\b` anchors.",
      },
      {
        id: "C-8tv2c",
        ts: daysAgo(3, 14, 20),
        author: "claude-sonnet",
        title: "Tested S09 on the dogfood workspace",
        kind: "test",
        task: "T-2",
        criteria: ["SC-1", "SC-2", "SC-3"],
        result: "pass",
        commit: "b20f7a4",
        files: ["crates/wf-lint/tests/s09.rs"],
        model: "claude-sonnet-5-5",
        body: "Ran S09 on 26 issues. It found 7 uses of `ticket` and `card`, and no false match in a code span.",
      },
      {
        id: "C-5mx9a",
        ts: ago(2 * 60),
        author: "claude-sonnet",
        title: "Promoted L-3nz8w to the draft lib-7nq3d",
        kind: "progress",
        files: ["library/patterns/match-synonyms-on-word-boundaries.md"],
        model: "claude-sonnet-5-5",
        body: "Ran `wf promote wf-9gr4k#L-3nz8w --kind pattern`. The draft links back to the learning and asks @shruti to review it.",
      },
      {
        id: "C-7bh4k",
        ts: ago(70),
        author: "mudit",
        title: "Reviewed the S09 matcher",
        kind: "review",
        task: "T-2",
        body: "Read `s09.rs` and `prose.rs`. Asked for a test with a link target that holds an avoided word. Left the fix text for the next pass.",
      },
    ],
    decisions: [],
    learnings: [
      {
        id: "L-3nz8w",
        ts: daysAgo(5, 15, 30),
        author: "claude-sonnet",
        title: "Match glossary synonyms on whole words, never on substrings.",
        kind: "pattern",
        tags: ["lint", "glossary", "regex"],
        applies_to: ["crates/wf-lint/**"],
        promote: "candidate",
        rule: "Match an avoided word with `\\b` anchors and ignore case. A substring match flags `history` for `story`.",
        evidence: "[[#C-3qy7n]] saw `story` match inside `history` on the first run.",
      },
      {
        id: "L-6fp2t",
        ts: daysAgo(3, 14, 40),
        author: "claude-sonnet",
        title: "Mask code spans before you lint prose.",
        kind: "tip",
        tags: ["lint", "markdown"],
        applies_to: ["crates/wf-lint/**"],
        promote: "no",
        rule: "Mask code spans, fenced blocks and link targets before any prose rule runs.",
        evidence:
          "Without the mask, S09 flagged `ticket` inside the branch name `fix/ticket-links`.",
      },
    ],
    activity: [
      {
        ts: ago(2 * 60 + 30),
        author: "claude-sonnet",
        kind: "status",
        title: "Moved from in_progress to review",
      },
      {
        ts: ago(55),
        author: "claude-sonnet",
        kind: "request",
        title: "Asked @shruti to review lib-7nq3d",
      },
    ],
  };
}
