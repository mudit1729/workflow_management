// Small pieces the Git and CI tabs share: the run status glyph, durations, short branch names,
// the counts the tab strip shows, and the empty-state hint that teaches how a commit finds its issue.
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/common";
import type { Delivery, PipelineRun } from "@/lib/api";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------- run state

/** What a CI run (or one of its jobs) is doing, from `status` and `conclusion`. */
export type RunState = "success" | "failure" | "cancelled" | "in_progress" | "queued";

/** The state of a run: its conclusion once it is completed, else its status. */
export function runState(run: Pick<PipelineRun, "status" | "conclusion">): RunState {
  if (run.status !== "completed") return run.status;
  return run.conclusion ?? "success";
}

export const RUN_LABEL: Record<RunState, string> = {
  success: "Passed",
  failure: "Failed",
  cancelled: "Cancelled",
  in_progress: "Running",
  queued: "Queued",
};

const RUN_COLOR: Record<RunState, string> = {
  success: "var(--wf-status-done)",
  failure: "var(--wf-signal-danger)",
  cancelled: "var(--wf-status-cancelled)",
  in_progress: "var(--wf-status-in_progress)",
  queued: "var(--wf-status-backlog)",
};

/** CSS color of a run state: green passed, red failed, blue running, gray for the rest. */
export function runColor(state: RunState): string {
  return RUN_COLOR[state];
}

const R = 5.75;
const DASH = 1.6;
const GAP = (2 * Math.PI * R) / 10 - DASH;

/**
 * The run status glyph, 14 px on the same grid as `StatusIcon`: a filled disc with a check
 * (passed) or a cross (failed), a ring with a slash (cancelled), a dashed ring (queued) and a
 * ring with a turning arc (running). The turn is slow and stops under reduced motion.
 */
export function RunStateIcon({
  state,
  size = 14,
  label = RUN_LABEL[state],
  className,
}: {
  state: RunState;
  size?: number;
  label?: string;
  className?: string;
}) {
  const ring = <circle cx="7" cy="7" r={R} fill="none" stroke="currentColor" strokeWidth="1.5" />;
  let glyph: React.ReactNode;
  switch (state) {
    case "success":
      glyph = (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path
            d="M4.4 7.2 6.2 9 9.6 5.3"
            fill="none"
            className="stroke-bg"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
      break;
    case "failure":
      glyph = (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path
            d="M5 5 9 9M9 5 5 9"
            fill="none"
            className="stroke-bg"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      );
      break;
    case "cancelled":
      glyph = (
        <>
          {ring}
          <path d="M4.6 9.4 9.4 4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      );
      break;
    case "queued":
      glyph = (
        <circle
          cx="7"
          cy="7"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={`${DASH} ${GAP.toFixed(3)}`}
          transform="rotate(-90 7 7)"
        />
      );
      break;
    case "in_progress":
      glyph = (
        <>
          <circle
            cx="7"
            cy="7"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.25"
          />
          <path
            d="M7 1.25 A5.75 5.75 0 0 1 12.75 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      );
      break;
  }
  return (
    <svg
      data-wf="RunStateIcon"
      role="img"
      aria-label={label}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={cn(
        "shrink-0 motion-reduce:animate-none",
        state === "in_progress" && "animate-spin [animation-duration:1.6s]",
        className,
      )}
      style={{ color: RUN_COLOR[state] }}
    >
      {glyph}
    </svg>
  );
}

// ---------------------------------------------------------------- formatting

/** "47s", "3m 34s", "2m", "1h 5m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** A branch without the issue-id prefix every branch of the issue shares: `wf-3k9x2/x` → `x`. */
export function shortBranch(branch: string, issueId: string): string {
  const prefix = `${issueId}/`;
  return branch.startsWith(prefix) && branch.length > prefix.length
    ? branch.slice(prefix.length)
    : branch;
}

// ---------------------------------------------------------------- counts for the tab strip

export interface DeliveryCounts {
  commits: number;
  prs: number;
  /** The newest run's state, if the issue has any run. */
  latest?: RunState;
}

export function deliveryCounts(d: Pick<Delivery, "commits" | "prs" | "pipelines">): DeliveryCounts {
  const newest = d.pipelines[0];
  return {
    commits: d.commits.length,
    prs: d.prs.length,
    latest: newest ? runState(newest) : undefined,
  };
}

/** Title (tooltip) of the Git tab: "4 commits · 2 pull requests". */
export function gitTitle(c: DeliveryCounts): string | undefined {
  if (c.commits === 0 && c.prs === 0) return undefined;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    plural(c.commits, "commit", "commits"),
    plural(c.prs, "pull request", "pull requests"),
  ].join(" · ");
}

/** Title (tooltip) of the CI tab: what the newest run did. */
export function ciTitle(latest: RunState | undefined): string | undefined {
  if (!latest) return undefined;
  const text: Record<RunState, string> = {
    success: "Latest run passed",
    failure: "Latest run failed",
    cancelled: "Latest run was cancelled",
    in_progress: "A run is in progress",
    queued: "A run is queued",
  };
  return text[latest];
}

/** The dot on the CI tab: the newest run's state, color for status only. */
export function CiDot({ state }: { state: RunState }) {
  return (
    <span data-wf="CiDot" className="inline-flex items-center">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          state === "in_progress" && "animate-pulse motion-reduce:animate-none",
        )}
        style={{ background: RUN_COLOR[state] }}
      />
      <span className="sr-only">{ciTitle(state)}</span>
    </span>
  );
}

// ---------------------------------------------------------------- live

/**
 * Keys that arrived after the list was first shown, for 1.5 s: a Codex run that adds a commit or a
 * CI run, or moves a run on, flashes that row once. Pass `id` for new rows, or `id:state` to flash
 * a change. `ready` is false while the first read is under way, so the first list never flashes.
 */
export function useFreshKeys(keys: string[], ready: boolean): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const joined = keys.join("|");

  useEffect(() => {
    if (!ready) return;
    const all = joined ? joined.split("|") : [];
    if (seen.current === null) {
      seen.current = new Set(all);
      return;
    }
    const known = seen.current;
    const added = all.filter((k) => !known.has(k));
    if (added.length === 0) return;
    for (const k of added) known.add(k);
    setFresh(new Set(added));
    const t = window.setTimeout(() => setFresh(new Set()), 1500);
    return () => window.clearTimeout(t);
  }, [joined, ready]);

  return fresh;
}

// ---------------------------------------------------------------- the commit trailer

/** `Issue: wf-3k9x2` in a mono box with a copy button: what to add to a commit message. */
export function TrailerCopy({ trailer }: { trailer: string }) {
  return (
    <div
      data-wf="TrailerCopy"
      className="inline-flex h-7 max-w-full items-center gap-2 rounded-md border border-border bg-subtle pr-0.5 pl-2.5"
    >
      <code className="min-w-0 truncate font-mono text-fg text-sm">{trailer}</code>
      <CopyButton text={trailer} label="Copy trailer" />
    </div>
  );
}
