// TaskDetail: everything about one plan task. Opens inline under a row in PlanList.
// Status and steps write back through ops.
import { Check, ChevronDown, GitCommitHorizontal } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { AuthorChip, CopyButton, MarkdownProse, StatusIcon } from "@/components/common";
import {
  Button,
  Checkbox,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui";
import type { Criterion, IssueId, Step, Task, TaskId, TaskStatus } from "@/gen/types";
import {
  type Commit,
  type PipelineRun,
  useDelivery,
  useSetTaskStatus,
  useToggleStep,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { absolute } from "@/lib/format";
import { useIssueTab, useOpenIssue } from "@/lib/nav";
import { TASK_STATUS_LABEL } from "@/lib/status";
import { focusCommit, focusRun } from "./delivery-focus";
import { RUN_LABEL, RunStateIcon, runState } from "./delivery-ui";
import { LeaseText, plainTitle, TaskPill } from "./TaskPill";

const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
];

export interface TaskDetailProps {
  task: Task;
  issueId: IssueId;
  /** All tasks of the plan, to render same-issue dependencies as pills. */
  tasks?: Task[];
  /** The issue's criteria, to explain `satisfies` chips. */
  criteria?: Criterion[];
  /** Called when a dependency pill is picked (PlanList opens that task). */
  onSelectTask?: (id: TaskId) => void;
  className?: string;
}

export function TaskDetail({
  task,
  issueId,
  tasks,
  criteria,
  onSelectTask,
  className,
}: TaskDetailProps) {
  const setTaskStatus = useSetTaskStatus(issueId);
  const toggleStep = useToggleStep(issueId);
  const taskById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);
  const criterionById = useMemo(() => new Map((criteria ?? []).map((c) => [c.id, c])), [criteria]);

  const changeStatus = (status: TaskStatus) => {
    if (status === task.status) return;
    void setTaskStatus({ task: task.id, status, base_rev: task.edit.rev });
  };
  const changeStep = (step: Step, checked: boolean) => {
    void toggleStep({ task: task.id, index: step.index, checked, base_rev: step.edit.rev });
  };

  return (
    <div
      data-wf="TaskDetail"
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-md border border-border bg-subtle p-3 text-base",
        className,
      )}
    >
      <header className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5 text-fg-faint text-xs">
          <span className={cn("font-mono", task.stale && "text-stale")}>{task.id}</span>
          {task.phase && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{task.phase}</span>
            </>
          )}
          {task.stale && (
            <>
              <span aria-hidden>·</span>
              <span className="text-stale">Stale</span>
            </>
          )}
        </div>
        <h4 className="font-medium text-base text-fg leading-snug">
          <InlineText text={task.title} />
        </h4>
      </header>

      <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
        <Property label="Status">
          <StatusMenu status={task.status} onChange={changeStatus} />
        </Property>
        <Property label="Area">
          <Chip tone="outline" size="sm">
            {task.lane}
          </Chip>
        </Property>
        {task.assignee && (
          <Property label="Assignee">
            {task.assignee.startsWith("role:") ? (
              <Chip tone="neutral" size="sm">
                {task.assignee}
              </Chip>
            ) : (
              <AuthorChip handle={task.assignee.replace(/^@/, "")} variant="chip" size="sm" />
            )}
          </Property>
        )}
        <Property label="Claimed">
          {task.claimed_by ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <AuthorChip handle={task.claimed_by} variant="chip" size="sm" />
              {task.lease !== "none" &&
                (task.lease_until ? (
                  <Tooltip content={`Lease until ${absolute(task.lease_until)}`}>
                    <span className="text-sm">
                      <LeaseText task={task} />
                    </span>
                  </Tooltip>
                ) : (
                  <LeaseText task={task} className="text-sm" />
                ))}
            </span>
          ) : (
            <span className="text-fg-faint text-sm">
              {task.ready ? "Not claimed · ready to claim" : "Not claimed"}
            </span>
          )}
        </Property>
        {task.depends_on.length > 0 && (
          <Property label="Depends on">
            <ul className="flex min-w-0 flex-col items-start gap-1">
              {task.depends_on.map((dep) => (
                <li key={dep} className="flex min-w-0 max-w-full">
                  <Dependency
                    target={dep}
                    task={taskById.get(dep)}
                    onSelect={onSelectTask ? () => onSelectTask(dep) : undefined}
                  />
                </li>
              ))}
            </ul>
          </Property>
        )}
        {task.owns.length > 0 && (
          <Property label="Owns">
            <ul className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              {task.owns.map((path) => (
                <li key={path} className="break-all font-mono text-fg-muted text-xs leading-5">
                  {path}
                </li>
              ))}
            </ul>
          </Property>
        )}
        {task.satisfies.length > 0 && (
          <Property label="Satisfies">
            <span className="flex flex-wrap gap-1">
              {task.satisfies.map((id) => (
                <CriterionChip key={id} id={id} criterion={criterionById.get(id)} />
              ))}
            </span>
          </Property>
        )}
        {task.verify && (
          <Property label="Verify">
            <VerifyCommand command={task.verify} />
          </Property>
        )}
        <DeliveryRows task={task} issueId={issueId} />
      </dl>

      {task.brief_md && (
        <div className="border-border border-t pt-3">
          <MarkdownProse md={task.brief_md} issueId={issueId} compact />
        </div>
      )}

      {task.steps.length > 0 && (
        <StepList steps={task.steps} taskId={task.id} onToggle={changeStep} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- parts

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="flex h-6 items-center text-fg-faint text-sm">{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center">{children}</dd>
    </>
  );
}

function StatusMenu({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-1.5 gap-1.5 px-1.5 font-normal text-fg"
          aria-label={`Status: ${TASK_STATUS_LABEL[status]}. Change status`}
        >
          <StatusIcon status={status} size={14} />
          {TASK_STATUS_LABEL[status]}
          <ChevronDown size={14} strokeWidth={1.75} className="text-fg-faint" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuRadioGroup value={status} onValueChange={(v) => onChange(v as TaskStatus)}>
          {TASK_STATUSES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s} icon={<StatusIcon status={s} size={14} />}>
              {TASK_STATUS_LABEL[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The commits that name this task (`task:` in their log entry) and the CI runs of those commits,
 * each a link to its row: a commit opens the Git tab on its sha, a run opens the CI tab on the
 * run. The Git tab's T-n pill goes the other way, so a task and its delivery are one click apart.
 */
function DeliveryRows({ task, issueId }: { task: Task; issueId: IssueId }) {
  const { commits, pipelines } = useDelivery(issueId);
  const { setTab } = useIssueTab();
  const mine = commits.filter((c) => c.task === task.id);
  const shas = new Set(mine.map((c) => c.sha.slice(0, 7)));
  const runs = pipelines.filter((r) => shas.has(r.sha.slice(0, 7)));
  if (mine.length === 0 && runs.length === 0) return null;

  const openCommit = (commit: Commit) => {
    focusCommit(issueId, commit.sha);
    void setTab("git");
  };
  const openRun = (run: PipelineRun) => {
    focusRun(issueId, run.id);
    void setTab("ci");
  };
  const chip =
    "inline-flex h-5 max-w-full items-center gap-1 rounded-sm bg-muted px-1.5 text-fg-muted text-xs transition-colors duration-100 ease-wf hover:bg-border hover:text-fg";

  return (
    <>
      {mine.length > 0 && (
        <Property label="Commits">
          <ul aria-label={`Commits of ${task.id}`} className="flex min-w-0 flex-wrap gap-1">
            {mine.map((commit) => (
              <li key={commit.sha} className="min-w-0 max-w-full">
                <Tooltip content={`${commit.subject} · Open in Git`}>
                  <button type="button" onClick={() => openCommit(commit)} className={chip}>
                    <GitCommitHorizontal size={12} strokeWidth={1.75} aria-hidden />
                    <span className="font-mono tabular">{commit.sha.slice(0, 7)}</span>
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        </Property>
      )}
      {runs.length > 0 && (
        <Property label="CI">
          <ul aria-label={`CI runs of ${task.id}`} className="flex min-w-0 flex-wrap gap-1">
            {runs.map((run) => {
              const state = runState(run);
              return (
                <li key={run.id} className="min-w-0 max-w-full">
                  <Tooltip content={`${run.workflow} ${run.id} · Open in CI`}>
                    <button type="button" onClick={() => openRun(run)} className={chip}>
                      <RunStateIcon state={state} size={12} label={RUN_LABEL[state]} />
                      <span className="font-mono tabular">{run.id}</span>
                      <span>{RUN_LABEL[state]}</span>
                    </button>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </Property>
      )}
    </>
  );
}

/** Same-issue deps render as pills; cross-issue refs ("wf-8h2k1#T-2") as mono links. */
function Dependency({
  target,
  task,
  onSelect,
}: {
  target: string;
  task?: Task;
  onSelect?: () => void;
}) {
  const openIssue = useOpenIssue();
  if (task) return <TaskPill task={task} size="sm" onClick={onSelect} />;

  const issue = target.includes("#") ? target.slice(0, target.indexOf("#")) : null;
  if (!issue) {
    return (
      <Tooltip content="This task is not in the plan">
        <span className="font-mono text-fg-faint text-xs leading-5 underline decoration-dashed underline-offset-2">
          {target}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={`Open ${issue}`}>
      <button
        type="button"
        onClick={() => void openIssue(issue, { tab: "plan" })}
        className="rounded-sm font-mono text-fg-muted text-xs leading-5 underline decoration-border-strong underline-offset-2 transition-colors duration-150 ease-wf hover:text-fg hover:decoration-fg-faint"
      >
        {target}
      </button>
    </Tooltip>
  );
}

function CriterionChip({ id, criterion }: { id: string; criterion?: Criterion }) {
  const chip = (
    <Chip
      tone="outline"
      size="sm"
      icon={
        criterion?.state === "verified" ? (
          <Check size={12} strokeWidth={1.75} className="text-status-done" />
        ) : undefined
      }
    >
      <span className="font-mono">{id}</span>
    </Chip>
  );
  if (!criterion) return chip;
  const state = { open: "Open", claimed: "Claimed, no evidence yet", verified: "Verified" }[
    criterion.state
  ];
  return (
    <Tooltip
      content={
        <span className="flex max-w-[280px] flex-col gap-0.5">
          <span>{plainTitle(criterion.text)}</span>
          <span className="opacity-75">{state}</span>
        </span>
      }
    >
      <span className="inline-flex">{chip}</span>
    </Tooltip>
  );
}

function VerifyCommand({ command }: { command: string }) {
  if (command.trim().toLowerCase() === "manual") {
    return <span className="text-fg-muted text-sm">Manual check</span>;
  }
  const text = command.replace(/^`|`$/g, "");
  return (
    <span className="flex min-w-0 max-w-full items-center gap-1 rounded-sm bg-muted py-0.5 pr-0.5 pl-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-fg text-xs">{text}</code>
      <CopyButton text={text} label="Copy verify command" />
    </span>
  );
}

function StepList({
  steps,
  taskId,
  onToggle,
}: {
  steps: Step[];
  taskId: TaskId;
  onToggle: (step: Step, checked: boolean) => void;
}) {
  const done = steps.filter((s) => s.checked).length;
  return (
    <section
      aria-label={`${taskId} steps`}
      className="flex flex-col gap-1 border-border border-t pt-3"
    >
      <div className="flex items-center justify-between">
        <h5 className="font-medium text-fg-muted text-sm">Steps</h5>
        <span className="text-fg-faint text-xs tabular">
          {done}/{steps.length} steps
        </span>
      </div>
      <ul className="flex flex-col">
        {steps.map((step) => (
          <li key={step.index}>
            {/* A label around the checkbox makes the whole row a click target. */}
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders a labelable button */}
            <label className="-mx-1 flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1 transition-colors duration-150 ease-wf hover:bg-muted">
              <span className="flex h-5 items-center">
                <Checkbox
                  checked={step.checked}
                  onCheckedChange={(v) => onToggle(step, v === true)}
                  aria-label={plainTitle(step.text)}
                />
              </span>
              <span
                className={cn(
                  "min-w-0 text-base leading-5",
                  step.checked ? "text-fg-muted" : "text-fg",
                )}
              >
                <InlineText text={step.text} />
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Plain text with `code` spans. For one-line fields (steps, assumptions). */
export function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.length > 1 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="code-inline rounded-sm bg-muted px-1 py-px">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
