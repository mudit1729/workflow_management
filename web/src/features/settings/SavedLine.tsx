// "Saved to workflow.toml · Undo": the one confirmation of a change (spec F6). It is a line on the
// page, so no toast says it again. After Undo it says "Undone" and leaves nothing to press.
import { Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useSaved } from "./saved";
import type { PanelKey } from "./search";

export function SavedLine({
  step,
  page = "flow",
  className,
}: {
  /** The panel this line is on; a line of another panel stays hidden. */
  step: PanelKey | undefined;
  /** The tab it is on; a line of another tab stays hidden. */
  page?: "flow" | "workspace";
  className?: string;
}) {
  const line = useSaved((s) => s.line);
  const [working, setWorking] = useState(false);
  if (!line || line.page !== page || line.step !== step) return null;
  const { undo } = line;

  const take = async () => {
    if (!undo || working) return;
    setWorking(true);
    try {
      if (await undo()) useSaved.getState().undone(line.id);
    } finally {
      setWorking(false);
    }
  };

  return (
    <SavedLineView
      text={line.text}
      undone={line.undone}
      onUndo={undo ? () => void take() : undefined}
      working={working}
      className={className}
    />
  );
}

/** The line itself, from its words: the page keeps the state, the Kit shows each one. */
export function SavedLineView({
  text,
  undone = false,
  onUndo,
  working = false,
  className,
}: {
  text: string;
  /** The change was taken back: the line says "Undone" and has no button. */
  undone?: boolean;
  /** Takes the change back. Without it there is no Undo. */
  onUndo?: () => void;
  working?: boolean;
  className?: string;
}) {
  return (
    <p
      data-wf="SavedLine"
      role="status"
      className={cn("flex min-w-0 items-center gap-1.5 text-fg-muted text-sm", className)}
    >
      <Check aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-success-text" />
      <span className="min-w-0 truncate">{undone ? "Undone" : text}</span>
      {onUndo && !undone && (
        <>
          <span aria-hidden className="text-fg-faint">
            ·
          </span>
          <button
            type="button"
            onClick={onUndo}
            disabled={working}
            className="shrink-0 cursor-default rounded-sm font-medium text-fg underline-offset-2 hover:underline disabled:opacity-50"
          >
            Undo
          </button>
        </>
      )}
    </p>
  );
}
