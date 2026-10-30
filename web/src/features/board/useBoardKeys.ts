// Board keyboard model (contract §6): j/k cards, h/l columns, Enter drawer,
// o full page, s move menu, Esc closes the drawer. Roving tabindex: one card is
// the tab stop; arrow-like keys move DOM focus between cards.
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IssueId, IssueStatus } from "@/gen/types";
import { useHotkey } from "@/lib/hooks";
import { useCloseIssue, useOpenIssue, useOpenIssueId } from "@/lib/nav";

/** One navigable column: its cards top to bottom. */
export interface NavColumn {
  status: IssueStatus;
  ids: IssueId[];
}

export interface MenuRequest {
  id: IssueId;
  nonce: number;
}

/** What a card inside a board needs from the board. Null for standalone cards (Kit). */
export interface BoardCardApi {
  /** The card that holds tabIndex 0. */
  tabStopId: IssueId | null;
  /** The issue open in the drawer. */
  selectedId?: IssueId;
  /** Titles of the selected group below the root; cards show paths relative to it. */
  basePath: string[];
  /** Set by `s`: the card with this id opens its Move menu, then clears the request. */
  menuRequest: MenuRequest | null;
  clearMenuRequest: () => void;
  setFocusedId: (id: IssueId) => void;
  /**
   * Make `id` the tab stop and move DOM focus to it once it renders. With `status`,
   * wait until the card shows in that column: a move remounts the card, and focus
   * set on the old copy would be lost.
   */
  focusCard: (id: IssueId, status?: IssueStatus) => void;
}

export const BoardCardContext = createContext<BoardCardApi | null>(null);

const CARD_SELECTOR = '[data-wf="IssueCard"]';
/** The rail a folded column leaves behind. */
const RAIL_SELECTOR = (status: IssueStatus) => `[data-wf="FoldedColumn"][data-status="${status}"]`;

/** The last kind of input: the card footer and the focus ring follow it, so one card is open. */
export type BoardInput = "keyboard" | "pointer";

/** Tracks whether the keyboard or the pointer was used last. Real pointer moves only: browsers
 * also fire a still "move" after a scroll, which must not undo a key press. */
function useLastInput(enabled: boolean): BoardInput | undefined {
  const [input, setInput] = useState<BoardInput>();
  useEffect(() => {
    if (!enabled) return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      setInput("keyboard");
    };
    const move = (e: PointerEvent) => {
      if (e.type === "pointermove" && e.movementX === 0 && e.movementY === 0) return;
      setInput("pointer");
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerdown", move, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerdown", move, true);
    };
  }, [enabled]);
  return enabled ? input : undefined;
}

function findCard(id: IssueId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${CARD_SELECTOR}[data-issue-id="${CSS.escape(id)}"]`);
}

function isInteractive(el: Element | null): boolean {
  if (!el || el === document.body) return false;
  return (
    el.closest("a, button, input, textarea, select, [role='menuitem'], [contenteditable]") != null
  );
}

/** One quiet flash on a rail that just received a card (the same fade as a live update). */
function pulse(el: HTMLElement) {
  el.classList.remove("wf-flash");
  void el.offsetWidth; // restart the animation when it is pulsed twice in a row
  el.classList.add("wf-flash");
  window.setTimeout(() => el.classList.remove("wf-flash"), 1300);
}

export function useBoardKeys(columns: NavColumn[], enabled = true) {
  const openIssue = useOpenIssue();
  const closeIssue = useCloseIssue();
  const openId = useOpenIssueId();
  const [focusedId, setFocusedId] = useState<IssueId | null>(null);
  const [menuRequest, setMenuRequest] = useState<MenuRequest | null>(null);
  const pending = useRef<IssueId | null>(null);
  const input = useLastInput(enabled);

  const locate = useCallback(
    (id: IssueId | null) => {
      if (!id) return null;
      for (let col = 0; col < columns.length; col++) {
        const row = columns[col].ids.indexOf(id);
        if (row !== -1) return { col, row };
      }
      return null;
    },
    [columns],
  );

  // The tab stop: the focused card if still visible, else the open issue, else the first card.
  const tabStopId = useMemo(() => {
    if (locate(focusedId)) return focusedId;
    if (locate(openId ?? null)) return openId ?? null;
    return columns.find((c) => c.ids.length > 0)?.ids[0] ?? null;
  }, [columns, focusedId, openId, locate]);

  // Follow the drawer: opening an issue makes its card the keyboard anchor.
  useEffect(() => {
    if (openId) setFocusedId(openId);
  }, [openId]);

  const focusCard = useCallback((id: IssueId, status?: IssueStatus) => {
    setFocusedId(id);
    pending.current = id;
    let tries = 0;
    const tick = () => {
      if (pending.current !== id) return;
      const card = findCard(id);
      const target = card?.querySelector<HTMLElement>("[data-card-link]");
      if (card && target && (!status || card.dataset.status === status)) {
        target.focus({ preventScroll: true });
        card.scrollIntoView({ block: "nearest", inline: "nearest" });
        pending.current = null;
        return;
      }
      // A card moved into a folded column (Backlog, Done) is not rendered anywhere. Keep
      // the person's place: focus the column's rail, whose label says where the card went.
      if (status && !card) {
        const rail = document.querySelector<HTMLElement>(RAIL_SELECTOR(status));
        if (rail) {
          rail.focus({ preventScroll: true });
          rail.scrollIntoView({ block: "nearest", inline: "nearest" });
          pulse(rail);
          pending.current = null;
          return;
        }
      }
      // Virtualized columns and optimistic moves render a frame or two later.
      if (++tries < 30) requestAnimationFrame(tick);
      else pending.current = null;
    };
    requestAnimationFrame(tick);
  }, []);

  const clearMenuRequest = useCallback(() => setMenuRequest(null), []);

  const step = useCallback(
    (dCol: number, dRow: number) => {
      // From outside the board (page body, drawer), the first key lands on the
      // keyboard anchor instead of skipping past it.
      if (tabStopId && !document.activeElement?.closest(CARD_SELECTOR)) {
        focusCard(tabStopId);
        return;
      }
      const here = locate(tabStopId);
      if (!here) {
        const first = columns.find((c) => c.ids.length > 0)?.ids[0];
        if (first) focusCard(first);
        return;
      }
      if (dRow !== 0) {
        const ids = columns[here.col].ids;
        const row = Math.max(0, Math.min(ids.length - 1, here.row + dRow));
        focusCard(ids[row]);
        return;
      }
      // h/l: the nearest non-empty column in that direction, same row when possible.
      for (let col = here.col + dCol; col >= 0 && col < columns.length; col += dCol) {
        const ids = columns[col].ids;
        if (ids.length === 0) continue;
        focusCard(ids[Math.min(here.row, ids.length - 1)]);
        return;
      }
    },
    [columns, tabStopId, locate, focusCard],
  );

  useHotkey("j", () => step(0, 1), { enabled });
  useHotkey("k", () => step(0, -1), { enabled });
  useHotkey("h", () => step(-1, 0), { enabled });
  useHotkey("l", () => step(1, 0), { enabled });

  // Enter on a focused card link is handled by the card itself; this covers the
  // case where the board has a keyboard anchor but DOM focus is on the page body.
  useHotkey(
    "Enter",
    (e) => {
      if (!tabStopId || isInteractive(document.activeElement)) return;
      e.preventDefault();
      openIssue(tabStopId);
    },
    { enabled, preventDefault: false },
  );

  useHotkey(
    "o",
    () => {
      const id = locate(focusedId) ? focusedId : (openId ?? tabStopId);
      if (id) openIssue(id, { page: true });
    },
    { enabled },
  );

  useHotkey(
    "s",
    () => {
      if (!tabStopId) return;
      setMenuRequest((prev) => ({ id: tabStopId, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    { enabled },
  );

  useHotkey("Escape", () => closeIssue(), {
    enabled: enabled && openId != null,
    preventDefault: false,
  });

  return {
    tabStopId,
    focusedId,
    setFocusedId,
    focusCard,
    menuRequest,
    clearMenuRequest,
    selectedId: openId,
    input,
  };
}
