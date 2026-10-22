// "Discard unsaved changes?": shown when something would drop an open draft, whether a route
// change the router blocked or the Back button of an inline editor. No window.confirm.
import { Button, Dialog, DialogContent, DialogFooter } from "@/components/ui";

export interface DiscardDialogProps {
  open: boolean;
  /** File name shown in the message. */
  name: string;
  onKeep: () => void;
  onDiscard: () => void;
}

export function DiscardDialog({ open, name, onKeep, onDiscard }: DiscardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onKeep()}>
      <DialogContent
        size="sm"
        title="Discard unsaved changes?"
        description={`Your edits to ${name} are not saved.`}
        hideClose
      >
        <div data-wf="DiscardDialog">
          <DialogFooter className="mt-2">
            <Button variant="secondary" onClick={onKeep}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={onDiscard}>
              Discard changes
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
