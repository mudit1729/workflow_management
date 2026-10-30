// PlanLanes: the plan as a grid. Rows are lanes (who works where), columns are
// dependency levels (what can run in parallel). Edges are drawn only for the
// hovered or selected task, so the grid stays quiet until you ask.
import {
  Fragment,
  type RefObject,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EmptyState } from "@/components/common";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui";
import type { Criterion, IssueId, Phase, Plan, Task, TaskId } from "@/gen/types";
import { cn } from "@/lib/cn";
import { TaskDetail } from "./TaskDetail";
import { plainTitle, TaskPill } from "./TaskPill";
import { useTaskFocusRequest } from "./task-focus";

const LANE_W = 96;
const LEVEL_W = 240;
const FADE_RIGHT = "linear-gradient(to right, black calc(100% - 40px), transparent)";

export interface PlanLanesProps {
  plan: Plan;
  criteria: Criterion[];
  issueId: IssueId;
  highlightReady?: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Edge = [from: TaskId, to: TaskId];

export function PlanLanes({ plan, criteria, issueId, highlightReady = false }: PlanLanesProps) {
  const tasks = useMemo(() => plan.phases.flatMap((p) => p.tasks), [plan]);
  const layout = useMemo(() => buildLayout(tasks), [tasks]);

  const [selected, setSelected] = useState<TaskId | null>(null);
  const [hovered, setHovered] = useState<TaskId | null>(null);

  // ---- measuring pills for the edge overlay
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRight = useMoreToTheRight(scrollRef);
  const gridRef = useRef<HTMLDivElement>(null);
  const pillEls = useRef(new Map<TaskId, HTMLElement>());
  const refFns = useRef(new Map<TaskId, (el: HTMLElement | null) => void>());
  const [boxes, setBoxes] = useState<Map<TaskId, Box>>(() => new Map());

  const pillRef = useCallback((id: TaskId) => {
    let fn = refFns.current.get(id);
    if (!fn) {
      fn = (el) => {
        if (el) pillEls.current.set(id, el);
        else pillEls.current.delete(id);
      };
      refFns.current.set(id, fn);
    }
    return fn;
  }, []);

  const measure = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const next = new Map<TaskId, Box>();
    for (const [id, el] of pillEls.current) {
      const box = boxWithin(el, grid);
      if (box) next.set(id, box);
    }
    setBoxes((prev) => (sameBoxes(prev, next) ? prev : next));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-observe when the task set changes
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    for (const el of pillEls.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [measure, tasks]);

  // ---- chains
  const selectedChain = useMemo(
    () => (selected && layout.byId.has(selected) ? chainOf(selected, layout) : null),
    [selected, layout],
  );
  const hoveredChain = useMemo(
    () =>
      hovered && hovered !== selected && layout.byId.has(hovered) ? chainOf(hovered, layout) : null,
    [hovered, selected, layout],
  );

  const select = useCallback((id: TaskId) => {
    setSelected(id);
    pillEls.current.get(id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  // A commit's T-n pill in the Git tab asks for this task.
  useTaskFocusRequest(issueId, select);

  if (tasks.length === 0) {
    return (
      <div data-wf="PlanLanes">
        <EmptyState
          compact
          title="No tasks yet"
          hint={
            <>
              Add <code className="font-mono text-fg-muted">### T-1: …</code> headings under a{" "}
              <code className="font-mono text-fg-muted">## Phase</code> heading in plan.md.
            </>
          }
          skill="write-plan"
        />
      </div>
    );
  }

  // A trailing 1fr track lets the row lines reach the edge when the grid is narrower than its box.
  const gridColumns = `${LANE_W}px repeat(${layout.levels}, ${LEVEL_W}px) minmax(0, 1fr)`;

  return (
    <div data-wf="PlanLanes" className="flex min-w-0 flex-col gap-2">
      <PhaseProgress phases={plan.phases} />
      <div
        ref={scrollRef}
        className="min-w-0 overflow-x-auto overscroll-x-contain rounded-md border border-border"
        // Fade the right edge while more columns wait behind it, so a cut-off pill reads as "scroll".
        style={moreRight ? { maskImage: FADE_RIGHT } : undefined}
      >
        <div
          ref={gridRef}
          className="relative grid w-max min-w-full gap-x-6"
          style={{ gridTemplateColumns: gridColumns }}
        >
          {/* header row */}
          <div className="sticky left-0 z-[3] bg-bg" style={{ gridRow: 1, gridColumn: 1 }} />
          {Array.from({ length: layout.levels }, (_, level) => (
            <div
              key={`h-${level}`}
              className="flex h-8 items-center"
              style={{ gridRow: 1, gridColumn: level + 2 }}
            >
              <LevelHeader level={level} count={layout.levelCounts[level] ?? 0} />
            </div>
          ))}

          {layout.lanes.map((lane, i) => {
            const row = i + 2;
            return (
              <Fragment key={lane}>
                {/* full-width row line, under everything */}
                <div
                  aria-hidden
                  className="border-border border-t"
                  style={{ gridRow: row, gridColumn: "1 / -1" }}
                />
                <div
                  className="sticky left-0 z-[3] flex min-w-0 items-start gap-1.5 border-border border-t border-r bg-bg py-3 pr-2 pl-3"
                  style={{ gridRow: row, gridColumn: 1 }}
                >
                  <span className="min-w-0 truncate font-medium text-fg text-sm leading-6">
                    {lane}
                  </span>
                  <span className="text-fg-faint text-xs tabular leading-6">
                    {layout.laneCounts.get(lane) ?? 0}
                  </span>
                </div>
                {Array.from({ length: layout.levels }, (_, level) => {
                  const cell = layout.cells.get(cellKey(lane, level));
                  if (!cell) return null;
                  return (
                    <div
                      key={`${lane}-${level}`}
                      className="relative z-[2] flex min-w-0 flex-col gap-1.5 py-3"
                      style={{ gridRow: row, gridColumn: level + 2 }}
                    >
                      {cell.map((task) => (
                        <LanePill
                          key={task.id}
                          task={task}
                          issueId={issueId}
                          tasks={tasks}
                          criteria={criteria}
                          highlightReady={highlightReady}
                          selected={selected === task.id}
                          dimmed={selectedChain != null && !selectedChain.nodes.has(task.id)}
                          pillRef={pillRef(task.id)}
                          onOpenChange={(open) =>
                            setSelected((cur) => (open ? task.id : cur === task.id ? null : cur))
                          }
                          onHover={(on) =>
                            setHovered((cur) => (on ? task.id : cur === task.id ? null : cur))
                          }
                          onSelectTask={select}
                        />
                      ))}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}

          <EdgeOverlay
            boxes={boxes}
            hovered={hoveredChain?.edges}
            selected={selectedChain?.edges}
          />
        </div>
      </div>
    </div>
  );
}

/** True while the scroller has content hidden past its right edge. */
function useMoreToTheRight(ref: RefObject<HTMLElement | null>): boolean {
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, [ref]);
  return more;
}

// ---------------------------------------------------------------- pill + popover

function LanePill({
  task,
  issueId,
  tasks,
  criteria,
  highlightReady,
  selected,
  dimmed,
  pillRef,
  onOpenChange,
  onHover,
  onSelectTask,
}: {
  task: Task;
  issueId: IssueId;
  tasks: Task[];
  criteria: Criterion[];
  highlightReady: boolean;
  selected: boolean;
  dimmed: boolean;
  pillRef: (el: HTMLElement | null) => void;
  onOpenChange: (open: boolean) => void;
  onHover: (on: boolean) => void;
  onSelectTask: (id: TaskId) => void;
}) {
  return (
    <Popover open={selected} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <TaskPill
          ref={pillRef}
          task={task}
          size="md"
          wrap
          selected={selected}
          highlightReady={highlightReady}
          className={cn("w-full", dimmed && "opacity-50")}
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
          onFocus={() => onHover(true)}
          onBlur={() => onHover(false)}
        />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        aria-label={`${task.id}: ${plainTitle(task.title)}`}
        className="max-h-[min(560px,var(--radix-popover-content-available-height))] w-auto p-0"
      >
        <TaskDetail
          task={task}
          issueId={issueId}
          variant="popover"
          tasks={tasks}
          criteria={criteria}
          onSelectTask={onSelectTask}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------- headers

function LevelHeader({ level, count }: { level: number; count: number }) {
  const hint =
    level === 0
      ? "Tasks with no dependencies. They can start now."
      : "Tasks that wait on tasks in earlier columns.";
  return (
    <Tooltip content={hint}>
      <span className="flex items-baseline gap-1.5 text-fg-faint text-xs">
        <span className="font-medium">{level === 0 ? "Start" : "Then"}</span>
        <span className="tabular">{count}</span>
      </span>
    </Tooltip>
  );
}

function PhaseProgress({ phases }: { phases: Phase[] }) {
  const shown = phases.filter((p) => p.tasks.length > 0);
  if (shown.length === 0) return null;
  return (
    <p
      data-wf="PlanPhaseProgress"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-fg-faint text-xs"
    >
      {shown.map((phase, i) => {
        const done = phase.tasks.filter((t) => t.status === "done").length;
        const complete = done === phase.tasks.length;
        return (
          <Fragment key={`${phase.index}-${phase.name}`}>
            {i > 0 && <span aria-hidden>·</span>}
            <span className={cn(complete && "text-fg-muted")}>
              {phase.name}{" "}
              <span className="tabular">
                {done}/{phase.tasks.length}
              </span>
            </span>
          </Fragment>
        );
      })}
    </p>
  );
}

// ---------------------------------------------------------------- edges

function EdgeOverlay({
  boxes,
  hovered,
  selected,
}: {
  boxes: Map<TaskId, Box>;
  hovered?: Edge[];
  selected?: Edge[];
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!hovered?.length && !selected?.length) return null;

  const selectedKeys = new Set((selected ?? []).map(([a, b]) => `${a}>${b}`));
  const faint = (hovered ?? []).filter(([a, b]) => !selectedKeys.has(`${a}>${b}`));

  const path = ([from, to]: Edge) => {
    const a = boxes.get(from);
    const b = boxes.get(to);
    if (!a || !b) return null;
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x - 1;
    const y2 = b.y + b.h / 2;
    const dx = Math.max(12, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <svg
      aria-hidden
      data-wf="PlanEdges"
      className="pointer-events-none absolute inset-0 z-[1] size-full overflow-visible fade-in-0 animate-in duration-150"
    >
      <defs>
        <Arrow id={`${uid}-faint`} className="text-fg-faint" />
        <Arrow id={`${uid}-accent`} className="text-accent" />
      </defs>
      <g className="text-fg-faint" fill="none" stroke="currentColor" strokeWidth={1.25}>
        {faint.map((e) => {
          const d = path(e);
          return d && <path key={`${e[0]}>${e[1]}`} d={d} markerEnd={`url(#${uid}-faint)`} />;
        })}
      </g>
      <g className="text-accent" fill="none" stroke="currentColor" strokeWidth={1.25}>
        {(selected ?? []).map((e) => {
          const d = path(e);
          return d && <path key={`${e[0]}>${e[1]}`} d={d} markerEnd={`url(#${uid}-accent)`} />;
        })}
      </g>
    </svg>
  );
}

function Arrow({ id, className }: { id: string; className: string }) {
  return (
    <marker
      id={id}
      className={className}
      viewBox="0 0 8 8"
      refX={8}
      refY={4}
      markerWidth={6}
      markerHeight={6}
      markerUnits="userSpaceOnUse"
      orient="auto"
    >
      <path d="M0 0.5 L8 4 L0 7.5 Z" fill="currentColor" stroke="none" />
    </marker>
  );
}

// ---------------------------------------------------------------- layout

interface Layout {
  lanes: string[];
  levels: number;
  cells: Map<string, Task[]>;
  laneCounts: Map<string, number>;
  levelCounts: number[];
  byId: Map<TaskId, Task>;
  deps: Map<TaskId, TaskId[]>;
  dependents: Map<TaskId, TaskId[]>;
}

const cellKey = (lane: string, level: number) => `${lane}\u0000${level}`;

function buildLayout(tasks: Task[]): Layout {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const lanes: string[] = [];
  const laneCounts = new Map<string, number>();
  const cells = new Map<string, Task[]>();
  const levelCounts: number[] = [];
  const deps = new Map<TaskId, TaskId[]>();
  const dependents = new Map<TaskId, TaskId[]>();
  let maxLevel = 0;

  for (const t of tasks) {
    if (!laneCounts.has(t.lane)) lanes.push(t.lane);
    laneCounts.set(t.lane, (laneCounts.get(t.lane) ?? 0) + 1);
    const level = Math.max(0, t.level);
    maxLevel = Math.max(maxLevel, level);
    levelCounts[level] = (levelCounts[level] ?? 0) + 1;
    const key = cellKey(t.lane, level);
    const cell = cells.get(key);
    if (cell) cell.push(t);
    else cells.set(key, [t]);

    // Only same-issue dependencies are drawn; "wf-…#T-n" refs live in TaskDetail.
    const local = t.depends_on.filter((d) => byId.has(d));
    deps.set(t.id, local);
    for (const d of local) {
      const list = dependents.get(d);
      if (list) list.push(t.id);
      else dependents.set(d, [t.id]);
    }
  }
  for (const cell of cells.values()) cell.sort((a, b) => taskNumber(a.id) - taskNumber(b.id));

  return { lanes, levels: maxLevel + 1, cells, laneCounts, levelCounts, byId, deps, dependents };
}

function taskNumber(id: TaskId): number {
  const n = Number.parseInt(id.replace(/^T-/, ""), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

/** The task, everything it waits on (upstream) and everything waiting on it (downstream). */
function chainOf(root: TaskId, layout: Layout): { nodes: Set<TaskId>; edges: Edge[] } {
  const nodes = new Set<TaskId>([root]);
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const walk = (start: TaskId, next: Map<TaskId, TaskId[]>, upstream: boolean) => {
    const queue = [start];
    while (queue.length > 0) {
      const id = queue.shift() as TaskId;
      for (const other of next.get(id) ?? []) {
        const edge: Edge = upstream ? [other, id] : [id, other];
        const key = `${edge[0]}>${edge[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push(edge);
        if (!nodes.has(other)) {
          nodes.add(other);
          queue.push(other);
        }
      }
    }
  };
  walk(root, layout.deps, true);
  walk(root, layout.dependents, false);
  return { nodes, edges };
}

/**
 * The element's box in the grid's coordinate space, from layout offsets. Unlike
 * getBoundingClientRect this ignores transforms, so a sliding drawer or a scaling
 * popover never skews the edges.
 */
function boxWithin(el: HTMLElement, root: HTMLElement): Box | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== root) return null;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function sameBoxes(a: Map<TaskId, Box>, b: Map<TaskId, Box>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, box] of b) {
    const prev = a.get(id);
    if (
      !prev ||
      Math.abs(prev.x - box.x) > 0.5 ||
      Math.abs(prev.y - box.y) > 0.5 ||
      Math.abs(prev.w - box.w) > 0.5 ||
      Math.abs(prev.h - box.h) > 0.5
    )
      return false;
  }
  return true;
}
