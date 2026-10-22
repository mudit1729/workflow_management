// PlanList: the plan as a phase stepper. Each phase shows its progress; finished
// phases start collapsed. A task row expands its TaskDetail inline.
import { Check, ChevronRight, ListChecks } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { AuthorChip, EmptyState, StatusIcon } from "@/components/common";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
} from "@/components/ui";
import type { Criterion, IssueId, Phase, Plan, Task, TaskId } from "@/gen/types";
import { cn } from "@/lib/cn";
import { InlineText, TaskDetail } from "./TaskDetail";

export interface PlanListProps {
  plan: Plan;
  issueId: IssueId;
  highlightReady?: boolean;
  /** The issue's criteria, passed on to TaskDetail for `satisfies` chips. */
  criteria?: Criterion[];
}

const phaseKey = (p: Phase) => `${p.index}:${p.name}`;
const isFinished = (p: Phase) =>
  p.tasks.length > 0 && p.tasks.every((t) => t.status === "done" || t.status === "cancelled");

export function PlanList({ plan, issueId, highlightReady = false, criteria }: PlanListProps) {
  const tasks = useMemo(() => plan.phases.flatMap((p) => p.tasks), [plan]);
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
          skill="write-plan"
        />
      </div>
    );
  }

  return (
    <ol data-wf="PlanList" className="flex min-w-0 flex-col">
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
                          variant="inline"
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
    return (
      <span className="grid size-4 place-items-center rounded-full bg-status-done text-accent-fg">
        <Check size={10} strokeWidth={3} />
      </span>
    );
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
  expanded,
  highlightReady,
  rowRef,
  onToggle,
}: {
  task: Task;
  expanded: boolean;
  highlightReady: boolean;
  rowRef: (el: HTMLButtonElement | null) => void;
  onToggle: () => void;
}) {
  const stepsDone = task.steps.filter((s) => s.checked).length;
  const leaseExpired = task.lease === "expired";
  const finished = task.status === "done" || task.status === "cancelled";
  const lit = highlightReady && task.ready;

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
          task.status === "cancelled" && "line-through",
        )}
      >
        <InlineText text={task.title} />
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Chip tone="outline" size="xs">
          {task.lane}
        </Chip>
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
              <ListChecks size={12} strokeWidth={1.75} aria-hidden />
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
