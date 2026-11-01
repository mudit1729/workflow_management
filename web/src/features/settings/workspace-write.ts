// The one setting of the Workspace tab that is written: how long a task's lease lasts. A minimal
// edit of `[leases] minutes` in `workflow.toml` (the TOML line editor keeps every other line), with
// the file's own revision, and a way back: Undo puts the text back as it was.
import { setTomlKey } from "@mock/md/toml-edit";
import { api } from "@/lib/api";

const FILE = "workflow.toml";

export interface LeaseSaved {
  file: string;
  /** Put `workflow.toml` back as it was. Resolves to true when it did. */
  undo: () => Promise<boolean>;
}

/** The file write of `useWriteWorkspaceFile()`: it toasts its own failures and resolves to undefined. */
type Write = (args: {
  path: string;
  text: string;
  base_rev?: string;
}) => Promise<{ rev: string } | undefined>;

/**
 * Set the lease length. Resolves to what a saved line needs, or undefined when the write failed
 * (the write function has said so). Writes nothing when the file already says so.
 */
export async function setLeaseMinutes(
  minutes: number,
  write: Write,
): Promise<LeaseSaved | undefined> {
  const before = await api.file(FILE);
  const text = before.text ?? "";
  const next = setTomlKey(text, "leases", "minutes", minutes);
  if (next === text) return { file: FILE, undo: async () => true };
  const saved = await write({ path: FILE, text: next, base_rev: before.rev });
  if (!saved) return undefined;
  return {
    file: FILE,
    undo: async () => !!(await write({ path: FILE, text, base_rev: saved.rev })),
  };
}
