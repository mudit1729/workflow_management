// "Ask library" in the issue header: opens the Ask panel for this issue, or closes it when it is
// already open for it. A button beside Open in Codex and Copy context, the same size; where the
// row is narrow (the container is under 520 px, as Copy context goes icon-only under 440 px) it
// keeps only its icon.
import { Library } from "lucide-react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { closeAskPanel, openAskPanel, useAsk } from "./store";

export const ASK_LIBRARY_HINT =
  "Ask the library a question, in a panel beside this issue. The answer cites its pages, which you can link to the issue or save in its log.";

export function AskLibraryButton({ issueId, className }: { issueId: string; className?: string }) {
  const here = useAsk((s) => s.open && s.issue === issueId);
  return (
    <Tooltip content={ASK_LIBRARY_HINT}>
      <Button
        data-wf="AskLibraryButton"
        variant="secondary"
        aria-label="Ask library"
        aria-pressed={here}
        onClick={() => (here ? closeAskPanel() : openAskPanel({ issue: issueId }))}
        className={cn("@max-[520px]:size-7 @max-[520px]:px-0", className)}
      >
        <Library aria-hidden size={14} strokeWidth={1.75} />
        <span className="@max-[520px]:hidden">Ask library</span>
      </Button>
    </Tooltip>
  );
}
