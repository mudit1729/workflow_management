// Add a team library by its GitHub link (spec 4.1): paste a link, pick the folder when there are
// several, look at the preview, add. The shell mounts it lazily and opens it through
// `openAddLibrary()` (`@/app/shell-store`); the look is Add work's: one question per screen.
import { useState } from "react";
import { useShell } from "@/app/shell-store";
import { Dialog, DialogContent } from "@/components/ui";
import { AddLibraryPanel } from "./AddLibraryPanel";
import { closeAddLibraryFromSettings, useAddStaysInSettings } from "./from-settings";
import { useAddLibraryFlow } from "./useAddLibraryFlow";

/** Fixed height, so the dialog does not jump between screens; the whole screen on a phone. */
const DIALOG_CLASS = [
  "h-[min(620px,calc(100dvh-64px))] max-w-[600px]",
  "max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none",
  "max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none",
].join(" ");

export function AddTeamLibraryDialog() {
  const open = useShell((s) => s.addLibraryOpen);
  const setOpen = useShell((s) => s.setAddLibraryOpen);
  const stay = useAddStaysInSettings();

  // Each opening starts with an empty field: a new key makes a new session. (State set while
  // rendering is applied before anything is shown.)
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }

  return (
    <AddLibrarySession
      key={session}
      open={open}
      stay={stay}
      onClose={() => {
        closeAddLibraryFromSettings();
        setOpen(false);
      }}
    />
  );
}

function AddLibrarySession({
  open,
  stay,
  onClose,
}: {
  open: boolean;
  stay: boolean;
  onClose: () => void;
}) {
  const flow = useAddLibraryFlow({ onClose, stay });

  // The control that opened the dialog (the nav's button), so closing returns the person there.
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && flow.requestClose()}>
      <DialogContent
        title="Add team library"
        size="md"
        className={DIALOG_CLASS}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        // Nothing is lost by closing, so Esc, the × and a click on the scrim just close, except
        // while the library is being read.
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          flow.requestClose();
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault();
          // A click on a toast is not a click away from the dialog.
          if ((e.target as HTMLElement | null)?.closest?.("[data-sonner-toaster]")) return;
          flow.requestClose();
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
        <AddLibraryPanel flow={flow} />
      </DialogContent>
    </Dialog>
  );
}
