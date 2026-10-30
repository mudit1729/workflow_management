// A request to show one commit in the Git tab or one run in the CI tab, made from another tab (a
// Log entry's commit chip, a task's "Commits and CI" row). It is the twin of `task-focus.ts`, for
// the other direction of the same link: a task opens its commits, a commit opens its task. The
// tab may not be mounted yet and its data may still load, so the request waits in this store and
// the tab takes it once it has rows to show.
import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { IssueId } from "@/gen/types";

export type DeliveryTarget = "commit" | "run";

interface DeliveryFocusRequest {
  issue: IssueId;
  target: DeliveryTarget;
  /** A short sha for a commit, a run id for a run. */
  id: string;
  /** Distinguishes two requests for the same row. */
  n: number;
}

interface DeliveryFocusState {
  request: DeliveryFocusRequest | null;
  focus: (issue: IssueId, target: DeliveryTarget, id: string) => void;
  /** Mark a request as taken. A newer request stays. */
  take: (n: number) => void;
}

let counter = 0;

export const useDeliveryFocus = create<DeliveryFocusState>((set) => ({
  request: null,
  focus: (issue, target, id) => set({ request: { issue, target, id, n: ++counter } }),
  take: (n) => set((s) => (s.request?.n === n ? { request: null } : s)),
}));

/** Ask the Git tab to scroll to a commit and flash it. Compares the first 7 characters. */
export function focusCommit(issue: IssueId, sha: string): void {
  useDeliveryFocus.getState().focus(issue, "commit", sha.slice(0, 7));
}

/** Ask the CI tab to open a run, scroll to it and flash it. */
export function focusRun(issue: IssueId, runId: string): void {
  useDeliveryFocus.getState().focus(issue, "run", runId);
}

/**
 * For the Git or CI tab: calls `apply(id)` once for each request of `target` made for this issue,
 * on mount and whenever a new one arrives. While `ready` is false (the first read is under way)
 * the request waits, so a tab opened by the request still finds its row.
 */
export function useDeliveryFocusRequest(
  issueId: IssueId,
  target: DeliveryTarget,
  ready: boolean,
  apply: (id: string) => void,
) {
  const request = useDeliveryFocus((s) => s.request);
  const take = useDeliveryFocus((s) => s.take);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!ready || !request || request.issue !== issueId || request.target !== target) return;
    // Let the rows mount first (the tab may have just opened).
    const frame = requestAnimationFrame(() => {
      applyRef.current(request.id);
      take(request.n);
    });
    return () => cancelAnimationFrame(frame);
  }, [request, issueId, target, ready, take]);
}

/**
 * Scroll a row into view and mark it for 1.8 s (`data-focused`: the row styles it with an accent
 * wash), so the eye finds the commit or run a link pointed at. Picking the same row twice
 * restarts the mark.
 */
export function flashRow(row: HTMLElement | null | undefined): void {
  if (!row) return;
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  row.removeAttribute("data-focused");
  void row.offsetWidth;
  row.setAttribute("data-focused", "");
  window.setTimeout(() => row.removeAttribute("data-focused"), 1800);
}
