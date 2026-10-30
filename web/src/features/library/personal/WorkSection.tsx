// Work (spec 3): the summaries of the workspace's groups and issues, organised like the group tree.
// Inside a group the issues sit under their status, in the order of the work: in progress, blocked,
// review, planned, backlog, done. A summary whose folder changed after it was written is stale.
// Summarize this group asks the connected agent to run `summarizing-work` for the group.
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { EmptyState, RelativeTime, StatusIcon } from "@/components/common";
import { Button, Chip, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { STATUS_LABEL } from "@/lib/status";
import { PERSONAL_ALIAS } from "../address";
import { SectionHeader } from "./SectionHeader";
import { summarize, useSummarizing } from "./summarize";
import { useWorkList } from "./use-work";
import {
  needsLine,
  summaryState,
  targetsBelow,
  type WorkGroup,
  type WorkList,
  type WorkTarget,
  workTree,
} from "./work";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** A link to a summary page, or the plain title when there is no page yet. */
function PageLink({ target, className }: { target: WorkTarget; className?: string }) {
  const open = useOpenPage();
  if (!target.summary) return <span className={cn("truncate", className)}>{target.title}</span>;
  return (
    <a
      href={libraryHref(PERSONAL_ALIAS, target.path)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open({ alias: PERSONAL_ALIAS, path: target.path });
      }}
      className={cn("truncate hover:underline", className)}
    >
      {target.title}
    </a>
  );
}

/** Refresh, Summarize or Summarize this group: one button, which reads "Summarizing…" while it runs. */
export function SummarizeButton({
  target,
  below,
  label,
  quiet,
  className,
}: {
  target: WorkTarget;
  /** Every target the run writes; the target alone for an issue. */
  below?: WorkTarget[];
  label: string;
  /** A group inside a group: no outline, so the tree stays calm. */
  quiet?: boolean;
  className?: string;
}) {
  const busy = useSummarizing(target.path);
  const pages = (below ?? [target]).map((t) => t.path);
  return (
    <Button
      variant={target.kind === "group" && !quiet ? "secondary" : "ghost"}
      size="sm"
      disabled={busy}
      className={className}
      onClick={() => void summarize({ kind: "work", target, pages })}
    >
      {busy ? (
        <Loader2 aria-hidden {...ICON} className="animate-spin motion-reduce:animate-none" />
      ) : (
        <RefreshCw aria-hidden {...ICON} />
      )}
      {busy ? "Summarizing…" : label}
    </Button>
  );
}

function StateMark({ target }: { target: WorkTarget }) {
  const state = summaryState(target);
  if (state === "stale")
    return (
      <Chip tone="stale" title="The work changed after this summary was written">
        Stale
      </Chip>
    );
  if (state === "none") return <span className="text-fg-faint text-sm">Not summarized</span>;
  return target.summary?.summarizedAt ? (
    <RelativeTime ts={target.summary.summarizedAt} className="text-fg-faint text-sm" />
  ) : null;
}

function IssueRow({ issue }: { issue: WorkTarget }) {
  const state = summaryState(issue);
  return (
    <li
      data-wf="WorkIssueRow"
      data-state={state}
      className="flex min-h-8 min-w-0 items-center gap-2 rounded-md px-2 hover:bg-subtle"
    >
      <span className="hidden w-[72px] shrink-0 font-mono text-fg-faint text-xs sm:block">
        {issue.key}
      </span>
      <PageLink target={issue} className="min-w-0 flex-1 text-base text-fg" />
      <span className="flex shrink-0 items-center gap-1.5">
        <StateMark target={issue} />
        {state !== "current" && (
          <SummarizeButton target={issue} label={state === "stale" ? "Refresh" : "Summarize"} />
        )}
      </span>
    </li>
  );
}

function Statuses({ group }: { group: WorkGroup }) {
  return (
    <>
      {group.byStatus.map((b) => (
        <div key={b.status} data-wf="WorkStatus" data-status={b.status} className="flex flex-col">
          <h4 className="m-0 flex items-center gap-1.5 px-2 pt-2 pb-0.5 font-medium text-fg-faint text-xs">
            <StatusIcon status={b.status} size={12} />
            {STATUS_LABEL[b.status]}
            <span className="tabular font-normal">{b.issues.length}</span>
          </h4>
          <ul className="m-0 flex list-none flex-col p-0">
            {b.issues.map((i) => (
              <IssueRow key={i.key} issue={i} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function GroupBlock({ group, depth }: { group: WorkGroup; depth: number }) {
  const { target } = group;
  // A group that needs attention opens by itself; the rest of the tree starts shut below the top.
  const [open, setOpen] = useState(depth === 0 || group.stale + group.missing > 0);
  const state = summaryState(target);
  const attention = needsLine(group.stale, group.missing);
  const below = targetsBelow(group);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-wf="WorkGroup"
      data-depth={depth}
      data-state-summary={state}
      className={cn(
        "flex min-w-0 flex-col",
        depth === 0 ? "rounded-lg border border-border bg-bg" : "",
      )}
    >
      <div
        className={cn(
          "flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1",
          depth === 0 && "rounded-t-lg bg-subtle",
        )}
      >
        <CollapsibleTrigger
          aria-label={`${open ? "Close" : "Open"} ${target.title}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-muted hover:text-fg"
        >
          <ChevronRight
            aria-hidden
            {...ICON}
            className={cn("transition-transform duration-150 ease-wf", open && "rotate-90")}
          />
        </CollapsibleTrigger>
        <h3 className="m-0 min-w-0 font-semibold text-fg text-base">
          <PageLink target={target} />
        </h3>
        <span className="tabular text-fg-faint text-sm">
          {target.issues} {target.issues === 1 ? "issue" : "issues"}
        </span>
        <StateMark target={target} />
        {attention && <span className="text-fg-faint text-sm">{attention}</span>}
        <SummarizeButton
          target={target}
          below={below}
          label="Summarize this group"
          quiet={depth > 0}
          className="ml-auto"
        />
      </div>
      <CollapsibleContent>
        <div
          className={cn(
            "flex flex-col pb-2",
            depth === 0 ? "px-2" : "ml-3 border-border border-l pl-2",
          )}
        >
          <Statuses group={group} />
          {group.groups.length > 0 && (
            <div className="flex flex-col gap-1 pt-2">
              {group.groups.map((g) => (
                <GroupBlock key={g.target.key} group={g} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function WorkSection() {
  const { data, unavailable } = useWorkList();
  return <WorkSectionView data={data} unavailable={unavailable} />;
}

/** The section for a list of targets, a list that is still being read, or a build that has none. */
export function WorkSectionView({ data, unavailable }: { data?: WorkList; unavailable?: boolean }) {
  const issues = data?.targets.filter((t) => t.kind === "issue") ?? [];
  const tree = data ? workTree(data) : undefined;
  const groups =
    tree?.groups.reduce(
      (n, g) => n + targetsBelow(g).filter((t) => t.kind === "group").length,
      0,
    ) ?? 0;
  return (
    <section data-wf="WorkSection" aria-labelledby="personal-work" className="flex flex-col gap-3">
      <SectionHeader
        id="personal-work"
        title="Work"
        count={issues.length || undefined}
        hint={
          <>
            What your work adds up to, by workspace and group.
            {data && issues.length > 0 && (
              <>
                {" "}
                <span className="font-mono text-xs">{data.workspace}</span>: {issues.length}{" "}
                {issues.length === 1 ? "issue" : "issues"} in {groups}{" "}
                {groups === 1 ? "group" : "groups"}.
              </>
            )}
          </>
        }
      />
      {unavailable ? (
        <EmptyState
          compact
          title="Work summaries need the daemon"
          hint="This build talks to wf serve, which does not list them yet."
        />
      ) : !data ? (
        <p role="status" className="m-0 text-fg-faint text-base">
          Reading the workspace…
        </p>
      ) : issues.length === 0 || !tree ? (
        <EmptyState
          compact
          title="No work to summarize yet"
          hint={`${data.workspace} has no issues. Summaries of its groups and issues appear here once it does.`}
          skill="summarizing-work"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {tree.groups.map((g) => (
            <GroupBlock key={g.target.key} group={g} depth={0} />
          ))}
          {tree.loose.length > 0 && (
            <div className="flex flex-col rounded-lg border border-border bg-bg px-2 pb-2">
              <h3 className="m-0 px-2 pt-2 font-semibold text-fg-muted text-sm">No group</h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {tree.loose.map((i) => (
                  <IssueRow key={i.key} issue={i} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
