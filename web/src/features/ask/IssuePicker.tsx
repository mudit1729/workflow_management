// Which issue is this for? "Ask about this page" opens the panel from the library, where no issue
// is open: the answer needs one to link its pages to or to save itself in. The issues that moved
// last are buttons, one tap each.
import { StatusIcon } from "@/components/common";
import { Button } from "@/components/ui";
import type { IssueSummary } from "@/gen/types";
import { useSnapshot } from "@/lib/api";
import { parseTs } from "@/lib/format";

/** How many issues are offered. */
export const RECENT_ISSUES = 6;

const touched = (i: IssueSummary) =>
  parseTs(i.last_activity?.ts ?? i.state_updated_at ?? i.created);

/** The issues that moved last, not done or cancelled ones first. Pure. */
export function recentIssues(issues: IssueSummary[], limit = RECENT_ISSUES): IssueSummary[] {
  const open = (i: IssueSummary) => i.status !== "done" && i.status !== "cancelled";
  return [...issues]
    .sort((a, b) => Number(open(b)) - Number(open(a)) || touched(b) - touched(a))
    .slice(0, limit);
}

export function IssuePicker({ onPick }: { onPick: (id: string) => void }) {
  const issues = useSnapshot().data?.issues ?? [];
  const recent = recentIssues(issues);
  return (
    <section
      data-wf="AskIssuePicker"
      aria-label="Pick an issue"
      className="flex flex-col gap-2 px-4 py-4"
    >
      <h3 className="m-0 font-semibold text-base text-fg">Which issue is this for?</h3>
      <p className="m-0 text-fg-muted text-sm">
        An answer can link its pages to an issue or be saved in its log.
      </p>
      {recent.length === 0 ? (
        <p className="m-0 text-fg-faint text-sm">
          No issues yet. Load the sample data from the Prototype panel to try this.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {recent.map((i) => (
            <li key={i.id} className="min-w-0">
              <Button
                variant="secondary"
                className="h-auto min-h-8 w-full justify-start gap-2 py-1.5 text-left"
                onClick={() => onPick(i.id)}
              >
                <StatusIcon status={i.status} size={14} />
                <span className="min-w-0 flex-1 truncate font-normal">{i.title}</span>
                <span className="shrink-0 font-mono text-fg-faint text-xs">{i.id}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
