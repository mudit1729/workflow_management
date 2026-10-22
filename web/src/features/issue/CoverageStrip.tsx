// Which tasks satisfy each success criterion. Exposes plan gaps (Q006) without a
// separate view; folds away when every criterion is covered.
import { ChevronRight, CircleDashed } from "lucide-react";
import { useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui";
import type { Criterion, Task, TaskStatus } from "@/gen/types";
import { cn } from "@/lib/cn";
import { statusColor, TASK_STATUS_LABEL } from "@/lib/status";
import { TaskPill } from "./TaskPill";

export interface CoverageStripProps {
  criteria: Criterion[];
  tasks: Task[];
}

// The bar reads like a progress bar: finished work first.
const STATUS_RANK: Record<TaskStatus, number> = {
  done: 0,
  review: 1,
  in_progress: 2,
  blocked: 3,
  todo: 4,
  cancelled: 5,
};

function coveringTasks(c: Criterion, tasks: Task[], byId: Map<string, Task>): Task[] {
  const seen = new Map<string, Task>();
  for (const t of tasks) if (t.satisfies.includes(c.id)) seen.set(t.id, t);
  for (const id of c.satisfied_by) {
    const t = byId.get(id);
    if (t) seen.set(t.id, t);
  }
  return [...seen.values()].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.id.localeCompare(b.id),
  );
}

export function CoverageStrip({ criteria, tasks }: CoverageStripProps) {
  const rows = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return criteria.map((c) => ({ criterion: c, tasks: coveringTasks(c, tasks, byId) }));
  }, [criteria, tasks]);
  const uncovered = rows.filter((r) => r.tasks.length === 0).length;
  const [open, setOpen] = useState(uncovered > 0);

  if (criteria.length === 0) return null;

  const summary =
    uncovered === 0
      ? `All ${criteria.length} criteria have a task`
      : `${uncovered} of ${criteria.length} ${criteria.length === 1 ? "criterion has" : "criteria have"} no task`;

  return (
    <div data-wf="CoverageStrip">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group -mx-1.5 flex h-7 w-[calc(100%_+_var(--spacing)_*_3)] items-center gap-1.5 rounded-sm px-1.5 text-sm transition-colors duration-100 ease-wf hover:bg-subtle">
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="text-fg-faint transition-transform duration-150 ease-wf group-data-[state=open]:rotate-90"
          />
          <span className="font-medium text-fg-muted group-hover:text-fg">Coverage</span>
          <span className={cn("truncate", uncovered > 0 ? "text-stale" : "text-fg-faint")}>
            {summary}
          </span>
          {!open && <OverviewBar rows={rows} />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul aria-label="Coverage by criterion" className="flex flex-col gap-1 pt-1 pb-0.5">
            {rows.map(({ criterion, tasks: covering }) => (
              <li
                key={criterion.id}
                className="grid min-h-7 grid-cols-[40px_56px_minmax(0,1fr)] items-center gap-x-3"
              >
                <span className="font-mono text-xs text-fg-faint tabular">{criterion.id}</span>
                <CoverageBar tasks={covering} />
                {covering.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {covering.map((t) => (
                      <TaskPill key={t.id} task={t} size="sm" />
                    ))}
                  </div>
                ) : (
                  <span className="inline-flex min-w-0 items-center gap-1 text-xs text-stale">
                    <CircleDashed size={12} strokeWidth={1.75} aria-hidden className="shrink-0" />
                    <span className="truncate">No task covers this (Q006)</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function coverageLabel(tasks: Task[]): string {
  if (tasks.length === 0) return "No task";
  return tasks.map((t) => `${t.id} ${TASK_STATUS_LABEL[t.status].toLowerCase()}`).join(", ");
}

/** One segment per covering task, colored by its status. Empty track when uncovered. */
function CoverageBar({ tasks }: { tasks: Task[] }) {
  return (
    <span
      aria-hidden
      title={coverageLabel(tasks)}
      className={cn(
        "flex h-1 w-full gap-px overflow-hidden rounded-full",
        tasks.length === 0 ? "border border-dashed border-stale/50" : "bg-muted",
      )}
    >
      {tasks.map((t) => (
        <span
          key={t.id}
          className="h-full flex-1"
          style={{ backgroundColor: statusColor(t.status) }}
        />
      ))}
    </span>
  );
}

/** Collapsed summary: one tick per criterion, in the status of its most advanced task. */
function OverviewBar({ rows }: { rows: { criterion: Criterion; tasks: Task[] }[] }) {
  return (
    <span aria-hidden className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
      {rows.map(({ criterion, tasks }) => (
        <span
          key={criterion.id}
          title={`${criterion.id}: ${coverageLabel(tasks)}`}
          className={cn("h-2.5 w-1 rounded-full", tasks.length === 0 && "bg-stale/60")}
          style={tasks[0] ? { backgroundColor: statusColor(tasks[0].status) } : undefined}
        />
      ))}
    </span>
  );
}
