// Log tab: the issue's append-only logs behind one segmented control.
// The control sticks to the top of the scrolling panel (below any bar the frame
// pins there); the timeline's day headers stick right under it via --wf-log-sticky.
// Sticky offsets are measured from the scroller's content box, so the offset also
// cancels the scroller's own top padding (the drawer panel has 16 px).
import { type CSSProperties, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { Segmented } from "@/components/ui";
import type { IssueDetail } from "@/gen/types";
import { type LogView, useIssueTab } from "@/lib/nav";
import { ChangesTimeline } from "../ChangesTimeline";
import { DecisionCards } from "../DecisionCards";
import { LearningCards } from "../LearningCards";

const VIEWS: LogView[] = ["changes", "decisions", "learnings"];

export interface LogTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function LogTab({ detail, variant }: LogTabProps) {
  const { log, setLog } = useIssueTab();
  const view: LogView = VIEWS.includes(log) ? log : "changes";
  const id = detail.summary.id;
  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const top = useStickyOffset(rootRef);
  const headH = useHeight(headRef);

  return (
    <div
      ref={rootRef}
      data-wf="LogTab"
      data-variant={variant}
      // -mt-2 offsets the header's own pt-2, so at rest the control lines up with the other tabs.
      className="-mt-2 flex min-w-0 flex-col"
      style={{ "--wf-log-sticky": `${top + headH}px` } as CSSProperties}
    >
      <div ref={headRef} className="sticky z-20 bg-bg pt-2 pb-2" style={{ top }}>
        <Segmented<LogView>
          aria-label="Log view"
          size="sm"
          value={view}
          onChange={(v: LogView) => {
            setLog(v);
          }}
          options={[
            { value: "changes", label: "Changes", count: detail.changes.length },
            { value: "decisions", label: "Decisions", count: detail.decisions.length },
            { value: "learnings", label: "Learnings", count: detail.learnings.length },
          ]}
        />
      </div>

      <div className="min-w-0">
        {view === "changes" && <ChangesTimeline changes={detail.changes} issueId={id} />}
        {view === "decisions" && <DecisionCards decisions={detail.decisions} issueId={id} />}
        {view === "learnings" && (
          <LearningCards learnings={detail.learnings} issueId={id} variant={variant} />
        )}
      </div>
    </div>
  );
}

/** Live height of an element, so sticky children below it know where to stop. */
function useHeight(ref: RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setH(el.offsetHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

/**
 * Where the sticky header must stop: the height of the bars the frame pins at the top of
 * the same scroll region (a column title on the issue page, nothing in the drawer) minus
 * the scroller's top padding, which sticky positioning already skips.
 */
function useStickyOffset(ref: RefObject<HTMLElement | null>): number {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { bars, scroller } = stickyContext(el);
    const pad = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0;
    const read = () => setTop(Math.max(0, ...bars.map((b) => b.offsetHeight)) - pad);
    read();
    const ro = new ResizeObserver(read);
    for (const b of bars) ro.observe(b);
    return () => ro.disconnect();
  }, [ref]);
  return top;
}

/** Earlier siblings pinned with `top: 0`, from `el` up to its scroll container (also returned). */
function stickyContext(el: HTMLElement): { bars: HTMLElement[]; scroller: HTMLElement | null } {
  const bars: HTMLElement[] = [];
  let node = el;
  while (node.parentElement) {
    for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
      if (!(s instanceof HTMLElement)) continue;
      const cs = getComputedStyle(s);
      if (cs.position === "sticky" && Number.parseFloat(cs.top) === 0) bars.push(s);
    }
    const parent = node.parentElement;
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") return { bars, scroller: parent };
    node = parent;
  }
  return { bars, scroller: null };
}
