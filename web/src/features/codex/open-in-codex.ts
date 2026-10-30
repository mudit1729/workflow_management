// "Open in Codex" from a browser (plan D3). The page cannot start a terminal, so it copies the
// command and says where to paste it. With the local wf daemon the same button starts Codex itself.
import { toast } from "sonner";
import { copyText } from "@/components/common";
import type { IssueSummary } from "@/gen/types";
import { codexCommand } from "@/lib/api";

/** What the codex actions need of an issue. An `IssueSummary` fits. */
export type CodexIssue = Pick<IssueSummary, "id" | "title" | "path"> &
  Partial<Pick<IssueSummary, "status" | "progress">>;

/** Said by the tooltip and the popover, so the real behavior is named wherever the button is. */
export const OPEN_IN_CODEX_HINT =
  "Copies a codex command to paste in a terminal at the repo root. With the local wf daemon, this starts Codex directly.";

/**
 * Copy the command that opens Codex on the issue, and say so. Resolves to whether the clipboard
 * took it. The toast is the same wherever the action starts: header, popover or card menu.
 */
export async function copyCodexCommand(issue: CodexIssue): Promise<boolean> {
  const ok = await copyText(codexCommand(issue).command);
  if (ok)
    toast("Copied the Codex command", { description: "Paste it in a terminal at the repo root." });
  else
    toast.error("Could not copy the Codex command", {
      description: "The browser blocked clipboard access.",
    });
  return ok;
}
