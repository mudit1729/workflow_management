// The board region. Three layouts over one model:
// - columns: horizontal scroller of status columns, each body scrolls on its own
// - swimlanes: sticky column titles, one band per child group; the board scrolls both ways
// - mobile (<768 px): one column at a time with a status switcher
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StatusIcon } from "@/components/common";
import { Segmented, Skeleton } from "@/components/ui";
import type { IssueStatus } from "@/gen/types";
import { useMoveIssue } from "@/lib/api";
import { useLayoutMode } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { FOLDABLE_COLUMNS, STATUS_LABEL } from "@/lib/status";
import { useBoardDnd, useCardAutoScroll } from "./dnd";
import { type BoardLane, bucketByStatus, type NeedsYou } from "./filter";
import { ColumnHeader, FoldedColumn, KanbanColumn } from "./KanbanColumn";
import { FoldedHeader, Swimlane } from "./Swimlane";
import {
  type BoardCardApi,
  BoardCardContext,
  type BoardInput,
  type NavColumn,
  useBoardKeys,
} from "./useBoardKeys";

export interface KanbanBoardProps {
  columns: IssueStatus[];
  /** One lane without swimlanes; one per child group (plus "No subgroup") with them. */
  lanes: BoardLane[];
  swimlanes: boolean;
  /** Titles of the selected group below the root, for relative card paths. */
  basePath: string[];
  /** The acting person's open requests, so a lane's "N need you" agrees with the toggle. */
  mine?: NeedsYou;
}

export function KanbanBoard({ columns, lanes, swimlanes, basePath, mine }: KanbanBoardProps) {
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
        input={keys.input}
        mine={mine}
      />
    );
  } else {
    body = (
      <ColumnsBoard
        columns={columns}
        lane={lanes[0]}
        isFolded={isFolded}
        onToggleFold={toggleColumnFold}
        input={keys.input}
      />
    );
  }

  return <BoardCardContext value={api}>{body}</BoardCardContext>;
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
  lane,
  isFolded,
  onToggleFold,
  input,
}: {
  columns: IssueStatus[];
  lane: BoardLane;
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
  input,
  mine,
}: {
  columns: IssueStatus[];
  lanes: BoardLane[];
  isFolded: (s: IssueStatus) => boolean;
  onToggleFold: (s: IssueStatus) => void;
  count: (s: IssueStatus) => number;
  collapsed: ReadonlySet<string>;
  onToggleLane: (id: string) => void;
  active: ReturnType<typeof useBoardDnd>;
  input?: BoardInput;
  mine?: NeedsYou;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useCardAutoScroll(scrollRef);
  useRevealCancelled(scrollRef, columns.includes("cancelled"));
  return (
    <div
      ref={scrollRef}
      data-wf="KanbanBoard"
      data-layout="swimlanes"
      data-input={input}
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
            mine={mine}
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
