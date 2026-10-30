// current_state.md, read in reader order (not file order): what needs me, what
// moves, what is stuck, what comes next. Then the history, folded away.
import { ChevronRight, CircleX, Clock, Library, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { AuthorChip, MarkdownProse, RefLink, useNow } from "@/components/common";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
} from "@/components/ui";
import { useRunActive } from "@/features/codex";
import type { CurrentState, IssueDetail, Task } from "@/gen/types";
import { useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { hoursSince, parseTs } from "@/lib/format";
import { useIssueTab } from "@/lib/nav";
import { InlineText } from "./CriteriaChecklist";
import { NeedsYouList, TimeAgo } from "./NeedsYouList";
import { TaskPill } from "./TaskPill";

/** Q008: the snapshot stays short enough to read in one pass. */
const WORD_LIMIT = 400;
const DEFAULT_ISSUE_HOURS = 24;

export interface StateSnapshotProps {
  state: CurrentState;
  detail: IssueDetail;
}

function countListItems(md: string | undefined): number {
  if (!md) return 0;
  return md.split("\n").filter((l) => /^([-*+]|\d+[.)])\s+/.test(l)).length;
}

export function StateSnapshot({ state, detail }: StateSnapshotProps) {
  const issueId = detail.summary.id;
  const tasks = useMemo(() => {
    const map = new Map<string, Task>();
    for (const phase of detail.plan?.phases ?? []) for (const t of phase.tasks) map.set(t.id, t);
    return map;
  }, [detail.plan]);

  const inFlight = state.in_flight_tasks.length > 0 || Boolean(state.in_flight_md?.trim());
  const openRequests = state.needs_you.filter((r) => !r.answered).length;
  const doneCount = countListItems(state.done_md);

  return (
    <section data-wf="StateSnapshot" aria-label="Current state" className="flex flex-col">
      <p
        data-wf="StateSummary"
        title={state.summary}
        className="line-clamp-2 text-md font-medium text-pretty text-fg"
      >
        {state.summary}
      </p>
      <StateMeta state={state} detail={detail} />

      {state.needs_you.length > 0 && (
        <div
          data-wf="StateNeedsYou"
          className="mt-4 overflow-hidden rounded-md border border-accent/30 bg-accent-subtle/60"
        >
          <p className="flex items-center gap-1.5 px-3 pt-2.5 pb-0.5 text-xs font-medium text-accent">
            Needs you
            {openRequests > 0 && <span className="tabular">{openRequests}</span>}
          </p>
          <NeedsYouList items={state.needs_you} issueId={issueId} />
        </div>
      )}

      {inFlight && (
        <div data-wf="StateInFlight">
          <SectionLabel count={state.in_flight_tasks.length || undefined}>In flight</SectionLabel>
          {state.in_flight_tasks.length > 0 && (
            <ul aria-label="Tasks in flight" className="flex flex-wrap gap-1.5">
              {state.in_flight_tasks.map((id) => {
                const task = tasks.get(id);
                return (
                  <li key={id} className="min-w-0 max-w-full">
                    {task ? <TaskPill task={task} /> : <MissingTask id={id} />}
                  </li>
                );
              })}
            </ul>
          )}
          {state.in_flight_md?.trim() && (
            <div className={cn("text-fg-muted", state.in_flight_tasks.length > 0 && "mt-2")}>
              <MarkdownProse md={state.in_flight_md} issueId={issueId} compact />
            </div>
          )}
        </div>
      )}

      {state.blocked_md?.trim() && (
        <div data-wf="StateBlocked">
          <SectionLabel>Blocked</SectionLabel>
          <div className="border-l-2 border-danger pl-3">
            <MarkdownProse md={state.blocked_md} issueId={issueId} compact />
          </div>
        </div>
      )}

      <NextSteps steps={state.next_steps} issueId={issueId} />

      {(state.done_md?.trim() || state.handoff_md?.trim() || state.failed_attempts.length > 0) && (
        <div className="mt-4 flex flex-col border-t border-border pt-1.5">
          {state.done_md?.trim() && (
            <Fold wf="StateDone" label="Done" count={doneCount || undefined}>
              <MarkdownProse md={state.done_md} issueId={issueId} compact />
            </Fold>
          )}
          {state.handoff_md?.trim() && (
            <Fold wf="StateHandoff" label="Handoff notes">
              <MarkdownProse md={state.handoff_md} issueId={issueId} compact />
            </Fold>
          )}
          {state.failed_attempts.length > 0 && (
            <Fold
              wf="StateFailedAttempts"
              label="Failed attempts"
              count={state.failed_attempts.length}
            >
              <ul className="flex flex-col gap-1">
                {state.failed_attempts.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-5">
                    <CircleX
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden
                      className="mt-[3px] shrink-0 text-danger/70"
                    />
                    <FailedAttempt line={line} issueId={issueId} />
                  </li>
                ))}
              </ul>
            </Fold>
          )}
        </div>
      )}

      {state.library_refs.length > 0 && (
        <p
          data-wf="StateLibraryRefs"
          className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-faint"
        >
          <span className="inline-flex items-center gap-1">
            <Library size={14} strokeWidth={1.75} aria-hidden />
            Consulted
          </span>
          {state.library_refs.map((id) => (
            <RefLink key={id} target={id} issueId={issueId} />
          ))}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- meta line

function StateMeta({ state, detail }: StateSnapshotProps) {
  const { data: snapshot } = useSnapshot();
  const { setLog } = useIssueTab();
  const now = useNow();

  const limitHours = snapshot?.config.staleness.issue_hours ?? DEFAULT_ISSUE_HOURS;
  const age = hoursSince(state.updated_at, now);
  const stale = age > limitHours;
  const updatedMs = parseTs(state.updated_at);
  const newer = detail.changes.filter((c) => parseTs(c.ts) > updatedMs).length;
  // Codex writes the snapshot last: while it works, "behind" is expected and stays quiet (Q005).
  const running = useRunActive(detail.summary.id);
  const behind = !running && (detail.summary.signals.state_behind_changes || newer > 0);
  const tinted = stale || behind;
  const overLimit = state.word_count > WORD_LIMIT;

  const staleNote = stale
    ? `No update for ${Math.round(age)} h. The limit is ${limitHours} h.`
    : `${newer || "Some"} change ${newer === 1 ? "entry is" : "entries are"} newer than this snapshot (Q005).`;

  return (
    <div
      data-wf="StateMeta"
      className={cn(
        "mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm",
        tinted ? "text-stale-text" : "text-fg-faint",
      )}
    >
      {tinted && (
        <Tooltip content={staleNote}>
          <span className="inline-flex" role="img" aria-label={staleNote}>
            <Clock size={14} strokeWidth={1.75} />
          </span>
        </Tooltip>
      )}
      <span className="inline-flex items-center gap-1">
        Updated <TimeAgo ts={state.updated_at} /> by
        <AuthorChip handle={state.updated_by} size="xs" />
      </span>
      {behind && (
        <>
          <Dot />
          <Tooltip content="Show the newer entries in Log">
            <button
              type="button"
              onClick={() => setLog("changes")}
              className="rounded-sm font-medium underline-offset-2 hover:underline"
            >
              {newer > 0
                ? `Behind ${newer} change${newer === 1 ? "" : "s"}`
                : "Behind latest changes"}
            </button>
          </Tooltip>
        </>
      )}
      {state.phase && (
        <>
          <Dot />
          <Chip size="sm" tone="neutral" title="Plan phase">
            {state.phase}
          </Chip>
        </>
      )}
      {state.session && (
        <>
          <Dot />
          <span
            title={`Session ${state.session}`}
            className="max-w-32 truncate font-mono text-xs text-fg-faint"
          >
            {state.session}
          </span>
        </>
      )}
      {overLimit && (
        <span className="ml-auto">
          <Chip
            size="sm"
            tone="stale"
            icon={<TriangleAlert size={12} strokeWidth={1.75} />}
            title="Q008 · current_state.md is a snapshot, not a log. Move history to changes.md."
          >
            {state.word_count} words · limit {WORD_LIMIT}
          </Chip>
        </span>
      )}
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="opacity-60">
      ·
    </span>
  );
}

// ---------------------------------------------------------------- sections

function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h3 className="mt-4 mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-faint">
      {children}
      {count !== undefined && <span className="tabular">{count}</span>}
    </h3>
  );
}

function MissingTask({ id }: { id: string }) {
  return (
    <span
      title={`${id} is not in plan.md`}
      className="inline-flex h-6 items-center rounded-md border border-dashed border-border-strong px-2 font-mono text-xs text-fg-faint"
    >
      {id}
    </span>
  );
}

function NextSteps({ steps, issueId }: { steps: string[]; issueId: string }) {
  return (
    <div data-wf="NextSteps">
      <SectionLabel>Next steps</SectionLabel>
      {steps.length === 0 ? (
        <p className="text-sm text-stale-text">
          No next step written (Q008). The next agent has no lead.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 leading-5">
              {i === 0 ? (
                <span className="inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-sm bg-accent-subtle text-xs font-medium text-accent">
                  Next
                </span>
              ) : (
                <span className="inline-flex h-5 w-9 shrink-0 items-center justify-center text-xs text-fg-faint tabular">
                  {i + 1}
                </span>
              )}
              <InlineText
                text={step}
                issueId={issueId}
                className={cn(
                  "min-w-0 flex-1 text-base",
                  i === 0 ? "font-medium text-fg" : "text-fg-muted",
                )}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Fold({
  wf,
  label,
  count,
  children,
}: {
  wf: string;
  label: string;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-wf={wf}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group -mx-1.5 flex h-7 w-[calc(100%_+_var(--spacing)_*_3)] items-center gap-1.5 rounded-sm px-1.5 text-sm font-medium text-fg-muted transition-colors duration-100 ease-wf hover:bg-subtle hover:text-fg">
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="text-fg-faint transition-transform duration-150 ease-wf group-data-[state=open]:rotate-90"
          />
          <span>{label}</span>
          {count !== undefined && (
            <span className="font-normal text-fg-faint tabular">{count}</span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-0.5 pb-2 pl-5">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** One failed attempt: the error signature (backticked, or after the last colon/dash) in danger. */
function FailedAttempt({ line, issueId }: { line: string; issueId: string }) {
  if (line.includes("`")) {
    return (
      <InlineText
        text={line}
        issueId={issueId}
        className="min-w-0 flex-1 text-fg-muted"
        codeClassName="bg-danger/10 text-danger"
      />
    );
  }
  const m = line.match(/^(.*\S)\s*(:|—|–| - )\s+(\S.*)$/);
  if (!m) return <span className="min-w-0 flex-1 text-fg-muted">{line}</span>;
  const [, lead, sep, signature] = m;
  return (
    <span className="min-w-0 flex-1 text-fg-muted">
      {lead}
      {sep === ":" ? ": " : ` ${sep.trim()} `}
      <span className="rounded-sm bg-danger/10 px-1 py-px font-mono text-xs text-danger">
        {signature}
      </span>
    </span>
  );
}
