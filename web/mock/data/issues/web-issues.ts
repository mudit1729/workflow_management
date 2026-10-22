// Lighter issues of the web group. Each one shows a specific signal:
//   wf-c2pn6  done with criteria still open (Q001)
//   wf-h2tb7  in progress with no plan.md (Q002); a scripted event moves it to review
//   wf-e6kc1  an xs bug with no plan (no Q002)
//   wf-7yq2m  invalid YAML in goal.md (F001, raw file view)
//   wf-z9mw2  in review
//   wf-v1cm9  minimal backlog issue
import type { IssueSrc } from "../../source";
import { ago, ahead, daysAgo } from "../../time";

export function commandPalette(): IssueSrc {
  return {
    slug: "command-palette",
    group: "g-web01",
    goal: {
      id: "wf-c2pn6",
      title: "Command palette",
      status: "done",
      priority: "medium",
      size: "m",
      owner: "shruti",
      labels: ["ux"],
      claimed_by: "claude-sonnet",
      blocked_by: [],
      created: daysAgo(18, 10, 0),
    },
    context: `People jump between issues, groups and the library all day. The sidebar needs several clicks for each jump. A command palette lets a person type a few letters, pick a result and land on it.

The palette opens with \`⌘K\`. It searches on the server, so the browser needs no index.`,
    criteria: [
      {
        text: "When a user presses `⌘K`, the app shall open the command palette within 100 ms.",
        checked: true,
        verify: "`pnpm -C web test palette-open`",
        evidence: "`pnpm -C web test palette-open` passed at `5c9e0a3`",
        verified_by: "claude-sonnet",
      },
      {
        text: "When a user types, the palette shall search issues, groups and library items on the server.",
        checked: true,
        verify: "`pnpm -C web test palette-search`",
        evidence: "`pnpm -C web test palette-search` passed at `5c9e0a3`",
        verified_by: "claude-sonnet",
      },
      {
        text: "When a user picks an issue, the palette shall open it in the drawer.",
        checked: true,
        verify: "manual",
        evidence: "manual check of 5 issues by @shruti, see [[#C-2bt8w]]",
        verified_by: "shruti",
      },
      {
        text: "The palette shall list the keyboard shortcut next to each action.",
        checked: false,
        verify: "manual",
      },
      {
        text: "While the palette is open, the app shall keep focus inside the palette.",
        checked: false,
        verify: "`pnpm -C web test palette-focus`",
      },
    ],
    out_of_scope: `- Fuzzy matching on the server. The palette uses the substring score of \`/api/search\`.
- A shortcut editor.`,
    links: `- [[wf-b1d7v]]: Build v1.`,
    plan: {
      updated_at: daysAgo(17, 11, 0),
      updated_by: "claude-sonnet",
      revision: 1,
      approach:
        "Build the palette on cmdk. Search through `/api/search` and group the results by kind. Add the actions last.",
      assumptions: [],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Palette",
          tasks: [
            {
              id: "T-1",
              title: "Build the palette shell",
              status: "done",
              lane: "web",
              owns: ["web/src/app/CommandPalette.tsx"],
              satisfies: ["SC-1"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              verify: "`pnpm -C web test palette-open`",
              brief: "Open a dialog with cmdk on `⌘K` and close it on `Esc`.",
            },
            {
              id: "T-2",
              title: "Wire the server search",
              status: "done",
              lane: "web",
              depends_on: ["T-1"],
              owns: ["web/src/lib/api/search.ts"],
              satisfies: ["SC-2", "SC-3"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              verify: "`pnpm -C web test palette-search`",
              brief: "Call `useSearch` while the user types. Group the hits by kind.",
            },
            {
              id: "T-3",
              title: "Add the actions group",
              status: "done",
              lane: "web",
              depends_on: ["T-1"],
              owns: ["web/src/app/palette-actions.ts"],
              satisfies: ["SC-1"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              verify: "manual",
              brief: "List the actions: new issue, switch theme, go to the inbox.",
            },
          ],
        },
      ],
    },
    state: {
      summary: "Shipped. Two criteria still wait for evidence.",
      updated_at: daysAgo(5, 17, 45),
      updated_by: "claude-sonnet",
      phase: "Palette",
      session: "cc-8b2a",
      done: [
        "[[#T-1]], [[#T-2]] and [[#T-3]] are merged. See [[#C-5xq4h]].",
        "[[#SC-1]], [[#SC-2]] and [[#SC-3]] have evidence.",
      ],
      needs_you: [],
      next_steps: ["Verify [[#SC-4]] and [[#SC-5]], or reopen the issue."],
    },
    changes: [
      {
        id: "C-6zd3q",
        ts: daysAgo(15, 14, 10),
        author: "claude-sonnet",
        title: "Built the palette shell with cmdk",
        kind: "progress",
        task: "T-1",
        commit: "1be7d40",
        files: ["web/src/app/CommandPalette.tsx"],
        model: "claude-sonnet-5-5",
        body: "Opened a dialog with cmdk on `⌘K`. The palette opens in 38 ms on the dev server.",
      },
      {
        id: "C-9nm7k",
        ts: daysAgo(11, 16, 20),
        author: "claude-sonnet",
        title: "Tested the open time and the server search",
        kind: "test",
        task: "T-2",
        criteria: ["SC-1", "SC-2"],
        result: "pass",
        commit: "5c9e0a3",
        files: ["web/src/app/CommandPalette.test.tsx"],
        model: "claude-sonnet-5-5",
        body: "Added `palette-open` and `palette-search`. Both pass against the mock server.",
      },
      {
        id: "C-2bt8w",
        ts: daysAgo(8, 15, 5),
        author: "shruti",
        title: "Checked that a picked issue opens in the drawer",
        kind: "verify",
        criteria: ["SC-3"],
        result: "pass",
        evidence: "manual check of 5 issues by @shruti",
        body: "Picked 5 issues from the palette. Each one opened in the drawer on the board.",
      },
      {
        id: "C-5xq4h",
        ts: daysAgo(5, 17, 0),
        author: "claude-sonnet",
        title: "Added the actions group",
        kind: "progress",
        task: "T-3",
        commit: "a07f6c8",
        files: ["web/src/app/palette-actions.ts"],
        model: "claude-sonnet-5-5",
        body: "Listed 8 actions. The shortcut column is still empty.",
      },
    ],
    decisions: [],
    learnings: [],
    activity: [
      {
        ts: daysAgo(5, 17, 30),
        author: "claude-sonnet",
        kind: "status",
        title: "Moved from review to done",
      },
    ],
  };
}

export function boardKeyboardNavigation(): IssueSrc {
  return {
    slug: "board-keyboard-navigation",
    group: "g-web01",
    goal: {
      id: "wf-h2tb7",
      title: "Board keyboard navigation",
      status: "in_progress",
      priority: "medium",
      size: "m",
      owner: "shruti",
      labels: ["ux", "a11y"],
      claimed_by: "cursor-bot",
      lease_until: ahead(26),
      blocked_by: [],
      created: daysAgo(4, 15, 40),
    },
    context: `Power users move through the board without a mouse. Today a card takes focus only with \`Tab\`, and a board with 40 cards needs 40 presses to reach the last one.

This issue adds the \`j\`, \`k\`, \`h\` and \`l\` keys to move focus between cards and columns, and \`Enter\` to open the drawer.`,
    criteria: [
      {
        text: "When a user presses `j` or `k`, the board shall move focus to the next or the previous card.",
        checked: true,
        verify: "`pnpm -C web test board-keys`",
        evidence: "`pnpm -C web test board-keys` passed at `d3f8a19`",
        verified_by: "cursor-bot",
      },
      {
        text: "When a user presses `h` or `l`, the board shall move focus to the neighbor column.",
        checked: false,
        verify: "`pnpm -C web test board-columns`",
      },
      {
        text: "When a card has focus and the user presses `Enter`, the board shall open the drawer.",
        checked: false,
        verify: "`pnpm -C web test board-enter`",
      },
      {
        text: "While a card has focus, the board shall draw a focus ring with a contrast ratio of at least 3:1.",
        checked: false,
        verify: "manual",
      },
    ],
    out_of_scope: `- Moving a card between columns with the keyboard. [[wf-z9mw2]] covers dragging.
- Custom key bindings.`,
    links: `- [[wf-z9mw2]]: drag issues between columns.`,
    state: {
      summary: "j and k work; h and l still need a rule for empty columns.",
      updated_at: ago(2 * 60 + 15),
      updated_by: "cursor-bot",
      session: "cu-4471",
      done: ["[[#SC-1]] has evidence from `pnpm -C web test board-keys`. See [[#C-8sy2p]]."],
      in_flight: ["`h` and `l` move to the next column. An empty column swallows focus."],
      needs_you: [],
      next_steps: [
        "Skip empty columns when `h` or `l` moves focus.",
        "Add `board-columns` and `board-enter` tests.",
        "Write `plan.md` with the `write-plan` skill.",
      ],
    },
    changes: [
      {
        id: "C-4kg7j",
        ts: daysAgo(3, 12, 30),
        author: "cursor-bot",
        title: "Moved focus between cards with j and k",
        kind: "progress",
        commit: "7aa0e53",
        files: ["web/src/features/board/useBoardKeys.ts"],
        body: "Added a roving tabindex to the cards of one column. `j` and `k` move focus down and up.",
      },
      {
        id: "C-8sy2p",
        ts: daysAgo(2, 16, 15),
        author: "cursor-bot",
        title: "Verified SC-1 with `board-keys`",
        kind: "verify",
        criteria: ["SC-1"],
        result: "pass",
        evidence: "`pnpm -C web test board-keys` passed at `d3f8a19`",
        commit: "d3f8a19",
        body: "Ran `wf verify wf-h2tb7 SC-1`. The test presses `j` 5 times and checks the focused card.",
      },
      {
        id: "C-3dv6n",
        ts: ago(2 * 60 + 15),
        author: "shruti",
        title: "Tried the keys on a board with 40 cards",
        kind: "review",
        body: "Opened the board with 40 cards and pressed `j` to the end. Focus moved without a visible lag. Asked for a rule for empty columns.",
      },
    ],
    decisions: [],
    learnings: [],
  };
}

export function drawerWidthJump(): IssueSrc {
  return {
    slug: "drawer-width-jump",
    group: "g-web01",
    goal: {
      id: "wf-e6kc1",
      title: "Fix drawer width jump",
      status: "planned",
      priority: "low",
      size: "xs",
      owner: "shruti",
      labels: ["bug"],
      blocked_by: [],
      created: daysAgo(1, 11, 20),
    },
    context: `The drawer grows by 16 px when a tab with a long list opens, because the scrollbar appears and takes its width from the content. The title and the tabs shift to the left.`,
    criteria: [
      {
        text: "When a user switches between drawer tabs, the drawer shall keep its width.",
        checked: false,
        verify: "`pnpm -C web test drawer-width`",
      },
      {
        text: "The drawer shall reserve the scrollbar gutter on every tab.",
        checked: false,
        verify: "manual",
      },
    ],
    changes: [],
    decisions: [],
    learnings: [],
  };
}

export function tabTitleCount(): IssueSrc {
  return {
    slug: "tab-title-count",
    group: "g-web01",
    goal: {
      id: "wf-7yq2m",
      title: "Fix tab-title count",
      status: "planned",
      priority: "medium",
      size: "xs",
      owner: "shruti",
      labels: ["bug"],
      blocked_by: [],
      created: daysAgo(2, 9, 50),
    },
    yaml_error: {
      key: "owner",
      message: "Invalid YAML at line 7, column 8: found character `@` that cannot start any token.",
      fix: 'Quote the handle: `owner: "@shruti"`.',
    },
    context: `The browser tab title shows \`(5) wf\`, but only 2 requests wait for @shruti. The count includes requests for other authors.

The fix is small. The count must use \`useInbox().mine\`. The \`owner\` line of this file also needs quotes. See [[lib-9vk2w]].`,
    criteria: [
      {
        text: "When a request is addressed to another author, the tab title count shall not include it.",
        checked: false,
        verify: "`pnpm -C web test title-count`",
      },
      {
        text: "When no request waits for the acting author, the tab title shall show `wf` without a number.",
        checked: false,
        verify: "`pnpm -C web test title-count`",
      },
    ],
    changes: [],
    decisions: [],
    learnings: [],
  };
}

export function dragBetweenColumns(): IssueSrc {
  return {
    slug: "drag-between-columns",
    group: "g-web01",
    goal: {
      id: "wf-z9mw2",
      title: "Drag issues between columns",
      status: "review",
      priority: "high",
      size: "m",
      owner: "shruti",
      labels: ["board", "dnd"],
      claimed_by: "claude-sonnet",
      blocked_by: [],
      created: daysAgo(9, 14, 20),
    },
    context: `A status change today needs three clicks: open the card, open the status menu, pick a status. People expect to drag a card to another column, as they do in every board.

A drop writes the new status through the same op as the menu, so the transition rules and the done gate stay in one place.`,
    criteria: [
      {
        text: "When a user drops a card on another column, the board shall move the issue to that status.",
        checked: true,
        verify: "`pnpm -C web test dnd-move`",
        evidence: "`pnpm -C web test dnd-move` passed at `e92b4d7`",
        verified_by: "claude-sonnet",
      },
      {
        text: "If the move is illegal, then the board shall show the gate dialog and keep the card in place.",
        checked: true,
        verify: "`pnpm -C web test dnd-gate`",
        evidence: "`pnpm -C web test dnd-gate` passed at `e92b4d7`",
        verified_by: "claude-sonnet",
      },
      {
        text: "While a drag is active, the board shall highlight the target column.",
        checked: true,
        verify: "manual",
        evidence: "manual check in both themes by @shruti, see [[#C-6cp5k]]",
        verified_by: "shruti",
      },
      {
        text: "When a drop fails with a conflict, the board shall roll the card back.",
        checked: true,
        verify: "`pnpm -C web test dnd-rollback`",
      },
    ],
    out_of_scope: `- Reordering cards inside a column. The order follows priority and activity.
- Dragging an issue to another group.`,
    links: `- [[wf-h2tb7]]: keyboard navigation of the same board.
- [[wf-c2pn6]]: the command palette also moves issues.`,
    plan: {
      updated_at: daysAgo(8, 10, 0),
      updated_by: "claude-sonnet",
      revision: 1,
      approach:
        "Use pragmatic-drag-and-drop for the drag source and the drop targets. Send each drop through `useMoveIssue`, so the gate dialog and the rollback stay in one place.",
      assumptions: [],
      prior_art: [],
      phases: [
        {
          index: 1,
          name: "Drag",
          tasks: [
            {
              id: "T-1",
              title: "Make the cards draggable",
              status: "done",
              lane: "web",
              owns: ["web/src/features/board/dnd.ts"],
              satisfies: ["SC-1"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              verify: "`pnpm -C web test dnd-move`",
              brief: "Register each card as a drag source with its issue ID.",
            },
            {
              id: "T-2",
              title: "Add drop targets and the indicator",
              status: "done",
              lane: "web",
              depends_on: ["T-1"],
              owns: ["web/src/features/board/KanbanColumn.tsx"],
              satisfies: ["SC-3"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              verify: "manual",
              brief:
                "Highlight the column under the pointer and draw a 2 px accent line at the drop point.",
            },
            {
              id: "T-3",
              title: "Handle the gate and the rollback",
              status: "review",
              lane: "web",
              depends_on: ["T-2"],
              owns: ["web/src/features/board/useMoveIssue.ts"],
              satisfies: ["SC-2", "SC-4"],
              assignee: "claude-sonnet",
              claimed_by: "claude-sonnet",
              verify: "`pnpm -C web test dnd-rollback`",
              brief:
                "Open the gate dialog for an illegal move. Roll the card back when the server answers 409.",
              steps: [
                { text: "Open the gate dialog for an illegal move.", done: true },
                { text: "Roll the card back on a 409.", done: true },
              ],
            },
          ],
        },
      ],
    },
    state: {
      summary: "All drag paths work; @shruti reviews the rollback test.",
      updated_at: ago(6 * 60),
      updated_by: "claude-sonnet",
      phase: "Drag",
      session: "cc-61f3",
      done: [
        "[[#T-1]] and [[#T-2]] are merged. See [[#C-2rw9x]].",
        "[[#SC-1]], [[#SC-2]] and [[#SC-3]] have evidence.",
      ],
      in_flight: ["[[#T-3]] The rollback test waits for a review by @shruti."],
      needs_you: [],
      next_steps: ["Run `wf verify wf-z9mw2 SC-4` after the review.", "Move the issue to done."],
    },
    changes: [
      {
        id: "C-7nh3b",
        ts: daysAgo(7, 15, 30),
        author: "claude-sonnet",
        title: "Made the cards draggable",
        kind: "progress",
        task: "T-1",
        commit: "30c9ba1",
        files: ["web/src/features/board/dnd.ts"],
        model: "claude-sonnet-5-5",
        body: "Registered each card as a drag source. The drag preview is the card itself.",
      },
      {
        id: "C-2rw9x",
        ts: daysAgo(5, 13, 40),
        author: "claude-sonnet",
        title: "Added drop targets and the accent line",
        kind: "progress",
        task: "T-2",
        commit: "e92b4d7",
        files: ["web/src/features/board/KanbanColumn.tsx"],
        model: "claude-sonnet-5-5",
        body: "Each column highlights while a card hovers over it. The accent line shows the drop point.",
      },
      {
        id: "C-6cp5k",
        ts: daysAgo(3, 17, 10),
        author: "shruti",
        title: "Checked the column highlight",
        kind: "verify",
        criteria: ["SC-3"],
        result: "pass",
        evidence: "manual check in both themes by @shruti",
        body: "Dragged a card across all 6 columns in the light and the dark theme. The highlight was visible in both.",
      },
      {
        id: "C-9fa8m",
        ts: ago(6 * 60),
        author: "claude-sonnet",
        title: "Rolled the card back on a conflict",
        kind: "fix",
        task: "T-3",
        criteria: ["SC-4"],
        result: "pass",
        commit: "b7d1e02",
        files: ["web/src/features/board/useMoveIssue.ts"],
        model: "claude-sonnet-5-5",
        body: "Restored the old status when the server answered 409. Showed the toast with the Reapply action.",
      },
    ],
    decisions: [],
    learnings: [],
    activity: [
      {
        ts: ago(5 * 60 + 40),
        author: "claude-sonnet",
        kind: "status",
        title: "Moved from in_progress to review",
      },
    ],
  };
}

export function groupRollupBars(): IssueSrc {
  return {
    slug: "group-rollup-bars",
    group: "g-web01",
    goal: {
      id: "wf-v1cm9",
      title: "Group roll-up progress bars",
      status: "backlog",
      priority: "low",
      size: "s",
      labels: ["ux"],
      blocked_by: [],
      created: daysAgo(10, 12, 0),
    },
    context: `The group tree shows a count for each group, but not how far along the group is. A thin progress bar next to the count would show it at a glance.`,
    criteria: [
      {
        text: "The group tree shall show a 32 px progress bar for each group.",
        checked: false,
        verify: "manual",
      },
      {
        text: "When an issue changes status, the bar of its group shall update within 2 s.",
        checked: false,
        verify: "manual",
      },
    ],
    changes: [],
    decisions: [],
    learnings: [],
  };
}
