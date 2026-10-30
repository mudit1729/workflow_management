// CI tab: the pipeline runs of this issue's commits, newest first. Each run opens to its jobs.
// Derived from GitHub through `gh`, never stored in the workspace (plan D2); the prototype reads
// a fixture plus the runs a Codex run adds, and `useDelivery` refreshes when one arrives.
import {
  ChevronRight,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestArrow,
  Workflow,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { EmptyState, RelativeTime, useNow } from "@/components/common";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Skeleton,
  Tooltip,
} from "@/components/ui";
import type { IssueDetail } from "@/gen/types";
import type { PipelineJob, PipelineRun } from "@/lib/api";
import { useDelivery } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseTs } from "@/lib/format";
import {
  formatDuration,
  RUN_LABEL,
  type RunState,
  RunStateIcon,
  runState,
  shortBranch,
  useFreshKeys,
} from "../delivery-ui";

export interface CiTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function CiTab({ detail, variant }: CiTabProps) {
  const issueId = detail.summary.id;
  const { pipelines, isLoading, error } = useDelivery(issueId);
  // What the person opened or closed by hand. Untouched rows open when they are the newest run.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // A new run flashes once; so does a run that changes state (running to passed).
  const fresh = useFreshKeys(
    pipelines.map((r) => `${r.id}:${runState(r)}`),
    !isLoading,
  );
  const headId = useId();

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading CI runs"
        className="flex flex-col gap-2"
      >
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  } else if (error && pipelines.length === 0) {
    body = (
      <p role="alert" className="py-6 text-center text-fg-muted text-sm">
        Could not read CI runs. {error.message}
      </p>
    );
  } else if (pipelines.length === 0) {
    body = <CiEmpty issueId={issueId} />;
  } else {
    body = (
      <section aria-labelledby={headId} className="min-w-0">
        <header className="mb-2 flex min-h-5 items-center gap-2">
          <h3 id={headId} className="font-medium text-fg-muted text-sm">
            Pipeline runs
          </h3>
          <span className="text-fg-faint text-sm tabular">{pipelines.length}</span>
        </header>
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {pipelines.map((run, i) => (
            <PipelineRow
              key={run.id}
              run={run}
              issueId={issueId}
              open={toggled[run.id] ?? (i === 0 || run.status !== "completed")}
              onOpenChange={(open) => setToggled((t) => ({ ...t, [run.id]: open }))}
              fresh={fresh.has(`${run.id}:${runState(run)}`)}
            />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div data-wf="CiTab" data-variant={variant} className="flex min-w-0 flex-col gap-6">
      {body}
    </div>
  );
}

// ---------------------------------------------------------------- empty

function CiEmpty({ issueId }: { issueId: string }) {
  const code = "code-inline rounded-sm bg-muted px-1 py-px text-fg";
  return (
    <div data-wf="CiEmpty">
      <EmptyState
        icon={<Workflow strokeWidth={1.75} />}
        title={`No CI runs for ${issueId} yet.`}
        hint={
          <>
            A push or a pull request on a branch named <code className={code}>{issueId}/…</code>{" "}
            starts a run.
          </>
        }
        action={
          <p className="max-w-[300px] text-fg-faint text-sm">
            Runs come from GitHub through <code className={code}>gh</code>. Nothing is stored in the
            workspace.
          </p>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- a run

const TRIGGER = {
  push: { label: "Push", icon: GitCommitHorizontal },
  pull_request: { label: "Pull request", icon: GitPullRequestArrow },
} as const;

export function PipelineRow({
  run,
  issueId,
  open,
  onOpenChange,
  fresh,
}: {
  run: PipelineRun;
  issueId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fresh: boolean;
}) {
  const state = runState(run);
  const trigger = TRIGGER[run.trigger];
  const TriggerIcon = trigger.icon;
  const failedJob =
    state === "failure" ? run.jobs.find((j) => j.conclusion === "failure") : undefined;

  return (
    <li
      data-wf="PipelineRow"
      data-run={run.id}
      data-state={state}
      className={cn("@container/run min-w-0", fresh && "wf-flash")}
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger
          className={cn(
            "group/run flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left",
            "transition-colors duration-100 ease-wf hover:bg-subtle",
          )}
        >
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="mt-0.5 shrink-0 text-fg-faint transition-transform duration-150 ease-wf group-data-[state=open]/run:rotate-90"
          />
          <span className="mt-0.5 flex shrink-0">
            <RunStateIcon state={state} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-medium text-base text-fg">{run.workflow}</span>
              <span className="shrink-0 font-mono text-fg-faint text-xs tabular">{run.id}</span>
              <RunResult run={run} state={state} />
            </span>
            <span className="flex min-w-0 items-center gap-x-2 text-fg-faint text-sm">
              {failedJob && (
                <>
                  <span className="shrink-0 whitespace-nowrap text-danger">
                    {failedJob.name} failed
                  </span>
                  <Dot />
                </>
              )}
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-fg-muted">
                <TriggerIcon size={12} strokeWidth={1.75} aria-hidden className="text-fg-faint" />
                {/* Icon only on a narrow row, so the branch keeps its room. */}
                <span className="sr-only @[400px]/run:not-sr-only">{trigger.label}</span>
              </span>
              <Dot />
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-fg-muted">
                <GitBranch
                  size={12}
                  strokeWidth={1.75}
                  aria-hidden
                  className="shrink-0 text-fg-faint"
                />
                <Tooltip content={<span className="font-mono text-xs">{run.branch}</span>}>
                  <span className="min-w-0 truncate font-mono text-xs">
                    {shortBranch(run.branch, issueId)}
                  </span>
                </Tooltip>
              </span>
              <Dot />
              <span className="shrink-0 font-mono text-fg-muted text-xs tabular">
                {run.sha.slice(0, 7)}
              </span>
              <Dot />
              <RelativeTime ts={run.started_at} />
            </span>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <PipelineJobs run={run} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** "Passed 3m 34s", "Failed 1m 37s", "Running 2m" (counting from the start), "Queued". */
function RunResult({ run, state }: { run: PipelineRun; state: RunState }) {
  const now = useNow();
  const elapsed =
    run.status === "completed"
      ? run.duration_s
      : run.status === "in_progress"
        ? Math.max(0, (now - parseTs(run.started_at)) / 1000)
        : undefined;
  return (
    <span
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1.5 text-sm",
        state === "failure" ? "text-danger" : "text-fg-muted",
      )}
    >
      <span>{RUN_LABEL[state]}</span>
      {elapsed != null && <span className="text-fg-faint tabular">{formatDuration(elapsed)}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- jobs

/** The job that is running: the first one without a conclusion while the run is in progress. */
function jobState(run: PipelineRun, job: PipelineJob, index: number): RunState {
  if (job.conclusion) return job.conclusion;
  if (run.status === "completed") return "cancelled";
  if (run.status === "in_progress") {
    const first = run.jobs.findIndex((j) => !j.conclusion);
    return index === first ? "in_progress" : "queued";
  }
  return "queued";
}

const JOB_LABEL: Record<RunState, string> = {
  ...RUN_LABEL,
  queued: "Waiting",
  cancelled: "Skipped",
};

function PipelineJobs({ run }: { run: PipelineRun }) {
  if (run.jobs.length === 0) {
    return <p className="pr-3 pb-2.5 pl-[58px] text-fg-faint text-sm">No jobs reported.</p>;
  }
  return (
    <ul
      data-wf="PipelineJobs"
      aria-label={`Jobs of ${run.workflow} ${run.id}`}
      className="flex flex-col pr-3 pb-2 pl-[58px]"
    >
      {run.jobs.map((job, i) => {
        const state = jobState(run, job, i);
        return (
          <li
            key={job.name}
            data-state={state}
            className="flex h-6 min-w-0 items-center gap-2 text-sm"
          >
            <RunStateIcon state={state} size={12} label={JOB_LABEL[state]} />
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-mono text-xs",
                state === "queued" ? "text-fg-faint" : "text-fg-muted",
              )}
            >
              {job.name}
            </span>
            <span
              className={cn(
                "shrink-0 tabular",
                state === "failure" ? "text-danger" : "text-fg-faint",
              )}
            >
              {job.duration_s != null ? formatDuration(job.duration_s) : JOB_LABEL[state]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Dot() {
  return (
    <span aria-hidden className="shrink-0 text-fg-faint">
      ·
    </span>
  );
}
