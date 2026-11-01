// The plan a "Do next step" run writes for an issue that has none. "Do next step" always does
// the next step, and on an issue without a plan that is planning (the `planning-issues` skill):
// `plan.md` from the criteria of `goal.md`, one task per criterion, in order, and the issue
// moves from backlog to planned. Real Codex reads the repository and decides the files; the
// prototype does not know the code layout, so a drafted task has no `owns` and says so in its
// brief. Pure: the same issue always gives the same plan.
import type { Handle, Ts } from "@/gen/types";
import { stripTicks } from "./derive";
import type { IssueSrc, PlanSrc, TaskSrc } from "./source";

/** Words that cannot open a task title: the response of the criterion is not an action. */
const NOT_A_VERB = new Set("be not have remain stay still also always never".split(" "));

const MAX_TITLE = 70;

/** Words a cut title cannot end on. */
const DANGLING = new Set("a an and at by for from in into of on or the to with".split(" "));

/**
 * The imperative title of the task for one criterion: the response after `shall`, with its first
 * word capitalised (`…the board shall show the entry within 2 s.` → `Show the entry within 2 s`).
 * A response that is not an action ("shall not occur") becomes `Satisfy SC-n`.
 */
export function taskTitle(criterion: string, n: number): string {
  const response = /\bshall\s+(.+?)\.?$/i.exec(criterion.trim().replace(/\s+/g, " "))?.[1];
  const first = response?.split(" ")[0]?.toLowerCase() ?? "";
  if (!response || NOT_A_VERB.has(first) || !/^[a-z]+$/.test(first)) return `Satisfy SC-${n}`;
  let title = response.charAt(0).toUpperCase() + response.slice(1);
  if (title.length > MAX_TITLE) {
    const words = title.slice(0, MAX_TITLE).split(" ");
    words.pop();
    while (words.length > 1 && DANGLING.has((words.at(-1) ?? "").toLowerCase())) words.pop();
    title = words.join(" ");
  }
  return title;
}

/** The `verify:` value of a task: the criterion's command in backticks, else `manual`. */
function verifyOf(verify: string | undefined): string {
  const cmd = stripTicks(verify)?.trim();
  return cmd && cmd !== "manual" ? `\`${cmd}\`` : "manual";
}

export interface PlanArgs {
  /** `updated_at` of the plan. */
  at: Ts;
  by: Handle;
  /** The lane of every task: the area of the work. */
  lane: string;
  /**
   * The most tasks a phase may have (the Plan step's `max_tasks`, default 8). More criteria than
   * that start a second phase, a third, and so on, each with at most this many.
   */
  maxTasks?: number;
}

/** The phase name of a drafted plan. */
export const PHASE_NAME = "Deliver the criteria";

/** The tasks and plan for an issue: `T-n` satisfies `SC-n`, and each task waits for the one before. */
export function draftPlan(src: IssueSrc, args: PlanArgs): PlanSrc {
  const tasks = src.criteria.map<TaskSrc>((c, i) => {
    const n = i + 1;
    const verify = verifyOf(c.verify);
    return {
      id: `T-${n}`,
      title: taskTitle(c.text, n),
      status: "todo",
      lane: args.lane,
      depends_on: n > 1 ? [`T-${n - 1}`] : undefined,
      satisfies: [`SC-${n}`],
      verify,
      brief: `Satisfy SC-${n} of goal.md. Find the files it needs; this plan does not name them yet.`,
      // A `manual` check is a person's, so it is not a step of the agent.
      steps: [
        { text: `Make the change that satisfies SC-${n}.`, done: false },
        ...(verify === "manual"
          ? []
          : [{ text: "Run the verify command and read its result.", done: false }]),
      ],
    };
  });
  // A plan holds at most `maxTasks` tasks in one phase; the rest wait in the next one.
  const per = Math.max(1, args.maxTasks ?? tasks.length);
  const phases = Array.from({ length: Math.max(1, Math.ceil(tasks.length / per)) }, (_, i) => ({
    index: i + 1,
    name: i === 0 ? PHASE_NAME : `${PHASE_NAME}, part ${i + 1}`,
    tasks: tasks.slice(i * per, (i + 1) * per),
  }));
  return {
    updated_at: args.at,
    updated_by: args.by,
    revision: 1,
    approach:
      "Each task satisfies one criterion of goal.md and proves it with the verify command of that criterion. The tasks run in order. Revise the plan when the work shows a better split.",
    assumptions: [],
    prior_art: [],
    phases,
  };
}
