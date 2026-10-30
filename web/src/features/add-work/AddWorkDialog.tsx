// + Add work (plan D6): a focused, one-question-per-screen dialog. The shell mounts it once and
// opens it through `openAddWork(start?)` in `@/app/shell-store`. Buttons come first, then
// multiple choice, then a dropdown; a field is for the one thing nothing else can capture.
import { useRef, useState } from "react";
import { type AddWorkStart, useShell } from "@/app/shell-store";
import { Button, Dialog, DialogContent, DialogFooter } from "@/components/ui";
import { AddWorkPanel } from "./AddWorkPanel";
import { useAddWorkFlow } from "./useAddWorkFlow";

/** Fixed height, so the dialog does not jump between screens; the whole screen on a phone. */
export const DIALOG_CLASS = [
  "h-[min(640px,calc(100dvh-64px))] max-w-[600px]",
  "max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none",
  "max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none",
].join(" ");

const PANEL = '[data-wf="AddWorkPanel"]';

export function AddWorkDialog() {
  const open = useShell((s) => s.addWorkOpen);
  const start = useShell((s) => s.addWorkStart);
  const setOpen = useShell((s) => s.setAddWorkOpen);

  // Each opening starts with empty answers: a new key makes a new session. (State set while
  // rendering is applied before anything is shown.)
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }

  return <AddWorkSession key={session} open={open} start={start} onClose={() => setOpen(false)} />;
}

function AddWorkSession({
  open,
  start,
  onClose,
}: {
  open: boolean;
  start?: AddWorkStart;
  onClose: () => void;
}) {
  const flow = useAddWorkFlow({ start, onClose });

  // The control that opened the dialog (the board's button), so closing returns the person there.
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );

  // "Discard this draft?" takes focus away; "Keep editing" (and Esc on it) gives it back to the
  // control the person was in, so they can go on typing or pressing Enter.
  const returnTo = useRef<HTMLElement | null>(null);
  const requestClose = () => {
    const at = document.activeElement;
    const inside = at instanceof HTMLElement && !at.matches(PANEL) && at.closest(PANEL);
    returnTo.current = inside ? at : null;
    flow.requestClose();
  };
  const returnFocus = () => {
    if (!open) return;
    const back = returnTo.current;
    const target =
      back?.isConnected && !back.hasAttribute("disabled")
        ? back
        : (document.querySelector<HTMLElement>(`${PANEL} [data-autofocus]:not(:disabled)`) ??
          document.querySelector<HTMLElement>(PANEL));
    target?.focus({ preventScroll: true });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
        <DialogContent
          title="Add work"
          size="md"
          className={DIALOG_CLASS}
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
          // Esc, the × and a click on the scrim ask first when there are answers to lose. The
          // title field of a proposal is the exception: Esc there only ends the edit.
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            if ((e.target as HTMLElement | null)?.closest?.("[data-local-esc]")) return;
            requestClose();
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            // A click on a toast is not a click away from the dialog.
            if ((e.target as HTMLElement | null)?.closest?.("[data-sonner-toaster]")) return;
            requestClose();
          }}
          onInteractOutside={(e) => e.preventDefault()}
          // The panel puts focus on the first answer itself.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            if (!(opener instanceof HTMLElement) || !opener.isConnected || opener === document.body)
              return;
            e.preventDefault();
            opener.focus({ preventScroll: true });
          }}
        >
          <AddWorkPanel flow={flow} />
        </DialogContent>
      </Dialog>
      <DiscardDialog
        open={open && flow.confirming}
        onKeepEditing={flow.keepEditing}
        onDiscard={flow.discard}
        onReturnFocus={returnFocus}
      />
    </>
  );
}

/** "Discard this draft?" — asked when Esc or the × would throw answers away. */
export function DiscardDialog({
  open,
  onKeepEditing,
  onDiscard,
  onReturnFocus,
}: {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  /** Where focus goes when the question closes; without it Radix puts it back on the page. */
  onReturnFocus?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onKeepEditing()}>
      <DialogContent
        size="sm"
        title="Discard this draft?"
        description="Your answers are lost if you close now."
        hideClose
        onCloseAutoFocus={(e) => {
          if (!onReturnFocus) return;
          e.preventDefault();
          onReturnFocus();
        }}
      >
        <div data-wf="DiscardDialog">
          <DialogFooter>
            <Button variant="ghost" onClick={onKeepEditing}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={onDiscard}>
              Discard
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
