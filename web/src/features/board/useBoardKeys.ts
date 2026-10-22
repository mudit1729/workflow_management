// Board keyboard model (contract §6): j/k cards, h/l columns, Enter drawer,
// o full page, s move menu, Esc closes the drawer. Roving tabindex: one card is
// the tab stop; arrow-like keys move DOM focus between cards.
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IssueId, IssueStatus } from "@/gen/types";
import { useHotkey } from "@/lib/hooks";
import { useCloseIssue, useOpenIssue, useOpenIssueId } from "@/lib/nav";

/** One navigable column: its cards top to bottom (across expanded lanes). */
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
  /** Set by `s`: the card with this id opens its Move menu. */
  menuRequest: MenuRequest | null;
  setFocusedId: (id: IssueId) => void;
  /** Make `id` the tab stop and move DOM focus to it once it renders. */
  focusCard: (id: IssueId) => void;
}

export const BoardCardContext = createContext<BoardCardApi | null>(null);

const CARD_SELECTOR = '[data-wf="IssueCard"]';

function findCard(id: IssueId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${CARD_SELECTOR}[data-issue-id="${CSS.escape(id)}"]`);
}

function isInteractive(el: Element | null): boolean {
  if (!el || el === document.body) return false;
  return el.closest("a, button, input, textarea, select, [role='menuitem'], [contenteditable]") != null;
}

export function useBoardKeys(columns: NavColumn[], enabled = true) {
  const openIssue = useOpenIssue();
  const closeIssue = useCloseIssue();
  const openId = useOpenIssueId();
  const [focusedId, setFocusedId] = useState<IssueId | null>(null);
  const [menuRequest, setMenuRequest] = useState<MenuRequest | null>(null);
  const pending = useRef<IssueId | null>(null);

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

  const focusCard = useCallback((id: IssueId) => {
    setFocusedId(id);
    pending.current = id;
    let tries = 0;
    const tick = () => {
      if (pending.current !== id) return;
      const card = findCard(id);
      const target = card?.querySelector<HTMLElement>("[data-card-link]");
      if (card && target) {
        target.focus({ preventScroll: true });
        card.scrollIntoView({ block: "nearest", inline: "nearest" });
        pending.current = null;
        return;
      }
      // Virtualized columns and optimistic moves render a frame or two later.
      if (++tries < 20) requestAnimationFrame(tick);
      else pending.current = null;
    };
    requestAnimationFrame(tick);
  }, []);

  const step = useCallback(
    (dCol: number, dRow: number) => {
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

  return { tabStopId, focusedId, setFocusedId, focusCard, menuRequest, selectedId: openId };
}
