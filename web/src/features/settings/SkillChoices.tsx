// The skills a step can take, as numbered cards grouped by where they live (spec 5.3): the Add work
// answer buttons (`features/add-work/parts.tsx`) with one difference. There the arrow keys pick,
// because picking costs nothing; here a pick is a write, so the arrow keys only move focus and
// Enter, Space, a click or the number key picks.
import { Check } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { KeyCap } from "@/features/add-work/parts";
import type { FlowScope, Skill, SkillChoiceGroup } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useHotkey } from "@/lib/hooks";
import { afterUseWhen } from "./labels";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * The groups a scope may pick from. `me:` names a skill in each person's own library, so a team
 * value that names one resolves for its author only: Everyone is offered everything but My library.
 */
export function groupsFor(groups: SkillChoiceGroup[], scope: FlowScope): SkillChoiceGroup[] {
  return scope === "team" ? groups.filter((g) => g.source !== "me") : groups;
}

/** Under the cards of Everyone, when My library was left out and Just me is there to use it. */
export function MineAside({
  all,
  shown,
  show,
}: {
  all: SkillChoiceGroup[];
  shown: SkillChoiceGroup[];
  /** Just me is offered on this page. */
  show: boolean;
}) {
  if (!show || all.length === shown.length) return null;
  return (
    <p data-wf="MineAside" className="text-fg-faint text-xs">
      Your own skills are private. Choose Just me to use one.
    </p>
  );
}

export interface SkillChoicesProps {
  groups: SkillChoiceGroup[];
  /** The reference in effect, marked as picked. */
  value: string | undefined;
  /** Pick a skill. Called for the number keys too. */
  onPick: (ref: string) => void;
  label: string;
  /** The panel is on show: the number keys 1 to 9 pick. */
  keys?: boolean;
  /** A write is under way. */
  disabled?: boolean;
}

export function SkillChoices({
  groups,
  value,
  onPick,
  label,
  keys = true,
  disabled = false,
}: SkillChoicesProps) {
  const all = groups.flatMap((g) => g.skills);
  const root = useRef<HTMLDivElement>(null);

  useHotkey(
    DIGITS,
    (e) => {
      const skill = all[Number(e.key) - 1];
      if (!skill || disabled) return;
      onPick(skill.ref);
    },
    { enabled: keys && all.length > 0 },
  );

  const tabbable = Math.max(
    all.findIndex((s) => s.ref === value),
    0,
  );
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + all.length) % all.length;
    root.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  let n = 0;
  return (
    <div
      ref={root}
      data-wf="SkillChoices"
      role="radiogroup"
      aria-label={label}
      aria-busy={disabled || undefined}
      className="flex flex-col gap-3"
    >
      {groups.map((g) => (
        <div key={g.key} data-wf="SkillGroup" data-group={g.key} className="flex flex-col gap-1.5">
          <h4 className="font-medium text-fg-faint text-xs">{g.name}</h4>
          {g.skills.map((skill) => {
            const i = n++;
            return (
              <SkillChoice
                key={skill.ref}
                skill={skill}
                n={i + 1}
                selected={skill.ref === value}
                tabIndex={i === tabbable ? 0 : -1}
                disabled={disabled}
                onClick={() => onPick(skill.ref)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SkillChoice({
  skill,
  n,
  selected,
  tabIndex,
  disabled,
  onClick,
  onKeyDown,
}: {
  skill: Skill;
  n: number;
  selected: boolean;
  tabIndex: number;
  disabled: boolean;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const lead = /^Use when\s+/.exec(skill.use_when)?.[0];
  return (
    // biome-ignore lint/a11y/useSemanticElements: a large answer button that is also a radio, as in Add work.
    <button
      type="button"
      data-wf="SkillChoice"
      data-skill={skill.ref}
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      title={skill.ref}
      onClick={() => !disabled && onClick()}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-h-12 w-full min-w-0 cursor-default select-none items-center gap-3 rounded-md border px-3 py-2 text-left",
        "transition-[background-color,border-color] duration-100 ease-wf",
        selected
          ? "border-accent bg-accent-subtle"
          : "border-border bg-bg hover:border-border-strong hover:bg-subtle",
        disabled && !selected && "opacity-60",
      )}
    >
      <KeyCap n={n} selected={selected} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-fg text-md">{skill.name}</span>
        {skill.problem ? (
          <span className="truncate text-danger text-sm">Not a valid skill: {skill.problem}</span>
        ) : (
          <span className="truncate text-fg-muted text-sm">
            {lead && <span className="text-fg-faint">{lead}</span>}
            {afterUseWhen(skill.use_when)}
          </span>
        )}
      </span>
      <Check
        aria-hidden
        size={14}
        strokeWidth={1.75}
        className={cn("shrink-0 text-accent", selected ? "opacity-100" : "opacity-0")}
      />
    </button>
  );
}
