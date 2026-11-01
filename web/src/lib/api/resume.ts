// The resume prompt: the one sentence that tells Codex (or any agent) to pick an issue up. It is
// defined once, in `plugins/workflow/skills/using-wf/references/format.md` section 15, and used
// verbatim by the "Open in Codex" button, the context bundle's last line and the README. Pure
// text, so the mock server (`mock/context.ts`) and the hooks share it.
import type { IssueSummary } from "@/gen/types";
import { BUILTIN_SKILLS } from "./flow";
import type { AgentKind } from "./types";

/** What the prompt needs of an issue. An `IssueSummary` fits. */
export type ResumeIssue = Pick<IssueSummary, "id" | "title" | "path">;

/** Wrap text in single quotes for a POSIX shell; a single quote inside becomes `'\''`. */
export const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;

/**
 * `Work on <id> "<title>" in <issue path>. Read current_state.md first, then use the wf skills
 * (doing-next-step).` The path is the issue folder relative to the workspace. `skill` is the Do
 * next step skill in effect (a reference, `wf-env.sh flow do`); with the built-in skill the
 * sentence is word for word the one of format.md section 15.
 */
export function resumePrompt(issue: ResumeIssue, skill: string = BUILTIN_SKILLS.do): string {
  return `Work on ${issue.id} "${issue.title}" in ${issue.path}. Read current_state.md first, then use the wf skills (${skill}).`;
}

/**
 * `codex '<prompt>'`: the interactive form that "Open in Codex" copies. For Claude Code it is
 * `claude '<prompt>'`: the agent's kind is also the name of its command. `skill` is the Do next
 * step skill in effect; left out, the built-in one.
 */
export function resumeCommand(
  issue: ResumeIssue,
  agent: AgentKind = "codex",
  skill?: string,
): string {
  return `${agent} ${shellQuote(resumePrompt(issue, skill))}`;
}
