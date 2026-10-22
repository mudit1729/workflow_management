// The board region. Three layouts over one model:
// - columns: horizontal scroller of status columns, each body scrolls on its own
// - swimlanes: sticky column titles, one band per child group; the board scrolls both ways
// - mobile (<768 px): one column at a time with a status switcher
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { StatusIcon } from "@/components/common";
import { Segmented, Skeleton } from "@/components/ui";
import type { IssueStatus } from "@/gen/types";
import { useMoveIssue } from "@/lib/api";
import { useLayoutMode } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { FOLDABLE_COLUMNS, STATUS_LABEL } from "@/lib/status";
import { useBoardDnd, useCardAutoScroll } from "./dnd";
import { type BoardLane, bucketByStatus } from "./filter";
import { ColumnHeader, FoldedColumn, KanbanColumn } from "./KanbanColumn";
import { FoldedHeader, Swimlane } from "./Swimlane";
import { type BoardCardApi, BoardCardContext, type NavColumn, useBoardKeys } from "./useBoardKeys";

export interface KanbanBoardProps {
  columns: IssueStatus[];
  /** One lane without swimlanes; one per child group (plus "No subgroup") with them. */
  lanes: BoardLane[];
  swimlanes: boolean;
  /** Titles of the selected group below the root, for relative card paths. */
  basePath: string[];
}

export function KanbanBoard({ columns, lanes, swimlanes, basePath }: KanbanBoardProps) {
  const mobile = useLayoutMode() === "mobile";
  const foldedColumns = usePrefs((s) => s.foldedColumns);
  const toggleColumnFold = usePrefs((s) => s.toggleColumnFold);
  const { move } = useMoveIssue();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const isFolded = useCallback(
    (s: IssueStatus) => FOLDABLE_COLUMNS.includes(s) && foldedColumns.includes(s),
    [foldedColumns],
  );

  const byId = useMemo(() => {
    const map = new Map<string, BoardLane["issues"][number]>();
    for (const lane of lanes) for (const issue of lane.issues) map.set(issue.id, issue);
    return map;
  }, [lanes]);

  const navColumns = useMemo<NavColumn[]>(() => {
    const open = lanes.filter((l) => !collapsed.has(l.id));
    return columns
      .filter((s) => !isFolded(s))
      .map((s) => ({ status: s, ids: open.flatMap((l) => l.byStatus[s].map((i) => i.id)) }));
  }, [columns, lanes, collapsed, isFolded]);

  const keys = useBoardKeys(navColumns, !mobile);

  const active = useBoardDnd((id, to) => {
    const issue = byId.get(id);
    if (!issue) return;
    move(issue, to);
    keys.setFocusedId(id);
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

  const toggleLane = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const count = (s: IssueStatus) => lanes.reduce((n, l) => n + l.byStatus[s].length, 0);

  let body: ReactNode;
  if (mobile) {
    body = <MobileBoard columns={columns} lanes={lanes} />;
  } else if (swimlanes) {
    body = (
      <SwimlaneBoard
        columns={columns}
        lanes={lanes}
        isFolded={isFolded}
        onToggleFold={toggleColumnFold}
        count={count}
        collapsed={collapsed}
        onToggleLane={toggleLane}
        active={active}
      />
    );
  } else {
    body = (
      <ColumnsBoard
        columns={columns}
        lane={lanes[0]}
        isFolded={isFolded}
        onToggleFold={toggleColumnFold}
      />
    );
  }

  return <BoardCardContext value={api}>{body}</BoardCardContext>;
}

// ---------------------------------------------------------------- columns

function ColumnsBoard({
  columns,
  lane,
  isFolded,
  onToggleFold,
}: {
  columns: IssueStatus[];
  lane: BoardLane;
  isFolded: (s: IssueStatus) => boolean;
  onToggleFold: (s: IssueStatus) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useCardAutoScroll(scrollRef);
  return (
    <div
      ref={scrollRef}
      data-wf="KanbanBoard"
      data-layout="columns"
      className="h-full min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"
    >
      <div className="flex h-full w-max gap-2 p-3">
        {columns.map((s) =>
          isFolded(s) ? (
            <FoldedColumn
              key={s}
              status={s}
              count={lane.byStatus[s].length}
              onUnfold={() => onToggleFold(s)}
            />
          ) : (
            <KanbanColumn
              key={s}
              status={s}
              issues={lane.byStatus[s]}
              lane={lane.id}
              onFold={FOLDABLE_COLUMNS.includes(s) ? () => onToggleFold(s) : undefined}
            />
          ),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- swimlanes

function SwimlaneBoard({
  columns,
  lanes,
  isFolded,
  onToggleFold,
  count,
  collapsed,
  onToggleLane,
  active,
}: {
  columns: IssueStatus[];
  lanes: BoardLane[];
  isFolded: (s: IssueStatus) => boolean;
  onToggleFold: (s: IssueStatus) => void;
  count: (s: IssueStatus) => number;
  collapsed: ReadonlySet<string>;
  onToggleLane: (id: string) => void;
  active: ReturnType<typeof useBoardDnd>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useCardAutoScroll(scrollRef);
  return (
    <div
      ref={scrollRef}
      data-wf="KanbanBoard"
      data-layout="swimlanes"
      className="h-full min-h-0 min-w-0 overflow-auto"
    >
      <div className="flex w-max min-w-full flex-col pb-6">
        <div className="sticky top-0 z-20 flex gap-2 border-border border-b bg-subtle px-3 pt-1">
          {columns.map((s) =>
            isFolded(s) ? (
              <FoldedHeader key={s} status={s} count={count(s)} onUnfold={() => onToggleFold(s)} />
            ) : (
              <ColumnHeader
                key={s}
                status={s}
                count={count(s)}
                onFold={FOLDABLE_COLUMNS.includes(s) ? () => onToggleFold(s) : undefined}
                className="w-[var(--wf-col-w)]"
              />
            ),
          )}
        </div>
        {lanes.map((lane) => (
          <Swimlane
            key={lane.id}
            lane={lane}
            columns={columns}
            isFolded={isFolded}
            onUnfold={onToggleFold}
            collapsed={collapsed.has(lane.id)}
            onToggle={() => onToggleLane(lane.id)}
            active={active}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mobile

const MOBILE_START: IssueStatus[] = ["in_progress", "review", "blocked", "planned", "backlog"];

function MobileBoard({ columns, lanes }: { columns: IssueStatus[]; lanes: BoardLane[] }) {
  const buckets = useMemo(() => bucketByStatus(lanes.flatMap((l) => l.issues)), [lanes]);
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
