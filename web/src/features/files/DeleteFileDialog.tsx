// The confirm step before a file is deleted. It says what the delete does to the board, since
// removing a goal.md or _group.md changes more than one file.
import { LoaderCircle } from "lucide-react";
import { Button, Dialog, DialogContent, DialogFooter } from "@/components/ui";
import type { FileContext } from "./context";
import { basename } from "./paths";

export function deleteConsequence(path: string, ctx: FileContext): string {
  const name = basename(path);
  if (name === "goal.md" && ctx.issue) {
    return `“${ctx.issue.title}” stops being an issue, so its card leaves the board. The other files in its folder stay.`;
  }
  if (name === "goal.md") return "The folder stops being an issue. The other files in it stay.";
  if (name === "_group.md") return "The folder becomes an implicit group, named after the folder.";
  if (ctx.library)
    return "The item leaves the library, and issues that cite it show a dangling ref.";
  if (name === "workflow.toml") return "The workspace falls back to its default settings.";
  return "The file is removed from the workspace.";
}

export interface DeleteFileDialogProps {
  open: boolean;
  path: string;
  context: FileContext;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteFileDialog({
  open,
  path,
  context,
  busy = false,
  onCancel,
  onConfirm,
}: DeleteFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent
        size="sm"
        title={`Delete ${basename(path)}?`}
        description={deleteConsequence(path, context)}
        hideClose
      >
        <div data-wf="DeleteFileDialog" className="flex flex-col gap-3">
          <code className="break-all rounded-md border border-border bg-subtle px-2 py-1.5 font-mono text-fg-muted text-sm">
            {path}
          </code>
          <DialogFooter className="mt-0">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={busy}>
              {busy && (
                <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" aria-hidden />
              )}
              Delete file
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
