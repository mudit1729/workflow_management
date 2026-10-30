// PlanList: the plan as a phase stepper, the one view of the tasks. Each phase shows its progress;
// finished phases start collapsed. A task row shows what to look for: the Ready highlight, what
// the task still waits for, its claimant; the task in progress is brought into view once when the
// list opens. A row expands its TaskDetail inline.
import { ChevronRight, ListChecks } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthorChip, EmptyState, StatusIcon } from "@/components/common";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Tooltip } from "@/components/ui";
import type { Criterion, IssueId, Phase, Plan, Task, TaskId } from "@/gen/types";
import { cn } from "@/lib/cn";
import { ASK, SkillHint } from "./skill-hint";
import { InlineText, TaskDetail } from "./TaskDetail";
import { useTaskFocus, useTaskFocusRequest } from "./task-focus";

export interface PlanListProps {
  plan: Plan;
  issueId: IssueId;
  highlightReady?: boolean;
  /** The issue's criteria, passed on to TaskDetail for `satisfies` chips. */
  criteria?: Criterion[];
}

const phaseKey = (p: Phase) => `${p.index}:${p.name}`;
const isClosed = (t: Task) => t.status === "done" || t.status === "cancelled";
const isFinished = (p: Phase) => p.tasks.length > 0 && p.tasks.every(isClosed);

/** The task the issue is about right now: in progress, else in review. */
const inFlight = (tasks: Task[]) =>
  tasks.find((t) => t.status === "in_progress") ?? tasks.find((t) => t.status === "review");

/** Whether `el` is fully inside the box that scrolls it (the drawer body), or the window. */
function inView(el: HTMLElement): boolean {
  let box: { top: number; bottom: number } = { top: 0, bottom: window.innerHeight };
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") {
      box = p.getBoundingClientRect();
      break;
    }
  }
  const r = el.getBoundingClientRect();
  return r.top >= box.top && r.bottom <= box.bottom;
}

/** The tasks of this plan that `task` still waits for. Other issues' tasks are not judged here. */
function waitingOn(task: Task, byId: ReadonlyMap<TaskId, Task>): Task[] {
  if (isClosed(task)) return [];
  return task.depends_on.flatMap((id) => {
    const dep = byId.get(id);
    return dep && !isClosed(dep) ? [dep] : [];
  });
}

export function PlanList({ plan, issueId, highlightReady = false, criteria }: PlanListProps) {
  const tasks = useMemo(() => plan.phases.flatMap((p) => p.tasks), [plan]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // Finished phases start collapsed. Phases the user has toggled, and phases that
  // finish later while the plan is open, keep the state they had.
  const [openPhases, setOpenPhases] = useState<Map<string, boolean>>(
    () => new Map(plan.phases.map((p) => [phaseKey(p), !isFinished(p)])),
  );
  const [expanded, setExpanded] = useState<TaskId | null>(null);
  const rowEls = useRef(new Map<TaskId, HTMLElement>());

  const setPhaseOpen = useCallback((key: string, open: boolean) => {
    setOpenPhases((prev) => new Map(prev).set(key, open));
  }, []);

  /** Jump to a task (from a dependency pill): open its phase, expand it, bring it into view. */
  const reveal = useCallback(
    (id: TaskId) => {
      const phase = plan.phases.find((p) => p.tasks.some((t) => t.id === id));
      if (phase) setPhaseOpen(phaseKey(phase), true);
      setExpanded(id);
      requestAnimationFrame(() => {
        const el = rowEls.current.get(id);
        el?.scrollIntoView({ block: "nearest" });
        el?.focus({ preventScroll: true });
      });
    },
    [plan.phases, setPhaseOpen],
  );

  // A commit's T-n pill in the Git tab asks for this task.
  useTaskFocusRequest(issueId, reveal);

  // When the list opens, bring the task in progress to the middle of the view if it is out of it
  // (so a short plan stays where it is). Later changes of the plan do not move the page. A task
  // asked for by a commit pill wins.
  const latestTasks = useRef(tasks);
  latestTasks.current = tasks;
  useEffect(() => {
    if (useTaskFocus.getState().request?.issue === issueId) return;
    const frame = requestAnimationFrame(() => {
      const flight = inFlight(latestTasks.current);
      const row = flight && rowEls.current.get(flight.id);
      if (row && !inView(row)) row.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [issueId]);

  if (tasks.length === 0) {
    return (
      <div data-wf="PlanList">
        <EmptyState
          compact
          title="No tasks yet"
          hint={
            <>
              Add <code className="font-mono text-fg-muted">### T-1: …</code> headings under a{" "}
              <code className="font-mono text-fg-muted">## Phase</code> heading in plan.md.
            </>
          }
          action={
            <SkillHint skill="planning-issues" prompt={ASK.moreTasks(issueId)} align="start" />
          }
        />
      </div>
    );
  }

  return (
    <ol data-wf="PlanList" className="@container/plan flex min-w-0 flex-col">
      {plan.phases.map((phase, i) => {
        const key = phaseKey(phase);
        return (
          <PhaseStep
            key={key}
            phase={phase}
            last={i === plan.phases.length - 1}
            open={openPhases.get(key) ?? !isFinished(phase)}
            onOpenChange={(open) => setPhaseOpen(key, open)}
          >
            {phase.tasks.length === 0 ? (
              <p className="px-2 py-1.5 text-fg-faint text-sm">No tasks in this phase.</p>
            ) : (
              <ul className="flex min-w-0 flex-col gap-px">
                {phase.tasks.map((task) => (
                  <li key={task.id} className="min-w-0">
                    <TaskRow
                      task={task}
                      waiting={waitingOn(task, byId)}
                      expanded={expanded === task.id}
                      highlightReady={highlightReady}
                      rowRef={(el) => {
                        if (el) rowEls.current.set(task.id, el);
                        else rowEls.current.delete(task.id);
                      }}
                      onToggle={() => setExpanded((cur) => (cur === task.id ? null : task.id))}
                    />
                    {expanded === task.id && (
                      <div className="pt-1 pb-2 pl-8">
                        <TaskDetail
                          task={task}
                          issueId={issueId}
                          tasks={tasks}
                          criteria={criteria}
                          onSelectTask={reveal}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </PhaseStep>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- phase

function PhaseStep({
  phase,
  last,
  open,
  onOpenChange,
  children,
}: {
  phase: Phase;
  last: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const total = phase.tasks.length;
  const done = phase.tasks.filter((t) => t.status === "done").length;
  const finished = isFinished(phase);
  const ready = phase.tasks.filter((t) => t.ready).length;

  return (
    <li data-wf="PlanPhase" className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] gap-x-2.5">
      <div aria-hidden className="flex flex-col items-center">
        <div className="flex h-7 items-center">
          <PhaseMarker done={done} total={total} finished={finished} />
        </div>
        {!last && <div className="w-px flex-1 bg-border" />}
      </div>
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        className={cn("min-w-0", !last && "pb-3")}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group/phase flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 ease-wf hover:bg-subtle"
          >
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-base">
              {phase.index > 0 && (
                <>
                  <span className="shrink-0 text-fg-muted">Phase {phase.index}</span>
                  <span aria-hidden className="text-fg-faint">
                    ·
                  </span>
                </>
              )}
              <span className={cn("truncate font-medium", finished ? "text-fg-muted" : "text-fg")}>
                {phase.name}
              </span>
            </span>
            {!open && ready > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-accent text-xs">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {ready} ready
              </span>
            )}
            <span className="shrink-0 text-fg-faint text-xs tabular">
              {done}/{total}
            </span>
            <ChevronRight
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-fg-faint transition-transform duration-150 ease-wf group-data-[state=open]/phase:rotate-90"
            />
          </button>
        </CollapsibleTrigger>
        {/* Inner room so focus rings are not clipped by the collapsible's overflow. */}
        <CollapsibleContent className="-mx-1 -mb-1 min-w-0 px-1 pt-0.5 pb-1">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** Filled check when every task is done; otherwise a ring that fills with progress. */
function PhaseMarker({
  done,
  total,
  finished,
}: {
  done: number;
  total: number;
  finished: boolean;
}) {
  if (finished) {
    return <StatusIcon status="done" size={16} />;
  }
  const r = 6.25;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" className="shrink-0">
      <circle
        cx={8}
        cy={8}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-border-strong"
        strokeDasharray={total === 0 ? "2 2" : undefined}
      />
      {frac > 0 && (
        <circle
          cx={8}
          cy={8}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 8 8)"
          className="text-status-done"
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- task row

function TaskRow({
  task,
  waiting,
  expanded,
  highlightReady,
  rowRef,
  onToggle,
}: {
  task: Task;
  /** The tasks of this plan it still waits for. */
  waiting: Task[];
  expanded: boolean;
  highlightReady: boolean;
  rowRef: (el: HTMLButtonElement | null) => void;
  onToggle: () => void;
}) {
  const stepsDone = task.steps.filter((s) => s.checked).length;
  const leaseExpired = task.lease === "expired";
  const finished = isClosed(task);
  const lit = highlightReady && task.ready;
  const working = task.status === "in_progress";

  return (
    <button
      ref={rowRef}
      type="button"
      data-wf="PlanTaskRow"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-2 rounded-md border px-2 text-left",
        "transition-colors duration-150 ease-wf",
        lit
          ? "border-accent/50 bg-accent-subtle hover:bg-accent-subtle"
          : "border-transparent hover:bg-subtle",
        expanded && !lit && "bg-subtle",
      )}
    >
      <StatusIcon status={task.status} size={14} />
      <span
        className={cn(
          "w-7 shrink-0 font-mono text-xs tabular",
          task.stale ? "text-stale" : "text-fg-muted",
        )}
      >
        {task.id}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-base",
          finished ? "text-fg-muted" : "text-fg",
          working && "font-medium",
          task.status === "cancelled" && "line-through",
        )}
      >
        <InlineText text={task.title} />
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {waiting.length > 0 && (
          <>
            <Tooltip content={`Waits for ${waiting.map((t) => t.id).join(", ")}`}>
              <span
                data-wf="PlanTaskWaits"
                className="hidden items-baseline gap-1 text-fg-faint text-xs @md/plan:flex"
              >
                after
                <span className="font-mono tabular">{waiting.map((t) => t.id).join(", ")}</span>
              </span>
            </Tooltip>
            <span aria-hidden className="-mx-1 hidden text-fg-faint text-xs @lg/plan:inline">
              ·
            </span>
          </>
        )}
        <Tooltip content={`Area: ${task.lane}`}>
          <span className="hidden text-fg-faint text-xs @lg/plan:inline">{task.lane}</span>
        </Tooltip>
        {task.claimed_by && (
          <span className="flex items-center gap-1">
            {leaseExpired && (
              <Tooltip content="Lease expired">
                <span className="size-1.5 rounded-full bg-stale">
                  <span className="sr-only">Lease expired</span>
                </span>
              </Tooltip>
            )}
            <AuthorChip handle={task.claimed_by} variant="avatar" size="xs" />
          </span>
        )}
        {task.steps.length > 0 && (
          <Tooltip content={`${stepsDone} of ${task.steps.length} steps done`}>
            <span className="flex items-center gap-1 text-fg-faint text-xs tabular">
              <ListChecks size={14} strokeWidth={1.75} aria-hidden />
              {stepsDone}/{task.steps.length}
            </span>
          </Tooltip>
        )}
        {task.ready && (
          <Tooltip content="Ready to claim">
            <span className="size-1.5 rounded-full bg-accent">
              <span className="sr-only">Ready to claim</span>
            </span>
          </Tooltip>
        )}
      </span>
    </button>
  );
}
