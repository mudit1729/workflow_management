// The pieces of the flow line (spec 5.2): a state pill, the label on an arrow (the step and the
// skill that runs it), a custom step on its arrow ("+ Security check") and the quiet "+" that adds
// one. Each label is a button of the flow's arrow-key group; a click or Enter opens the panel.
import { Plus } from "lucide-react";
import { StatusIcon } from "@/components/common";
import { Tooltip } from "@/components/ui";
import type { IssueStatus } from "@/gen/types";
import { flowStep, type ResolvedCustom, type ResolvedStep, type SkillsCatalog } from "@/lib/api";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, statusColor } from "@/lib/status";
import { useFlowItem } from "./FlowNavContext";
import { customKey, hasOverride } from "./labels";
import { OverrideMark, SourceChip } from "./parts";

/** A state of an issue, in its status color. Not a button: the arrows are what a person changes. */
export function StatePill({ status, className }: { status: IssueStatus; className?: string }) {
  const color = statusColor(status);
  return (
    <span
      data-wf="StatePill"
      data-status={status}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 32%, transparent)`,
      }}
      className={cn(
        "inline-flex h-7 select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-2 font-medium text-base text-fg",
        className,
      )}
    >
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const TONE = (selected: boolean) =>
  selected ? "bg-accent-subtle" : "hover:bg-subtle focus-visible:bg-subtle";

const BASE =
  "cursor-default select-none rounded-md transition-colors duration-100 ease-wf outline-offset-0";

export interface ArrowLabelProps {
  step: ResolvedStep;
  catalog: SkillsCatalog | undefined;
  /** Mark a value of mine over the team's ("In effect for me"). Off in the team view. */
  overrides?: boolean;
  selected?: boolean;
  /**
   * `arrow`: the name over its skill, centered on the arrow. `inline`: both on one line (Hand off,
   * below the line). `loop`: "↺ Do next step", under In progress, with no skill.
   */
  variant?: "arrow" | "inline" | "loop";
  /** The key in the flow's arrow-key group. Default: the step's id. */
  navKey?: string;
  onSelect: () => void;
  className?: string;
}

/** A step on its arrow: its name, the skill in mono, a chip when the skill is not built in. */
export function ArrowLabel({
  step,
  catalog,
  overrides = true,
  selected = false,
  variant = "arrow",
  navKey,
  onSelect,
  className,
}: ArrowLabelProps) {
  const def = flowStep(step.id);
  const item = useFlowItem(navKey ?? step.id);
  const mine = overrides && hasOverride(step);
  const name = variant === "loop" ? `↺ ${def.name}` : def.name;
  const missing = step.unresolved;
  return (
    <button
      type="button"
      data-wf="ArrowLabel"
      data-step={step.id}
      data-variant={variant}
      aria-current={selected ? "true" : undefined}
      title={missing?.message}
      onClick={onSelect}
      {...item}
      className={cn(
        BASE,
        TONE(selected),
        variant === "inline"
          ? "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2 py-1 text-left"
          : "flex w-max max-w-[220px] flex-col items-center gap-0.5 px-2 py-1 text-center",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-base text-fg">
        {name}
        {missing && (
          <>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-stale" />
            <span className="sr-only">The skill is missing</span>
          </>
        )}
      </span>
      {variant !== "loop" && (
        <code
          className={cn(
            "max-w-full font-mono text-fg-muted text-xs",
            variant === "arrow" ? "whitespace-nowrap" : "break-all",
          )}
        >
          {step.skill}
        </code>
      )}
      {variant !== "loop" && (step.source !== "built-in" || mine) && (
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {step.source !== "built-in" && (
            <SourceChip source={step.source} alias={step.alias} catalog={catalog} />
          )}
          {mine && <OverrideMark />}
        </span>
      )}
    </button>
  );
}

export interface CustomChipProps {
  custom: ResolvedCustom;
  /** What `resolveFlow` says about it when its reference does not resolve. */
  problem?: string;
  selected?: boolean;
  onSelect: () => void;
  className?: string;
}

/** A custom step on its arrow: "+ Security check", dashed, with a dot when it does not run. */
export function CustomChip({
  custom,
  problem,
  selected = false,
  onSelect,
  className,
}: CustomChipProps) {
  const item = useFlowItem(customKey(custom));
  return (
    <button
      type="button"
      data-wf="CustomChip"
      data-custom={custom.id}
      aria-current={selected ? "true" : undefined}
      title={
        custom.unresolved
          ? (problem ?? `${custom.skill} is missing. The step does not run.`)
          : custom.skill
      }
      onClick={onSelect}
      {...item}
      className={cn(
        BASE,
        "inline-flex max-w-[240px] items-center gap-1.5 whitespace-nowrap border border-border border-dashed px-2 py-0.5 text-sm",
        selected ? "border-accent bg-accent-subtle" : "hover:border-border-strong hover:bg-subtle",
        className,
      )}
    >
      <span className="truncate text-fg">+ {custom.label}</span>
      {custom.required && <span className="shrink-0 text-fg-muted text-xs">Must pass</span>}
      {custom.origin === "me" && <OverrideMark>Just you</OverrideMark>}
      {custom.unresolved && (
        <>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-stale" />
          <span className="sr-only">The step does not run</span>
        </>
      )}
    </button>
  );
}

/** The quiet "+" on an arrow: shown on hover and focus, always on touch and on a phone. */
export function AddStepButton({
  after,
  afterName,
  pressed = false,
  shown = false,
  onAdd,
}: {
  after: string;
  afterName: string;
  pressed?: boolean;
  /** Always drawn (the stacked flow), not only on hover and focus. */
  shown?: boolean;
  onAdd: () => void;
}) {
  const item = useFlowItem(`new:${after}`);
  return (
    <Tooltip content={`Add a step after ${afterName}`}>
      <button
        type="button"
        data-wf="AddStepButton"
        data-after={after}
        aria-label={`Add a step after ${afterName}`}
        aria-pressed={pressed}
        onClick={onAdd}
        {...item}
        className={cn(
          "grid shrink-0 cursor-default place-items-center rounded-full border",
          shown ? "size-7" : "size-5",
          "transition-[opacity,color,border-color] duration-100 ease-wf",
          "focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          pressed || shown
            ? "opacity-100"
            : "opacity-0 group-focus-within/flow:opacity-100 group-hover/flow:opacity-100",
          pressed
            ? "border-accent bg-accent-subtle text-accent"
            : "border-border bg-bg text-fg-faint hover:border-border-strong hover:text-fg",
        )}
      >
        <Plus aria-hidden size={12} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}
