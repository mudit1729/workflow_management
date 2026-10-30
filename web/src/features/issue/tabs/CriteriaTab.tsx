// Criteria tab: how we know the issue is done. The success criteria of goal.md with their three
// states (open, claimed, verified), and below them which tasks cover each one. It was part of
// the Goal tab; it has its own tab because it is the part people tick and check most.
import { OctagonAlert } from "lucide-react";
import { useMemo } from "react";
import type { IssueDetail } from "@/gen/types";
import { CoverageStrip } from "../CoverageStrip";
import { CriteriaChecklist } from "../CriteriaChecklist";

export interface CriteriaTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function CriteriaTab({ detail, variant }: CriteriaTabProps) {
  const { criteria, goal, summary } = detail;
  const tasks = useMemo(() => detail.plan?.phases.flatMap((p) => p.tasks) ?? [], [detail.plan]);
  const small = summary.size === "xs" || summary.size === "s";

  return (
    // The frame (IssueView) owns padding and scrolling for both variants.
    <div data-wf="CriteriaTab" data-variant={variant} className="flex min-w-0 flex-col gap-3">
      {!goal.frontmatter_ok && criteria.length === 0 && (
        <p data-wf="CriteriaUnreadable" className="flex items-start gap-2 text-fg-muted text-sm">
          <OctagonAlert
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="mt-0.5 shrink-0 text-danger"
          />
          <span>
            goal.md could not be read, so its criteria are missing. Fix the frontmatter in the Goal
            tab.
          </span>
        </p>
      )}

      <CriteriaChecklist criteria={criteria} issueId={summary.id} />

      {criteria.length > 0 &&
        (detail.plan ? (
          <div className="border-border border-t pt-2">
            <CoverageStrip criteria={criteria} tasks={tasks} />
          </div>
        ) : (
          <p className="border-border border-t pt-3 text-fg-faint text-sm">
            {small
              ? "No plan.md yet. Do next step writes a one-task plan first, and coverage shows here."
              : "No plan.md yet. Coverage shows here once tasks name these criteria in satisfies."}
          </p>
        ))}
    </div>
  );
}
