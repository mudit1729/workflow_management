// A request to select one task in the Plan tab, made from another tab (a commit's T-n pill in Git).
// The Plan view may not be mounted yet: the tab panel mounts when it opens. So the request waits in
// this store, and the plan view takes it when it mounts or when a new request arrives.
import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { IssueId, TaskId } from "@/gen/types";

interface TaskFocusRequest {
  issue: IssueId;
  task: TaskId;
  /** Distinguishes two requests for the same task. */
  n: number;
}

interface TaskFocusState {
  request: TaskFocusRequest | null;
  /** Ask the Plan view of `issue` to select `task`. */
  focusTask: (issue: IssueId, task: TaskId) => void;
  /** Mark a request as taken. A newer request stays. */
  take: (n: number) => void;
}

let counter = 0;

export const useTaskFocus = create<TaskFocusState>((set) => ({
  request: null,
  focusTask: (issue, task) => set({ request: { issue, task, n: ++counter } }),
  take: (n) => set((s) => (s.request?.n === n ? { request: null } : s)),
}));

/**
 * For a Plan view: calls `apply(taskId)` once for each request made for this issue, on mount and
 * whenever a new one arrives.
 */
export function useTaskFocusRequest(issueId: IssueId, apply: (task: TaskId) => void) {
  const request = useTaskFocus((s) => s.request);
  const take = useTaskFocus((s) => s.take);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!request || request.issue !== issueId) return;
    // Let the pills register their elements first (the view may have just mounted).
    const frame = requestAnimationFrame(() => {
      applyRef.current(request.task);
      take(request.n);
    });
    return () => cancelAnimationFrame(frame);
  }, [request, issueId, take]);
}
