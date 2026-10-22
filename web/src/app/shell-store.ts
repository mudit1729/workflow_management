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
  newGroupOpen: boolean;
  /** Parent preselected in the New group dialog; falls back to the board group. */
  newGroupParent?: GroupId;
  devPanelOpen: boolean;
  mobileNavOpen: boolean;
  /** 768–1099 px: the rail is an icon rail; this is the person asking to see it open (an overlay). */
  narrowNavOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setNewIssueOpen: (open: boolean, group?: GroupId) => void;
  setNewGroupOpen: (open: boolean, parent?: GroupId) => void;
  setDevPanelOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setNarrowNavOpen: (open: boolean) => void;
}

export const useShell = create<ShellState>()((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  newIssueOpen: false,
  newIssueGroup: undefined,
  newGroupOpen: false,
  newGroupParent: undefined,
  devPanelOpen: false,
  mobileNavOpen: false,
  narrowNavOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setNewIssueOpen: (newIssueOpen, group) =>
    set(newIssueOpen ? { newIssueOpen, newIssueGroup: group } : { newIssueOpen }),
  setNewGroupOpen: (newGroupOpen, parent) =>
    set(newGroupOpen ? { newGroupOpen, newGroupParent: parent } : { newGroupOpen }),
  setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setNarrowNavOpen: (narrowNavOpen) => set({ narrowNavOpen }),
}));

/** Open the New issue dialog, optionally preselecting a group. */
export function openNewIssue(group?: GroupId) {
  useShell.getState().setNewIssueOpen(true, group);
}

/** Open the New group dialog, optionally preselecting the parent group. */
export function openNewGroup(parent?: GroupId) {
  useShell.getState().setNewGroupOpen(true, parent);
}

/** Open the command palette. */
export function openCommandPalette() {
  useShell.getState().setPaletteOpen(true);
}

/** Open the keyboard shortcuts dialog. */
export function openShortcuts() {
  useShell.getState().setShortcutsOpen(true);
}
