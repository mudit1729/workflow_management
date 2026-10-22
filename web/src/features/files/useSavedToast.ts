// The toast after a file was written: "Saved goal.md · the board re-read it", with an action that
// opens the screen the change shows on (the board, the library item, the glossary).
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { useSnapshot } from "@/lib/api";
import { useGo } from "@/lib/nav";
import { basename } from "./paths";
import { type SavedTarget, savedCopy, savedTarget } from "./saved";

type Navigate = (o: { to: string }) => Promise<void>;

export interface SavedToast {
  verb: "Saved" | "Created";
  path: string;
  /** The text that was written. */
  text: string;
  description?: string;
}

export function useSavedToast(): (saved: SavedToast) => void {
  const go = useGo();
  const navigate = useNavigate() as unknown as Navigate;
  const libraryDir = useSnapshot().data?.config.library_dir;

  const open = useCallback(
    (target: SavedTarget) => {
      if (target.kind === "glossary") void navigate({ to: "/glossary" });
      else if (target.kind === "library") {
        void (target.id ? go.libraryItem(target.id) : go.library());
      } else void go.board();
    },
    [go, navigate],
  );

  return useCallback(
    ({ verb, path, text, description }) => {
      const target = savedTarget(path, text, libraryDir);
      const copy = savedCopy(target);
      toast.success(`${verb} ${basename(path)} · ${copy.reread}`, {
        description,
        action: { label: copy.action, onClick: () => open(target) },
      });
    },
    [libraryDir, open],
  );
}
