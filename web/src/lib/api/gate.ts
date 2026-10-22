// The move flow and its gate (contract 1.6).
//   illegal move            → gate "illegal" with the steering text; "Move anyway" sends force
//   move to done with gaps  → gate "done_gate" listing the gaps; "Move to Done anyway" sends force
//   anything else           → written straight away (optimistic)
import { create } from "zustand";
import type { IssueStatus, IssueSummary } from "@/gen/types";
import { doneGaps, illegalReason, isLegalTransition } from "@/lib/status";
import { performMove } from "./ops";

export interface MoveGateState {
  open: boolean;
  kind: "illegal" | "done_gate";
  issue?: IssueSummary;
  to?: IssueStatus;
  /** Steering text for kind "illegal". */
  reason: string;
  /** Gaps for kind "done_gate". */
  gaps: string[];
  /** Write the move with `force: true` and close the gate. */
  confirm: () => void;
  cancel: () => void;
}

export const useMoveGate = create<MoveGateState>((set, get) => ({
  open: false,
  kind: "illegal",
  reason: "",
  gaps: [],
  confirm: () => {
    const { issue, to } = get();
    set({ open: false });
    if (issue && to) void performMove(issue, to, true);
  },
  cancel: () => set({ open: false }),
}));

/** Move an issue: write it, or open the gate when the move needs a decision first. */
export function requestMove(issue: IssueSummary, to: IssueStatus): void {
  if (issue.status === to) return;
  const gate = useMoveGate.getState();
  if (!isLegalTransition(issue.status, to)) {
    useMoveGate.setState({
      open: true,
      kind: "illegal",
      issue,
      to,
      reason: illegalReason(issue.status, to),
      gaps: [],
    });
    return;
  }
  if (to === "done") {
    const gaps = doneGaps(issue);
    if (gaps.length > 0) {
      useMoveGate.setState({ open: true, kind: "done_gate", issue, to, reason: "", gaps });
      return;
    }
  }
  if (gate.open) gate.cancel();
  void performMove(issue, to);
}

const moveApi = { move: requestMove };

export function useMoveIssue(): { move: (issue: IssueSummary, to: IssueStatus) => void } {
  return moveApi;
}
