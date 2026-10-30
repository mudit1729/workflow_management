// What a run is doing, in the slot where "Do next step" sits. While it runs the strip shows the
// phase, a four-step progress bar and Cancel; when it ends it says how, for a few seconds. A run on
// a real bridge has no phases: the strip says where it runs and shows the last line the agent
// printed. A reason the person has to read (nothing ready, failed) is `RunNotice`, on a line of
// its own.
import { ArrowUpRight, Check, CircleX, Info, Minus, X } from "lucide-react";
import { AuthorChip } from "@/components/common";
import { Button, IconButton } from "@/components/ui";
import type { CodexRun } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { IssueTab } from "@/lib/nav";
import { isBridgeRun, reasonAction, runLine, runProgress } from "./run-copy";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

// ---------------------------------------------------------------- progress

/**
 * One segment per phase: filled when done, pulsing while it runs, empty when it waits. Quiet
 * on purpose: it is a pulse, not a bar that fills smoothly, because a phase has no percent.
 */
export function RunProgress({ run, className }: { run: CodexRun; className?: string }) {
  const { done, total } = runProgress(run);
  if (total === 0) return null;
  return (
    <span
      data-wf="CodexRunProgress"
      role="progressbar"
      aria-label="Run progress"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} of ${total} steps done`}
      className={cn("flex shrink-0 items-center gap-[3px]", className)}
    >
      {run.phases.map((p) => (
        <span
          key={p.id}
          aria-hidden
          title={p.label}
          className={cn(
            "h-1 w-3 rounded-full transition-colors duration-200 ease-wf",
            p.state === "done" && "bg-accent",
            p.state === "running" && "animate-pulse bg-accent/45",
            p.state === "pending" && "bg-border",
          )}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- strip

export interface RunStatusProps {
  run: CodexRun;
  /** The computer a bridge run works on: "Running on laptop". */
  host?: string;
  /** Cancel a run that is going. */
  onCancel?: () => void;
  /** Open the Log tab, where the run's change entry is. Offered once the run is done. */
  onOpenLog?: () => void;
  className?: string;
}

/** The leading mark: the agent's tile while it works, a status glyph once it stopped. */
function Lead({ run }: { run: CodexRun }) {
  if (run.status === "running" && isBridgeRun(run))
    // No phases to pulse: the tile itself does.
    return (
      <span className="relative flex shrink-0">
        <AuthorChip handle={run.by} variant="avatar" size="xs" />
        <span
          aria-hidden
          className="absolute -inset-px animate-pulse rounded-[4px] ring-1 ring-accent/50"
        />
      </span>
    );
  if (run.status === "running") return <AuthorChip handle={run.by} variant="avatar" size="xs" />;
  if (run.status === "done") return <Check {...ICON} className="shrink-0 text-status-done" />;
  return <Minus {...ICON} className="shrink-0 text-fg-faint" />;
}

export function RunStatus({ run, host, onCancel, onOpenLog, className }: RunStatusProps) {
  const running = run.status === "running";
  const line = runLine(run, host);
  return (
    <div
      data-wf="CodexRunStatus"
      data-status={run.status}
      role="status"
      // Not a tab stop: CodexActions puts focus here after a key press started the run, so Tab
      // goes on to Cancel and focus does not fall to the top of the page.
      tabIndex={-1}
      data-run-focus=""
      className={cn(
        "flex h-7 min-w-0 items-center gap-2 rounded-md border border-border bg-subtle pl-2 text-base",
        running || (run.status === "done" && onOpenLog) ? "pr-0.5" : "pr-2.5",
        className,
      )}
    >
      <Lead run={run} />
      <span title={line} className="min-w-0 truncate text-fg">
        {line}
      </span>
      {running && isBridgeRun(run) && run.lastLine && (
        <span
          title={run.lastLine}
          className="min-w-0 flex-1 truncate text-fg-faint @max-[520px]:hidden"
        >
          {run.lastLine}
        </span>
      )}
      {running && <RunProgress run={run} />}
      {running && onCancel && (
        <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 text-fg-muted">
          Cancel
        </Button>
      )}
      {run.status === "done" && onOpenLog && (
        <Button variant="ghost" size="sm" onClick={onOpenLog} className="shrink-0 text-fg-muted">
          Open log
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- notice

export interface RunNoticeProps {
  run: CodexRun;
  /**
   * Go to the tab that answers the reason (the Now tab for a request, the goal for an issue
   * without criteria, the plan otherwise); a reason with nowhere to go gets no button.
   */
  onOpen?: (tab: IssueTab) => void;
  /** Always open the Plan tab. Kept for callers that predate `onOpen`; `onOpen` wins. */
  onOpenPlan?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * A run that did no work and says why: nothing was ready, or the task changed under it. A line of
 * its own under the buttons, because the reason is a sentence and wraps on a phone.
 */
export function RunNotice({ run, onOpen, onOpenPlan, onDismiss, className }: RunNoticeProps) {
  const failed = run.status === "failed";
  const text = run.reason ?? (failed ? "The run stopped." : "No ready task.");
  // A failed run points at the plan (the task it held); a run that did no work, at its answer.
  const where = onOpen
    ? failed
      ? { label: "Open plan", tab: "plan" as const }
      : reasonAction(run)
    : onOpenPlan
      ? { label: "Open plan", tab: "plan" as const }
      : undefined;
  return (
    <div
      data-wf="CodexRunNotice"
      data-status={run.status}
      role="status"
      className={cn(
        "flex min-h-7 items-start gap-2 rounded-md py-1 pr-1 pl-2.5 text-sm",
        failed ? "bg-danger/8" : "bg-muted",
        className,
      )}
    >
      {failed ? (
        <CircleX {...ICON} aria-label="Failed" className="mt-px shrink-0 text-danger" />
      ) : (
        <Info {...ICON} aria-hidden className="mt-px shrink-0 text-fg-faint" />
      )}
      <span className="min-w-0 flex-1 py-px text-fg leading-snug">
        {failed ? `Failed: ${text}` : text}
      </span>
      {where && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (onOpen ? onOpen(where.tab) : onOpenPlan?.())}
          className="-my-0.5 shrink-0"
        >
          {where.label}
          <ArrowUpRight {...ICON} className="text-fg-faint" />
        </Button>
      )}
      {onDismiss && (
        <IconButton
          size="sm"
          label="Dismiss"
          icon={<X {...ICON} />}
          onClick={onDismiss}
          className="-my-0.5 shrink-0"
        />
      )}
    </div>
  );
}
