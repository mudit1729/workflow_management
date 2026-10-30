// Connect an agent (plan D10): a focused, one-question-per-screen dialog, built like Add work. The
// shell mounts it once and opens it through `openAgent(start?)` in `@/app/shell-store`: the nav's
// "Connect an agent" row, the palette, Switch and Reconnect in the Agent panel, and a Do next step
// that found no agent. Esc closes it, and nothing is lost: a pairing goes on in the background.
import { useCallback, useState } from "react";
import { type AgentStart, type AgentThen, useShell } from "@/app/shell-store";
import { Dialog, DialogContent } from "@/components/ui";
import { useResumeNextStep } from "@/features/codex";
import { ConnectAgentPanel } from "./ConnectAgentPanel";
import { useConnectFlow } from "./useConnectFlow";

/** Fixed height, so the dialog does not jump between screens; the whole screen on a phone. */
export const DIALOG_CLASS = [
  "h-[min(600px,calc(100dvh-64px))] max-w-[520px]",
  "max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none",
  "max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none",
].join(" ");

export function ConnectAgentDialog() {
  const open = useShell((s) => s.agentOpen);
  const start = useShell((s) => s.agentStart);
  const setOpen = useShell((s) => s.setAgentOpen);

  // Each opening starts on its first screen: a new key makes a new session. (State set while
  // rendering is applied before anything is shown.)
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }

  return (
    <ConnectAgentSession key={session} open={open} start={start} onClose={() => setOpen(false)} />
  );
}

function ConnectAgentSession({
  open,
  start,
  onClose,
}: {
  open: boolean;
  start?: AgentStart;
  onClose: () => void;
}) {
  const resume = useResumeNextStep();
  // The last screen closes the dialog and starts the run that Do next step asked for.
  const finish = useCallback(
    (then?: AgentThen) => {
      onClose();
      if (then) resume(then);
    },
    [onClose, resume],
  );
  const flow = useConnectFlow({ start, onFinish: finish });

  // The control that opened the dialog (the nav row, a button), so closing returns the person there.
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title="Connect an agent"
        size="md"
        className={DIALOG_CLASS}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        // The panel puts focus on the first answer itself.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          if (!(opener instanceof HTMLElement) || !opener.isConnected || opener === document.body)
            return;
          e.preventDefault();
          opener.focus({ preventScroll: true });
        }}
      >
        <ConnectAgentPanel flow={flow} />
      </DialogContent>
    </Dialog>
  );
}
