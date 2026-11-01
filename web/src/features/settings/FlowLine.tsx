// The flow itself (spec 1.1, 5.2, decision F7): the five states of an issue on one line, Backlog →
// Planned → In progress → Review → Done, with the skill that moves an issue along on each arrow.
// Below it one quiet row: Hand off, which works in any state, and the side states. Log, Writing
// style and Status are not drawn; the panel of the arrow they run in lists them. The line knows
// nothing about files: it is drawn from a resolved flow and calls back.
//
// Where the page is wide the states are one line, and the line scrolls sideways when a docked
// panel leaves it too little room; under 640 px the states stack with the arrow labels between.
//
// Keyboard: the labels, the custom steps and the "+" buttons are one tab stop; the arrow keys, Home
// and End move between them in reading order.
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { FlowAfter, IssueStatus } from "@/gen/types";
import {
  customAfter,
  type FlowProblem,
  flowStep,
  type ResolvedCustom,
  type ResolvedFlow,
  type SkillsCatalog,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { AddStepButton, ArrowLabel, CustomChip, StatePill } from "./ArrowLabel";
import { FlowNavContext } from "./FlowNavContext";
import { customKey } from "./labels";
import type { PanelKey } from "./search";

export interface FlowLineProps {
  flow: ResolvedFlow;
  catalog: SkillsCatalog | undefined;
  /** The flow is mine: mark what I override. Off for the team default. */
  mine: boolean;
  /** The panel on show, so its arrows are marked. */
  selected: PanelKey | undefined;
  /** The "+" whose form is open. */
  adding?: FlowAfter;
  /** `line`: the states side by side. `stack`: one under the other, under 640 px. */
  layout: "line" | "stack";
  onSelect: (key: PanelKey) => void;
  onAdd: (after: FlowAfter) => void;
}

const STATES: IssueStatus[] = ["backlog", "planned", "in_progress", "review", "done"];

/** One arrow: the step that runs on it (none when a person approves), and its key in the arrow-key group. */
interface Hop {
  id: string;
  step?: "add" | "plan" | "do";
  /** The "+" and the custom steps of this arrow. The Do next step ones hang under In progress. */
  after?: "add" | "plan";
}

/** Add work (new → Backlog), Plan, Do next step twice, and the approval. */
const HOPS: Hop[] = [
  { id: "add", step: "add", after: "add" },
  { id: "plan", step: "plan", after: "plan" },
  { id: "start", step: "do" },
  { id: "finish", step: "do" },
  { id: "approve" },
];

const navKeyOf = (hop: Hop) => (hop.id === "finish" ? "do:finish" : (hop.step ?? hop.id));

/** What `resolveFlow` said about a custom step that does not resolve. */
function problemOf(flow: ResolvedFlow, c: ResolvedCustom): string | undefined {
  return flow.problems.find(
    (p: FlowProblem) => p.kind === "unresolved" && p.id === c.id && p.origin === c.origin,
  )?.message;
}

export function FlowLine(props: FlowLineProps) {
  const { selected, layout } = props;
  const [active, setActive] = useState<string>(selected && selected !== "new" ? selected : "add");
  const root = useRef<HTMLDivElement>(null);

  // The label of the panel that opens (a link, a click elsewhere) is where the tab stop is, and it
  // is in view: a docked panel can leave the line less room than it needs.
  useEffect(() => {
    if (!selected || selected === "new") return;
    setActive(selected);
    root.current
      ?.querySelector<HTMLElement>(`[data-flow-nav="${CSS.escape(selected)}"]`)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [selected]);

  // An item that is gone (a removed custom step) takes the tab stop with it: the line starts over.
  useEffect(() => {
    if (!root.current?.querySelector(`[data-flow-nav="${CSS.escape(active)}"]`)) setActive("add");
  });

  // Arrow keys move through the items in the order they are drawn in.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>("[data-flow-nav]") ?? [])];
    const at = items.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : move[e.key] !== undefined
            ? Math.min(items.length - 1, Math.max(0, at + (move[e.key] as number)))
            : undefined;
    if (to === undefined) return;
    e.preventDefault();
    items[to]?.focus();
  };

  return (
    <FlowNavContext value={{ active, setActive }}>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would box and label the whole flow; this is a group of arrows. */}
      <div
        ref={root}
        data-wf="FlowLine"
        data-layout={layout}
        role="group"
        aria-label="The skills flow"
        onKeyDown={onKeyDown}
        className="group/flow flex min-w-0 flex-col gap-6"
      >
        {layout === "line" ? <Line {...props} /> : <Stack {...props} />}
        <Below {...props} />
      </div>
    </FlowNavContext>
  );
}

// ---------------------------------------------------------------- pieces

function useParts({ flow, catalog, mine, selected, adding, onSelect, onAdd }: FlowLineProps) {
  const label = (
    hop: Hop,
    variant: "arrow" | "inline" | "loop" = "arrow",
    className?: string,
  ): ReactNode => {
    const id = hop.step;
    if (!id) return null;
    return (
      <ArrowLabel
        step={flow.steps[id]}
        catalog={catalog}
        overrides={mine}
        selected={selected === id}
        variant={variant}
        navKey={variant === "loop" ? "do:loop" : navKeyOf(hop)}
        onSelect={() => onSelect(id)}
        className={className}
      />
    );
  };
  /** The custom steps after a step, then the "+". */
  const extras = (after: FlowAfter, orient: "col" | "wrap", shown = false): ReactNode => (
    <div
      data-wf="ArrowExtras"
      className={cn(
        "flex min-w-0 gap-1.5",
        orient === "col" ? "flex-col items-center" : "flex-wrap items-center",
      )}
    >
      {customAfter(flow, after, { all: true }).map((c) => (
        <CustomChip
          key={c.id}
          custom={c}
          problem={problemOf(flow, c)}
          selected={selected === customKey(c)}
          onSelect={() => onSelect(customKey(c))}
        />
      ))}
      <AddStepButton
        after={after}
        afterName={flowStep(after).name}
        pressed={adding === after}
        shown={shown}
        onAdd={() => onAdd(after)}
      />
    </div>
  );
  return { label, extras };
}

/** Review → Done has no skill: a person approves. Not a button. */
const Approve = ({ className }: { className?: string }) => (
  <span
    data-wf="ApproveLabel"
    className={cn("whitespace-nowrap px-2 py-1 text-fg-muted text-base", className)}
  >
    you approve
  </span>
);

// ---------------------------------------------------------------- the line

// New → Backlog is a short lead-in; the other arrows share what is left. A label can be wider than
// its arrow: it is in the row above the pills, where the neighbours' columns are empty.
const COLUMNS = "minmax(80px, 0.7fr) auto repeat(4, minmax(96px, 1fr) auto)";

/** Three rows: the labels, the pills with the arrows between them, the custom steps and "+". */
function Line(props: FlowLineProps) {
  const { label, extras } = useParts(props);
  const rows = { gridTemplateColumns: COLUMNS, gridTemplateRows: "auto 28px auto" };
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="grid w-full" style={rows}>
        {HOPS.map((hop, i) => {
          const col = 2 * i + 1;
          const state = STATES[i] as IssueStatus;
          return (
            <Fragment key={hop.id}>
              <div
                className="flex items-end justify-center px-1 pb-1"
                style={{ gridColumn: col, gridRow: 1 }}
              >
                {hop.step ? label(hop) : <Approve />}
              </div>
              <span
                aria-hidden
                className="flex items-center"
                style={{ gridColumn: col, gridRow: 2 }}
              >
                {i === 0 && (
                  <span className="size-1.5 shrink-0 rounded-full border border-fg-faint" />
                )}
                <span className="h-px flex-1 bg-border" />
                <ChevronRight
                  size={12}
                  strokeWidth={1.75}
                  className="-mr-1 -ml-1.5 shrink-0 text-fg-faint"
                />
              </span>
              {hop.after && (
                <div
                  className="flex justify-center px-1 pt-1"
                  style={{ gridColumn: col, gridRow: 3 }}
                >
                  {extras(hop.after, "col")}
                </div>
              )}
              <div className="flex items-center px-0.5" style={{ gridColumn: col + 1, gridRow: 2 }}>
                <StatePill status={state} />
              </div>
              {hop.id === "start" && (
                // Do next step is a loop: one task per run, and the custom steps run after each.
                <div
                  className="flex flex-col items-center gap-1 px-1 pt-1"
                  style={{ gridColumn: col + 1, gridRow: 3 }}
                >
                  {label(hop, "loop")}
                  {extras("do", "col")}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the stack

/** The same flow top to bottom, for a phone: the arrow labels sit between the states. */
function Stack(props: FlowLineProps) {
  const { label, extras } = useParts(props);
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1.5 pl-[11px] text-fg-faint text-sm">
        <span aria-hidden className="size-1.5 rounded-full border border-fg-faint" />
        New work
      </span>
      {HOPS.map((hop, i) => (
        <Fragment key={hop.id}>
          <div className="relative ml-[14px] flex min-h-12 flex-col items-start justify-center gap-1 border-border border-l py-2 pl-3">
            {hop.step ? label(hop, "inline", "-ml-2") : <Approve className="-ml-2" />}
            {hop.after && extras(hop.after, "wrap", true)}
            <ChevronDown
              aria-hidden
              size={12}
              strokeWidth={1.75}
              className="absolute -bottom-1.5 -left-[6.5px] text-fg-faint"
            />
          </div>
          <StatePill status={STATES[i] as IssueStatus} className="self-start" />
          {hop.id === "start" && (
            <div className="ml-[14px] flex flex-col items-start gap-1 py-2 pl-3">
              {label(hop, "loop", "-ml-2")}
              {extras("do", "wrap", true)}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- below the line

/** Hand off works in any state, so it is not on the line; Blocked and Cancelled are off it. */
function Below(props: FlowLineProps) {
  const { flow, catalog, mine, selected, onSelect } = props;
  const { extras } = useParts(props);
  return (
    <div
      data-wf="FlowBelow"
      className="flex flex-wrap items-start gap-x-10 gap-y-3 border-border border-t pt-4"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-x-1 gap-y-1">
        <span className="py-1 text-fg-muted text-base">Any state:</span>
        <ArrowLabel
          step={flow.steps.handoff}
          catalog={catalog}
          overrides={mine}
          selected={selected === "handoff"}
          variant="inline"
          onSelect={() => onSelect("handoff")}
        />
        <div className="py-1 pl-1">{extras("handoff", "wrap", true)}</div>
      </div>
      <p className="py-1 text-fg-muted text-base">Side states: Blocked, Cancelled</p>
    </div>
  );
}
