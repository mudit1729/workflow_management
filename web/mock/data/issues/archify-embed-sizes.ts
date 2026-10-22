// issues/docs/archify-embed-sizes: wf-r6jk2, a research issue in the implicit docs/ group.
// It holds one research note that "Open raw" serves from web/public/files/.
import type { IssueSrc } from "../../source";
import { ago, ahead, daysAgo } from "../../time";
import { DOCS_GROUP } from "../groups";

export const EMBED_SIZES_NOTE = `# Archify embed sizes

Input for the \`diagram\` event of [[wf-w8vz4]] and for the height rule of the drawer. Measured by @claude-opus on 5 sample diagrams with the archify CLI at \`--quality showcase\`.

## Rendered height

Heights are in px. The width is the width of the drawer content.

| Diagram | Nodes | 440 px | 560 px | 760 px |
|---|---|---|---|---|
| \`live-board-architecture\` | 11 | 540 | 470 | 410 |
| \`sse-delivery-flow\` | 9 | 380 | 340 | 300 |
| \`skills-flow\` | 14 | 760 | 640 | 520 |
| \`release-flow\` | 7 | 300 | 270 | 250 |
| \`lease-lifecycle\` | 5 | 220 | 210 | 200 |

## Findings

- Height falls as the width grows, because archify scales the diagram to the viewport width.
- Diagrams with 12 or more nodes pass 600 px at 440 px width.
- The \`wf:size\` message from the bridge reports the final height within 80 ms of the load.

## Recommendation

Start every embed at \`clamp(220px, 32vh, 420px)\` and grow it to the \`wf:size\` height, up to 420 px. Open the dialog for anything taller. Carry the height in the \`diagram\` event, so that a page can reserve the space before the iframe loads.
`;

export function archifyEmbedSizes(): IssueSrc {
  return {
    slug: "archify-embed-sizes",
    group: DOCS_GROUP,
    goal: {
      id: "wf-r6jk2",
      title: "Research archify embed sizes",
      status: "in_progress",
      priority: "medium",
      size: "s",
      owner: "shruti",
      labels: ["research", "archify"],
      claimed_by: "claude-opus",
      lease_until: ahead(27),
      blocked_by: [],
      created: daysAgo(3, 13, 40),
    },
    context: `The drawer embeds archify diagrams in an iframe. A fixed height clips a tall diagram, and a tall default wastes space for a small one. This note finds a height rule that works for every diagram type at drawer widths from 440 px to 760 px.

[[wf-w8vz4]] waits for the answer, because the \`diagram\` event carries a height hint.`,
    criteria: [
      {
        text: "The note shall list the rendered height of each sample diagram at 440, 560 and 760 px.",
        checked: true,
        verify: "manual",
        evidence: "table in `notes/embed-sizes.md`, checked by @shruti",
        verified_by: "shruti",
      },
      {
        text: "The note shall recommend one height rule with a cap in px.",
        checked: false,
        verify: "manual",
      },
      {
        text: "The note shall say whether the `wf:size` message is enough to reserve the height before the load.",
        checked: false,
        verify: "manual",
      },
    ],
    out_of_scope: `- Changing the archify renderer.
- Zoom and pan inside the embed.`,
    links: `- [[wf-w8vz4]]: background renders, blocked by this note.
- \`notes/embed-sizes.md\`: the measurements.`,
    plan: {
      updated_at: daysAgo(3, 14, 0),
      updated_by: "claude-opus",
      revision: 1,
      approach:
        "Render 5 sample diagrams at 3 widths and record the height of each. Write one rule from the numbers, then test the rule in the drawer.",
      assumptions: [
        {
          id: "A1",
          text: "Five sample diagrams cover the five diagram types.",
          state: "confirmed",
        },
      ],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Measure",
          tasks: [
            {
              id: "T-1",
              title: "Render the samples at 3 widths",
              status: "done",
              lane: "research",
              satisfies: ["SC-1"],
              assignee: "claude-opus",
              claimed_by: "claude-opus",
              verify: "manual",
              brief: "Render each sample at 440, 560 and 760 px and record the final height.",
            },
            {
              id: "T-2",
              title: "Write the height rule",
              status: "in_progress",
              lane: "research",
              depends_on: ["T-1"],
              satisfies: ["SC-2", "SC-3"],
              assignee: "claude-opus",
              claimed_by: "claude-opus",
              lease_until: ahead(27),
              verify: "manual",
              brief:
                "Propose one rule with a cap. Say if `wf:size` is enough to reserve the height.",
              steps: [
                { text: "Draft the rule from the table.", done: true },
                { text: "Test the rule in the drawer.", done: false },
              ],
            },
          ],
        },
      ],
    },
    state: {
      summary: "Measurements are done; the height rule is in draft.",
      updated_at: ago(2 * 60 + 5),
      updated_by: "claude-opus",
      phase: "Measure",
      session: "cc-d3f7",
      done: ["[[#T-1]] The table covers 5 diagrams at 3 widths. See [[#C-2mq9b]]."],
      in_flight: [
        "[[#T-2]] The height rule. @claude-opus holds the lease. The draft rule is in the note.",
      ],
      needs_you: [],
      next_steps: [
        "Test the rule in the drawer with the diagram `skills-flow`.",
        "Answer the question about `wf:size` in `notes/embed-sizes.md`.",
        "Move the issue to review and tell [[wf-w8vz4]].",
      ],
    },
    changes: [
      {
        id: "C-2mq9b",
        ts: daysAgo(2, 12, 30),
        author: "claude-opus",
        title: "Rendered 5 sample diagrams at 3 widths",
        kind: "research",
        task: "T-1",
        files: ["notes/embed-sizes.md"],
        model: "claude-opus-5-5",
        body: "Ran the archify CLI on 5 samples and recorded the final height at 440, 560 and 760 px. Wrote the table in `notes/embed-sizes.md`.",
      },
      {
        id: "C-7jx4n",
        ts: daysAgo(1, 17, 40),
        author: "shruti",
        title: "Checked the table of heights",
        kind: "verify",
        criteria: ["SC-1"],
        result: "pass",
        evidence: "table in `notes/embed-sizes.md`, checked by @shruti",
        body: "Read the 15 measurements. The values fall as the width grows, as expected. Asked for the node count in the table.",
      },
      {
        id: "C-4vc6h",
        ts: ago(2 * 60 + 5),
        author: "claude-opus",
        title: "Drafted the height rule",
        kind: "research",
        task: "T-2",
        files: ["notes/embed-sizes.md"],
        model: "claude-opus-5-5",
        body: "Added the recommendation: start at `clamp(220px, 32vh, 420px)` and grow to the `wf:size` height, up to 420 px.",
      },
    ],
    decisions: [],
    learnings: [
      {
        id: "L-9ks3d",
        ts: ago(2 * 60 + 5),
        author: "claude-opus",
        title: "Render at three widths before you pick an embed height.",
        kind: "tip",
        tags: ["archify", "layout"],
        applies_to: ["web/src/features/diagram/**"],
        promote: "no",
        rule: "Render a diagram at the narrowest and the widest drawer width before you pick an embed height. Height falls as the width grows.",
        evidence: "The 14-node diagram measured 760 px at 440 px width and 520 px at 760 px width.",
      },
    ],
    docs: [
      {
        path: "notes/embed-sizes.md",
        title: "Archify embed sizes",
        body: EMBED_SIZES_NOTE,
      },
    ],
  };
}
