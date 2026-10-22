// Small shared hooks: media queries, layout mode, keyboard shortcuts.
import { useEffect, useRef, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/**
 * Drawer behaviour by viewport (contract §6):
 * - docked:  ≥1600 px, the drawer sits beside the board
 * - overlay: 768–1599 px, the drawer overlays the board as a sheet
 * - mobile:  <768 px, single column; an issue opens as the full page
 */
export type LayoutMode = "docked" | "overlay" | "mobile";
export function useLayoutMode(): LayoutMode {
  const docked = useMediaQuery("(min-width: 1600px)");
  const mobile = useMediaQuery("(max-width: 767px)");
  return docked ? "docked" : mobile ? "mobile" : "overlay";
}

// ---------------------------------------------------------------- hotkeys
//
// Grammar: "mod+k" (⌘ on macOS, Ctrl elsewhere), "j", "?", "[", "Escape", "Enter",
// "g w" (a two-key sequence within 1 s). One global listener; the most recently
// registered enabled binding for a combo wins, so nested views override parents.
// Bindings skip keystrokes in inputs and open dialogs unless told otherwise.

export interface HotkeyOptions {
  enabled?: boolean;
  allowInInputs?: boolean;
  allowInDialogs?: boolean;
  preventDefault?: boolean; // default true
}

interface Binding {
  combo: string;
  handler: (e: KeyboardEvent) => void;
  opts: HotkeyOptions;
  order: number;
}

const bindings = new Set<Binding>();
let order = 0;
let pending: { key: string; at: number } | null = null;
let installed = false;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function keyToken(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  // Shift is implied by printable characters such as "?"; only name it for letters.
  let key = e.key;
  if (key.length === 1) key = key.toLowerCase();
  if (e.shiftKey && /^[a-z]$/.test(key)) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.closest?.("[cmdk-root]") != null
  );
}

function dialogOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
    ) != null
  );
}

function onKeyDown(e: KeyboardEvent) {
  // A handled key stays handled. In particular Radix prevents default on the Escape that
  // dismisses a menu, popover or dialog, and that same press must not also close the drawer.
  if (e.defaultPrevented) return;
  const token = keyToken(e);
  const typing = isTyping(e.target);
  const inDialog = dialogOpen();
  const now = performance.now();
  const seq = pending && now - pending.at < 1000 ? `${pending.key} ${token}` : null;

  const candidates = [...bindings]
    .filter((b) => b.opts.enabled !== false)
    .filter((b) => (typing ? b.opts.allowInInputs : true))
    .filter((b) => (inDialog && !b.combo.startsWith("mod+") ? b.opts.allowInDialogs : true))
    .sort((a, b) => b.order - a.order);

  const hit =
    (seq && candidates.find((b) => b.combo === seq)) || candidates.find((b) => b.combo === token);
  const startsSeq = !typing && candidates.some((b) => b.combo.startsWith(`${token} `));

  if (hit && !(startsSeq && hit.combo === token && !seq)) {
    pending = null;
    if (hit.opts.preventDefault !== false) e.preventDefault();
    hit.handler(e);
    return;
  }
  pending = startsSeq ? { key: token, at: now } : null;
}

export function useHotkey(
  combo: string | string[],
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOptions = {},
) {
  const ref = useRef(handler);
  ref.current = handler;
  const combos = Array.isArray(combo) ? combo : [combo];
  const key = combos.join("|");
  const { enabled, allowInInputs, allowInDialogs, preventDefault } = opts;

  useEffect(() => {
    if (!installed) {
      window.addEventListener("keydown", onKeyDown);
      installed = true;
    }
    const mine: Binding[] = key.split("|").map((c) => ({
      combo: c,
      handler: (e) => ref.current(e),
      opts: { enabled, allowInInputs, allowInDialogs, preventDefault },
      order: ++order,
    }));
    for (const b of mine) bindings.add(b);
    return () => {
      for (const b of mine) bindings.delete(b);
    };
  }, [key, enabled, allowInInputs, allowInDialogs, preventDefault]);
}

/** Display a combo for a Kbd chip: "mod+k" → ["⌘","K"], "g w" → ["G","W"]. */
export function comboKeys(combo: string): string[] {
  return combo
    .split(/[ +]/)
    .map((k) =>
      k === "mod"
        ? isMac
          ? "⌘"
          : "Ctrl"
        : k === "shift"
          ? "⇧"
          : k === "Escape"
            ? "Esc"
            : k === "Enter"
              ? "↵"
              : k.length === 1
                ? k.toUpperCase()
                : k,
    );
}
