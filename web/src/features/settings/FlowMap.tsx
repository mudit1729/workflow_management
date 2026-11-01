// The flow itself (spec 5.2): Add work → Plan → Do next step → Hand off as cards joined by arrows,
// Log hanging under Do next step, a "+" in each gap and after Hand off, the custom steps (dashed)
// in the gaps they run in, and an Anywhere row for Status and Writing style. A row where the page
// is wide, a vertical list where it is not. The map knows nothing about files: it is drawn from a
// resolved flow and calls back.
//
// Keyboard: the cards and the "+" buttons are one tab stop; the arrow keys, Home and End move
// between them in reading order (Add work, +, Plan, +, Do next step, Log, …, Anywhere).
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { FlowAfter, FlowStepId } from "@/gen/types";
import {
  customAfter,
  FLOW_AFTER,
  type FlowProblem,
  flowStep,
  type ResolvedCustom,
  type ResolvedFlow,
  type SkillsCatalog,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { FlowNavContext } from "./FlowNavContext";
import { customKey } from "./labels";
import { AddStepButton, CustomCard, StepCard } from "./StepCard";
import type { PanelKey } from "./search";

export interface FlowMapProps {
  flow: ResolvedFlow;
  catalog: SkillsCatalog | undefined;
  /** The flow is mine: mark what I override. Off for the team default. */
  mine: boolean;
  /** The panel on show, so its card is marked. */
  selected: PanelKey | undefined;
  /** The "+" whose form is open. */
  adding?: FlowAfter;
  layout: "row" | "list";
  onSelect: (key: PanelKey) => void;
  onAdd: (after: FlowAfter) => void;
}

const ANYWHERE: FlowStepId[] = ["status", "style"];

/** What `resolveFlow` said about a custom step that does not resolve. */
function problemOf(flow: ResolvedFlow, c: ResolvedCustom): string | undefined {
  return flow.problems.find(
    (p: FlowProblem) => p.kind === "unresolved" && p.id === c.id && p.origin === c.origin,
  )?.message;
}

export function FlowMap(props: FlowMapProps) {
  const { selected, layout } = props;
  const [active, setActive] = useState<string>(selected && selected !== "new" ? selected : "add");
  const root = useRef<HTMLDivElement>(null);

  // The card of the panel that opens (a link, a click elsewhere) is where the tab stop is.
  useEffect(() => {
    if (selected && selected !== "new") setActive(selected);
  }, [selected]);

  // Arrow keys move through the cards and the "+" buttons in the order they are drawn in.
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
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would box and label the whole flow; this is a group of cards. */}
      <div
        ref={root}
        data-wf="FlowMap"
        data-layout={layout}
        role="group"
        aria-label="The skills flow"
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-col gap-6"
      >
        {layout === "row" ? <FlowRow {...props} /> : <FlowList {...props} />}
        <Anywhere {...props} />
      </div>
    </FlowNavContext>
  );
}

const MAIN = FLOW_AFTER;
const stepName = (id: FlowStepId) => flowStep(id).name;

function useCards({ flow, catalog, mine, selected, onSelect }: FlowMapProps) {
  const step = (id: FlowStepId, compact = false) => (
    <StepCard
      step={flow.steps[id]}
      catalog={catalog}
      overrides={mine}
      selected={selected === id}
      compact={compact}
      onSelect={() => onSelect(id)}
      className="h-full w-full"
    />
  );
  const custom = (c: ResolvedCustom, className?: string) => (
    <CustomCard
      key={c.id}
      custom={c}
      catalog={catalog}
      problem={problemOf(flow, c)}
      selected={selected === customKey(c)}
      onSelect={() => onSelect(customKey(c))}
      className={className}
    />
  );
  return { step, custom };
}

// ---------------------------------------------------------------- the row

const Line = () => <span aria-hidden className="h-px w-2 shrink-0 bg-border" />;

/** Cards in a row, the gaps between them hold the custom steps and the "+". */
function FlowRow(props: FlowMapProps) {
  const { flow, adding, onAdd } = props;
  const { step, custom } = useCards(props);
  return (
    <div
      className="grid items-stretch"
      style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr) auto)" }}
    >
      {MAIN.map((id, i) => (
        <Fragment key={id}>
          <div className="min-w-0" style={{ gridColumn: 2 * i + 1, gridRow: 1 }}>
            {step(id)}
          </div>
          {id === "do" && (
            // Log runs inside Plan and Do next step: a smaller card under the one it serves.
            <div className="flex min-w-0 flex-col" style={{ gridColumn: 2 * i + 1, gridRow: 2 }}>
              <span aria-hidden className="ml-6 h-3 w-px bg-border" />
              {step("log", true)}
            </div>
          )}
          <div className="flex items-center" style={{ gridColumn: 2 * i + 2, gridRow: 1 }}>
            {customAfter(flow, id, { all: true }).map((c) => (
              <Fragment key={c.id}>
                <Line />
                {custom(c, "w-[148px]")}
              </Fragment>
            ))}
            <Line />
            <AddStepButton
              after={id}
              afterName={stepName(id)}
              pressed={adding === id}
              onAdd={() => onAdd(id)}
            />
            {i < MAIN.length - 1 && (
              <>
                <Line />
                <ChevronRight
                  aria-hidden
                  size={12}
                  strokeWidth={1.75}
                  className="-ml-1.5 shrink-0 text-fg-faint"
                />
              </>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the list

/** The same flow top to bottom: down arrows, the "+" between items. */
function FlowList(props: FlowMapProps) {
  const { flow, adding, onAdd } = props;
  const { step, custom } = useCards(props);
  return (
    <div className="flex max-w-[480px] flex-col">
      {MAIN.map((id, i) => (
        <Fragment key={id}>
          {step(id)}
          {id === "do" && (
            <div className="ml-6 flex flex-col">
              <span aria-hidden className="h-3 w-px bg-border" />
              {step("log", true)}
            </div>
          )}
          <div className="flex flex-col items-start">
            {customAfter(flow, id, { all: true }).map((c) => (
              <Fragment key={c.id}>
                <span aria-hidden className="ml-6 h-3 w-px bg-border" />
                {custom(c, "ml-6 w-[calc(100%-24px)]")}
              </Fragment>
            ))}
            <span aria-hidden className="ml-6 h-3 w-px bg-border" />
            <span className="ml-[14px]">
              <AddStepButton
                after={id}
                afterName={stepName(id)}
                pressed={adding === id}
                onAdd={() => onAdd(id)}
              />
            </span>
            {i < MAIN.length - 1 && (
              <>
                <span aria-hidden className="ml-6 h-2 w-px bg-border" />
                <ChevronDown
                  aria-hidden
                  size={12}
                  strokeWidth={1.75}
                  className="-mt-1 ml-[18px] shrink-0 text-fg-faint"
                />
              </>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- anywhere

/** Status and Writing style run wherever a skill needs them, so they are not on the line. */
function Anywhere(props: FlowMapProps) {
  const { step } = useCards(props);
  return (
    <section data-wf="FlowAnywhere" aria-labelledby="flow-anywhere" className="flex flex-col gap-2">
      <h2
        id="flow-anywhere"
        className="flex items-baseline gap-2 font-medium text-fg-muted text-sm"
      >
        Anywhere
        <span className="font-normal text-fg-faint text-xs">
          Other skills call these at any point
        </span>
      </h2>
      <div
        className={cn(
          "grid gap-3",
          props.layout === "row" ? "grid-cols-2" : "max-w-[480px] grid-cols-1",
        )}
      >
        {ANYWHERE.map((id) => (
          <div key={id} className="min-w-0">
            {step(id)}
          </div>
        ))}
      </div>
    </section>
  );
}
