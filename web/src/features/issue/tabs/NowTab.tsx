// Now tab: current_state.md, the file built to answer "where are we".
import { NotebookPen } from "lucide-react";
import { EmptyState } from "@/components/common";
import type { IssueDetail } from "@/gen/types";
import { StateSnapshot } from "../StateSnapshot";

export interface NowTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function NowTab({ detail, variant }: NowTabProps) {
  const { state, summary } = detail;
  return (
    // The frame (IssueView) owns padding and scrolling for both variants.
    <div data-wf="NowTab" data-variant={variant}>
      {state ? (
        <StateSnapshot state={state} detail={detail} />
      ) : (
        <EmptyState
          icon={<NotebookPen strokeWidth={1.75} />}
          title="No current state yet"
          hint={
            summary.status === "in_progress"
              ? "The next agent reads this first. Write a snapshot at the end of each session."
              : "An agent writes a short snapshot here at the end of each session."
          }
          skill="write-current-state"
          command={`wf state ${summary.id} --from -`}
        />
      )}
    </div>
  );
}
