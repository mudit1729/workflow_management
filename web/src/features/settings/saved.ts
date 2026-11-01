// The one confirmation of a change (spec F6): "Saved to workflow.toml · Undo", a line on the page
// where the change was made, never a toast. The line belongs to the panel that was open when the
// change was saved (`step`), so it goes when another panel opens. The store outlives the page: the
// editor of a skill copy saves, goes back to the panel, and the panel says so.
import { create } from "zustand";
import type { FlowSaved } from "@/lib/api";
import { undoFlowChange } from "@/lib/api";
import type { PanelKey } from "./search";

export interface SavedLine {
  /** Changes with every change, so a second save shows as a new line. */
  id: number;
  /** The tab it was made on: a line of the flow stays off the Workspace tab. */
  page: "flow" | "workspace";
  /** The panel the line belongs to, or undefined for the flow itself (a removed step) and the other tabs. */
  step: PanelKey | undefined;
  /** "Saved to workflow.toml", "Removed Security check". */
  text: string;
  /** Takes the change back. Resolves to true when it did. Undefined: nothing to undo. */
  undo?: () => Promise<boolean>;
  /** The change was taken back: the line says so, without a button. */
  undone?: boolean;
}

interface SavedState {
  line: SavedLine | undefined;
  show: (line: Omit<SavedLine, "id" | "undone" | "page"> & { page?: SavedLine["page"] }) => void;
  undone: (id: number) => void;
  clear: () => void;
}

let next = 0;

export const useSaved = create<SavedState>()((set) => ({
  line: undefined,
  show: (line) => set({ line: { page: "flow", ...line, id: ++next } }),
  undone: (id) => set((s) => (s.line?.id === id ? { line: { ...s.line, undone: true } } : s)),
  clear: () => set({ line: undefined }),
}));

/** Where a flow write went, in the words of the line: `workflow.toml`, `your library.toml`, `skills/x/`. */
export function fileWords(file: string): string {
  return file === "library.toml" ? "your library.toml" : file;
}

/** Show the line for a flow write, with the undo it came with. `text` replaces "Saved to workflow.toml". */
export function showSaved(saved: FlowSaved, step: PanelKey | undefined, text?: string): void {
  useSaved.getState().show({
    step,
    text: text ?? `Saved to ${fileWords(saved.file)}`,
    undo: () => undoFlowChange(saved.undo),
  });
}

/** The line of a write that has no flow token (an edited skill, the leases). */
export function showUndoable(
  text: string,
  step: PanelKey | undefined,
  undo: () => Promise<boolean>,
  page: SavedLine["page"] = "flow",
): void {
  useSaved.getState().show({ step, text, undo, page });
}
