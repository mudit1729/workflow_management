import { PlanList } from "@/features/issue/PlanList";
import { TaskDetail } from "@/features/issue/TaskDetail";
import { TaskPill } from "@/features/issue/TaskPill";
import { PlanTab } from "@/features/issue/tabs/PlanTab";
import type { IssueDetail, Task, TaskStatus } from "@/gen/types";
import { entry, type KitEntry, V, WithDetail } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/issue";

const allTasks = (d: IssueDetail): Task[] => d.plan?.phases.flatMap((p) => p.tasks) ?? [];
const taskOf = (d: IssueDetail, id: string) => allTasks(d).find((t) => t.id === id);

// ---------------------------------------------------------------- TaskPill

function Pill({
  issue = ISSUE.rich,
  task,
  label,
  note,
  tweak,
  size,
  showTitle,
  interactive,
}: {
  issue?: string;
  task: string;
  label: string;
  note?: string;
  tweak?: (t: Task) => Task;
  size?: "sm" | "md";
  showTitle?: boolean;
  interactive?: boolean;
}) {
  return (
    <V label={label} note={note} width={size === "sm" ? 220 : 280}>
      <WithDetail id={issue}>
        {(d) => {
          const t = taskOf(d, task);
          if (!t) return null;
          return (
            <TaskPill
              task={tweak ? tweak(t) : t}
              size={size}
              showTitle={showTitle}
              onClick={interactive ? () => undefined : undefined}
            />
          );
        }}
      </WithDetail>
    </V>
  );
}

const asStatus = (status: TaskStatus) => (t: Task) => ({ ...t, status });

function TaskPillBody() {
  return (
    <>
      <Pill task="T-4" label="to do" tweak={asStatus("todo")} />
      <Pill task="T-3" label="in progress · claimed, live lease" />
      <Pill task="T-4" label="blocked" tweak={asStatus("blocked")} />
      <Pill task="T-2" label="review" />
      <Pill task="T-1" label="done" />
      <Pill task="T-4" label="cancelled" tweak={asStatus("cancelled")} />
      <Pill task="T-4" label="ready · accent dot" />
      <Pill issue={ISSUE.leaseExpired} task="T-3" label="lease expired · amber dot" />
      <Pill issue={ISSUE.stale} task="T-2" label="stale · amber" />
      <Pill task="T-3" label="no title" showTitle={false} />
      <Pill task="T-3" label="small" size="sm" />
      <Pill
        task="T-3"
        label="clickable"
        interactive
        note="Becomes a button; tooltip names the claimant."
      />
      <Pill
        task="T-4"
        label="long title"
        tweak={(t) => ({
          ...t,
          title:
            "Elect one leader tab over BroadcastChannel and fall back to a shared worker when it is missing",
        })}
      />
    </>
  );
}

// ---------------------------------------------------------------- TaskDetail

function Detail({
  issue = ISSUE.rich,
  task,
  label,
  note,
}: {
  issue?: string;
  task: string;
  label: string;
  note?: string;
}) {
  return (
    <V label={label} note={note} width={360}>
      <WithDetail id={issue}>
        {(d) => {
          const t = taskOf(d, task);
          return t ? (
            <div className="rounded-md border border-border p-3">
              <TaskDetail
                task={t}
                issueId={d.summary.id}
                tasks={allTasks(d)}
                criteria={d.criteria}
              />
            </div>
          ) : null;
        }}
      </WithDetail>
    </V>
  );
}

function TaskDetailBody() {
  return (
    <>
      <Detail
        task="T-3"
        label="in progress · steps 1/2, dependencies, owns"
        note="Commits and CI list the commits that name this task and their runs; each opens its row in the Git or CI tab."
      />
      <Detail task="T-4" label="ready · nothing claimed yet" />
      <Detail issue={ISSUE.leaseExpired} task="T-3" label="lease expired" />
      <Detail task="T-1" label="done" />
    </>
  );
}

// ---------------------------------------------------------------- PlanList

function PlanListDemo({
  id,
  label,
  note,
  width = 560,
  ready,
}: {
  id: string;
  label: string;
  note?: string;
  width?: number;
  ready?: boolean;
}) {
  return (
    <V label={label} note={note} width={width}>
      <WithDetail id={id}>
        {(d) =>
          d.plan ? (
            <PlanList
              plan={d.plan}
              issueId={d.summary.id}
              criteria={d.criteria}
              highlightReady={ready}
            />
          ) : null
        }
      </WithDetail>
    </V>
  );
}

function PlanListBody() {
  return (
    <>
      <PlanListDemo
        id={ISSUE.rich}
        label="wf-3k9x2 · three phases"
        note="A task that waits shows “after T-3”. The task in progress is bold and is scrolled into view when the list opens."
      />
      <PlanListDemo id={ISSUE.crowded} label="wf-b1d7v · finished phases collapsed" />
      <PlanListDemo id={ISSUE.rich} label="ready highlighted" ready />
      <PlanListDemo
        id={ISSUE.rich}
        label="360 px"
        note="Narrow, the area and “after …” leave the row; the detail still lists them."
        width={360}
      />
    </>
  );
}

// ---------------------------------------------------------------- PlanTab

function PlanTabBody() {
  return (
    <>
      <V label="wf-3k9x2 · drawer" width={560}>
        <WithDetail id={ISSUE.rich}>{(d) => <PlanTab detail={d} variant="drawer" />}</WithDetail>
      </V>
      <V label="wf-3k9x2 · page (context folded)" width={900}>
        <WithDetail id={ISSUE.rich}>{(d) => <PlanTab detail={d} variant="page" />}</WithDetail>
      </V>
      <V label="no plan, m size · wf-h2tb7" width={560}>
        <WithDetail id={ISSUE.noPlan}>{(d) => <PlanTab detail={d} variant="drawer" />}</WithDetail>
      </V>
      <V label="no plan, xs size (a plan is optional) · wf-e6kc1" width={560}>
        <WithDetail id="wf-e6kc1">{(d) => <PlanTab detail={d} variant="drawer" />}</WithDetail>
      </V>
    </>
  );
}

export const issuePlanEntries: KitEntry[] = [
  entry(
    "Issue · Plan",
    "TaskPill",
    `${SRC}/TaskPill.tsx`,
    "A task needs to be recognizable anywhere it is mentioned (the list, the state, the goal, a commit): status glyph, id, title and who holds it, with markers only for ready, expired and stale.",
    TaskPillBody,
  ),
  entry(
    "Issue · Plan",
    "TaskDetail",
    `${SRC}/TaskDetail.tsx`,
    "Opening a task shows what an agent needs to pick it up: the brief, steps to tick, dependencies, files it owns, what it satisfies, the verify command and the lease.",
    TaskDetailBody,
  ),
  entry(
    "Issue · Plan",
    "PlanList",
    `${SRC}/PlanList.tsx`,
    "The tasks as a sequence of phases, the one view of them: the Ready highlight, what each task waits for and the task in progress are easy to find, and finished phases fold away.",
    PlanListBody,
  ),
  entry(
    "Issue · Plan",
    "PlanTab",
    `${SRC}/tabs/PlanTab.tsx`,
    "The plan tab carries the approach and its assumptions before the tasks, so a reviewer can disagree with the idea before the work is spent.",
    PlanTabBody,
  ),
];
