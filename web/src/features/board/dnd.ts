// Drag and drop for the board (pragmatic-drag-and-drop, element adapter).
//
// A card is a draggable carrying `CardDragData`. Every status column is a drop
// target carrying `ColumnDropData`. A card can be dropped in any column; the
// board monitor turns a drop on another status into a move.

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
const COLUMN = "wf-board-column";

// Type aliases, not interfaces: the adapter wants `Record<string | symbol, unknown>`,
// which only object literal types satisfy without an explicit index signature.
export type CardDragData = {
  type: typeof CARD;
  id: IssueId;
  status: IssueStatus;
  priority: Priority;
};

export type ColumnDropData = {
  type: typeof COLUMN;
  status: IssueStatus;
};

export function isCardData(data: Record<string | symbol, unknown>): data is CardDragData {
  return data.type === CARD;
}

export function isColumnData(data: Record<string | symbol, unknown>): data is ColumnDropData {
  return data.type === COLUMN;
}

function cardData(issue: IssueSummary): CardDragData {
  return { type: CARD, id: issue.id, status: issue.status, priority: issue.priority };
}

/**
 * Make `ref` draggable as a board card. Returns true while this card is dragged.
 * The preview is a compact card rendered once into the native drag image.
 */
export function useDraggableCard(
  ref: RefObject<HTMLElement | null>,
  opts: { issue: IssueSummary; disabled?: boolean; preview: () => ReactNode },
): boolean {
  const [dragging, setDragging] = useState(false);
  // Live updates replace the issue object mid-drag; read the latest through refs
  // so the registration (and the drag in progress) survives re-renders.
  const latest = useRef(opts);
  latest.current = opts;
  const { disabled } = opts;

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;
    return draggable({
      element,
      getInitialData: () => cardData(latest.current.issue),
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
  }, [ref, disabled]);

  return dragging;
}

/**
 * Make `ref` the drop target of one status column. Returns the card being
 * dragged over it when the drop would move that card, else null.
 */
export function useColumnDropTarget(
  ref: RefObject<HTMLElement | null>,
  status: IssueStatus,
): CardDragData | null {
  const [over, setOver] = useState<CardDragData | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const data: ColumnDropData = { type: COLUMN, status };
    return dropTargetForElements({
      element,
      getData: () => data,
      canDrop: ({ source }) => isCardData(source.data),
      getDropEffect: () => "move",
      onDragEnter: ({ source }) => {
        if (isCardData(source.data) && source.data.status !== status) setOver(source.data);
      },
      onDragLeave: () => setOver(null),
      onDrop: () => setOver(null),
    });
  }, [ref, status]);

  return over;
}

/**
 * Watch every card drag on the page and call `onMove` when a card is dropped on
 * another status.
 */
export function useBoardDnd(onMove: (id: IssueId, to: IssueStatus) => void): void {
  const move = useRef(onMove);
  move.current = onMove;

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isCardData(source.data),
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0];
          if (!target || !isCardData(source.data) || !isColumnData(target.data)) return;
          if (target.data.status === source.data.status) return;
          move.current(source.data.id, target.data.status);
        },
      }),
    [],
  );
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
