// Global hotkeys (contract §6 Keyboard). Board and drawer keys (j/k, h/l, Enter,
// o, s, /, 1–5, Esc) are registered by those features; this file owns the rest.
// SHORTCUTS is also the source for the ShortcutsDialog.
import { useHotkey, useLayoutMode } from "@/lib/hooks";
import { useGo } from "@/lib/nav";
import { usePrefs } from "@/lib/prefs";
import { useShell } from "./shell-store";

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
      { combos: ["n"], label: "New issue" },
      { combos: ["?"], label: "Show keyboard shortcuts" },
      { combos: ["."], label: "Prototype controls" },
    ],
  },
  {
    title: "Go to",
    items: [
      { combos: ["g w"], label: "Board" },
      { combos: ["g i"], label: "Inbox" },
      { combos: ["g l"], label: "Library" },
      { combos: ["g k"], label: "Component kit" },
    ],
  },
  {
    title: "Board",
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
      { combos: ["1", "5"], label: "Switch tab: Now, Goal, Plan, Log, Files", range: true },
      { combos: ["o"], label: "Open as a full page" },
      { combos: ["Escape"], label: "Close the drawer or dialog" },
    ],
  },
];

/** Registers the shell's global hotkeys. Render once, inside the router. */
export function GlobalShortcuts() {
  const go = useGo();
  const mobile = useLayoutMode() === "mobile";
  const toggleNav = usePrefs((s) => s.toggleNav);
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
  useHotkey("g i", () => go.inbox());
  useHotkey("g l", () => go.library());
  useHotkey("g k", () => go.kit());
  useHotkey("n", () => shell.setNewIssueOpen(true));
  // "?" and "." may close their own overlay, but never open over another dialog.
  useHotkey("?", () => shell.setShortcutsOpen(!shell.shortcutsOpen), {
    allowInDialogs: shell.shortcutsOpen,
  });
  useHotkey(".", () => shell.setDevPanelOpen(!shell.devPanelOpen), {
    allowInDialogs: shell.devPanelOpen,
  });

  return null;
}
