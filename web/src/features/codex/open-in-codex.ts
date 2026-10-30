// "Open in Codex" from a browser (plan D3, D12). The page cannot start a terminal, so it copies the
// command and says where to paste it. The command follows the agent: `codex '…'` for Codex,
// `claude '…'` for Claude Code, the connected one or else the last one chosen. Do next step is the
// button that starts the agent itself, through the bridge.
import { toast } from "sonner";
import { copyText } from "@/components/common";
import type { IssueSummary } from "@/gen/types";
import { type AgentKind, agentCommand, agentName, preferredAgent } from "@/lib/api";

/** What the codex actions need of an issue. An `IssueSummary` fits. */
export type CodexIssue = Pick<IssueSummary, "id" | "title" | "path"> &
  Partial<Pick<IssueSummary, "status" | "progress">>;

/** Said by the tooltip and the popover, so the real behavior is named wherever the button is. */
export const openInAgentHint = (agent: AgentKind): string =>
  `Copies a ${agent} command to paste in a terminal at the repo root. Do next step runs ${agentName(agent)} for you once it is connected.`;

export interface CopyCodexCommandOptions {
  /**
   * Say so in a toast (default). The Open in Codex popover turns it off: its own line "Command
   * copied" is the confirmation, and one event is announced once.
   */
  toast?: boolean;
  /** Copy the command of this agent. Default: the connected one, else the last one chosen. */
  agent?: AgentKind;
}

/**
 * Copy the command that opens the agent on the issue. Resolves to whether the clipboard took it.
 * From a place without a panel of its own (the card menu, the palette) one toast says what
 * happened; the header's popover says it in its own line and passes `{ toast: false }`.
 */
export async function copyCodexCommand(
  issue: CodexIssue,
  options: CopyCodexCommandOptions = {},
): Promise<boolean> {
  const agent = options.agent ?? preferredAgent();
  const name = agentName(agent);
  const ok = await copyText(agentCommand(agent, issue).command);
  if (options.toast === false) return ok;
  if (ok)
    toast(`Copied the ${name} command`, {
      description: "Paste it in a terminal at the repo root.",
    });
  else
    toast.error(`Could not copy the ${name} command`, {
      description: "The browser blocked clipboard access.",
    });
  return ok;
}
