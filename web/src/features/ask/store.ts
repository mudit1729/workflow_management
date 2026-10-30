// Is the Ask panel open, for which issue, and on which pages? Ephemeral UI state, like the shell's
// overlays. Everything that opens the panel goes through `openAskPanel`: the Ask library button of
// an issue, "Ask about this page" in the library (`openAsk` in `features/library/ask-hook.ts`) and
// the palette. This module is small on purpose: the issue header imports it, and the panel itself
// (`AskPanel`) is a lazy chunk.
import { create } from "zustand";

export interface AskStart {
  /** The issue to ask for. Left out: the open issue, or the person picks one. */
  issue?: string;
  /** Pages to start on (`alias:path`, `#heading` for a section), from "Ask about this page". */
  pages?: string[];
}

interface AskState {
  open: boolean;
  issue?: string;
  pages: string[];
  /** Bumped by every open, so a panel that is already open starts over on the new request. */
  nonce: number;
  show: (start: AskStart) => void;
  close: () => void;
  /** The person chose another issue (or none, to pick again). */
  setIssue: (issue: string | undefined) => void;
}

export const useAsk = create<AskState>()((set) => ({
  open: false,
  pages: [],
  nonce: 0,
  show: ({ issue, pages }) =>
    set((s) => ({ open: true, issue, pages: pages ?? [], nonce: s.nonce + 1 })),
  close: () => set({ open: false }),
  setIssue: (issue) => set({ issue }),
}));

/** Open the Ask panel (spec section 6), on an issue and some pages when they are known. */
export function openAskPanel(start: AskStart = {}): void {
  useAsk.getState().show(start);
}

/** Close it. */
export function closeAskPanel(): void {
  useAsk.getState().close();
}
