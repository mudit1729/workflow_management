// The panel of a custom step, and the form that adds one (spec 5.3, last paragraph). A custom step
// runs a skill after Add work, Plan, Do next step or Hand off. The form writes nothing until Add
// step; the panel of a step that exists writes at once, like the panel of a step of the flow.
import { type KeyboardEvent, useEffect, useState } from "react";
import { Button, Input, Segmented } from "@/components/ui";
import type { FlowAfter } from "@/gen/types";
import {
  addCustomStep,
  type CustomStepPatch,
  FLOW_AFTER,
  type FlowScope,
  flowStep,
  type ResolvedCustom,
  removeCustomStep,
  skillByRef,
  skillChoices,
  skillName,
  skillWords,
  updateCustomStep,
  useFlow,
  usePersonalConfig,
} from "@/lib/api";
import { customKey } from "./labels";
import {
  ApplyTo,
  InstallNote,
  MoreSkills,
  PanelFrame,
  PanelSection,
  type PanelVariant,
  useWriter,
} from "./panel";
import { OverrideMark, Warning } from "./parts";
import { SkillActions } from "./SkillActions";
import { groupsFor, SkillChoices } from "./SkillChoices";
import { SkillChoicesSkeleton } from "./StepPanel";
import { fileWords } from "./saved";

const AFTER_OPTIONS = FLOW_AFTER.map((id) => ({ value: id, label: flowStep(id).name }));
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** Label field: prefilled, saved when it loses focus or on Enter. */
function LabelField({
  value,
  placeholder,
  onCommit,
  disabled,
}: {
  value: string;
  placeholder?: string;
  onCommit?: (label: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const label = draft.trim();
    if (label !== value.trim()) onCommit?.(label);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  return (
    <Input
      aria-label="Label"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={onCommit ? commit : undefined}
      onKeyDown={onKeyDown}
      maxLength={60}
      autoComplete="off"
      spellCheck={false}
    />
  );
}

// ---------------------------------------------------------------- a step that exists

export interface CustomPanelProps {
  id: string;
  variant: PanelVariant;
  onClose: () => void;
  keys?: boolean;
}

export function CustomStepPanel({ id, variant, onClose, keys = true }: CustomPanelProps) {
  const { flow } = useFlow();
  const custom = flow.custom.find((c) => c.id === id);
  // A step that was just added is in the file before it is in the flow: say nothing for a moment.
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!custom)
    return (
      <PanelFrame
        panel={`custom:${id}`}
        title={late ? "Step not found" : "Step"}
        variant={variant}
        onClose={onClose}
      >
        {late && (
          <p className="text-fg-muted text-base">
            There is no custom step called {id}. It may have been removed.
          </p>
        )}
      </PanelFrame>
    );
  return <CustomStepBody custom={custom} variant={variant} onClose={onClose} keys={keys} />;
}

/** The panel of a custom step that is given (the Kit shows one without writing a file). */
export function CustomStepBody({
  custom,
  variant,
  onClose,
  keys,
}: {
  custom: ResolvedCustom;
  variant: PanelVariant;
  onClose: () => void;
  keys: boolean;
}) {
  const { flow, catalog } = useFlow();
  const panel = customKey(custom);
  const { busy, problem, run } = useWriter(panel);
  const scope: FlowScope = custom.origin;
  const skill = skillByRef(catalog, custom.skill);
  const groups = groupsFor(
    skillChoices(catalog, "custom", { exclude: [flow.steps[custom.after].skill] }),
    scope,
  );
  const missing = flow.problems.find((p) => p.id === custom.id && p.kind === "unresolved");

  const patch = (change: CustomStepPatch) =>
    run(() => updateCustomStep({ scope, id: custom.id, ...change }));

  return (
    <PanelFrame
      panel={panel}
      name="CustomStepPanel"
      title={custom.label}
      about={
        custom.origin === "team"
          ? "A team step, kept in workflow.toml. It runs for everyone. Changes here are for everyone, and you cannot turn it off just for yourself."
          : "Only you. It runs after the team's steps at this point."
      }
      variant={variant}
      onClose={onClose}
    >
      {missing && <Warning role="status">{missing.message}</Warning>}

      <p data-wf="AppliesTo" className="text-fg-faint text-xs">
        Applies to: {custom.origin === "team" ? "Everyone" : "Just you"}
      </p>

      <PanelSection title="Label" hint="What the line and the run call this step.">
        <LabelField
          value={custom.label}
          disabled={busy}
          onCommit={(label) => void patch({ label })}
        />
      </PanelSection>

      <PanelSection title="Runs after">
        <Segmented<FlowAfter>
          className="self-start"
          aria-label="Runs after"
          value={custom.after}
          disabled={busy}
          options={AFTER_OPTIONS}
          onChange={(after) => after !== custom.after && void patch({ after })}
        />
      </PanelSection>

      <PanelSection
        title="Must pass"
        hint="A step that must pass stops the run when it fails. Any other is logged and the run goes on."
      >
        <Segmented
          className="self-start"
          aria-label="Must pass"
          value={custom.required ? "yes" : "no"}
          disabled={busy}
          options={YES_NO}
          onChange={(v) =>
            (v === "yes") !== custom.required && void patch({ required: v === "yes" })
          }
        />
      </PanelSection>

      <PanelSection title="Skill">
        {custom.origin === "me" && (
          <p className="flex items-center gap-2 text-sm">
            <OverrideMark>Just you</OverrideMark>
          </p>
        )}
        {catalog ? (
          <SkillChoices
            groups={groups}
            value={custom.skill}
            label={`Skill for ${custom.label}`}
            keys={keys}
            disabled={busy}
            onPick={(ref) => ref !== custom.skill && void patch({ skill: ref })}
          />
        ) : (
          <SkillChoicesSkeleton />
        )}
        {catalog && <MoreSkills catalog={catalog} groups={groups} />}
        <InstallNote skill={skill} catalog={catalog} scope={custom.origin} />
      </PanelSection>

      <PanelSection title="Actions">
        <SkillActions skill={skill} catalog={catalog} panel={panel} scope={scope}>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run(() => removeCustomStep({ scope, id: custom.id }), {
                step: undefined,
                text: (saved) => `Removed ${custom.label} from ${fileWords(saved.file)}`,
              }).then((saved) => saved && onClose())
            }
          >
            {custom.origin === "team" ? "Remove for everyone" : "Remove step"}
          </Button>
        </SkillActions>
      </PanelSection>

      {problem && (
        <p role="alert" className="text-danger text-sm">
          {problem}
        </p>
      )}
    </PanelFrame>
  );
}

// ---------------------------------------------------------------- the form

export interface NewStepPanelProps {
  /** The step the new one follows, from the "+" that was pressed. */
  after: FlowAfter;
  variant: PanelVariant;
  onClose: () => void;
  /** The step was added: open its panel. */
  onAdded: (id: string) => void;
  keys?: boolean;
  /** The page shows the team default alone: the step is the team's and Just me is off. */
  teamView?: boolean;
}

/** The form behind a "+": a skill, a label, must pass, whom it is for. Nothing is written before Add step. */
export function NewStepPanel({
  after: first,
  variant,
  onClose,
  onAdded,
  keys = true,
  teamView = false,
}: NewStepPanelProps) {
  const { flow, catalog } = useFlow();
  const canBeMine = usePersonalConfig().data !== undefined && !teamView;
  const [after, setAfter] = useState<FlowAfter>(first);
  const [skill, setSkill] = useState<string>();
  const [label, setLabel] = useState("");
  const [required, setRequired] = useState(false);
  const [chosen, setScope] = useState<FlowScope>("team");
  const scope: FlowScope = canBeMine ? chosen : "team";
  const { busy, problem, run } = useWriter("new");
  const groups = groupsFor(
    skillChoices(catalog, "custom", { exclude: [flow.steps[after].skill] }),
    scope,
  );
  const picked = skillByRef(catalog, skill ?? "");

  // The "+" that opened the form can change while it is open.
  useEffect(() => setAfter(first), [first]);

  const add = async () => {
    if (!skill) return;
    const text = label.trim();
    const saved = await run(
      () =>
        addCustomStep({
          scope,
          after,
          skill,
          // The default label is the skill's name in words; only a label that differs is written.
          ...(text && text !== skillWords(skillName(skill)) ? { label: text } : {}),
          ...(required ? { required: true } : {}),
        }),
      {
        step: (s) => (s.id ? (`custom:${s.id}` as const) : undefined),
        text: (s) => `Added to ${fileWords(s.file)}`,
      },
    );
    if (saved?.id) onAdded(saved.id);
  };

  // Enter in the label adds the step when a skill is picked.
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (skill && !busy) void add();
  };

  return (
    <PanelFrame
      panel="new"
      name="NewStepPanel"
      title="Add a step"
      about="Runs a skill at a point of the flow. Nothing is saved until you add it."
      variant={variant}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={!skill || busy} onClick={() => void add()}>
            Add step
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!skill && <span className="text-fg-faint text-sm">Pick a skill first.</span>}
        </div>
      }
    >
      <PanelSection title="Runs after">
        <Segmented<FlowAfter>
          className="self-start"
          aria-label="Runs after"
          value={after}
          options={AFTER_OPTIONS}
          onChange={setAfter}
        />
      </PanelSection>

      <ApplyTo
        scope={scope}
        onChange={setScope}
        canBeMine={canBeMine}
        why={
          teamView
            ? "You are looking at the team default. Switch to In effect for me to change yours."
            : undefined
        }
      />

      <PanelSection title="Skill">
        {catalog ? (
          <SkillChoices
            groups={groups}
            value={skill}
            label="Skill for the new step"
            keys={keys}
            onPick={setSkill}
          />
        ) : (
          <SkillChoicesSkeleton />
        )}
        {catalog && <MoreSkills catalog={catalog} groups={groups} />}
        <InstallNote skill={picked} catalog={catalog} scope={scope} />
      </PanelSection>

      <PanelSection
        title="Label"
        hint="Optional. Without one the line says what the skill is called."
      >
        <Input
          aria-label="Label"
          value={label}
          placeholder={skill ? skillWords(skillName(skill)) : "Security check"}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={onEnter}
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
        />
      </PanelSection>

      <PanelSection
        title="Must pass"
        hint="A step that must pass stops the run when it fails. Any other is logged and the run goes on."
      >
        <Segmented
          className="self-start"
          aria-label="Must pass"
          value={required ? "yes" : "no"}
          options={YES_NO}
          onChange={(v) => setRequired(v === "yes")}
        />
      </PanelSection>

      {problem && (
        <p role="alert" className="text-danger text-sm">
          {problem}
        </p>
      )}
    </PanelFrame>
  );
}
