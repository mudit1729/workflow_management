// Hooks of the Workdatabase · Files view: list the files, read one, save one, delete one. The
// markdown files are the source of truth, so a save here changes the board: the store
// re-reads the workspace and every view updates through the live stream.
//
// `useWriteWorkspaceFile` follows the other write hooks: a plain async function that shows its
// own toast on failure and resolves to `undefined`. `useDeleteWorkspaceFile` throws instead,
// because its caller (the delete dialog) keeps the dialog open and explains the failure itself.
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./client";
import { firstProblem, isConflictError, isUnprocessableError } from "./error";
import { qk } from "./keys";
import { queryClient } from "./query-client";

export function useWorkspaceFiles() {
  return useQuery({
    queryKey: qk.files(),
    queryFn: () => api.files(),
  });
}

export function useWorkspaceFile(path?: string) {
  return useQuery({
    queryKey: qk.file(path ?? ""),
    queryFn: () => api.file(path as string),
    enabled: !!path,
  });
}

/**
 * After a file write the board, the issue views and the file views must read again, and so must
 * the skills (a file under `skills/` is a skill) and the flow (`workflow.toml` holds it).
 */
export function refreshAfterWrite() {
  void queryClient.invalidateQueries({ queryKey: qk.skills() });
  void queryClient.invalidateQueries({ queryKey: qk.snapshot() });
  void queryClient.invalidateQueries({ queryKey: ["issue"] });
  void queryClient.invalidateQueries({ queryKey: ["library"] });
  void queryClient.invalidateQueries({ queryKey: qk.glossary() });
  void queryClient.invalidateQueries({ queryKey: qk.files() });
  void queryClient.invalidateQueries({ queryKey: ["file"] });
}

/** Save a file. Shows its own toast on failure and resolves to `undefined`. */
export async function writeWorkspaceFile(args: {
  path: string;
  text: string;
  base_rev?: string;
}): Promise<{ rev: string } | undefined> {
  try {
    const result = await api.writeFile(args);
    refreshAfterWrite();
    return result;
  } catch (err) {
    refreshAfterWrite();
    if (isConflictError(err)) {
      toast.warning(`${err.body.reason}. Your save was refused.`, {
        description: "Use Reload to see the new text, or Overwrite to keep yours.",
        duration: 10_000,
      });
    } else if (isUnprocessableError(err)) {
      const { message, hint } = firstProblem(err);
      toast.error(message, hint ? { description: hint } : undefined);
    } else {
      toast.error("Could not save the file", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    }
    return undefined;
  }
}

/** Delete a file. Throws when the server refuses: the caller explains it. */
export async function deleteWorkspaceFile(args: {
  path: string;
  base_rev?: string;
}): Promise<void> {
  try {
    await api.deleteFile(args);
  } finally {
    refreshAfterWrite();
  }
}

export const useWriteWorkspaceFile = () => writeWorkspaceFile;

export const useDeleteWorkspaceFile = () => deleteWorkspaceFile;
