// The board region. Two layouts over one model:
// - columns: horizontal scroller of status columns, each body scrolls on its own
// - mobile (<768 px): one column at a time with a status switcher
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusIcon } from "@/components/common";
import { Segmented, Skeleton } from "@/components/ui";
import type { IssueStatus, IssueSummary } from "@/gen/types";
import { useMoveIssue } from "@/lib/api";
import { useLayoutMode } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { FOLDABLE_COLUMNS, STATUS_LABEL } from "@/lib/status";
import { useBoardDnd, useCardAutoScroll } from "./dnd";
import { bucketByStatus } from "./filter";
import { FoldedColumn, KanbanColumn } from "./KanbanColumn";
import {
  type BoardCardApi,
  BoardCardContext,
  type BoardInput,
  type NavColumn,
  useBoardKeys,
} from "./useBoardKeys";

export interface KanbanBoardProps {
  columns: IssueStatus[];
  /** The issues in view; the board sorts them into the columns. */
  issues: IssueSummary[];
  /** Titles of the selected group below the root, for relative card paths. */
  basePath: string[];
}

export function KanbanBoard({ columns, issues, basePath }: KanbanBoardProps) {
  const mobile = useLayoutMode() === "mobile";
  const foldedColumns = usePrefs((s) => s.foldedColumns);
  const toggleColumnFold = usePrefs((s) => s.toggleColumnFold);
  const { move } = useMoveIssue();

  const isFolded = useCallback(
    (s: IssueStatus) => FOLDABLE_COLUMNS.includes(s) && foldedColumns.includes(s),
    [foldedColumns],
  );

  const buckets = useMemo(() => bucketByStatus(issues), [issues]);

  const navColumns = useMemo<NavColumn[]>(
    () =>
      columns
        .filter((s) => !isFolded(s))
        .map((s) => ({ status: s, ids: buckets[s].map((i) => i.id) })),
    [columns, buckets, isFolded],
  );

  const keys = useBoardKeys(navColumns, !mobile);

  useBoardDnd((id, to) => {
    const issue = issues.find((i) => i.id === id);
    if (!issue) return;
    move(issue, to);
    // A card dropped on a folded rail vanishes: let the rail answer (focus, one pulse).
    if (isFolded(to)) keys.focusCard(id, to);
    else keys.setFocusedId(id);
  });

  const api = useMemo<BoardCardApi>(
    () => ({
      tabStopId: keys.tabStopId,
      selectedId: keys.selectedId,
      basePath,
      menuRequest: keys.menuRequest,
      clearMenuRequest: keys.clearMenuRequest,
      setFocusedId: keys.setFocusedId,
      focusCard: keys.focusCard,
    }),
    [
      keys.tabStopId,
      keys.selectedId,
      basePath,
      keys.menuRequest,
      keys.clearMenuRequest,
      keys.setFocusedId,
      keys.focusCard,
    ],
  );

  return (
    <BoardCardContext value={api}>
      {mobile ? (
        <MobileBoard columns={columns} buckets={buckets} />
      ) : (
        <ColumnsBoard
          columns={columns}
          buckets={buckets}
          isFolded={isFolded}
          onToggleFold={toggleColumnFold}
          input={keys.input}
        />
      )}
    </BoardCardContext>
  );
}

// ---------------------------------------------------------------- columns

/**
 * "Cancelled" adds a column past the right edge. When it appears, scroll it into view (and on
 * a link that opens with it), so the toggle visibly does something.
 */
function useRevealCancelled(scrollRef: RefObject<HTMLDivElement | null>, shown: boolean) {
  const before = useRef<boolean | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = shown;
    if (!shown || was === true) return;
    // A link that opens with the column jumps; the toggle glides.
    const quiet = was === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el?.isConnected)
        el.scrollTo({ left: el.scrollWidth, behavior: quiet ? "auto" : "smooth" });
    });
  }, [scrollRef, shown]);
}

function ColumnsBoard({
  columns,
  buckets,
  isFolded,
  onToggleFold,
  input,
}: {
  columns: IssueStatus[];
  buckets: Record<IssueStatus, IssueSummary[]>;
  isFolded: (s: IssueStatus) => boolean;
  onToggleFold: (s: IssueStatus) => void;
  input?: BoardInput;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useCardAutoScroll(scrollRef);
  useRevealCancelled(scrollRef, columns.includes("cancelled"));
  return (
    <div
      ref={scrollRef}
      data-wf="KanbanBoard"
      data-layout="columns"
      data-input={input}
      className="h-full min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"
    >
      <div className="flex h-full w-max gap-2 p-3">
        {columns.map((s) =>
          isFolded(s) ? (
            <FoldedColumn
              key={s}
              status={s}
              count={buckets[s].length}
              onUnfold={() => onToggleFold(s)}
            />
          ) : (
            <KanbanColumn
              key={s}
              status={s}
              issues={buckets[s]}
              onFold={FOLDABLE_COLUMNS.includes(s) ? () => onToggleFold(s) : undefined}
            />
          ),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mobile

const MOBILE_START: IssueStatus[] = ["in_progress", "review", "blocked", "planned", "backlog"];

function MobileBoard({
  columns,
  buckets,
}: {
  columns: IssueStatus[];
  buckets: Record<IssueStatus, IssueSummary[]>;
}) {
  const [picked, setPicked] = useState<IssueStatus | null>(null);
  const fallback = MOBILE_START.find((s) => buckets[s].length > 0) ?? columns[0];
  const status = picked && columns.includes(picked) ? picked : fallback;

  return (
    <div data-wf="KanbanBoard" data-layout="mobile" className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 overflow-x-auto border-border border-b bg-bg px-3 py-2">
        <Segmented
          size="sm"
          aria-label="Status column"
          value={status}
          onChange={(v) => setPicked(v)}
          options={columns.map((s) => ({
            value: s,
            label: <span className="sr-only">{STATUS_LABEL[s]}</span>,
            icon: <StatusIcon status={s} size={14} />,
            count: buckets[s].length,
          }))}
        />
      </div>
      <div className="min-h-0 flex-1 px-2 pt-1">
        <KanbanColumn key={status} status={status} issues={buckets[status]} fill dragDisabled />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- loading

const SKELETON: number[][] = [[2, 1, 2], [1, 2], [2, 2, 1, 2], [1], [2, 1], [1, 1]];

export function BoardSkeleton() {
  return (
    <div
      data-wf="BoardSkeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading the board"
      className="flex h-full min-h-0 gap-2 overflow-hidden p-3"
    >
      {SKELETON.map((cards, i) => (
        <div key={i} className="flex w-[var(--wf-col-w)] shrink-0 flex-col">
          <div className="flex h-9 items-center gap-2 px-2">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex flex-col gap-[var(--wf-card-gap)] px-1 pt-1">
            {cards.map((lines, j) => (
              <div key={j} className="rounded-md border border-border bg-bg px-3 py-2.5">
                <Skeleton className="h-3 w-4/5" />
                {lines > 1 && <Skeleton className="mt-2 h-3 w-1/2" />}
                <Skeleton className="mt-3 h-2.5 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
