// SkillHint: what an empty state offers when the work can also be done without the dashboard. It
// names the one skill that does the job, links to it in Workdatabase · Skills, and gives
// `codex '<prompt>'`, a command that exists today. It replaces hints that named skills the plugin
// does not have and a CLI that has not been built (hints.test.ts keeps them out).
//
// "The skill that does the job" is the skill of a step of the flow (skills-flow-spec 4.3): the
// built-in one unless the team or the person chose another in Settings. A caller asks
// `useFlowSkill(step)` (or `useFlow()`) for the reference and passes it to the hint and to the
// prompt; the prompts below default to the built-in skill of their step.
import type { MouseEvent } from "react";
import { CopyButton } from "@/components/common";
import { skillHref, useSkillsNav } from "@/features/skills/search";
import type { FlowStepId } from "@/gen/types";
import {
  BUILTIN_FLOW,
  BUILTIN_SKILL_NAMES,
  BUILTIN_SKILLS,
  flowOptionValue,
  type ResolvedFlow,
  shellQuote,
  useFlow,
  useFlowSkill,
} from "@/lib/api";
import { cn } from "@/lib/cn";

/** The built-in skills of `plugins/workflow/skills`. The default of every hint and prompt. */
export const WF_SKILLS = BUILTIN_SKILL_NAMES;

/**
 * A skill reference: a built-in name (`planning-issues`), `ws:<name>`, `<alias>:<name>` or
 * `me:<name>`. A prompt and a link name it by the reference, as `wf-env.sh flow` prints it.
 */
export type WfSkill = string;

/** `codex '<prompt>'`: what the Copy button of a hint puts on the clipboard. */
export function codexAsk(prompt: string): string {
  return `codex ${shellQuote(prompt)}`;
}

/** What the Add work step does once the issues are written (`[flow.add] then`). */
const AFTER_ADDING: Record<string, string> = {
  plan: " Then plan every new issue.",
  stop: " Do not offer to plan them.",
};

/** The Add work option `then` in effect, for `ASK.addWork`. */
export const addThen = (flow: ResolvedFlow): string =>
  String(flowOptionValue(flow, "add", "then") ?? "offer");

/**
 * The prompts the issue hints hand to Codex, one place so the empty states say the same thing. Each
 * takes the skill in effect for its step as its last argument (a reference; the built-in skill of
 * the step when left out).
 */
export const ASK = {
  addWork: (scope?: string, skill: WfSkill = BUILTIN_SKILLS.add, then = "offer") =>
    `Add work${scope ? ` to ${scope}` : ""} with the ${skill} skill. Ask me for the outcome.${AFTER_ADDING[then] ?? ""}`,
  plan: (id: string, skill: WfSkill = BUILTIN_SKILLS.plan) => `Plan ${id} with the ${skill} skill.`,
  moreTasks: (id: string, skill: WfSkill = BUILTIN_SKILLS.plan) =>
    `Add the missing tasks to the plan of ${id} with the ${skill} skill.`,
  state: (id: string, skill: WfSkill = BUILTIN_SKILLS.handoff) =>
    `Write current_state.md for ${id} with the ${skill} skill.`,
  change: (id: string, skill: WfSkill = BUILTIN_SKILLS.log) =>
    `Log what changed on ${id} with the ${skill} skill.`,
  decision: (id: string, skill: WfSkill = BUILTIN_SKILLS.log) =>
    `Log the decision on ${id} with the ${skill} skill.`,
  learning: (id: string, skill: WfSkill = BUILTIN_SKILLS.log) =>
    `Log the learning on ${id} with the ${skill} skill.`,
  // The formats are the bootstrap skill's, not a step's: nothing swaps it.
  goal: (id: string) =>
    `Write the Context of ${id} in goal.md. Follow the formats of the using-wf skill.`,
  criterion: (id: string) =>
    `Add a success criterion to ${id} in goal.md: one EARS sentence and a verify line. Follow the formats of the using-wf skill.`,
  verify: (id: string, criterion: string, skill: WfSkill = BUILTIN_SKILLS.do) =>
    `Verify ${criterion} of ${id}: run its verify command and record the evidence, with the ${skill} skill.`,
  decide: (
    id: string,
    decision: string,
    verb: "Accept" | "Reject",
    skill: WfSkill = BUILTIN_SKILLS.log,
  ) => `${verb} ${decision} on ${id}: set its status line, with the ${skill} skill.`,
} as const;

/** The skill a hint or link names: a reference, or the step whose skill the flow runs. */
export type SkillTarget =
  | { skill: WfSkill; step?: undefined }
  | { skill?: undefined; step: FlowStepId };

/**
 * The skill as a link to its page in Workdatabase · Skills. Give a `skill` reference, or a `step`
 * to name the skill the flow runs for it (`planning-issues` unless Settings chose another). The
 * link goes by the reference, so two skills of one name in different sources never collide; the
 * text is the reference too: `planning-issues`, or `ws:acme-planning` for a skill of the workspace.
 */
export function SkillLink(props: SkillTarget & { className?: string }) {
  return props.step ? (
    <StepSkillLink step={props.step} className={props.className} />
  ) : (
    <SkillAnchor skill={props.skill} className={props.className} />
  );
}

function StepSkillLink({ step, className }: { step: FlowStepId; className?: string }) {
  return <SkillAnchor skill={useFlowSkill(step)} className={className} />;
}

function SkillAnchor({ skill, className }: { skill: WfSkill; className?: string }) {
  const { select } = useSkillsNav();
  const follow = (e: MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    // Let the browser handle new-tab clicks.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    select(skill);
  };
  return (
    <a
      data-wf="SkillLink"
      href={skillHref(skill)}
      onClick={follow}
      title={`Open the ${skill} skill`}
      className={cn(
        "code-inline rounded-sm bg-muted px-1 py-px text-fg underline decoration-border-strong decoration-1 underline-offset-[3px] transition-colors duration-100 hover:decoration-fg-muted",
        className,
      )}
    >
      {skill}
    </a>
  );
}

export type SkillHintProps = SkillTarget & {
  /**
   * What Codex is asked, one sentence that names the issue. A function gets the skill in effect
   * and the flow, so a hint for a step names the skill the flow runs: `(skill) => ASK.plan(id,
   * skill)`. A hint for a bare reference gets the built-in flow.
   */
  prompt: string | ((skill: WfSkill, flow: ResolvedFlow) => string);
  /** `start` left-aligns it inside a compact empty state. */
  align?: "center" | "start";
  className?: string;
};

/**
 * "Codex does this with the <skill> skill", the prompt it is asked, and a button that copies the
 * `codex '<prompt>'` command. The prompt is shown as text that wraps (a long one stays readable);
 * the command it becomes is the button's tooltip and what lands on the clipboard.
 */
export function SkillHint(props: SkillHintProps) {
  const { prompt, align, className } = props;
  return props.step ? (
    <StepSkillHint step={props.step} prompt={prompt} align={align} className={className} />
  ) : (
    <HintView skill={props.skill} prompt={prompt} align={align} className={className} />
  );
}

function StepSkillHint({ step, prompt, align, className }: SkillHintProps & { step: FlowStepId }) {
  const { flow } = useFlow();
  return (
    <HintView
      skill={flow.steps[step].skill}
      flow={flow}
      prompt={prompt}
      align={align}
      className={className}
    />
  );
}

function HintView({
  skill,
  flow = BUILTIN_FLOW,
  prompt: given,
  align = "center",
  className,
}: {
  skill: WfSkill;
  flow?: ResolvedFlow;
  prompt: SkillHintProps["prompt"];
  align?: SkillHintProps["align"];
  className?: string;
}) {
  const prompt = typeof given === "function" ? given(skill, flow) : given;
  const command = codexAsk(prompt);
  return (
    <div
      data-wf="SkillHint"
      className={cn(
        "flex min-w-0 max-w-full flex-col gap-1.5",
        align === "start" ? "items-start" : "items-center",
        className,
      )}
    >
      <p className="text-fg-muted text-sm">
        Codex does this with the <SkillAnchor skill={skill} /> skill:
      </p>
      {/* An absolute width: a percentage would not hold inside an empty state that sizes itself by
          its content, and a long prompt would push the Copy button out of the panel. */}
      <div className="flex w-[min(24rem,calc(100vw-4.5rem))] max-w-full items-start gap-2 rounded-md border border-border bg-subtle py-1 pr-0.5 pl-2.5 text-left">
        <p
          data-wf="SkillPrompt"
          title={command}
          className="min-w-0 flex-1 select-text py-0.5 text-fg text-sm leading-snug"
        >
          {prompt}
        </p>
        <CopyButton text={command} label="Copy Codex command" />
      </div>
    </div>
  );
}
