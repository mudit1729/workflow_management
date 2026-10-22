// The issue drawer on the board route. Docked beside the board at ≥1600 px,
// an overlay sheet at 768–1599 px, full screen below 768 px.
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import type { IssueId } from "@/gen/types";
import { cn } from "@/lib/cn";
import { useHotkey, useLayoutMode } from "@/lib/hooks";
import { useCloseIssue } from "@/lib/nav";
import { usePrefs } from "@/lib/prefs";
import { IssueView } from "./IssueView";

const MIN_W = 440;
const MAX_W = 760;
const DEFAULT_W = 560;
const KEY_STEP = 16;

const clamp = (w: number) => Math.max(MIN_W, Math.min(MAX_W, Math.round(w)));

export function IssueDrawer({ id }: { id: IssueId }) {
  const mode = useLayoutMode();
  const close = useCloseIssue();
  const storedWidth = usePrefs((s) => s.drawerWidth);
  const setDrawerWidth = usePrefs((s) => s.setDrawerWidth);
  // Live width while dragging; committed to prefs on release.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? clamp(storedWidth);
  const panelRef = useRef<HTMLElement>(null);

  useHotkey("Escape", () => void close(), { allowInInputs: false });

  // The overlay takes focus when it opens, so keyboard users land inside it,
  // and hands focus back (usually to the board card) when it closes.
  useEffect(() => {
    if (mode !== "overlay") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mode]);

  if (mode === "mobile") {
    return (
      <aside
        data-wf="IssueDrawer"
        data-mode="mobile"
        aria-label={`Issue ${id}`}
        className="absolute inset-0 z-30 flex min-h-0 flex-col bg-bg"
      >
        <IssueView id={id} variant="drawer" />
      </aside>
    );
  }

  const handle = (
    <ResizeHandle
      width={width}
      onDrag={setDragWidth}
      onCommit={(w) => {
        setDragWidth(null);
        setDrawerWidth(w);
      }}
      onReset={() => setDrawerWidth(DEFAULT_W)}
    />
  );

  if (mode === "docked") {
    return (
      <aside
        data-wf="IssueDrawer"
        data-mode="docked"
        aria-label={`Issue ${id}`}
        className="relative flex h-full min-h-0 shrink-0 flex-col border-border border-l bg-bg"
        style={{ width }}
      >
        {handle}
        <IssueView id={id} variant="drawer" />
      </aside>
    );
  }

  return (
    <>
      {/* Transparent click-catcher: a click on the board closes the overlay. */}
      <div aria-hidden className="absolute inset-0 z-20" onClick={() => void close()} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        data-wf="IssueDrawer"
        data-mode="overlay"
        aria-label={`Issue ${id}`}
        className={cn(
          "absolute inset-y-0 right-0 z-30 flex min-h-0 flex-col bg-bg shadow-pop outline-none",
          "motion-safe:slide-in-from-right motion-safe:animate-in",
          "duration-[var(--wf-dur-3)] ease-wf",
        )}
        style={{ width, maxWidth: "calc(100% - 48px)" }}
      >
        {handle}
        <IssueView id={id} variant="drawer" />
      </aside>
    </>
  );
}

/**
 * 6 px invisible grip on the drawer's left edge. Drag to resize (440–760 px),
 * double-click to reset to 560 px, arrow keys step by 16 px when focused.
 */
function ResizeHandle({
  width,
  onDrag,
  onCommit,
  onReset,
}: {
  width: number;
  onDrag: (w: number) => void;
  onCommit: (w: number) => void;
  onReset: () => void;
}) {
  const start = useRef<{ x: number; w: number; last: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // While dragging, keep the col-resize cursor everywhere and stop text selection.
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w: width, last: width };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    // The handle sits on the left edge: moving left widens the drawer.
    const next = clamp(s.w + (s.x - e.clientX));
    if (next !== s.last) {
      s.last = next;
      onDrag(next);
    }
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    start.current = null;
    setDragging(false);
    onCommit(s.last);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = width + KEY_STEP;
    else if (e.key === "ArrowRight") next = width - KEY_STEP;
    else if (e.key === "Home") next = MAX_W;
    else if (e.key === "End") next = MIN_W;
    else if (e.key === "Enter") next = DEFAULT_W;
    if (next == null) return;
    e.preventDefault();
    e.stopPropagation();
    onCommit(clamp(next));
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter has no native element; role="separator" with aria-valuenow is the WAI-ARIA window splitter pattern.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize issue panel"
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      data-wf="DrawerResizeHandle"
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className="group/handle absolute inset-y-0 -left-[3px] z-40 w-[6px] cursor-col-resize touch-none outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-transparent transition-colors duration-150",
          "group-hover/handle:bg-accent group-focus-visible/handle:bg-accent",
          dragging && "bg-accent",
        )}
      />
    </div>
  );
}
