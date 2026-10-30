// The resume prompt: the one sentence that tells Codex (or any agent) to pick an issue up. It is
// defined once, in `plugins/workflow/skills/using-wf/references/format.md` section 15, and used
// verbatim by the "Open in Codex" button, the context bundle's last line and the README. Pure
// text, so the mock server (`mock/context.ts`) and the hooks share it.
import type { IssueSummary } from "@/gen/types";

/** What the prompt needs of an issue. An `IssueSummary` fits. */
export type ResumeIssue = Pick<IssueSummary, "id" | "title" | "path">;

/** Wrap text in single quotes for a POSIX shell; a single quote inside becomes `'\''`. */
export const shellQuote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`;

/**
 * `Work on <id> "<title>" in <issue path>. Read current_state.md first, then use the wf skills
 * (doing-next-step).` The path is the issue folder relative to the workspace.
 */
export function resumePrompt(issue: ResumeIssue): string {
  return `Work on ${issue.id} "${issue.title}" in ${issue.path}. Read current_state.md first, then use the wf skills (doing-next-step).`;
}

/** `codex '<prompt>'`: the interactive form that "Open in Codex" copies. */
export function resumeCommand(issue: ResumeIssue): string {
  return `codex ${shellQuote(resumePrompt(issue))}`;
}
