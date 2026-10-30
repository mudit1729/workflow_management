// "Open in Codex" from a browser (plan D3). The page cannot start a terminal, so it copies the
// command and says where to paste it. A local wf daemon would start Codex itself, later.
import { toast } from "sonner";
import { copyText } from "@/components/common";
import type { IssueSummary } from "@/gen/types";
import { codexCommand } from "@/lib/api";

/** What the codex actions need of an issue. An `IssueSummary` fits. */
export type CodexIssue = Pick<IssueSummary, "id" | "title" | "path"> &
  Partial<Pick<IssueSummary, "status" | "progress">>;

/** Said by the tooltip and the popover, so the real behavior is named wherever the button is. */
export const OPEN_IN_CODEX_HINT =
  "Copies a codex command to paste in a terminal at the repo root. Later, a local wf daemon will start Codex itself.";

export interface CopyCodexCommandOptions {
  /**
   * Say so in a toast (default). The Open in Codex popover turns it off: its own line "Command
   * copied" is the confirmation, and one event is announced once.
   */
  toast?: boolean;
}

/**
 * Copy the command that opens Codex on the issue. Resolves to whether the clipboard took it. From
 * a place without a panel of its own (the card menu, the palette) one toast says what happened;
 * the header's popover says it in its own line and passes `{ toast: false }`.
 */
export async function copyCodexCommand(
  issue: CodexIssue,
  options: CopyCodexCommandOptions = {},
): Promise<boolean> {
  const ok = await copyText(codexCommand(issue).command);
  if (options.toast === false) return ok;
  if (ok)
    toast("Copied the Codex command", { description: "Paste it in a terminal at the repo root." });
  else
    toast.error("Could not copy the Codex command", {
      description: "The browser blocked clipboard access.",
    });
  return ok;
}
