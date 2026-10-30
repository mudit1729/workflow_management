// The plan "Do next step" writes for an issue that has none: one task per criterion, in order,
// each in the shape planning-issues prescribes. Pure, so the same issue gives the same plan.
import { describe, expect, test } from "vitest";
import { draftPlan, PHASE_NAME, taskTitle } from "./codex-plan";
import { renderPlan } from "./md/render";
import type { IssueSrc } from "./source";

const src = (criteria: IssueSrc["criteria"]): IssueSrc => ({
  slug: "x",
  group: "g-aaaaa",
  goal: {
    id: "wf-aaaaa",
    title: "A",
    status: "backlog",
    priority: "medium",
    size: "m",
    labels: [],
    blocked_by: [],
    created: "2026-10-30T10:00+05:30",
  },
  context: "Why.",
  criteria,
  changes: [],
  decisions: [],
  learnings: [],
});

describe("taskTitle", () => {
  test.each([
    [
      "When an agent appends, the board shall show the entry within 2 s.",
      "Show the entry within 2 s",
    ],
    [
      "The spec shall state the inputs, the outputs and the failure cases.",
      "State the inputs, the outputs and the failure cases",
    ],
    [
      "If the input is invalid, then the server shall name the field and refuse it.",
      "Name the field and refuse it",
    ],
    ["When the failing step runs, the problem shall not occur.", "Satisfy SC-4"],
    ["The old path shall be deleted once no caller uses it.", "Satisfy SC-4"],
    ["Flagged hedge words are easy to fix.", "Satisfy SC-4"],
  ])("%s", (criterion, title) => {
    expect(taskTitle(criterion, 4)).toBe(title);
  });

  test("a long response is cut at a word, not at a small word", () => {
    const title = taskTitle(
      "The report shall list every issue that has a blocking request open for more than a week and the person who asked for it.",
      1,
    );
    expect(title.length).toBeLessThanOrEqual(70);
    expect(title).not.toMatch(/ (a|an|and|at|by|for|from|in|into|of|on|or|the|to|with)$/i);
    expect(title).toMatch(/^List /);
  });
});

describe("draftPlan", () => {
  const issue = src([
    {
      text: "When a person signs in, the system shall open the board.",
      checked: false,
      verify: "`pnpm -C web test sign-in`",
    },
    { text: "The guide shall show one example.", checked: false, verify: "manual" },
    { text: "The log shall name the user.", checked: false },
  ]);
  const plan = draftPlan(issue, { at: "2026-10-30T10:05+05:30", by: "codex", lane: "auth" });
  const tasks = plan.phases.flatMap((p) => p.tasks);

  test("one task per criterion, in order, each waiting for the one before", () => {
    expect(tasks.map((t) => [t.id, t.satisfies, t.depends_on])).toEqual([
      ["T-1", ["SC-1"], undefined],
      ["T-2", ["SC-2"], ["T-1"]],
      ["T-3", ["SC-3"], ["T-2"]],
    ]);
    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0].name).toBe(PHASE_NAME);
    expect(tasks.every((t) => t.status === "todo" && t.lane === "auth")).toBe(true);
    // Nothing is claimed by the plan itself.
    expect(tasks.some((t) => t.claimed_by || t.lease_until)).toBe(false);
  });

  test("a task proves its criterion the way the criterion says, else by hand", () => {
    expect(tasks.map((t) => t.verify)).toEqual(["`pnpm -C web test sign-in`", "manual", "manual"]);
    // A check by hand is a person's, so it is not a step of the agent.
    expect(tasks[0].steps?.map((s) => s.text)).toEqual([
      "Make the change that satisfies SC-1.",
      "Run the verify command and read its result.",
    ]);
    expect(tasks[1].steps?.map((s) => s.text)).toEqual(["Make the change that satisfies SC-2."]);
    for (const t of tasks)
      for (const s of t.steps ?? []) expect(s.text.split(" ").length).toBeLessThanOrEqual(20);
  });

  test("the frontmatter and the text are the plan format, and the same input gives the same plan", () => {
    const text = renderPlan(plan);
    expect(text).toMatch(
      /^---\nupdated_at: 2026-10-30T10:05\+05:30\nupdated_by: "@codex"\nrevision: 1\n---\n\n## Approach\n\n/,
    );
    expect(text).toContain("## Phase 1: Deliver the criteria\n\n### T-1: ");
    expect(
      renderPlan(draftPlan(issue, { at: "2026-10-30T10:05+05:30", by: "codex", lane: "auth" })),
    ).toBe(text);
    // At most 5 short sentences in the approach, no hedge word.
    expect(plan.approach.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(5);
    expect(`${plan.approach} ${tasks.map((t) => t.brief).join(" ")}`).not.toMatch(
      /\b(maybe|probably|perhaps|possibly|likely|might|may|somewhat|hopefully|basically)\b/i,
    );
  });
});
