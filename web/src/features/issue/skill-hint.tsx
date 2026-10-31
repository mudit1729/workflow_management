// SkillHint: what an empty state offers when the work can also be done without the dashboard. It
// names the one skill of the workflow plugin that does the job, links to it in Workdatabase ·
// Skills, and gives `codex '<prompt>'` or `claude '<prompt>'`, a command that exists today. It replaces hints that named
// skills the plugin does not have and a CLI that has not been built (hints.test.ts keeps them out).
import type { MouseEvent } from "react";
import { CopyButton } from "@/components/common";
import { skillHref, useSkillsNav } from "@/features/skills/search";
import { type AgentKind, agentName, shellQuote, usePreferredAgent } from "@/lib/api";
import { cn } from "@/lib/cn";

/** The skills of `plugins/workflow/skills`. A hint may name only these. */
export const WF_SKILLS = [
  "using-wf",
  "adding-work",
  "planning-issues",
  "doing-next-step",
  "logging-work",
  "handing-off",
  "checking-status",
  "writing-readable-bulk-text",
  "keeping-a-library",
  "summarizing-codebase",
  "summarizing-work",
  "querying-library",
] as const;

export type WfSkill = (typeof WF_SKILLS)[number];

/**
 * `codex '<prompt>'`: what the Copy button of a hint puts on the clipboard. `claude '<prompt>'` for
 * Claude Code: the agent's kind is also the name of its command.
 */
export function codexAsk(prompt: string, agent: AgentKind = "codex"): string {
  return `${agent} ${shellQuote(prompt)}`;
}

/** The prompts the issue hints hand to the agent, one place so the empty states say the same thing. */
export const ASK = {
  plan: (id: string) => `Plan ${id} with the planning-issues skill.`,
  moreTasks: (id: string) =>
    `Add the missing tasks to the plan of ${id} with the planning-issues skill.`,
  state: (id: string) => `Write current_state.md for ${id} with the handing-off skill.`,
  change: (id: string) => `Log what changed on ${id} with the logging-work skill.`,
  decision: (id: string) => `Log the decision on ${id} with the logging-work skill.`,
  learning: (id: string) => `Log the learning on ${id} with the logging-work skill.`,
  goal: (id: string) =>
    `Write the Context of ${id} in goal.md. Follow the formats of the using-wf skill.`,
  criterion: (id: string) =>
    `Add a success criterion to ${id} in goal.md: one EARS sentence and a verify line. Follow the formats of the using-wf skill.`,
  verify: (id: string, criterion: string) =>
    `Verify ${criterion} of ${id}: run its verify command and record the evidence, with the doing-next-step skill.`,
  decide: (id: string, decision: string, verb: "Accept" | "Reject") =>
    `${verb} ${decision} on ${id}: set its status line, with the logging-work skill.`,
} as const;

/** The skill's name as a link to its page in Workdatabase · Skills. */
export function SkillLink({ skill, className }: { skill: WfSkill; className?: string }) {
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

export interface SkillHintProps {
  skill: WfSkill;
  /** What the agent is asked, one sentence that names the issue. */
  prompt: string;
  /** `start` left-aligns it inside a compact empty state. */
  align?: "center" | "start";
  className?: string;
}

/**
 * "<Agent> does this with the <skill> skill", the prompt it is asked, and a button that copies the
 * `codex '<prompt>'` command (`claude '<prompt>'` for Claude Code, the connected agent or else the
 * last one chosen). The prompt is shown as text that wraps (a long one stays readable); the command
 * it becomes is the button's tooltip and what lands on the clipboard.
 */
export function SkillHint({ skill, prompt, align = "center", className }: SkillHintProps) {
  const agent = usePreferredAgent();
  const name = agentName(agent);
  const command = codexAsk(prompt, agent);
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
        {name} does this with the <SkillLink skill={skill} /> skill:
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
        <CopyButton text={command} label={`Copy ${name} command`} />
      </div>
    </div>
  );
}
