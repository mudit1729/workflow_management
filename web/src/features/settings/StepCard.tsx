// The cards of the flow (spec 5.2): a step with the skill that runs it, a custom step (smaller,
// dashed border) and the "+" that inserts one. Each is a button of the flow's arrow-key group; a
// click or Enter opens the panel.
import { Plus } from "lucide-react";
import { Tooltip } from "@/components/ui";
import {
  flowOptionsLine,
  flowStep,
  type ResolvedCustom,
  type ResolvedStep,
  type SkillsCatalog,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useFlowItem } from "./FlowNavContext";
import { customKey, hasOverride } from "./labels";
import { OverrideMark, SourceChip, Warning } from "./parts";

const CARD =
  "group/card flex min-w-0 cursor-default select-none flex-col text-left transition-colors duration-100 ease-wf";

function cardTone(selected: boolean, dashed = false) {
  return cn(
    "rounded-lg border",
    dashed && "border-dashed",
    selected
      ? "border-accent bg-accent-subtle"
      : "border-border bg-bg hover:border-border-strong hover:bg-subtle",
  );
}

export interface StepCardProps {
  step: ResolvedStep;
  catalog: SkillsCatalog | undefined;
  /** Mark a value of mine over the team's ("In effect for me"). Off in the team view. */
  overrides?: boolean;
  selected?: boolean;
  /** Log: smaller, it hangs under Do next step. */
  compact?: boolean;
  onSelect: () => void;
  className?: string;
}

/** One step: its name, the skill in mono, where the skill lives, its options in one line. */
export function StepCard({
  step,
  catalog,
  overrides = true,
  selected = false,
  compact = false,
  onSelect,
  className,
}: StepCardProps) {
  const def = flowStep(step.id);
  const item = useFlowItem(step.id);
  const options = compact ? "" : flowOptionsLine(step);
  const mine = overrides && hasOverride(step);
  return (
    <button
      type="button"
      data-wf="StepCard"
      data-step={step.id}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      {...item}
      className={cn(
        CARD,
        cardTone(selected),
        compact ? "gap-1 px-3 py-2" : "gap-1.5 px-3 py-2.5",
        className,
      )}
    >
      <span className="truncate font-semibold text-base text-fg">{def.name}</span>
      <code title={step.skill} className="min-w-0 truncate font-mono text-fg-muted text-sm">
        {step.skill}
      </code>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SourceChip source={step.source} alias={step.alias} catalog={catalog} />
        {mine && <OverrideMark />}
      </span>
      {options && <span className="line-clamp-2 text-fg-faint text-xs">{options}</span>}
      {step.unresolved && <Warning className="mt-0.5">{step.unresolved.message}</Warning>}
    </button>
  );
}

export interface CustomCardProps {
  custom: ResolvedCustom;
  catalog: SkillsCatalog | undefined;
  /** What `resolveFlow` says about it when its reference does not resolve. */
  problem?: string;
  selected?: boolean;
  onSelect: () => void;
  className?: string;
}

/** A custom step: smaller than a step, dashed, with its label first. */
export function CustomCard({
  custom,
  catalog,
  problem,
  selected = false,
  onSelect,
  className,
}: CustomCardProps) {
  const item = useFlowItem(customKey(custom));
  return (
    <button
      type="button"
      data-wf="CustomCard"
      data-custom={custom.id}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      {...item}
      className={cn(CARD, cardTone(selected, true), "gap-1 px-2.5 py-2", className)}
    >
      <span className="truncate font-medium text-base text-fg">{custom.label}</span>
      <code title={custom.skill} className="min-w-0 truncate font-mono text-fg-faint text-xs">
        {custom.skill}
      </code>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SourceChip source={custom.source} alias={custom.alias} catalog={catalog} />
        {custom.required && (
          <span className="whitespace-nowrap font-medium text-fg-muted text-xs">Must pass</span>
        )}
        {custom.origin === "me" && <OverrideMark>Just you</OverrideMark>}
      </span>
      {custom.unresolved && (
        <Warning className="mt-0.5">
          {problem ?? `${custom.skill} is missing. The step does not run.`}
        </Warning>
      )}
    </button>
  );
}

/** The "+" between two steps and after Hand off: quiet, always there. */
export function AddStepButton({
  after,
  afterName,
  pressed = false,
  onAdd,
}: {
  after: string;
  afterName: string;
  pressed?: boolean;
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
          "grid size-5 shrink-0 cursor-default place-items-center rounded-full border max-md:size-7",
          "transition-colors duration-100 ease-wf",
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
