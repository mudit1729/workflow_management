// The issue's recent runs, newest first. Every row starts with how the run went, then the task,
// then when; a finished run links to the commit and the CI run it added. A run on a real bridge
// shows the last line the agent printed in place of a task.
import { Check, CircleX, History, Minus } from "lucide-react";
import { AuthorChip, RelativeTime } from "@/components/common";
import { Button, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui";
import { type CodexRun, useAgent, usePreferredAgent } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { IssueTab } from "@/lib/nav";
import { isBridgeRun, runLine, runsLabel } from "./run-copy";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** Runs shown; the data layer keeps 30 and the rest are noise in a popover. */
const SHOWN = 8;

/** How a run went, as a glyph: the agent's tile while it works, a check, a cross or a dash. */
export function RunGlyph({ run }: { run: CodexRun }) {
  switch (run.status) {
    case "running":
      return <AuthorChip handle={run.by} variant="avatar" size="xs" />;
    case "done":
      return <Check {...ICON} className="text-status-done" />;
    case "failed":
      return <CircleX {...ICON} className="text-danger" />;
    default:
      return <Minus {...ICON} className="text-fg-faint" />;
  }
}

/** The second line: the task for a run that had one, the reason for one that did not. */
export function runDetail(run: CodexRun): string | undefined {
  if (run.status === "failed" || run.status === "nothing_ready") return run.reason;
  if (run.status === "running" && isBridgeRun(run)) return run.lastLine;
  return run.task_title;
}

export interface RunsListProps {
  runs: readonly CodexRun[];
  /** The computer a bridge run works on: "Running on laptop". */
  host?: string;
  /** Open the Git or CI tab from a result chip. */
  onOpenTab?: (tab: IssueTab) => void;
  className?: string;
}

export function RunsList({ runs, host, onOpenTab, className }: RunsListProps) {
  const shown = runs.slice(0, SHOWN);
  const label = runsLabel(runs, usePreferredAgent());
  return (
    <div data-wf="CodexRunsList" className={cn("flex flex-col gap-1", className)}>
      <h3 className="flex items-baseline gap-2 font-semibold text-base text-fg">
        {label}
        <span className="font-normal text-fg-faint text-sm tabular">{runs.length}</span>
      </h3>
      {shown.length === 0 ? (
        <p className="py-2 text-fg-faint text-sm">No runs yet. Do next step starts the first.</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {shown.map((run) => (
            <li key={run.id} className="flex items-start gap-2 rounded-sm px-1 py-1.5">
              <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                <RunGlyph run={run} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 truncate font-medium text-base text-fg">
                    {runLine(run, host)}
                  </span>
                  <RelativeTime
                    ts={run.finished_at ?? run.started_at}
                    className="ml-auto shrink-0 text-fg-faint text-xs"
                  />
                </div>
                {runDetail(run) && (
                  <span className="line-clamp-2 text-fg-muted text-sm leading-snug">
                    {runDetail(run)}
                  </span>
                )}
                {(run.commit || run.pipeline) && (
                  <span className="flex items-center gap-2 font-mono text-fg-faint text-xs">
                    {run.commit && (
                      <ResultLink
                        label={run.commit}
                        tip="Open Git"
                        onClick={() => onOpenTab?.("git")}
                      />
                    )}
                    {run.pipeline && (
                      <ResultLink
                        label={run.pipeline}
                        tip="Open CI"
                        onClick={() => onOpenTab?.("ci")}
                      />
                    )}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultLink({ label, tip, onClick }: { label: string; tip: string; onClick: () => void }) {
  return (
    <Tooltip content={tip}>
      <button type="button" onClick={onClick} className="rounded-sm hover:text-fg hover:underline">
        {label}
      </button>
    </Tooltip>
  );
}

export interface RunsPopoverProps {
  runs: readonly CodexRun[];
  onOpenTab?: (tab: IssueTab) => void;
  /** Give the room to a run's strip in a narrow container (a phone). */
  yield?: boolean;
}

/** A history button beside the Codex buttons. Absent until the issue has had a run. */
export function RunsPopover({ runs, onOpenTab, yield: yields }: RunsPopoverProps) {
  const { host } = useAgent();
  const label = runsLabel(runs, usePreferredAgent());
  const recent = `Recent ${label.replace(/^Agent /, "agent ")}`;
  if (runs.length === 0) return null;
  return (
    <Popover>
      <Tooltip content={recent}>
        <PopoverTrigger asChild>
          <Button
            data-wf="CodexRunsButton"
            variant="ghost"
            size="icon"
            aria-label={`${recent}, ${runs.length}`}
            className={cn("shrink-0", yields && "@max-[440px]:hidden")}
          >
            <History {...ICON} />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        data-wf="CodexRunsPopover"
        align="start"
        aria-label={label}
        className="w-[min(340px,calc(100vw-24px))]"
      >
        <RunsList runs={runs} host={host} onOpenTab={onOpenTab} />
      </PopoverContent>
    </Popover>
  );
}
