// Global hotkeys (contract §6 Keyboard). Board and drawer keys (j/k, h/l, Enter,
// o, s, /, 1–8, Esc) are registered by those features; this file owns the rest.
// SHORTCUTS is also the source for the ShortcutsDialog.
//
// Go to: `g w` Workflow · Board, `g l` (or `g d`) Library, `g p` Personal library, `g t` Team
// libraries, `g g` Glossary (a page of the workspace library), `g f` Files, `g s` Skills, `g k` Kit. `n` opens Add work. There is no inbox (plan D5): what needs
// you is a filter of the board.

import { useNavigate } from "@tanstack/react-router";
import { useFilesNav } from "@/features/files";
import { useHotkey, useLayoutMode } from "@/lib/hooks";
import { useGo } from "@/lib/nav";
import { openAddWork, useShell } from "./shell-store";
import { useNavRail } from "./useNavRail";

export interface ShortcutDef {
  /** One or more combos in `useHotkey` grammar; several render as "A or B". */
  combos: string[];
  label: string;
  /** Render combos as a range ("1–5") instead of alternatives. */
  range?: boolean;
}

export interface ShortcutSection {
  title: string;
  items: ShortcutDef[];
}

export const SHORTCUTS: ShortcutSection[] = [
  {
    title: "General",
    items: [
      { combos: ["mod+k"], label: "Search or run a command" },
      { combos: ["mod+b", "["], label: "Collapse or expand the sidebar" },
      { combos: ["n"], label: "Add work" },
      { combos: ["?"], label: "Show keyboard shortcuts" },
      { combos: ["."], label: "Prototype controls" },
    ],
  },
  {
    title: "Go to",
    items: [
      { combos: ["g w"], label: "Workflow · Board" },
      { combos: ["g l", "g d"], label: "Library" },
      { combos: ["g p"], label: "Library · Personal" },
      { combos: ["g t"], label: "Library · Team libraries" },
      { combos: ["g g"], label: "Library · Glossary" },
      { combos: ["g f"], label: "Library · Files" },
      { combos: ["g s"], label: "Library · Skills" },
      { combos: ["g k"], label: "Kit" },
    ],
  },
  {
    title: "Workflow · Board",
    items: [
      { combos: ["j", "k"], label: "Next or previous card" },
      { combos: ["h", "l"], label: "Previous or next column" },
      { combos: ["Enter"], label: "Open the issue in the drawer" },
      { combos: ["o"], label: "Open the issue as a full page" },
      { combos: ["s"], label: "Change status" },
      { combos: ["/"], label: "Filter the board" },
    ],
  },
  {
    title: "Issue",
    items: [
      {
        combos: ["1", "8"],
        label: "Switch tab: Now, Goal, Criteria, Plan, Log, Git, CI, Files",
        range: true,
      },
      { combos: ["o"], label: "Open as a full page" },
      { combos: ["Escape"], label: "Close the drawer or dialog" },
    ],
  },
  {
    title: "Library · Pages",
    items: [
      { combos: ["["], label: "Previous page" },
      { combos: ["]"], label: "Next page" },
      { combos: ["/"], label: "Search the libraries" },
    ],
  },
  {
    title: "Library · Files",
    items: [
      { combos: ["/"], label: "Filter the file tree" },
      { combos: ["mod+s", "mod+Enter"], label: "Save the file you are editing" },
      { combos: ["Escape"], label: "Cancel editing" },
    ],
  },
];

/** Registers the shell's global hotkeys. Render once, inside the router. */
export function GlobalShortcuts() {
  const go = useGo();
  const navigate = useNavigate();
  const files = useFilesNav();
  const mobile = useLayoutMode() === "mobile";
  const toggleNav = useNavRail().toggle;
  const shell = useShell();

  useHotkey("mod+k", () => shell.setPaletteOpen(!shell.paletteOpen), {
    allowInInputs: true,
    allowInDialogs: true,
  });
  useHotkey(["mod+b", "["], () => {
    if (mobile) shell.setMobileNavOpen(!shell.mobileNavOpen);
    else toggleNav();
  });
  useHotkey("g w", () => go.board());
  useHotkey(["g d", "g l"], () => go.library());
  useHotkey("g p", () => void navigate({ to: "/lib/me" }));
  useHotkey("g t", () => void navigate({ to: "/lib/t" }));
  useHotkey("g g", () => void navigate({ to: "/glossary" }));
  useHotkey("g f", () => files.open());
  useHotkey("g s", () => void navigate({ to: "/skills" }));
  useHotkey("g k", () => go.kit());
  useHotkey("n", () => openAddWork());
  // "?" and "." may close their own overlay, but never open over another dialog.
  useHotkey("?", () => shell.setShortcutsOpen(!shell.shortcutsOpen), {
    allowInDialogs: shell.shortcutsOpen,
  });
  useHotkey(".", () => shell.setDevPanelOpen(!shell.devPanelOpen), {
    allowInDialogs: shell.devPanelOpen,
  });

  return null;
}
