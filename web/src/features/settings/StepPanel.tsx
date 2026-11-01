// The panel of one step (spec 5.3): what the step does and what a replacement must do, whom the
// change applies to, the skill (numbered cards), the options (buttons), what can be done with the
// skill, and the saved line. Every click writes at once: the team's `workflow.toml` for Everyone,
// my `library.toml` for Just me, as a minimal edit that keeps every other line.
import { useState } from "react";
import { Button, Skeleton } from "@/components/ui";
import type { FlowStepId } from "@/gen/types";
import {
  BUILTIN_SKILLS,
  type FlowOptionDef,
  type FlowSaved,
  type FlowScope,
  type FlowUndo,
  flowStep,
  type ResolvedFlow,
  type ResolvedStep,
  resetFlowValue,
  setFlowValue,
  skillByRef,
  skillChoices,
  useFlow,
  usePersonalConfig,
} from "@/lib/api";
import { OptionRows } from "./OptionRows";
import {
  ApplyTo,
  Contract,
  InstallNote,
  MoreSkills,
  PanelFrame,
  PanelSection,
  type PanelVariant,
  useWriter,
} from "./panel";
import { OverrideMark, Warning } from "./parts";
import { SkillActions } from "./SkillActions";
import { SkillChoices } from "./SkillChoices";

export interface StepPanelProps {
  step: FlowStepId;
  variant: PanelVariant;
  onClose: () => void;
  /** Start on Just me (the Kit shows it). Default: Just me when I override the step, else Everyone. */
  initialScope?: FlowScope;
  /** The number keys pick a skill. Off for a frame in the Kit, where several panels share the page. */
  keys?: boolean;
  /** The page shows the team default alone: the panel writes the team's file and Just me is off. */
  teamView?: boolean;
}

/** Join the undo tokens of several writes into one: Undo takes all of them back. */
function joined(tokens: FlowSaved[]): FlowSaved | undefined {
  const [first] = tokens;
  if (!first) return undefined;
  const writes: FlowUndo["writes"][number][] = tokens.flatMap((t) => [...t.undo.writes]);
  return { undo: { writes }, file: first.file };
}

export function StepPanel(props: StepPanelProps) {
  // A new step starts a new panel: its scope and its problem line do not carry over.
  return <StepPanelBody key={props.step} {...props} />;
}

function StepPanelBody({
  step: id,
  variant,
  onClose,
  initialScope,
  keys = true,
  teamView = false,
}: StepPanelProps) {
  const state = useFlow();
  const { flow, team, config, catalog } = state;
  const canBeMine = usePersonalConfig().data !== undefined && !teamView;
  const def = flowStep(id);
  const mineAlready = Object.keys(config.me.steps[id] ?? {}).length > 0;
  const [chosen, setScope] = useState<FlowScope>(initialScope ?? (mineAlready ? "me" : "team"));
  const scope: FlowScope = canBeMine ? chosen : "team";
  const { busy, problem, run } = useWriter(id);

  const mine = scope === "me";
  const shown: ResolvedFlow = mine ? flow : team;
  const resolved: ResolvedStep = shown.steps[id];
  const skill = skillByRef(catalog, resolved.skill);
  const groups = skillChoices(catalog, id);
  const teamNamed = config.team.steps[id]?.skill ?? BUILTIN_SKILLS[id];

  // What applies when my key is taken away (Just me), or when the team's is (Everyone).
  const inheritedSkill = mine ? teamNamed : BUILTIN_SKILLS[id];
  const inheritedOption = (option: FlowOptionDef) =>
    mine ? (team.steps[id].options[option.key]?.value ?? option.default) : option.default;

  const pickSkill = (ref: string) => {
    if (ref === resolved.skill && !resolved.unresolved) return;
    void run(() =>
      ref === inheritedSkill
        ? resetFlowValue({ scope, step: id, key: "skill" })
        : setFlowValue({ scope, step: id, key: "skill", value: ref }),
    );
  };

  const pickOption = (option: FlowOptionDef, value: string | number) => {
    if (value === resolved.options[option.key]?.value) return;
    void run(() =>
      // A team-only option lives in a table that exists today, so it is written, not removed.
      !option.teamOnly && value === inheritedOption(option)
        ? resetFlowValue({ scope, step: id, key: option.key })
        : setFlowValue({ scope, step: id, key: option.key, value }),
    );
  };

  // Reset: every value of this step in the file of the scope goes back to what lies below it.
  const myKeys = Object.keys(config.me.steps[id] ?? {});
  const teamKeys = [
    ...Object.keys(config.team.steps[id] ?? {}),
    ...def.options
      .filter((o) => o.teamOnly && team.steps[id].options[o.key]?.value !== o.default)
      .map((o) => o.key),
  ];
  const resettable = mine ? myKeys : teamKeys;
  const reset = () =>
    run(async () => {
      const done: FlowSaved[] = [];
      for (const key of resettable) {
        const saved = await resetFlowValue({ scope, step: id, key });
        if (!saved) return undefined;
        done.push(saved);
      }
      return joined(done);
    });

  return (
    <PanelFrame panel={id} title={def.name} about={def.about} variant={variant} onClose={onClose}>
      <Contract>{def.contract}</Contract>

      <ApplyTo
        scope={scope}
        onChange={setScope}
        canBeMine={canBeMine}
        why={
          teamView
            ? "You are looking at the team default. Switch to In effect for me to change yours."
            : undefined
        }
        teamValue={
          <>
            The team uses{" "}
            <code className="code-inline rounded-sm bg-muted px-1 py-px text-fg">
              {team.steps[id].teamSkill}
            </code>
            {team.steps[id].origin === "built-in" ? " (built in)." : "."}
          </>
        }
      />

      <PanelSection title="Skill" hint={`The skill that runs ${def.name}.`}>
        {resolved.unresolved && <Warning role="status">{resolved.unresolved.message}</Warning>}
        {mine && resolved.origin === "me" && (
          <p className="flex items-center gap-2 text-fg-muted text-sm">
            <OverrideMark />
          </p>
        )}
        {catalog ? (
          <SkillChoices
            groups={groups}
            value={resolved.skill}
            onPick={pickSkill}
            label={`Skill for ${def.name}`}
            keys={keys}
            disabled={busy}
          />
        ) : (
          <SkillChoicesSkeleton />
        )}
        {catalog && <MoreSkills catalog={catalog} groups={groups} copy />}
        <InstallNote
          skill={skill}
          catalog={catalog}
          who={mine ? "Your agent" : "Everyone's agent"}
        />
      </PanelSection>

      <PanelSection title="Options">
        <OptionRows
          step={def}
          values={resolved.options}
          mine={mine}
          disabled={busy}
          onPick={pickOption}
        />
      </PanelSection>

      <PanelSection title="Actions">
        <SkillActions skill={skill} catalog={catalog} panel={id}>
          {resettable.length > 0 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reset()}>
              {mine ? "Reset to the team's choice" : "Reset to built-in"}
            </Button>
          )}
        </SkillActions>
      </PanelSection>

      {problem && (
        <p role="alert" data-wf="PanelProblem" className="text-danger text-sm">
          {problem}
        </p>
      )}
    </PanelFrame>
  );
}

export function SkillChoicesSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the skills"
      className="flex flex-col gap-1.5"
    >
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}
