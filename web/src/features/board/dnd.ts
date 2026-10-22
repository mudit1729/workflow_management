// Drag and drop for the board (pragmatic-drag-and-drop, element adapter).
//
// A card is a draggable carrying `CardDragData`. Every (status, lane) cell is a
// drop target carrying `CellDropData`. Drops are allowed only inside the card's
// own lane; the board monitor turns a drop on another status into a move.

import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { IssueId, IssueStatus, IssueSummary, Priority } from "@/gen/types";

const CARD = "wf-board-card";
const CELL = "wf-board-cell";

// Type aliases, not interfaces: the adapter wants `Record<string | symbol, unknown>`,
// which only object literal types satisfy without an explicit index signature.
export type CardDragData = {
  type: typeof CARD;
  id: IssueId;
  status: IssueStatus;
  priority: Priority;
  lane: string;
};

export type CellDropData = {
  type: typeof CELL;
  status: IssueStatus;
  lane: string;
};

export function isCardData(data: Record<string | symbol, unknown>): data is CardDragData {
  return data.type === CARD;
}

export function isCellData(data: Record<string | symbol, unknown>): data is CellDropData {
  return data.type === CELL;
}

function cardData(issue: IssueSummary, lane: string): CardDragData {
  return { type: CARD, id: issue.id, status: issue.status, priority: issue.priority, lane };
}

/**
 * Make `ref` draggable as a board card. Returns true while this card is dragged.
 * The preview is a compact card rendered once into the native drag image.
 */
export function useDraggableCard(
  ref: RefObject<HTMLElement | null>,
  opts: { issue: IssueSummary; lane: string; disabled?: boolean; preview: () => ReactNode },
): boolean {
  const [dragging, setDragging] = useState(false);
  // Live updates replace the issue object mid-drag; read the latest through refs
  // so the registration (and the drag in progress) survives re-renders.
  const latest = useRef(opts);
  latest.current = opts;
  const { lane, disabled } = opts;

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;
    return draggable({
      element,
      getInitialData: () => cardData(latest.current.issue, lane),
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: pointerOutsideOfPreview({ x: "12px", y: "8px" }),
          render: ({ container }) => {
            const root = createRoot(container);
            // The browser snapshots the preview right after this call returns.
            flushSync(() => root.render(latest.current.preview()));
            return () => root.unmount();
          },
        });
      },
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [ref, lane, disabled]);

  return dragging;
}

/**
 * Make `ref` a drop target for one (status, lane) cell. Returns the card being
 * dragged over it when the drop would move that card, else null. Cards from
 * another lane are refused (no highlight; the browser shows a no-drop cursor).
 */
export function useCellDropTarget(
  ref: RefObject<HTMLElement | null>,
  status: IssueStatus,
  lane: string,
): CardDragData | null {
  const [over, setOver] = useState<CardDragData | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const data: CellDropData = { type: CELL, status, lane };
    return dropTargetForElements({
      element,
      getData: () => data,
      canDrop: ({ source }) => isCardData(source.data) && source.data.lane === lane,
      getDropEffect: () => "move",
      onDragEnter: ({ source }) => {
        if (isCardData(source.data) && source.data.status !== status) setOver(source.data);
      },
      onDragLeave: () => setOver(null),
      onDrop: () => setOver(null),
    });
  }, [ref, status, lane]);

  return over;
}

/**
 * Watch every card drag on the page. Returns the card in flight (for lane
 * dimming) and calls `onMove` when a card is dropped on another status in its lane.
 */
export function useBoardDnd(onMove: (id: IssueId, to: IssueStatus) => void): CardDragData | null {
  const [active, setActive] = useState<CardDragData | null>(null);
  const move = useRef(onMove);
  move.current = onMove;

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isCardData(source.data),
        onDragStart: ({ source }) => {
          if (isCardData(source.data)) setActive(source.data);
        },
        onDrop: ({ source, location }) => {
          setActive(null);
          const target = location.current.dropTargets[0];
          if (!target || !isCardData(source.data) || !isCellData(target.data)) return;
          const from = source.data;
          const to = target.data;
          if (to.lane !== from.lane || to.status === from.status) return;
          move.current(from.id, to.status);
        },
      }),
    [],
  );

  return active;
}

/** Scroll `ref` while a card is dragged near its edges. */
export function useCardAutoScroll(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    return autoScrollForElements({
      element,
      canScroll: ({ source }) => isCardData(source.data),
    });
  }, [ref, enabled]);
}
