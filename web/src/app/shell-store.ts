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
  devPanelOpen: boolean;
  mobileNavOpen: boolean;
  /** 768–1099 px: the rail is an icon rail; this is the person asking to see it open (an overlay). */
  narrowNavOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setAddWorkOpen: (open: boolean, start?: AddWorkStart) => void;
  setDevPanelOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setNarrowNavOpen: (open: boolean) => void;
}

export const useShell = create<ShellState>()((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  addWorkOpen: false,
  addWorkStart: undefined,
  devPanelOpen: false,
  mobileNavOpen: false,
  narrowNavOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAddWorkOpen: (addWorkOpen, start) =>
    set(addWorkOpen ? { addWorkOpen, addWorkStart: start } : { addWorkOpen }),
  setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setNarrowNavOpen: (narrowNavOpen) => set({ narrowNavOpen }),
}));

/** Open the Add work flow, optionally on the group or issue path and with a group preselected. */
export function openAddWork(start?: AddWorkStart) {
  useShell.getState().setAddWorkOpen(true, start);
}

/** Open the command palette. */
export function openCommandPalette() {
  useShell.getState().setPaletteOpen(true);
}

/** Open the keyboard shortcuts dialog. */
export function openShortcuts() {
  useShell.getState().setShortcutsOpen(true);
}
