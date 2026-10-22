// issues/wf/skills/promote-learnings: wf-x5hd3. No open request yet: a scripted event
// adds a blocking question here. T-4 is not ready because its `owns` overlaps a live lease.
import type { IssueSrc } from "../../source";
import { ago, ahead, dateIn, daysAgo } from "../../time";

export function promoteLearnings(): IssueSrc {
  return {
    slug: "promote-learnings",
    group: "g-skl01",
    goal: {
      id: "wf-x5hd3",
      title: "Promote learnings to the library",
      status: "in_progress",
      priority: "medium",
      size: "m",
      owner: "shruti",
      labels: ["library"],
      claimed_by: "claude-sonnet",
      lease_until: ahead(44),
      blocked_by: [],
      due: dateIn(12),
      created: daysAgo(6, 11, 0),
    },
    context: `Agents write learnings in \`learnings.md\`, and the rest of the team never reads them. The library holds the rules worth keeping, but a promotion today means copying text by hand and losing the link to the evidence.

This issue adds \`wf promote\`. It copies a learning or a decision into \`library/\` as a draft with a \`source:\` backlink. It then asks the group owner to review the draft. Agents read reviewed items only.`,
    criteria: [
      {
        text: "When a user promotes a learning, the daemon shall create a draft library item with a `source:` backlink to the entry.",
        checked: true,
        verify: "`cargo test -p wf-edit promote_creates_draft`",
        evidence:
          "`cargo test -p wf-edit promote_creates_draft` passed at `5d0c3b9`, see [[#C-2wz7m]]",
        verified_by: "codex",
      },
      {
        text: "While a library item is a draft, the CLI shall leave it out of `wf context`.",
        checked: false,
        verify: "`cargo test -p wf-cli context_skips_drafts`",
      },
      {
        text: "If a library item with a similar title exists, then the promote dialog shall suggest a merge.",
        checked: false,
        verify: "manual",
        scenario:
          "Given a library item titled `Rescan subtrees instead of trusting notify on macOS` / When a user promotes a learning titled `notify drops rename events on macOS` / Then the dialog shows `Similar: lib-4tz7c` and a merge action",
      },
      {
        text: "When the group owner approves a draft, the daemon shall set `status: reviewed` and `last_reviewed` to today.",
        checked: true,
        verify: "`cargo test -p wf-edit approve_sets_reviewed`",
        evidence:
          "`cargo test -p wf-edit approve_sets_reviewed` passed at `a82e6f1`, see [[#C-8dq3p]]",
        verified_by: "claude-sonnet",
      },
    ],
    out_of_scope: `- Merging two library items. The dialog only suggests a merge.
- Auto-promoting a learning without a person in the loop.`,
    links: `- [[lib-5cw1e]]: review promoted items before agents read them.
- [[wf-9gr4k]]: the first promote that used this flow.
- [[wf-b1d7v]]: Build v1.`,
    plan: {
      updated_at: ago(2 * 24 * 60),
      updated_by: "claude-sonnet",
      revision: 2,
      approach:
        "Build the promote and approve ops in `wf-edit` first, because both the CLI and the web UI call them. Build the dialog next. Filter drafts out of the context bundle last, because that file has a live lease.",
      assumptions: [
        {
          id: "A1",
          text: "The group owner reads a review request within a day.",
          state: "open",
        },
        {
          id: "A2",
          text: "A trigram score on titles finds near duplicates.",
          state: "confirmed",
        },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Promote and approve",
          tasks: [
            {
              id: "T-1",
              title: "Create the draft with a source backlink",
              status: "done",
              lane: "core",
              owns: ["crates/wf-edit/src/promote.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              claimed_by: "codex",
              verify: "`cargo test -p wf-edit promote_creates_draft`",
              brief:
                "Write `library/<kind>s/<slug>.md` with `status: draft` and a `source:` list. Take the kind from the entry.",
              steps: [
                { text: "Pick the library kind from the entry kind.", done: true },
                { text: "Write the draft file under the lock.", done: true },
              ],
            },
            {
              id: "T-2",
              title: "Approve a draft",
              status: "done",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-edit/src/approve.rs"],
              satisfies: ["SC-4"],
              assignee: "role:backend",
              claimed_by: "claude-sonnet",
              verify: "`cargo test -p wf-edit approve_sets_reviewed`",
              brief: "Set `status: reviewed`, `reviewed_by` and `last_reviewed` in one splice.",
            },
          ],
        },
        {
          index: 2,
          name: "Review flow",
          tasks: [
            {
              id: "T-3",
              title: "Build the promote dialog",
              status: "in_progress",
              lane: "web",
              depends_on: ["T-1"],
              owns: ["web/src/features/library/PromoteDialog.tsx"],
              satisfies: ["SC-3"],
              assignee: "role:frontend",
              claimed_by: "shruti",
              lease_until: ahead(50),
              verify: "manual",
              brief:
                "Show the kind, the slug and a preview of the draft. Show `Similar: lib-…` when the title score passes 0.6.",
              steps: [
                { text: "Show the kind and the slug.", done: true },
                { text: "Show the preview of the draft.", done: true },
                { text: "Show the merge suggestion.", done: false },
              ],
            },
            {
              id: "T-4",
              title: "Leave drafts out of the context bundle",
              status: "todo",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-cli/src/context/select.rs"],
              satisfies: ["SC-2"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-cli context_skips_drafts`",
              brief:
                "Skip every library item that is not `reviewed` when the bundle picks items. [[wf-t3jp5]] holds the lease on the context folder.",
            },
            {
              id: "T-5",
              title: "Open a review request on promote",
              status: "todo",
              lane: "core",
              depends_on: ["T-1"],
              owns: ["crates/wf-edit/src/review_request.rs"],
              satisfies: ["SC-1"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-edit promote_asks_owner`",
              brief:
                "Append a `Q-` request for the group owner to `current_state.md` of the source issue. Link the draft in `ref:`.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "Promote and approve work in the daemon; the dialog is in flight.",
      updated_at: ago(3 * 60 + 10),
      updated_by: "claude-sonnet",
      phase: "Review flow",
      library_refs: ["lib-5cw1e"],
      session: "cc-c4d0",
      done: [
        "[[#T-1]] Promote writes the draft. See [[#C-5hk9f]].",
        "[[#T-2]] Approve sets the review fields. See [[#C-8dq3p]].",
        "[[#SC-1]] has evidence from `wf verify`. See [[#C-2wz7m]].",
      ],
      in_flight: [
        "[[#T-3]] The promote dialog. @shruti holds the lease. The kind, the slug and the preview work.",
      ],
      blocked: [
        "[[#T-4]] is not ready. [[wf-t3jp5]] holds a live lease on `crates/wf-cli/src/context/`.",
      ],
      needs_you: [],
      handoff: [
        "The dedupe score lives in the mock server for the prototype. The real daemon computes it in `wf-index`.",
      ],
      next_steps: [
        "Finish the merge suggestion in [[#T-3]].",
        "Claim [[#T-5]] and write the review request.",
        "Claim [[#T-4]] after [[wf-t3jp5]] releases its lease.",
      ],
    },
    changes: [
      {
        id: "C-5hk9f",
        ts: daysAgo(4, 14, 10),
        author: "codex",
        title: "Created the draft library item on promote",
        kind: "progress",
        task: "T-1",
        commit: "5d0c3b9",
        files: ["crates/wf-edit/src/promote.rs"],
        model: "gpt-5-codex",
        body: "Added `promote()` to `wf-edit`. It writes the draft with a `source:` backlink and takes the kind from the entry.",
      },
      {
        id: "C-2wz7m",
        ts: daysAgo(4, 15, 30),
        author: "codex",
        title: "Verified SC-1 with `promote_creates_draft`",
        kind: "verify",
        task: "T-1",
        criteria: ["SC-1"],
        result: "pass",
        evidence: "`cargo test -p wf-edit promote_creates_draft` passed at `5d0c3b9`",
        commit: "5d0c3b9",
        body: "Ran `wf verify wf-x5hd3 SC-1`. The test promoted a learning and read back the draft and its backlink.",
      },
      {
        id: "C-8dq3p",
        ts: daysAgo(3, 12, 45),
        author: "claude-sonnet",
        title: "Added the approve op",
        kind: "progress",
        task: "T-2",
        criteria: ["SC-4"],
        result: "pass",
        evidence: "`cargo test -p wf-edit approve_sets_reviewed` passed at `a82e6f1`",
        commit: "a82e6f1",
        files: ["crates/wf-edit/src/approve.rs"],
        model: "claude-sonnet-5-5",
        body: "Set `status`, `reviewed_by` and `last_reviewed` in one splice. The test checks that no other byte of the file changes.",
      },
      {
        id: "C-6vs4g",
        ts: daysAgo(1, 16, 20),
        author: "claude-sonnet",
        title: "Scored title similarity with trigrams",
        kind: "research",
        task: "T-3",
        model: "claude-sonnet-5-5",
        body: "Compared 3 scores on the 8 library titles. Trigram overlap found the one true duplicate at 0.71 and gave no false match above 0.4. A word-set score gave 2 false matches.",
      },
      {
        id: "C-9nt2a",
        ts: ago(5 * 60),
        author: "shruti",
        title: "Reviewed the copy of the promote dialog",
        kind: "review",
        task: "T-3",
        body: "Read the dialog text. Shortened the explanation of the review request to one sentence and asked for the word `draft` in the button label.",
      },
    ],
    decisions: [
      {
        id: "D-3gx7k",
        ts: daysAgo(5, 12, 0),
        author: "claude-sonnet",
        title: "Start every promoted item as a draft",
        status: "accepted",
        topic: "review-gate",
        affects: ["SC-2", "SC-4"],
        decided_by: ["claude-sonnet", "shruti"],
        decision:
          "Create every promoted item with `status: draft`. Only an approval sets `reviewed`.",
        because:
          "An unreviewed rule can mislead an agent. A draft stays visible to people and hidden from the bundle.",
        rejected: "Promote straight to `reviewed` for the group owner (two code paths, one gate).",
        consequences:
          "Each promote opens a review request. A draft that nobody reviews stays out of the bundle.",
        revisit: "More than 5 drafts wait for a review at the same time.",
      },
    ],
    learnings: [
      {
        id: "L-4cm6v",
        ts: daysAgo(1, 16, 40),
        author: "claude-sonnet",
        title: "Score title similarity with trigrams, not word sets.",
        kind: "tip",
        tags: ["search", "dedupe"],
        applies_to: ["crates/wf-index/**"],
        promote: "no",
        rule: "Score title similarity with trigram overlap. Treat a score above 0.6 as a duplicate candidate.",
        evidence: "[[#C-6vs4g]] compared 3 scores on 8 titles.",
      },
      {
        id: "L-8rk5m",
        ts: ago(3 * 60 + 30),
        author: "claude-sonnet",
        title: "Keep promoted items as drafts until a person reviews them.",
        kind: "pattern",
        tags: ["library", "review", "promote"],
        applies_to: ["promote-to-library", "curate-library"],
        promote: "candidate",
        rule: "Create every promoted item as a draft. Let only a human review set `reviewed`. Inject reviewed items only.",
        evidence:
          "An unreviewed gotcha sent two agents down a dead end in the first week of the dogfood run.",
      },
    ],
  };
}
