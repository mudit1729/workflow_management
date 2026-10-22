// A status column: header (glyph, label, count, fold) and a body that scrolls on
// its own. Bodies above 40 cards are virtualized. The whole column is one drop
// target; a hovering card shows where it will land with an accent line.
import { useVirtualizer } from "@tanstack/react-virtual";
import { FoldHorizontal } from "lucide-react";
import { type RefObject, useContext, useEffect, useRef } from "react";
import { StatusIcon } from "@/components/common";
import { IconButton, Tooltip } from "@/components/ui";
import type { IssueStatus, IssueSummary } from "@/gen/types";
import { cn } from "@/lib/cn";
import { STATUS_LABEL } from "@/lib/status";
import { useCardAutoScroll, useCellDropTarget } from "./dnd";
import { ALL_LANE, landingIndex } from "./filter";
import { IssueCard } from "./IssueCard";
import { BoardCardContext } from "./useBoardKeys";

/** Columns longer than this render only the cards in view. */
export const VIRTUALIZE_ABOVE = 40;

export interface KanbanColumnProps {
  status: IssueStatus;
  issues: IssueSummary[];
  lane?: string;
  /** Shows the fold button (Backlog and Done). */
  onFold?: () => void;
  dragDisabled?: boolean;
  /** Full width instead of `--wf-col-w` (mobile). */
  fill?: boolean;
  /** Hide the header (mobile shows a status switcher instead). */
  hideHeader?: boolean;
}

export function KanbanColumn({
  status,
  issues,
  lane = ALL_LANE,
  onFold,
  dragDisabled,
  fill,
  hideHeader,
}: KanbanColumnProps) {
  const ref = useRef<HTMLElement>(null);
  const over = useCellDropTarget(ref, status, lane);
  const scrollRef = useRef<HTMLDivElement>(null);
  useCardAutoScroll(scrollRef, !dragDisabled);
  const landing = over ? landingIndex(issues, over.priority) : -1;

  return (
    <section
      ref={ref}
      data-wf="KanbanColumn"
      data-status={status}
      aria-label={`${STATUS_LABEL[status]}, ${issues.length} issue${issues.length === 1 ? "" : "s"}`}
      className={cn(
        "group/col flex h-full min-h-0 shrink-0 flex-col rounded-lg transition-colors duration-150 ease-wf",
        fill ? "w-full" : "w-[var(--wf-col-w)]",
        over && "bg-accent-subtle",
      )}
    >
      {!hideHeader && <ColumnHeader status={status} count={issues.length} onFold={onFold} />}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pt-1 pb-3"
      >
        {issues.length === 0 ? (
          <EmptyDropArea status={status} active={over != null} />
        ) : issues.length > VIRTUALIZE_ABOVE ? (
          <VirtualCards
            issues={issues}
            lane={lane}
            landing={landing}
            dragDisabled={dragDisabled}
            scrollRef={scrollRef}
          />
        ) : (
          <CardStack issues={issues} lane={lane} landing={landing} dragDisabled={dragDisabled} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- header

export function ColumnHeader({
  status,
  count,
  onFold,
  className,
}: {
  status: IssueStatus;
  count: number;
  onFold?: () => void;
  className?: string;
}) {
  const label = STATUS_LABEL[status];
  return (
    <header
      data-wf="ColumnHeader"
      className={cn("group/head flex h-9 shrink-0 items-center gap-2 px-2", className)}
    >
      <StatusIcon status={status} size={14} />
      <h2 className="min-w-0 truncate font-medium text-base text-fg">{label}</h2>
      <span className="text-fg-faint text-sm tabular">{count}</span>
      {onFold && (
        <IconButton
          label={`Fold ${label}`}
          icon={<FoldHorizontal size={14} strokeWidth={1.75} />}
          size="sm"
          onClick={onFold}
          className={cn(
            "ml-auto opacity-0 transition-opacity duration-150 ease-wf focus-visible:opacity-100",
            "group-hover/col:opacity-100 group-hover/head:opacity-100",
          )}
        />
      )}
    </header>
  );
}

// ---------------------------------------------------------------- folded rail

/** A folded column: a 36 px rail with the glyph, count and vertical label. Click unfolds; drops still move. */
export function FoldedColumn({
  status,
  count,
  onUnfold,
}: {
  status: IssueStatus;
  count: number;
  onUnfold: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const over = useCellDropTarget(ref, status, ALL_LANE);
  const label = STATUS_LABEL[status];
  return (
    <Tooltip content={`Unfold ${label}`} side="right">
      <button
        ref={ref}
        type="button"
        data-wf="FoldedColumn"
        data-status={status}
        onClick={onUnfold}
        aria-label={`${label}, ${count} issue${count === 1 ? "" : "s"}. Unfold column`}
        className={cn(
          "relative flex h-full w-[var(--wf-col-w-folded)] shrink-0 flex-col items-center gap-2 rounded-lg py-2.5",
          "transition-colors duration-150 ease-wf",
          over ? "bg-accent-subtle" : "hover:bg-muted",
        )}
      >
        {over && <span className="absolute inset-x-1.5 top-1 h-[2px] rounded-full bg-accent" />}
        <StatusIcon status={status} size={14} />
        <span className="text-fg-muted text-sm tabular">{count}</span>
        <span className="text-fg-muted text-sm [writing-mode:vertical-rl]">{label}</span>
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- cards

/** The 2 px accent line where a dropped card will land; sits in the gap above its slot. */
export function DropLine() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-[calc(var(--wf-card-gap)*-0.5_-_1px)] z-10 h-[2px] rounded-full bg-accent"
    />
  );
}

export function CardStack({
  issues,
  lane,
  landing,
  dragDisabled,
}: {
  issues: IssueSummary[];
  lane: string;
  landing: number;
  dragDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[var(--wf-card-gap)]">
      {issues.map((issue, i) => (
        <div key={issue.id} className="relative">
          {landing === i && <DropLine />}
          <IssueCard issue={issue} lane={lane} dragDisabled={dragDisabled} />
        </div>
      ))}
      {landing === issues.length && (
        <div className="relative h-0">
          <DropLine />
        </div>
      )}
    </div>
  );
}

function VirtualCards({
  issues,
  lane,
  landing,
  dragDisabled,
  scrollRef,
}: {
  issues: IssueSummary[];
  lane: string;
  landing: number;
  dragDisabled?: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const board = useContext(BoardCardContext);
  const virtualizer = useVirtualizer({
    count: issues.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 8,
    getItemKey: (i) => issues[i].id,
  });

  // Keyboard focus can move to a card outside the rendered window; bring it in.
  const tabStop = board?.tabStopId;
  const focusIndex = tabStop ? issues.findIndex((i) => i.id === tabStop) : -1;
  useEffect(() => {
    if (focusIndex >= 0) virtualizer.scrollToIndex(focusIndex, { align: "auto" });
  }, [focusIndex, virtualizer]);

  const total = virtualizer.getTotalSize();
  return (
    <div className="relative w-full" style={{ height: total }}>
      {virtualizer.getVirtualItems().map((v) => {
        const issue = issues[v.index];
        return (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            className="absolute inset-x-0 top-0 pb-[var(--wf-card-gap)]"
            style={{ transform: `translateY(${v.start}px)` }}
          >
            {landing === v.index && <DropLine />}
            <IssueCard issue={issue} lane={lane} dragDisabled={dragDisabled} />
          </div>
        );
      })}
      {landing === issues.length && (
        <div className="absolute inset-x-0" style={{ top: total }}>
          <DropLine />
        </div>
      )}
    </div>
  );
}

/** The body of an empty column: a quiet dashed area that doubles as the drop zone. */
export function EmptyDropArea({
  status,
  active,
  className,
}: {
  status: IssueStatus;
  active: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-16 items-center justify-center rounded-md border border-dashed text-sm",
        "transition-colors duration-150 ease-wf",
        active ? "border-accent text-accent" : "border-border-strong text-fg-faint",
        className,
      )}
    >
      {active ? `Move to ${STATUS_LABEL[status]}` : "No issues"}
    </div>
  );
}
