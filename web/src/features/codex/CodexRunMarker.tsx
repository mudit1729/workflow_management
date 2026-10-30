// The mark a board card shows while Codex works on its issue: the Codex author tile, the task id
// and one word for the phase ("T-3 Claiming"). It takes the place of the group path in the card's
// id row, so the card keeps its height and its right-hand marks stay where they are.
import { Check } from "lucide-react";
import { AuthorChip } from "@/components/common";
import type { CodexRun } from "@/lib/api";
import { cn } from "@/lib/cn";
import { runLine, runWord } from "./run-copy";

export interface CodexRunMarkerProps {
  run: CodexRun;
  className?: string;
}

export function CodexRunMarker({ run, className }: CodexRunMarkerProps) {
  const running = run.status === "running";
  const done = run.status === "done";
  return (
    <span
      data-wf="CodexRunMarker"
      data-status={run.status}
      title={`${runLine(run)} · @${run.by}`}
      className={cn("flex min-w-0 items-center gap-1.5 text-fg-muted", className)}
    >
      <span className="relative flex shrink-0">
        <AuthorChip handle={run.by} variant="avatar" size="xs" />
        {running && (
          <span
            aria-hidden
            className="absolute -inset-px animate-pulse rounded-[4px] ring-1 ring-accent/50"
          />
        )}
      </span>
      <span className="shrink-0 font-mono text-fg tabular">{run.task}</span>
      <span className="flex min-w-0 items-center gap-1 truncate">
        {done && (
          <Check aria-hidden size={12} strokeWidth={1.75} className="shrink-0 text-status-done" />
        )}
        <span className="truncate">{runWord(run)}</span>
      </span>
      <span role="status" className="sr-only">
        {runLine(run)}
      </span>
    </span>
  );
}
