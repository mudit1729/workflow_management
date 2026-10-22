// Ephemeral shell UI state: which overlay is open. Not persisted (prefs live in
// `@/lib/prefs`). Features open shell overlays through the helpers at the bottom,
// e.g. the board toolbar's "New issue" button calls `openNewIssue(groupId)`.
import { create } from "zustand";
import type { GroupId } from "@/gen/types";

interface ShellState {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  newIssueOpen: boolean;
  /** Group preselected in the New issue dialog; falls back to the board group. */
  newIssueGroup?: GroupId;
  devPanelOpen: boolean;
  mobileNavOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setNewIssueOpen: (open: boolean, group?: GroupId) => void;
  setDevPanelOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useShell = create<ShellState>()((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  newIssueOpen: false,
  newIssueGroup: undefined,
  devPanelOpen: false,
  mobileNavOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setNewIssueOpen: (newIssueOpen, group) =>
    set(newIssueOpen ? { newIssueOpen, newIssueGroup: group } : { newIssueOpen }),
  setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));

/** Open the New issue dialog, optionally preselecting a group. */
export function openNewIssue(group?: GroupId) {
  useShell.getState().setNewIssueOpen(true, group);
}

/** Open the command palette. */
export function openCommandPalette() {
  useShell.getState().setPaletteOpen(true);
}

/** Open the keyboard shortcuts dialog. */
export function openShortcuts() {
  useShell.getState().setShortcutsOpen(true);
}
