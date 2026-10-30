// One swimlane band: a sticky-left header (chevron, group dot, title, roll-up,
// mini status bar) and a row of (status, lane) cells aligned with the columns.
// Cards may move between columns inside a band, never across bands.
import { ChevronRight, Focus } from "lucide-react";
import { useRef } from "react";
import { StatusIcon } from "@/components/common";
import { IconButton, Tooltip } from "@/components/ui";
import type { IssueStatus, IssueSummary } from "@/gen/types";
import { cn } from "@/lib/cn";
import { useBoardSearch } from "@/lib/nav";
import { STATUS_LABEL, statusColor } from "@/lib/status";
import { type CardDragData, useCellDropTarget } from "./dnd";
import { type BoardLane, DIRECT_LANE, landingIndex, laneSummary, type NeedsYou } from "./filter";
import { CardStack, EmptyDropArea } from "./KanbanColumn";

export interface SwimlaneProps {
  lane: BoardLane;
  columns: IssueStatus[];
  isFolded: (status: IssueStatus) => boolean;
  onUnfold: (status: IssueStatus) => void;
  collapsed: boolean;
  onToggle: () => void;
  /** The card being dragged anywhere on the board. */
  active: CardDragData | null;
  /** The acting person's open requests (the lane's "need you" count). */
  mine?: NeedsYou;
}

export function Swimlane({
  lane,
  columns,
  isFolded,
  onUnfold,
  collapsed,
  onToggle,
  active,
  mine,
}: SwimlaneProps) {
  const [, setSearch] = useBoardSearch();
  const count = lane.issues.length;
  const dimmed = active != null && active.lane !== lane.id;
  const draggingHere = active != null && active.lane === lane.id;
  const group = lane.group;

  return (
    <section
      data-wf="Swimlane"
      data-lane={lane.id}
      aria-label={`${lane.title}, ${count} issue${count === 1 ? "" : "s"}`}
      className={cn(
        "group/band border-border border-t first-of-type:border-t-0",
        "transition-opacity duration-150 ease-wf",
        dimmed && "opacity-50",
      )}
    >
      <div className="sticky left-0 flex h-10 w-max max-w-full items-center gap-2 px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            "-ml-1 flex h-7 min-w-0 items-center gap-2 rounded-md pr-2 pl-1 text-base",
            "transition-colors duration-100 ease-wf hover:bg-muted",
          )}
        >
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            className={cn(
              "shrink-0 text-fg-faint transition-transform duration-150 ease-wf",
              !collapsed && "rotate-90",
            )}
          />
          <LaneDot lane={lane} />
          <span
            className={cn("truncate font-medium text-fg", group?.implicit && "italic")}
            title={group?.goal}
          >
            {lane.title}
          </span>
          <span className="text-fg-faint text-sm tabular">{count}</span>
        </button>
        <MiniStatusBar issues={lane.issues} />
        {collapsed && (
          <span className="truncate text-fg-faint text-sm">{laneSummary(lane.issues, mine)}</span>
        )}
        {group && (
          <IconButton
            label={`Show only ${group.title}`}
            icon={<Focus size={14} strokeWidth={1.75} />}
            size="sm"
            onClick={() => setSearch({ group: group.id })}
            className="opacity-0 transition-opacity duration-150 ease-wf focus-visible:opacity-100 group-hover/band:opacity-100"
          />
        )}
      </div>

      {!collapsed &&
        (count === 0 ? (
          <p className="sticky left-0 w-max px-4 pb-3 text-fg-faint text-sm">
            No issues in {lane.title} yet.
          </p>
        ) : (
          <div className="flex gap-2 px-3 pb-3">
            {columns.map((s) =>
              isFolded(s) ? (
                <FoldedCell
                  key={s}
                  status={s}
                  laneId={lane.id}
                  count={lane.byStatus[s].length}
                  onUnfold={() => onUnfold(s)}
                />
              ) : (
                <SwimlaneCell
                  key={s}
                  status={s}
                  laneId={lane.id}
                  issues={lane.byStatus[s]}
                  draggingHere={draggingHere}
                />
              ),
            )}
          </div>
        ))}
    </section>
  );
}

// ---------------------------------------------------------------- cells

function SwimlaneCell({
  status,
  laneId,
  issues,
  draggingHere,
}: {
  status: IssueStatus;
  laneId: string;
  issues: IssueSummary[];
  draggingHere: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const over = useCellDropTarget(ref, status, laneId);
  const landing = over ? landingIndex(issues, over.priority) : -1;

  return (
    <div
      ref={ref}
      data-wf="SwimlaneCell"
      data-status={status}
      className={cn(
        "min-h-12 w-[var(--wf-col-w)] shrink-0 rounded-lg p-1 transition-colors duration-150 ease-wf",
        over && "bg-accent-subtle",
      )}
    >
      {issues.length > 0 ? (
        <CardStack issues={issues} lane={laneId} landing={landing} />
      ) : draggingHere ? (
        <EmptyDropArea status={status} active={over != null} className="h-12" />
      ) : null}
    </div>
  );
}

function FoldedCell({
  status,
  laneId,
  count,
  onUnfold,
}: {
  status: IssueStatus;
  laneId: string;
  count: number;
  onUnfold: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const over = useCellDropTarget(ref, status, laneId);
  const label = STATUS_LABEL[status];
  return (
    <button
      ref={ref}
      type="button"
      data-wf="FoldedCell"
      data-status={status}
      onClick={onUnfold}
      aria-label={`${label}, ${count} issue${count === 1 ? "" : "s"} in this lane. Unfold column`}
      className={cn(
        "relative flex min-h-12 w-[var(--wf-col-w-folded)] shrink-0 flex-col items-center gap-2 rounded-lg py-2",
        "transition-colors duration-150 ease-wf",
        over ? "bg-accent-subtle" : "hover:bg-muted",
      )}
    >
      {over && <span className="absolute inset-x-1.5 top-1 h-[2px] rounded-full bg-accent" />}
      <span className={cn("text-sm tabular", count ? "text-fg-muted" : "text-fg-faint")}>
        {count}
      </span>
      <span className="text-fg-faint text-xs [writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

/** Header cell of a folded column in the sticky swimlane header row. */
export function FoldedHeader({
  status,
  count,
  onUnfold,
}: {
  status: IssueStatus;
  count: number;
  onUnfold: () => void;
}) {
  const label = STATUS_LABEL[status];
  return (
    <Tooltip content={`Unfold ${label} · ${count}`} side="bottom">
      <button
        type="button"
        data-wf="FoldedHeader"
        data-status={status}
        onClick={onUnfold}
        aria-label={`${label}, ${count} issue${count === 1 ? "" : "s"}. Unfold column`}
        className={cn(
          "grid h-9 w-[var(--wf-col-w-folded)] shrink-0 place-items-center rounded-md",
          "transition-colors duration-100 ease-wf hover:bg-muted",
        )}
      >
        <StatusIcon status={status} size={14} />
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- bits

function LaneDot({ lane }: { lane: BoardLane }) {
  if (lane.id === DIRECT_LANE || !lane.group) {
    return (
      <span
        data-wf="LaneDot"
        aria-hidden
        className="size-2 shrink-0 rounded-full border border-fg-faint border-dashed"
      />
    );
  }
  return (
    <span
      data-wf="LaneDot"
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ background: `var(--wf-hue-${lane.group.color})` }}
    />
  );
}

const BAR_ORDER: IssueStatus[] = ["done", "review", "in_progress", "blocked", "planned", "backlog"];

/** 32 px bar of status-colored segments, done first. Cancelled issues are left out. */
export function MiniStatusBar({ issues }: { issues: IssueSummary[] }) {
  const live = issues.filter((i) => i.status !== "cancelled");
  const parts = BAR_ORDER.map(
    (s) => [s, live.filter((i) => i.status === s).length] as const,
  ).filter(([, n]) => n > 0);
  const label = parts.length
    ? parts.map(([s, n]) => `${n} ${STATUS_LABEL[s].toLowerCase()}`).join(" · ")
    : "No open issues";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-wf="MiniStatusBar"
      className="flex h-1 w-8 shrink-0 gap-px overflow-hidden rounded-full bg-muted"
    >
      {parts.map(([s, n]) => (
        <span
          key={s}
          className="h-full"
          style={{ width: `${(n / live.length) * 100}%`, background: statusColor(s) }}
        />
      ))}
    </span>
  );
}
