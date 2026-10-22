// issues/wf/core/context-token-budget: wf-t3jp5. A scripted event marks it blocked by wf-w8vz4:
// the bundle stubs a diagram with its node count, and that count comes from the archify render.
import type { IssueSrc } from "../../source";
import { ago, ahead, dateIn, daysAgo } from "../../time";

export const TOKEN_BUDGET_NOTE = `# Token budget of the context bundle

Measured on the 6 largest issues of the dogfood workspace, before and after the trim. Counts use the byte-pair estimate of [[#C-7pw3d]] with a 10% margin.

| Issue | Before | After | Dropped |
|---|---|---|---|
| \`wf-3k9x2\` Live board updates | 11,240 | 5,870 | 6 older changes, 2 library items |
| \`wf-b1d7v\` Build v1 | 9,410 | 5,640 | 3 older changes, 1 done task |
| \`wf-t3jp5\` Trim context bundles | 6,980 | 5,310 | 2 older changes |
| \`wf-x5hd3\` Promote learnings | 6,210 | 5,120 | 1 older change |
| \`wf-skf01\` Draw the skills flowchart | 4,880 | 4,880 | nothing |
| \`wf-q4fs9\` Reap expired task leases | 3,540 | 3,540 | nothing |

## Trim order

1. Changes older than the last 5.
2. Library items beyond the 3 best matches.
3. Done tasks.
4. Notes and docs.

The bundle never drops \`## Needs you\`, \`## Next steps\` or the open criteria.

## Findings

- The \`tiktoken-rs\` count ran 5% above the Claude tokenizer on markdown tables. See [[#C-2ys8h]].
- A diagram stub costs about 30 tokens. The raw archify JSON costs 1,800.
`;

export function contextTokenBudget(): IssueSrc {
  return {
    slug: "context-token-budget",
    group: "g-core1",
    goal: {
      id: "wf-t3jp5",
      title: "Trim context bundles to the token budget",
      status: "in_progress",
      priority: "high",
      size: "m",
      owner: "mudit",
      labels: ["context", "tokens"],
      claimed_by: "codex",
      lease_until: ahead(38),
      blocked_by: [],
      due: dateIn(4),
      created: daysAgo(5, 10, 20),
    },
    context: `\`wf context\` prints the bundle that an agent reads at the start of a session. Today the bundle of a busy issue holds 11,000 tokens and pushes the agent over its budget. The agent then cuts the end of the bundle, and the end holds \`## Next steps\`.

This issue makes the bundle fit the budget. The CLI counts tokens, drops sections in a fixed order and always keeps what the agent needs to act.`,
    criteria: [
      {
        text: "When an agent runs `wf context` on an issue, the CLI shall print a bundle of at most 6000 tokens by default.",
        checked: true,
        verify: "`cargo test -p wf-cli context_budget`",
        evidence: "`cargo test -p wf-cli context_budget` passed at `c47a1be`, see [[#C-3mf7q]]",
        verified_by: "codex",
      },
      {
        text: "If the bundle exceeds the budget, then the CLI shall drop older changes, library items and done tasks, in that order.",
        checked: true,
        verify: "`cargo test -p wf-cli trim_order`",
      },
      {
        text: "The CLI shall keep `## Needs you` and `## Next steps` in every bundle.",
        checked: false,
        verify: "`cargo test -p wf-cli keep_next_steps`",
      },
      {
        text: "When the CLI drops a section, the bundle shall end with a line that names the dropped sections.",
        checked: false,
        verify: "manual",
      },
      {
        text: "When the issue holds a diagram, the bundle shall show a stub with the node count.",
        checked: false,
        verify: "`cargo test -p wf-cli diagram_stub`",
        scenario:
          "Given an issue with one workflow diagram of 14 nodes / When the user runs `wf context` / Then the bundle holds `[diagram workflow … · 14 nodes · plan.md:40]`",
      },
    ],
    out_of_scope: `- Summarizing sections with a model. \`wf\` makes no LLM calls.
- A per-agent budget. The budget is one number in \`workflow.toml\`.`,
    links: `- [[wf-b1d7v]]: Build v1, task T-4 ships the bundle.
- [[wf-w8vz4]]: archify renders in the background, which the diagram stub needs.
- [[lib-6pm4c]]: how an agent resumes an issue.`,
    plan: {
      updated_at: ago(7 * 60),
      updated_by: "codex",
      revision: 2,
      approach:
        "Count tokens with an estimate, because the CLI cannot call a tokenizer service. Trim in a fixed order and stop at the first fit. Replace each diagram with a stub last, because the stub needs the node count from the archify render.",
      assumptions: [
        {
          id: "A1",
          text: "A byte-pair estimate stays within 10% of the Claude tokenizer.",
          state: "confirmed",
        },
        { id: "A2", text: "Agents read the end line that names dropped sections.", state: "open" },
      ],
      prior_art: [{ ref: "lib-6pm4c", why: "the bundle is the first thing an agent reads." }],
      phases: [
        {
          index: 1,
          name: "Count tokens",
          tasks: [
            {
              id: "T-1",
              title: "Count tokens with a byte-pair estimate",
              status: "done",
              lane: "core",
              owns: ["crates/wf-cli/src/context/tokens.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-cli context_budget`",
              brief:
                "Estimate tokens from bytes with a 10% safety margin. Read the budget from `workflow.toml`.",
              steps: [
                { text: "Add the estimator.", done: true },
                { text: "Read `budget_tokens` from `workflow.toml`.", done: true },
              ],
            },
          ],
        },
        {
          index: 2,
          name: "Trim",
          tasks: [
            {
              id: "T-2",
              title: "Drop sections in a fixed order",
              status: "in_progress",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-cli/src/context/**"],
              satisfies: ["SC-2", "SC-3"],
              assignee: "role:backend",
              claimed_by: "codex",
              lease_until: ahead(38),
              verify: "`cargo test -p wf-cli trim_order`",
              brief:
                "Drop sections from the end of the order until the bundle fits. Never drop `## Needs you`, `## Next steps` or the open criteria.",
              steps: [
                { text: "Order the sections by drop priority.", done: true },
                { text: "Stop trimming at the first fit.", done: true },
                { text: "Test that `## Next steps` survives a 2000 token budget.", done: false },
              ],
            },
            {
              id: "T-3",
              title: "Name the dropped sections at the end of the bundle",
              status: "todo",
              lane: "core",
              depends_on: ["T-2"],
              owns: ["crates/wf-cli/src/context/footer.rs"],
              satisfies: ["SC-4"],
              assignee: "role:backend",
              verify: "manual",
              brief:
                "End the bundle with one line, for example `dropped: 6 changes, 2 library items`.",
            },
          ],
        },
        {
          index: 3,
          name: "Expose",
          tasks: [
            {
              id: "T-4",
              title: "Replace diagrams with stubs",
              status: "todo",
              lane: "core",
              depends_on: ["T-2"],
              owns: ["crates/wf-archify/src/stub.rs"],
              satisfies: ["SC-5"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-cli diagram_stub`",
              brief:
                'Print `[diagram <type> "<title>" · <n> nodes · <file>:<line>]` for each archify block. Read the node count from the render receipt.',
            },
            {
              id: "T-5",
              title: "Show the bundle size in the drawer",
              status: "todo",
              lane: "web",
              depends_on: ["T-2"],
              owns: ["web/src/features/issue/ContextSize.tsx"],
              satisfies: ["SC-1"],
              assignee: "role:frontend",
              verify: "manual",
              brief: "Show `4,210 of 6,000 tokens` next to the `Copy wf context` button.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "Token counting is done; the trim order is in flight.",
      updated_at: ago(55),
      updated_by: "codex",
      phase: "Trim",
      library_refs: ["lib-6pm4c"],
      session: "cx-31ab",
      done: [
        "[[#T-1]] The estimator counts within 10%. See [[#C-7pw3d]].",
        "[[#SC-1]] has evidence from `wf verify`. See [[#C-3mf7q]].",
      ],
      in_flight: [
        "[[#T-2]] The trim order. @codex holds the lease. Sections drop in order and stop at the first fit. The `## Next steps` test remains.",
      ],
      blocked: ["[[#T-4]] needs the node count from the archify render. See [[wf-w8vz4]]."],
      needs_you: [],
      failed_attempts: [
        "`tiktoken-rs` counted 5% above the Claude tokenizer: `bundle 6290 > budget 6000`. Switched to a byte-pair estimate with a 10% margin. See [[#C-2ys8h]].",
      ],
      handoff: [
        "@codex owns `crates/wf-cli/src/context/` under the T-2 lease. Do not edit those files.",
      ],
      next_steps: [
        "Add the `## Next steps` test to [[#T-2]].",
        "Claim [[#T-3]] after [[#T-2]] lands.",
        "Run `wf verify wf-t3jp5 SC-2`.",
      ],
    },
    changes: [
      {
        id: "C-7pw3d",
        ts: daysAgo(4, 13, 20),
        author: "codex",
        title: "Counted tokens with a byte-pair estimate",
        kind: "progress",
        task: "T-1",
        commit: "c47a1be",
        files: ["crates/wf-cli/src/context/tokens.rs"],
        model: "gpt-5-codex",
        body: "Added `estimate_tokens()`. It counts byte pairs and adds a 10% margin. The estimate stayed within 4% of the Claude tokenizer on 40 sample bundles.",
      },
      {
        id: "C-2ys8h",
        ts: daysAgo(4, 17, 10),
        author: "codex",
        title: "`tiktoken-rs` counted 5% above the Claude tokenizer",
        kind: "failure",
        task: "T-1",
        result: "fail",
        evidence: "`bundle 6290 > budget 6000`",
        files: ["crates/wf-cli/Cargo.toml"],
        body: "Tried `tiktoken-rs` for the count. It over-counted markdown tables, and the trim cut sections that fit.",
      },
      {
        id: "C-3mf7q",
        ts: daysAgo(3, 11, 45),
        author: "codex",
        title: "Verified SC-1 with `context_budget`",
        kind: "verify",
        task: "T-1",
        criteria: ["SC-1"],
        result: "pass",
        evidence: "`cargo test -p wf-cli context_budget` passed at `c47a1be`",
        commit: "c47a1be",
        body: "Ran `wf verify wf-t3jp5 SC-1`. The largest bundle of the golden workspace came out at 5,870 tokens.",
      },
      {
        id: "C-9ez6r",
        ts: ago(26 * 60),
        author: "codex",
        title: "Dropped sections in a fixed order",
        kind: "progress",
        task: "T-2",
        criteria: ["SC-2"],
        commit: "e50d93c",
        files: ["crates/wf-cli/src/context/trim.rs"],
        model: "gpt-5-codex",
        body: "Added `trim()`. It drops older changes, then library items, then done tasks, and stops at the first fit.",
      },
      {
        id: "C-5kn4j",
        ts: ago(55),
        author: "codex",
        title: "Tested the trim order on the golden workspace",
        kind: "test",
        task: "T-2",
        criteria: ["SC-2"],
        result: "pass",
        files: ["crates/wf-cli/tests/trim_order.rs"],
        body: "Trimmed the 6 largest issues of the dogfood workspace. Every bundle fit 6000 tokens. See `notes/token-budget.md`.",
      },
    ],
    decisions: [
      {
        id: "D-4hv9s",
        ts: daysAgo(4, 17, 40),
        author: "codex",
        title: "Count tokens with an estimate, not a tokenizer crate",
        status: "accepted",
        topic: "token-count",
        affects: ["SC-1"],
        decided_by: ["codex", "mudit"],
        decision: "Estimate tokens from byte pairs and add a 10% margin.",
        because:
          "`wf` stays offline and makes no model call. The estimate is within 4% of the Claude tokenizer and never counts low.",
        rejected:
          "`tiktoken-rs` (5% high on tables); a call to a token-count API (needs a network and a key).",
        consequences: "Bundles carry about 10% of unused budget.",
        revisit: "Agents report that bundles end up too short.",
      },
    ],
    learnings: [
      {
        id: "L-7tq2x",
        ts: ago(55),
        author: "codex",
        title: "Leave 10% of the token budget unused.",
        kind: "tip",
        tags: ["context", "tokens"],
        applies_to: ["crates/wf-cli/src/context/**"],
        promote: "no",
        rule: "Leave 10% of the token budget unused. An estimate that lands on the limit gets cut by the agent.",
        evidence: "Bundles at 98% of the budget lost their last section in 3 of 5 sessions.",
      },
    ],
    docs: [
      {
        path: "notes/token-budget.md",
        title: "Token budget of the context bundle",
        body: TOKEN_BUDGET_NOTE,
      },
    ],
  };
}
