// Giving focus back when a shell overlay (the palette, the shortcuts list) closes. Radix Dialog
// returns focus to its trigger on close, and these two have none: they open from a key or from a
// button elsewhere in the shell. Without this focus drops to <body>, and the keyboard or screen
// reader user loses their place (a board card, the drawer, the sidebar's search button).
//
// The overlay remembers what had focus when it opened. On close, focus goes back there, unless the
// overlay sent the person somewhere (it opened an issue, a page or another dialog): then the new
// place decides where focus goes, and taking it back would steal it.
import { useCallback, useEffect, useRef } from "react";
import { useShell } from "./shell-store";

/** What of an element focus needs: the DOM's `HTMLElement` fits. */
export interface Focusable {
  isConnected: boolean;
  focus: (options?: { preventScroll?: boolean }) => void;
}

export interface ReturnFocusState {
  /** Called when the overlay opens, with the element that has focus at that moment. */
  remember: (active: Focusable | null) => void;
  /** The overlay sent the person somewhere else: do not take focus back on close. */
  release: () => void;
  /** Radix's `onCloseAutoFocus`: gives focus back, or leaves Radix's default alone. */
  onCloseAutoFocus: (event: { preventDefault: () => void }) => void;
}

/** The logic, apart from React and the DOM, so a test can drive it with plain objects. */
export function createReturnFocus(): ReturnFocusState {
  let opener: Focusable | null = null;
  let keep = true;
  return {
    remember(active) {
      opener = active;
      keep = true;
    },
    release() {
      keep = false;
    },
    onCloseAutoFocus(event) {
      const target = opener;
      opener = null;
      // Nothing to go back to (the opener is gone, or nothing had focus): Radix's default stands.
      if (!keep || !target?.isConnected) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
    },
  };
}

type Overlay = "paletteOpen" | "shortcutsOpen";

/**
 * For the overlay of the shell store flag `overlay`. The store tells the moment it opens, before
 * the page re-renders, so the element that has focus then is still the one that opened it.
 */
export function useReturnFocus(overlay: Overlay): ReturnFocusState {
  const state = useRef<ReturnFocusState>(undefined);
  state.current ??= createReturnFocus();
  const current = state.current;

  useEffect(
    () =>
      useShell.subscribe((now, before) => {
        if (!now[overlay] || before[overlay]) return;
        const active = document.activeElement;
        current.remember(active instanceof HTMLElement && active !== document.body ? active : null);
      }),
    [overlay, current],
  );

  return {
    remember: current.remember,
    release: useCallback(() => current.release(), [current]),
    onCloseAutoFocus: useCallback((e) => current.onCloseAutoFocus(e), [current]),
  };
}
