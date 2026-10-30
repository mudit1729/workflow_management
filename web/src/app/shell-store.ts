// Ephemeral shell UI state: which overlay is open. Not persisted (prefs live in
// `@/lib/prefs`). Features open shell overlays through the helpers at the bottom,
// e.g. the board toolbar's "Add work" button calls `openAddWork({ group })`.
import { create } from "zustand";
import type { GroupId, IssueId } from "@/gen/types";
import type { AgentKind, CodexRunKind } from "@/lib/api";

/** Where the Add work flow starts. Nothing preselected starts it at the first question. */
export interface AddWorkStart {
  /** Start on the group path or on the single-issue path. */
  kind?: "group" | "issue";
  /** The group preselected as the place (the parent of a new group). Default: the board group. */
  group?: GroupId;
}

/** The run a Do next step asked for before it found no agent: it starts once one is connected. */
export interface AgentThen {
  issueId: IssueId;
  kind: CodexRunKind;
}

/** Where the connect flow (plan D10) starts. Nothing preselected starts it at "Which agent?". */
export interface AgentStart {
  /** Connect this agent and skip the first question (Switch to…, Reconnect). */
  agent?: AgentKind;
  /** Start this run when the agent is connected: the flow was opened by Do next step. */
  then?: AgentThen;
}

interface ShellState {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  /** The Add work flow (plan D6) is open. */
  addWorkOpen: boolean;
  addWorkStart?: AddWorkStart;
  /** The connect flow (plan D10) is open. */
  agentOpen: boolean;
  /** The Agent panel (plan D11) is open. It shares `agentStart`: the run waits there too. */
  agentPanelOpen: boolean;
  agentStart?: AgentStart;
  devPanelOpen: boolean;
  mobileNavOpen: boolean;
  /** 768–1099 px: the rail is an icon rail; this is the person asking to see it open (an overlay). */
  narrowNavOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setAddWorkOpen: (open: boolean, start?: AddWorkStart) => void;
  setAgentOpen: (open: boolean, start?: AgentStart) => void;
  setAgentPanelOpen: (open: boolean, start?: Pick<AgentStart, "then">) => void;
  setDevPanelOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setNarrowNavOpen: (open: boolean) => void;
}

export const useShell = create<ShellState>()((set) => ({
  paletteOpen: false,
  shortcutsOpen: false,
  addWorkOpen: false,
  addWorkStart: undefined,
  agentOpen: false,
  agentPanelOpen: false,
  agentStart: undefined,
  devPanelOpen: false,
  mobileNavOpen: false,
  narrowNavOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAddWorkOpen: (addWorkOpen, start) =>
    set(addWorkOpen ? { addWorkOpen, addWorkStart: start } : { addWorkOpen }),
  // The flow and the panel never show together: opening one closes the other.
  setAgentOpen: (agentOpen, start) =>
    set(agentOpen ? { agentOpen, agentPanelOpen: false, agentStart: start } : { agentOpen }),
  setAgentPanelOpen: (agentPanelOpen, start) =>
    set(
      agentPanelOpen ? { agentPanelOpen, agentOpen: false, agentStart: start } : { agentPanelOpen },
    ),
  setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setNarrowNavOpen: (narrowNavOpen) => set({ narrowNavOpen }),
}));

/** Open the Add work flow, optionally on the group or issue path and with a group preselected. */
export function openAddWork(start?: AddWorkStart) {
  useShell.getState().setAddWorkOpen(true, start);
}

/**
 * Open the connect flow: Which agent?, Run this in the repo, Done. `start.agent` skips the first
 * question; `start.then` is the run to start when the agent is connected.
 */
export function openAgent(start?: AgentStart) {
  useShell.getState().setAgentOpen(true, start);
}

/** Open the Agent panel: what is connected, the recent runs, Switch and Disconnect. */
export function openAgentPanel(start?: Pick<AgentStart, "then">) {
  useShell.getState().setAgentPanelOpen(true, start);
}

/** Open the command palette. */
export function openCommandPalette() {
  useShell.getState().setPaletteOpen(true);
}

/** Open the keyboard shortcuts dialog. */
export function openShortcuts() {
  useShell.getState().setShortcutsOpen(true);
}
