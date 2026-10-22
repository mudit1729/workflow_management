// issues/wf/skills/skills-flowchart: wf-skf01. Its goal.md holds the `skills-flow` diagram.
// T-2 holds a live lease that a scripted event expires; a blocking question waits for the owner.
import type { IssueSrc } from "../../source";
import { ago, ahead, dateIn, daysAgo } from "../../time";

export const SKILL_TRIGGERS_NOTE = `# Skill triggers

Input for the flowchart. One row per skill: when an agent runs it, what it reads and what it writes.

## workflow

| Skill | Run it when | Reads | Writes |
|---|---|---|---|
| \`write-goal\` | A new issue has no criteria | \`goal.md\` | \`goal.md\` |
| \`write-plan\` | An issue has criteria and no tasks | \`goal.md\` | \`plan.md\` |
| \`write-current-state\` | You stop work or hand off | all files | \`current_state.md\` |
| \`split-issue\` | An issue holds more than 10 tasks | \`plan.md\` | a group and new issues |
| \`write-decision\` | You choose between options | \`decisions.md\` | \`decisions.md\` |
| \`write-learning\` | You find a rule worth keeping | \`learnings.md\` | \`learnings.md\` |

## library

| Skill | Run it when | Reads | Writes |
|---|---|---|---|
| \`promote-to-library\` | A learning applies to other issues | \`learnings.md\` | \`library/\` draft |
| \`curate-library\` | A draft waits for a review | \`library/\` | \`library/\` |
| \`search-library\` | You start a task in an unfamiliar area | \`library/\` | nothing |
| \`retire-library-item\` | A newer item replaces an old one | \`library/\` | \`library/\` |

## agent-execution

| Skill | Run it when | Reads | Writes |
|---|---|---|---|
| \`resume-issue\` | A session starts on an issue | context bundle | nothing |
| \`claim-task\` | You pick the next ready task | \`plan.md\` | \`plan.md\` |
| \`record-change\` | You finish one change | git diff | \`changes.md\` |
| \`ask-for-input\` | You need a human answer | \`current_state.md\` | \`current_state.md\` |
`;

export function skillsFlowchart(): IssueSrc {
  return {
    slug: "skills-flowchart",
    group: "g-skl01",
    goal: {
      id: "wf-skf01",
      title: "Draw the skills flowchart",
      status: "in_progress",
      priority: "medium",
      size: "s",
      owner: "shruti",
      labels: ["docs", "diagram"],
      claimed_by: "claude-sonnet",
      lease_until: ahead(52),
      blocked_by: [],
      due: dateIn(5),
      created: daysAgo(4, 14, 30),
    },
    context: `Agents pick the wrong skill when the three plugins list 14 of them. A reader needs one picture that shows which skill to run at each point of an issue. The flowchart maps each skill to its trigger, its input file and its output file.

The page ships in \`docs/skills-flowchart/\` and the README links to it. The diagram below is the first draft.

\`\`\`wf-diagram
skills-flow
\`\`\``,
    criteria: [
      {
        text: "The inventory shall list each skill with its trigger, its input file and its output file.",
        checked: true,
        verify: "manual",
        evidence: "`notes/skill-triggers.md` reviewed by @shruti, see [[#C-4qd8h]]",
        verified_by: "shruti",
      },
      {
        text: "The flowchart shall show every skill of the `workflow`, `library` and `agent-execution` plugins.",
        checked: false,
        verify: "`node docs/skills-flowchart/check.mjs`",
      },
      {
        text: "When a reader clicks a node, the page shall open the `SKILL.md` of that skill.",
        checked: false,
        verify: "manual",
      },
      {
        text: "If a skill is missing from the flowchart, then `wf skills lint` shall report a finding.",
        checked: false,
        verify: "`cargo test -p wf-cli skills_lint_coverage`",
        scenario:
          "Given a plugin with 15 skills / When the flowchart names 14 / Then `wf skills lint` prints one finding with the missing skill",
      },
    ],
    out_of_scope: `- A rendered flowchart in the web UI. The page is static HTML.
- Skills outside the three plugins.`,
    links: `- [[wf-b1d7v]]: Build v1, task T-6 ships the skills.
- [[wf-p2hs4]]: the \`SessionStart\` hook that starts \`resume-issue\`.`,
    plan: {
      updated_at: ago(5 * 60),
      updated_by: "claude-sonnet",
      revision: 2,
      approach:
        "List the skills first. Draw the flow in archify with one node per skill. Link each node to its `SKILL.md`, then add a coverage check to `wf skills lint`.",
      assumptions: [
        { id: "A1", text: "Archify keeps 14 nodes readable on one page.", state: "open" },
        {
          id: "A2",
          text: "Every skill has a one-line trigger in its frontmatter.",
          state: "confirmed",
        },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Draw",
          tasks: [
            {
              id: "T-1",
              title: "List the skills and their triggers",
              status: "done",
              lane: "docs",
              owns: ["docs/skills-flowchart/skills.json"],
              satisfies: ["SC-1"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              verify: "manual",
              brief: "Read the frontmatter of every `SKILL.md`. Write one row per skill.",
              steps: [
                { text: "Read the `SKILL.md` of the three plugins.", done: true },
                { text: "Write `notes/skill-triggers.md`.", done: true },
              ],
            },
            {
              id: "T-2",
              title: "Draw the flow in archify",
              status: "in_progress",
              lane: "docs",
              depends_on: ["T-1"],
              owns: ["docs/skills-flowchart/**"],
              satisfies: ["SC-2"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              lease_until: ahead(20),
              verify: "`node docs/skills-flowchart/check.mjs`",
              brief:
                "Draw one node per skill and one edge per hand-off. Lay the nodes out by the answer to [[#Q-6vt4c]].",
              steps: [
                { text: "Draw the nodes and the edges.", done: true },
                { text: "Pick the layout after the answer to [[#Q-6vt4c]].", done: false },
                { text: "Render the page with the archify CLI.", done: false },
              ],
            },
          ],
        },
        {
          index: 2,
          name: "Link and check",
          tasks: [
            {
              id: "T-3",
              title: "Link each node to its SKILL.md",
              status: "todo",
              lane: "docs",
              depends_on: ["T-2"],
              owns: ["docs/skills-flowchart/links.json"],
              satisfies: ["SC-3"],
              assignee: "claude-sonnet",
              verify: "manual",
              brief: "Add the relative path of the `SKILL.md` to each node.",
            },
            {
              id: "T-4",
              title: "Report missing skills in `wf skills lint`",
              status: "todo",
              lane: "skills",
              depends_on: ["T-3"],
              owns: ["crates/wf-cli/src/skills_lint.rs"],
              satisfies: ["SC-4"],
              assignee: "role:backend",
              verify: "`cargo test -p wf-cli skills_lint_coverage`",
              brief:
                "Compare the node list of the flowchart with the skill folders. Print one finding per missing skill.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "The first draft of the flow is drawn; the node layout waits for your answer.",
      updated_at: ago(40),
      updated_by: "claude-sonnet",
      phase: "Draw",
      session: "cc-2e8b",
      done: [
        "[[#T-1]] The inventory lists 14 skills. See [[#C-7gm2x]].",
        "[[#SC-1]] has a review by @shruti. See [[#C-4qd8h]].",
      ],
      in_flight: ["[[#T-2]] The draft has 14 nodes and 17 edges. @claude-sonnet holds the lease."],
      blocked: ["[[#T-2]] cannot pick a layout until [[#Q-6vt4c]] has an answer."],
      needs_you: [
        {
          id: "Q-6vt4c",
          question: "Group the flowchart nodes by plugin or by phase?",
          from: "claude-sonnet",
          to: "shruti",
          kind: "question",
          urgency: "blocking",
          asked: ago(35),
          options: ["by plugin", "by phase"],
          ref: "[[#T-2]]",
        },
      ],
      handoff: [
        "Archify is not installed in the cloud sandbox. Render the page on a laptop with `node ~/.claude/skills/archify/bin/archify.mjs`.",
      ],
      next_steps: [
        "Apply the answer to [[#Q-6vt4c]] to the layout in [[#T-2]].",
        "Render the page and run `node docs/skills-flowchart/check.mjs`.",
        "Link the nodes in [[#T-3]].",
      ],
    },
    changes: [
      {
        id: "C-7gm2x",
        ts: daysAgo(3, 15, 20),
        author: "claude-sonnet",
        title: "Listed 14 skills with trigger, input and output",
        kind: "progress",
        task: "T-1",
        files: ["notes/skill-triggers.md"],
        model: "claude-sonnet-5-5",
        session: "cc-b712",
        body: "Read the `SKILL.md` frontmatter of the three plugins. Wrote one row per skill in `notes/skill-triggers.md`.",
      },
      {
        id: "C-4qd8h",
        ts: daysAgo(3, 18, 5),
        author: "shruti",
        title: "Reviewed the skill inventory",
        kind: "verify",
        criteria: ["SC-1"],
        result: "pass",
        evidence: "`notes/skill-triggers.md` reviewed by @shruti",
        body: "Read all 14 rows. Each row names a trigger a person can recognize. Asked for no changes.",
      },
      {
        id: "C-9ba5v",
        ts: ago(3 * 60 + 30),
        author: "claude-sonnet",
        title: "Compared a layout by plugin with a layout by phase",
        kind: "research",
        task: "T-2",
        model: "claude-sonnet-5-5",
        body: "Sketched both layouts with 14 nodes. A layout by plugin has 3 columns and 9 crossing edges. A layout by phase has 4 rows and 4 crossing edges. Asked @shruti which one the page uses.",
      },
      {
        id: "C-3jr6s",
        ts: ago(75),
        author: "claude-sonnet",
        title: "Drew the first draft of the flow",
        kind: "progress",
        task: "T-2",
        files: ["docs/skills-flowchart/flow.json"],
        model: "claude-sonnet-5-5",
        body: "Added 14 nodes and 17 edges to `flow.json`. Archify accepted the candidate on the second try after a fix to one edge target.",
      },
    ],
    decisions: [
      {
        id: "D-8tn3c",
        ts: daysAgo(3, 16, 0),
        author: "claude-sonnet",
        title: "Draw the flowchart with archify",
        status: "accepted",
        topic: "diagram-tool",
        affects: ["SC-2"],
        decided_by: ["claude-sonnet", "shruti"],
        decision: "Draw the flowchart as an archify `workflow` diagram.",
        because:
          "The same diagram renders in the README page and in the web UI drawer. Archify checks the JSON, so a broken edge fails early.",
        rejected:
          "A hand-drawn SVG (it drifts from the skill list); Mermaid (a second diagram tool).",
        consequences: "The page needs the archify CLI on the machine that renders it.",
        revisit: "Archify cannot keep 20 nodes readable.",
      },
    ],
    learnings: [
      {
        id: "L-6yw4b",
        ts: ago(75),
        author: "claude-sonnet",
        title: "Give each flowchart node one verb and one file.",
        kind: "tip",
        tags: ["diagram", "writing"],
        applies_to: ["docs/skills-flowchart/**"],
        promote: "no",
        rule: "Give each flowchart node one verb and one file. A node with two verbs hides a hand-off.",
        evidence:
          "The first draft had 4 nodes with two verbs. Splitting them added 4 edges and removed 2 questions from review.",
      },
    ],
    docs: [
      {
        path: "notes/skill-triggers.md",
        title: "Skill triggers",
        body: SKILL_TRIGGERS_NOTE,
      },
    ],
  };
}
