// TaskPill: the compact, recognisable token for a plan task. Used by PlanLanes,
// TaskDetail, the Now tab (In flight), CoverageStrip and the Kit.
//
// Anatomy: status glyph · "T-3" (mono) · title (truncated) · markers · claimant.
// Markers: ready → accent dot (plus an accent hairline when the Ready highlight
// is on); lease expired → amber dot; stale → amber id. Hover shows the full title,
// lane, status, claimant and lease time.
import type { ComponentProps, Ref } from "react";
import { AuthorChip, StatusIcon, useNow } from "@/components/common";
import { Tooltip } from "@/components/ui";
import type { Task } from "@/gen/types";
import { cn } from "@/lib/cn";
import { parseTs } from "@/lib/format";
import { TASK_STATUS_LABEL } from "@/lib/status";

export interface TaskPillProps extends Omit<ComponentProps<"button">, "children" | "ref"> {
  task: Task;
  size?: "sm" | "md";
  /** Makes the pill a button. Popover triggers (asChild) pass this in too. */
  onClick?: ComponentProps<"button">["onClick"];
  selected?: boolean;
  /** Default true. False shows only the glyph, the id and the markers. */
  showTitle?: boolean;
  /** The plan's "Ready" highlight: ready tasks get an accent hairline. */
  highlightReady?: boolean;
  /** Lets the title run to two lines (the id, glyph and claimant stay on the first). Size md only. */
  wrap?: boolean;
  ref?: Ref<HTMLElement>;
}

export function TaskPill({
  task,
  size = "md",
  onClick,
  selected = false,
  showTitle = true,
  highlightReady = false,
  wrap = false,
  className,
  ref,
  ...rest
}: TaskPillProps) {
  const interactive = onClick != null;
  const md = size === "md";
  const wrapped = wrap && md;
  // Titles may hold `code` spans; a one-line pill shows them as plain text.
  const title = plainTitle(task.title);
  const leaseExpired = task.lease === "expired";
  const finished = task.status === "done" || task.status === "cancelled";

  const classes = cn(
    "inline-flex min-w-0 max-w-full shrink-0 items-center rounded-md border bg-bg text-left align-middle",
    "transition-[border-color,background-color,opacity] duration-150 ease-wf",
    wrapped
      ? "min-h-6 items-start gap-1.5 px-1.5 py-[3px]"
      : md
        ? "h-6 gap-1.5 px-1.5"
        : "h-5 gap-1 px-1",
    selected
      ? "border-accent bg-accent-subtle"
      : highlightReady && task.ready
        ? "border-accent/70"
        : "border-border",
    interactive && !selected && "cursor-pointer hover:border-border-strong hover:bg-subtle",
    interactive && "disabled:pointer-events-none disabled:opacity-50",
    className,
  );

  const content = (
    <>
      {/* The status is spoken once, in the sr-only text below. */}
      {wrapped ? (
        // Every first-line part is one 18 px line box, so a wrapped title never shifts them.
        <span className="flex h-[18px] shrink-0 items-center">
          <StatusIcon status={task.status} size={12} aria-hidden="true" />
        </span>
      ) : (
        <StatusIcon status={task.status} size={md ? 12 : 11} aria-hidden="true" />
      )}
      <span
        className={cn(
          "shrink-0 font-mono text-xs tabular",
          wrapped ? "leading-[18px]" : "leading-none",
          task.stale ? "text-stale" : "text-fg-muted",
        )}
      >
        {task.id}
      </span>
      {showTitle && (
        <span
          className={cn(
            wrapped ? "line-clamp-2 break-words leading-[18px]" : "min-w-0 truncate",
            "min-w-0",
            md ? "text-sm" : "text-xs",
            finished ? "text-fg-muted" : "text-fg",
            task.status === "cancelled" && "line-through",
          )}
        >
          {title}
        </span>
      )}
      <PillMarkers task={task} leaseExpired={leaseExpired} wrapped={wrapped} />
      <span className="sr-only">
        {!showTitle && ` ${title}`}
        {`, ${TASK_STATUS_LABEL[task.status]}`}
        {task.ready && ", ready to claim"}
        {leaseExpired && ", lease expired"}
        {task.stale && ", stale"}
      </span>
    </>
  );

  const pill = interactive ? (
    <button
      type="button"
      data-wf="TaskPill"
      data-size={size}
      className={classes}
      onClick={onClick}
      ref={ref as Ref<HTMLButtonElement>}
      {...rest}
    >
      {content}
    </button>
  ) : (
    <span
      data-wf="TaskPill"
      data-size={size}
      className={classes}
      ref={ref as Ref<HTMLSpanElement>}
      {...(rest as ComponentProps<"span">)}
    >
      {content}
    </span>
  );

  return (
    <Tooltip side="top" content={<TaskPillTooltip task={task} />}>
      {pill}
    </Tooltip>
  );
}

/** A task title without its backticks, for one-line and plain-text uses. */
export function plainTitle(title: string): string {
  return title.replace(/`/g, "");
}

function PillMarkers({
  task,
  leaseExpired,
  wrapped,
}: {
  task: Task;
  leaseExpired: boolean;
  wrapped: boolean;
}) {
  if (!task.ready && !leaseExpired && !task.claimed_by) return null;
  return (
    <span className={cn("ml-auto flex shrink-0 items-center gap-1 pl-0.5", wrapped && "h-[18px]")}>
      {task.ready && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
      {leaseExpired && <span aria-hidden className="size-1.5 rounded-full bg-stale" />}
      {task.claimed_by && (
        // The pill's own tooltip names the claimant; the avatar's hover card would
        // stack a second overlay on top, so the avatar ignores the pointer here.
        <span className="pointer-events-none flex">
          <AuthorChip handle={task.claimed_by} variant="avatar" size="xs" />
        </span>
      )}
    </span>
  );
}

/** Tooltip body. Colors inherit from the tooltip surface so it reads in either style. */
function TaskPillTooltip({ task }: { task: Task }) {
  const leaseExpired = task.lease === "expired";
  return (
    <div data-wf="TaskPillTooltip" className="flex max-w-[280px] flex-col gap-1 py-0.5 text-xs">
      <div className="flex items-center gap-1.5 opacity-75">
        <StatusIcon status={task.status} size={12} />
        <span>{TASK_STATUS_LABEL[task.status]}</span>
        <span aria-hidden>·</span>
        <span className="truncate">Lane {task.lane}</span>
      </div>
      <div className="font-medium text-sm leading-snug">
        <span className="font-mono opacity-75">{task.id}</span> {plainTitle(task.title)}
      </div>
      {task.claimed_by && (
        <div className="opacity-75">
          Claimed by @{task.claimed_by}
          {task.lease === "live" && (
            <>
              {" · "}
              <LeaseText task={task} tone="inherit" />
            </>
          )}
        </div>
      )}
      {task.ready && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
          Ready to claim
        </div>
      )}
      {leaseExpired && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-stale" />
          Lease expired
        </div>
      )}
      {task.stale && (
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-stale" />
          Stale: no change or lease renewal lately
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lease

/** "lease 34m left", "lease 1h 20m left", or "lease expired" (amber). Ticks every 30 s. */
export function LeaseText({
  task,
  tone = "default",
  className,
}: {
  task: Task;
  /** "inherit" keeps the surrounding color (tooltips); "default" uses muted/amber. */
  tone?: "default" | "inherit";
  className?: string;
}) {
  const now = useNow();
  if (task.lease === "none") return null;

  const until = task.lease_until ? parseTs(task.lease_until) : null;
  const expired = task.lease === "expired" || (until != null && until <= now);
  const text = expired
    ? "lease expired"
    : until != null
      ? `lease ${formatMinutes((until - now) / 60_000)} left`
      : "lease active";
  return (
    <span
      data-wf="LeaseText"
      className={cn(
        "tabular",
        tone === "default" && (expired ? "text-stale" : "text-fg-muted"),
        className,
      )}
    >
      {text}
    </span>
  );
}

function formatMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
