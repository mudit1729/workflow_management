// Kit entries of Settings (src/features/settings): the Skills flow page, its cards in every state,
// the panel of a step for Everyone and for Just me, the form that adds a custom step, the two
// screens of Edit a copy and the editor with its checks. The cards and the flow are drawn from a
// made-up flow (`fixtures.ts`), so each state is there without writing a file; the panels and the
// editor are the real ones, on the workspace's own files.
import { useState } from "react";
import {
  AddStepButton,
  AgentTab,
  CopyPanel,
  CustomCard,
  CustomStepBody,
  FlowMap,
  NewStepPanel,
  OptionRows,
  SavedLineView,
  SettingsView,
  SkillChecks,
  SkillChoices,
  StepCard,
  StepPanel,
  WorkspaceTab,
} from "@/features/settings";
import {
  FIXTURE_CATALOG,
  FIXTURE_FLOW,
  FIXTURE_ME,
  FIXTURE_TEAM,
  FIXTURE_TEAM_FLOW,
} from "@/features/settings/fixtures";
import {
  allSkills,
  BUILTIN_FLOW,
  flowStep,
  type ResolvedCustom,
  resolveFlow,
  skillChoices,
  skillExists,
  useSkills,
  validateSkill,
} from "@/lib/api";
import { entry, type KitEntry, Loading, Sandbox, V } from "../kit-ui";

const SRC = "src/features/settings";

const noop = () => {};

/** The fixture with one custom step, so it fits in a row on a page of modest width. */
const SECURITY = FIXTURE_TEAM.custom["security-check"];
const ROW_FLOW = resolveFlow({
  team: { ...FIXTURE_TEAM, custom: SECURITY ? { "security-check": SECURITY } : {} },
  me: { ...FIXTURE_ME, custom: {} },
  exists: skillExists(FIXTURE_CATALOG),
});

// ---------------------------------------------------------------- SettingsView

function SettingsViewBody() {
  return (
    <>
      <V
        label="Skills flow · the built-in flow"
        note="Four steps in a row, Log under Do next step, a + in each gap and after Hand off, Status and Writing style below. The page is as wide as the frame; 1440 px of window gives the cards 230 px each."
        fill
        height={640}
      >
        <Sandbox quiet path="/settings/flow">
          <SettingsView page="flow" />
        </Sandbox>
      </V>
      <V
        label="Skills flow · the Plan panel open"
        note="The panel keeps the flow in view. With less room than four cards need, the flow becomes a list."
        fill
        height={760}
      >
        <Sandbox quiet path="/settings/flow?step=plan">
          <SettingsView page="flow" />
        </Sandbox>
      </V>
      <V label="phone · the flow" width={390} height={760}>
        <Sandbox quiet path="/settings/flow">
          <SettingsView page="flow" />
        </Sandbox>
      </V>
      <V
        label="phone · the Plan panel"
        note="Under 900 px the panel is a screen of its own, with a way back to the flow."
        width={390}
        height={760}
      >
        <Sandbox quiet path="/settings/flow?step=plan">
          <SettingsView page="flow" />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- FlowMap

function FlowMapBody() {
  const props = { catalog: FIXTURE_CATALOG, selected: undefined, onSelect: noop, onAdd: noop };
  return (
    <>
      <V label="the built-in flow" width={1100}>
        <FlowMap {...props} flow={BUILTIN_FLOW} mine layout="row" />
      </V>
      <V
        label="in effect for me"
        note="Plan uses my skill over the team's, Do next step has two overrides, Status names a skill that is not there (the built-in runs), and Security check must pass."
        width={1100}
      >
        <FlowMap {...props} flow={ROW_FLOW} mine layout="row" selected="plan" />
      </V>
      <V
        label="team default"
        note="My choices are left out; so is the step that is mine."
        width={1100}
      >
        <FlowMap {...props} flow={FIXTURE_TEAM_FLOW} mine={false} layout="list" />
      </V>
      <V label="the form's + is pressed" width={1100}>
        <FlowMap {...props} flow={BUILTIN_FLOW} mine layout="row" adding="plan" />
      </V>
      <V
        label="list · under 640 px"
        note="Down arrows, the + between items, custom steps indented under the line."
        width={390}
      >
        <FlowMap
          {...props}
          flow={FIXTURE_FLOW}
          mine
          layout="list"
          selected="custom:security-check"
        />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- StepCard

const CARD_W = 220;

function StepCardBody() {
  const card = (
    flow: typeof FIXTURE_FLOW,
    id: keyof typeof FIXTURE_FLOW.steps,
    extra: { selected?: boolean; compact?: boolean; overrides?: boolean } = {},
  ) => (
    <StepCard
      step={flow.steps[id]}
      catalog={FIXTURE_CATALOG}
      onSelect={noop}
      className="w-full"
      {...extra}
    />
  );
  return (
    <>
      <V
        label="built-in"
        note="No flow table anywhere: the skill that ships with the plugin."
        width={CARD_W}
      >
        {card(BUILTIN_FLOW, "plan")}
      </V>
      <V label="team skill" note="This workspace's skill, chosen for everyone." width={CARD_W}>
        {card(FIXTURE_TEAM_FLOW, "plan")}
      </V>
      <V
        label="yours"
        note="My skill, with the dot that says it is mine over the team's."
        width={CARD_W}
      >
        {card(FIXTURE_FLOW, "plan")}
      </V>
      <V
        label="override · options only"
        note="The team's skill stays; one option is mine."
        width={CARD_W}
      >
        {card(FIXTURE_FLOW, "do")}
      </V>
      <V
        label="unresolved"
        note="The reference is gone: the built-in skill runs, and the card says so."
        width={CARD_W}
      >
        {card(FIXTURE_FLOW, "status")}
      </V>
      <V label="selected" width={CARD_W}>
        {card(BUILTIN_FLOW, "do", { selected: true })}
      </V>
      <V label="Log · smaller, under Do next step" width={CARD_W}>
        {card(BUILTIN_FLOW, "log", { compact: true })}
      </V>
    </>
  );
}

// ---------------------------------------------------------------- CustomCard

function CustomCardBody() {
  const custom = (id: string): ResolvedCustom => {
    const c = FIXTURE_FLOW.custom.find((x) => x.id === id);
    if (!c) throw new Error(`no fixture step ${id}`);
    return c;
  };
  const unresolved: ResolvedCustom = {
    ...custom("changelog"),
    id: "audit",
    label: "Audit log",
    skill: "platform:auditing",
    alias: "platform",
    source: "library",
    unresolved: true,
  };
  const show = (c: ResolvedCustom, extra: { selected?: boolean; problem?: string } = {}) => (
    <CustomCard
      custom={c}
      catalog={FIXTURE_CATALOG}
      onSelect={noop}
      className="w-full"
      {...extra}
    />
  );
  return (
    <>
      <V label="optional" note="The run goes on when it fails, and logs it." width={190}>
        {show(custom("changelog"))}
      </V>
      <V label="must pass" note="A failing step stops the run." width={190}>
        {show(custom("security-check"))}
      </V>
      <V
        label="just you"
        note="A step of my own: it runs after the team's at this point."
        width={190}
      >
        {show(custom("notify-me"))}
      </V>
      <V label="unresolved" width={190}>
        {show(unresolved, {
          problem: "platform:auditing is not in the team library platform. The step does not run.",
        })}
      </V>
      <V label="selected" width={190}>
        {show(custom("security-check"), { selected: true })}
      </V>
    </>
  );
}

// ---------------------------------------------------------------- AddStepButton

function AddStepButtonBody() {
  return (
    <>
      <V label="quiet" note="Always there, between two steps and after Hand off." width={120}>
        <div className="flex h-10 items-center justify-center">
          <AddStepButton after="plan" afterName="Plan" onAdd={noop} />
        </div>
      </V>
      <V label="its form is open" width={120}>
        <div className="flex h-10 items-center justify-center">
          <AddStepButton after="plan" afterName="Plan" pressed onAdd={noop} />
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SkillChoices

function SkillChoicesBody() {
  const [plan, setPlan] = useState("ws:acme-planning");
  const [custom, setCustom] = useState<string>();
  return (
    <>
      <V
        label="a step · grouped by where the skills live"
        note="Built-in first, then this workspace, each team library, yours. A skill that fails the rules says so. A click, Enter or a number key picks and saves; the arrows move focus."
        width={440}
      >
        <SkillChoices
          groups={skillChoices(FIXTURE_CATALOG, "plan")}
          value={plan}
          onPick={setPlan}
          label="Skill for Plan"
          keys={false}
        />
      </V>
      <V label="a custom step · nothing picked yet" width={440}>
        <SkillChoices
          groups={skillChoices(FIXTURE_CATALOG, "custom")}
          value={custom}
          onPick={setCustom}
          label="Skill for the new step"
          keys={false}
        />
      </V>
      <V label="while a write is under way" width={440}>
        <SkillChoices
          groups={skillChoices(FIXTURE_CATALOG, "plan").slice(0, 2)}
          value="planning-issues"
          onPick={noop}
          label="Skill for Plan"
          keys={false}
          disabled
        />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- OptionRows

function OptionRowsBody() {
  const plan = FIXTURE_FLOW.steps.plan;
  const doStep = FIXTURE_FLOW.steps.do;
  const handoff = FIXTURE_FLOW.steps.handoff;
  return (
    <>
      <V label="Plan · Everyone" width={440}>
        <OptionRows step={flowStep("plan")} values={plan.options} mine={false} onPick={noop} />
      </V>
      <V
        label="Do next step · Just me"
        note="The commit option is mine and says so; the team's choice for the first stays."
        width={440}
      >
        <OptionRows step={flowStep("do")} values={doStep.options} mine onPick={noop} />
      </V>
      <V
        label="Hand off · Just me"
        note="The bundle's size is the team's: shown, and off."
        width={440}
      >
        <OptionRows step={flowStep("handoff")} values={handoff.options} mine onPick={noop} />
      </V>
      <V label="a step without options" width={440}>
        <OptionRows step={flowStep("log")} values={{}} mine={false} onPick={noop} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- StepPanel

function StepPanelBody() {
  return (
    <>
      <V
        label="Plan · Everyone"
        note="Writes workflow.toml. The skills are the live catalog: the built-in one, plus any skill of this workspace, a team library or yours."
        width={440}
        height={780}
      >
        <Sandbox quiet path="/settings/flow?step=plan">
          <StepPanel step="plan" variant="pane" onClose={noop} initialScope="team" keys={false} />
        </Sandbox>
      </V>
      <V
        label="Plan · Just me"
        note="Writes your library.toml, and says what the team uses."
        width={440}
        height={780}
      >
        <Sandbox quiet path="/settings/flow?step=plan">
          <StepPanel step="plan" variant="pane" onClose={noop} initialScope="me" keys={false} />
        </Sandbox>
      </V>
      <V
        label="Hand off · Everyone"
        note="Team settings are options here."
        width={440}
        height={780}
      >
        <Sandbox quiet path="/settings/flow?step=handoff">
          <StepPanel
            step="handoff"
            variant="pane"
            onClose={noop}
            initialScope="team"
            keys={false}
          />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- custom step

function CustomStepBodyFrames() {
  const custom = FIXTURE_FLOW.custom.find((c) => c.id === "security-check") as ResolvedCustom;
  return (
    <V
      label="a team step that must pass"
      note="Label, the step it follows, must pass, the skill, and Remove step. Removing says so in the saved line, with Undo."
      width={440}
      height={780}
    >
      <Sandbox quiet path="/settings/flow?step=custom:security-check">
        <CustomStepBody custom={custom} variant="pane" onClose={noop} keys={false} />
      </Sandbox>
    </V>
  );
}

function NewStepPanelBody() {
  return (
    <>
      <V
        label="after Do next step"
        note="Nothing is written until Add step."
        width={440}
        height={780}
      >
        <Sandbox quiet path="/settings/flow?step=new&after=do">
          <NewStepPanel after="do" variant="pane" onClose={noop} onAdded={noop} keys={false} />
        </Sandbox>
      </V>
      <V label="phone" width={390} height={780}>
        <Sandbox quiet path="/settings/flow?step=new&after=do">
          <NewStepPanel after="do" variant="screen" onClose={noop} onAdded={noop} keys={false} />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- CopyPanel

function WithPlanSkill({
  children,
}: {
  children: (skill: ReturnType<typeof allSkills>[number]) => React.ReactNode;
}) {
  const catalog = useSkills().data;
  const skill = allSkills(catalog).find((s) => s.ref === "planning-issues");
  if (!skill) return <Loading height={200} />;
  return <>{children(skill)}</>;
}

function CopyPanelBody() {
  return (
    <>
      <V label="1 · where the copy lives" note="Two buttons; the number keys pick." width={540}>
        <Sandbox quiet path="/settings/flow?step=plan">
          <WithPlanSkill>
            {(skill) => <CopyPanel skill={skill} forPanel="plan" onClose={noop} onDone={noop} />}
          </WithPlanSkill>
        </Sandbox>
      </V>
      <V
        label="2 · its name"
        note="Prefilled with the workspace's prefix, taken with Enter."
        width={540}
      >
        <Sandbox quiet path="/settings/flow?step=plan">
          <WithPlanSkill>
            {(skill) => (
              <CopyPanel
                skill={skill}
                forPanel="plan"
                onClose={noop}
                onDone={noop}
                startAt="name"
              />
            )}
          </WithPlanSkill>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SkillEditorPage

const EDIT_COPY =
  "/settings/flow/edit?skill=planning-issues&to=ws&name=wf-planning-issues&for=plan";

function SkillEditorBody() {
  return (
    <>
      <V
        label="a copy of Plan's skill"
        note="The editor of the Files view with the rules of check-skills.mjs beside it, applied as you type. Save writes the folder and points Plan at the copy."
        fill
        height={640}
      >
        <Sandbox quiet path={EDIT_COPY}>
          <SettingsView page="edit" />
        </Sandbox>
      </V>
      <V label="phone · the checks are a summary above the editor" width={390} height={640}>
        <Sandbox quiet path={EDIT_COPY}>
          <SettingsView page="edit" />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SkillChecks

function SkillChecksBody() {
  const bad = "---\nname: x-y\ndescription: Does a thing. Avoid it.\nowner: me\n---\n\nBody.\n";
  return (
    <>
      <V label="passes" width={280}>
        <SkillChecks problems={[]} />
      </V>
      <V label="problems · with the line of each" width={280}>
        <SkillChecks problems={validateSkill(bad, "x-y")} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SavedLine

function SavedLineBody() {
  return (
    <>
      <V
        label="saved"
        note="The one confirmation of a change: a line on the page, no toast."
        width={360}
      >
        <SavedLineView text="Saved to workflow.toml" onUndo={noop} />
      </V>
      <V label="yours" width={360}>
        <SavedLineView text="Saved to your library.toml" onUndo={noop} />
      </V>
      <V label="undone" width={360}>
        <SavedLineView text="Saved to workflow.toml" undone onUndo={noop} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- the other tabs

function AgentTabBody() {
  return (
    <V
      label="before the agent connection exists"
      note="The connect button, a line that the connection comes with round 2, and what the flow needs installed."
      width={720}
      height={560}
    >
      <Sandbox quiet path="/settings/agent">
        <AgentTab />
      </Sandbox>
    </V>
  );
}

function WorkspaceTabBody() {
  return (
    <V label="leases and lint" width={720} height={600}>
      <Sandbox quiet path="/settings/workspace">
        <WorkspaceTab />
      </Sandbox>
    </V>
  );
}

export const settingsEntries: KitEntry[] = [
  entry(
    "Settings",
    "SettingsView",
    `${SRC}/SettingsView.tsx`,
    "Which skill runs each step of the work is a decision of the team and of each person, so it has a page of its own: the flow, clickable, with the tabs of the other settings beside it.",
    SettingsViewBody,
  ),
  entry(
    "Settings",
    "FlowMap",
    `${SRC}/FlowMap.tsx`,
    "The flow is drawn as it runs, step after step with the custom steps where they run, so a person sees what a swap changes before making it.",
    FlowMapBody,
  ),
  entry(
    "Settings",
    "StepCard",
    `${SRC}/StepCard.tsx`,
    "One step, one glance: the skill in mono, where it lives, whose choice it is and what its options say; a warning when the reference no longer resolves.",
    StepCardBody,
  ),
  entry(
    "Settings",
    "CustomCard",
    `${SRC}/StepCard.tsx`,
    "A step that is added, not built in, is smaller and dashed; it says when it must pass and when it is only yours.",
    CustomCardBody,
  ),
  entry(
    "Settings",
    "AddStepButton",
    `${SRC}/StepCard.tsx`,
    "Inserting a step is one quiet click at the point where it will run.",
    AddStepButtonBody,
  ),
  entry(
    "Settings",
    "StepPanel",
    `${SRC}/StepPanel.tsx`,
    "A click on a step is a decision, so the panel offers all of it at once: whom it applies to, the skill, the options, and what to do with the skill, each saved as soon as it is picked.",
    StepPanelBody,
  ),
  entry(
    "Settings",
    "SkillChoices",
    `${SRC}/SkillChoices.tsx`,
    "Picking a skill is a choice among a few, so they are numbered buttons, grouped by where they live, with the ones that break the rules marked.",
    SkillChoicesBody,
  ),
  entry(
    "Settings",
    "OptionRows",
    `${SRC}/OptionRows.tsx`,
    "Every option of a step is two or three buttons; the team's settings are shown to a person who cannot change them, and say so.",
    OptionRowsBody,
  ),
  entry(
    "Settings",
    "CustomStepPanel",
    `${SRC}/CustomPanel.tsx`,
    "A custom step is changed in the file that holds it, so its panel has the label, the step it follows, must pass and the skill, and a way to take the step out.",
    CustomStepBodyFrames,
  ),
  entry(
    "Settings",
    "NewStepPanel",
    `${SRC}/CustomPanel.tsx`,
    "Adding a step is a form, because it has four parts; nothing is saved until the person presses Add step.",
    NewStepPanelBody,
  ),
  entry(
    "Settings",
    "CopyPanel",
    `${SRC}/CopyDialog.tsx`,
    "A built-in skill cannot be edited, so a change starts with a copy: where it lives and what it is called, two questions of buttons.",
    CopyPanelBody,
  ),
  entry(
    "Settings",
    "SkillEditorPage",
    `${SRC}/SkillEditor.tsx`,
    "A copy is only worth making if it still passes the skill rules, so the editor checks the text as it is typed and says which line is wrong.",
    SkillEditorBody,
  ),
  entry(
    "Settings",
    "SkillChecks",
    `${SRC}/SkillChecks.tsx`,
    "The rules of check-skills.mjs, as a list a person can read while editing.",
    SkillChecksBody,
  ),
  entry(
    "Settings",
    "SavedLine",
    `${SRC}/SavedLine.tsx`,
    "A change is confirmed once, in the place where it was made, and can be taken back from there.",
    SavedLineBody,
  ),
  entry(
    "Settings",
    "AgentTab",
    `${SRC}/AgentTab.tsx`,
    "An agent can only run the skills it has installed, so the page that will hold the agent's connection already lists what the flow needs, with the commands.",
    AgentTabBody,
  ),
  entry(
    "Settings",
    "WorkspaceTab",
    `${SRC}/WorkspaceTab.tsx`,
    "The few settings of the workspace itself: its name, how long a claim lasts, and which lint rules are off.",
    WorkspaceTabBody,
  ),
];
