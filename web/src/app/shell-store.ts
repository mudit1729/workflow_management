// Ephemeral shell UI state: which overlay is open. Not persisted (prefs live in
// `@/lib/prefs`). Features open shell overlays through the helpers at the bottom,
// e.g. the board toolbar's "Add work" button calls `openAddWork({ group })`.
import { create } from "zustand";
import type { GroupId } from "@/gen/types";

/** Where the Add work flow starts. Nothing preselected starts it at the first question. */
export interface AddWorkStart {
  /** Start on the group path or on the single-issue path. */
  kind?: "group" | "issue";
  /** The group preselected as the place (the parent of a new group). Default: the board group. */
  group?: GroupId;
}

interface ShellState {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  /** The Add work flow (plan D6) is open. */
  addWorkOpen: boolean;
  addWorkStart?: AddWorkStart;
  /** Legacy: the New issue dialog, until the Add work flow replaces it. */
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
  setAddWorkOpen: (open: boolean, start?: AddWorkStart) => void;
  setNewIssueOpen: (open: boolean, group?: GroupId) => void;
  setNewGroupOpen: (open: boolean, parent?: GroupId) => void;
  setDevPanelOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setNarrowNavOpen: (open: boolean) => void;
}

export const useShell = create<ShellState>()((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  addWorkOpen: false,
  addWorkStart: undefined,
  newIssueOpen: false,
  newIssueGroup: undefined,
  newGroupOpen: false,
  newGroupParent: undefined,
  devPanelOpen: false,
  mobileNavOpen: false,
  narrowNavOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAddWorkOpen: (addWorkOpen, start) =>
    set(addWorkOpen ? { addWorkOpen, addWorkStart: start } : { addWorkOpen }),
  setNewIssueOpen: (newIssueOpen, group) =>
    set(newIssueOpen ? { newIssueOpen, newIssueGroup: group } : { newIssueOpen }),
  setNewGroupOpen: (newGroupOpen, parent) =>
    set(newGroupOpen ? { newGroupOpen, newGroupParent: parent } : { newGroupOpen }),
  setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setNarrowNavOpen: (narrowNavOpen) => set({ narrowNavOpen }),
}));

/** Open the Add work flow, optionally on the group or issue path and with a group preselected. */
export function openAddWork(start?: AddWorkStart) {
  useShell.getState().setAddWorkOpen(true, start);
}

/** Open the New issue dialog, optionally preselecting a group. Add work replaces it. */
export function openNewIssue(group?: GroupId) {
  useShell.getState().setNewIssueOpen(true, group);
}

/** Open the New group dialog, optionally preselecting the parent. Add work replaces it. */
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
