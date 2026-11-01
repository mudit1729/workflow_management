// Plan tab: how the goal gets done. Approach, assumptions and prior art first,
// then the tasks as lanes (parallel work) or a phase list (sequence). In the full
// page the context folds away so the task view gets the room.
import { ChevronRight, Columns3, ListTree, Play, Waypoints } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AuthorChip, EmptyState, MarkdownProse, RefLink, RelativeTime } from "@/components/common";
import {
  Button,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Segmented,
  Tooltip,
} from "@/components/ui";
import { useNextStep } from "@/features/codex";
import type { IssueDetail, Plan, Task, TaskStatus } from "@/gen/types";
import { cn } from "@/lib/cn";
import { type PlanView, usePrefs } from "@/lib/prefs";
import { PlanLanes } from "../PlanLanes";
import { PlanList } from "../PlanList";
import { ASK, SkillHint } from "../skill-hint";
import { InlineText } from "../TaskDetail";

export interface PlanTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function PlanTab({ detail, variant }: PlanTabProps) {
  const planView = usePrefs((s) => s.planView);
  const setPlanView = usePrefs((s) => s.setPlanView);
  const [highlightReady, setHighlightReady] = useState(false);
  const plan = detail.plan;
  const issueId = detail.summary.id;

  if (!plan) return <NoPlan detail={detail} />;

  const tasks = plan.phases.flatMap((p) => p.tasks);
  const readyCount = tasks.filter((t) => t.ready).length;

  return (
    <div data-wf="PlanTab" data-variant={variant} className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <PlanMeta plan={plan} />
        {variant === "page" ? (
          <FoldedContext plan={plan} detail={detail} />
        ) : (
          <PlanContext plan={plan} detail={detail} />
        )}
      </div>

      <section aria-label="Tasks" data-wf="PlanTasks" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-medium text-fg-muted text-sm">Tasks</h3>
            <TaskCounts tasks={tasks} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ReadyToggle
              count={readyCount}
              on={highlightReady && readyCount > 0}
              onChange={setHighlightReady}
            />
            <Segmented<PlanView>
              size="sm"
              aria-label="Plan view"
              value={planView}
              onChange={setPlanView}
              options={[
                {
                  value: "lanes",
                  label: "Lanes",
                  icon: <Columns3 size={14} strokeWidth={1.75} />,
                },
                { value: "list", label: "List", icon: <ListTree size={14} strokeWidth={1.75} /> },
              ]}
            />
          </div>
        </div>
        {planView === "lanes" ? (
          <PlanLanes
            plan={plan}
            criteria={detail.criteria}
            issueId={issueId}
            highlightReady={highlightReady}
          />
        ) : (
          <PlanList
            plan={plan}
            issueId={issueId}
            highlightReady={highlightReady}
            criteria={detail.criteria}
          />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- empty

function NoPlan({ detail }: { detail: IssueDetail }) {
  const { size, signals, id } = detail.summary;
  const nextStep = useNextStep(detail.summary);
  const small = size === "xs" || size === "s";
  const hint = small
    ? "A one-task plan is enough for a small issue. Do next step writes it, then starts on T-1."
    : signals.in_progress_no_plan
      ? "Work started without a plan. Do next step writes it first, so agents can claim tasks in parallel."
      : "A plan splits the goal into tasks that agents can claim in parallel. Do next step writes it first.";
  return (
    <div data-wf="PlanTab" data-state="empty" className="py-6">
      <EmptyState
        icon={<Waypoints size={14} strokeWidth={1.75} />}
        title="No plan yet"
        hint={hint}
        action={
          <div className="flex flex-col items-center gap-3">
            {/* Do next step plans first when the issue has no plan, so the button is the plan. */}
            <Button
              variant="secondary"
              onClick={() => void nextStep.start()}
              disabled={nextStep.busy}
              aria-busy={nextStep.busy || undefined}
            >
              <Play size={14} strokeWidth={1.75} className="fill-current" />
              {nextStep.busy ? "Codex is working" : "Do next step"}
            </Button>
            <SkillHint step="plan" prompt={(skill) => ASK.plan(id, skill)} />
          </div>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- header + context

function PlanMeta({ plan }: { plan: Plan }) {
  return (
    <p
      data-wf="PlanMeta"
      className="flex min-w-0 flex-wrap items-center gap-x-1 text-fg-faint text-sm"
    >
      <span>Revision {plan.revision}</span>
      <span aria-hidden>·</span>
      <span>
        updated <RelativeTime ts={plan.updated_at} long />
      </span>
      <span>by</span>
      <AuthorChip handle={plan.updated_by} variant="text" size="xs" />
    </p>
  );
}

function PlanContext({
  plan,
  detail,
  folded = false,
}: {
  plan: Plan;
  detail: IssueDetail;
  /** Inside the fold, whose row already says "Approach". */
  folded?: boolean;
}) {
  const issueId = detail.summary.id;
  const approach = plan.approach_md.trim();
  const prose = approach && (
    <MarkdownProse md={approach} diagrams={detail.diagrams} issueId={issueId} />
  );
  return (
    <div data-wf="PlanContext" className="flex min-w-0 flex-col gap-5">
      {approach && (folded ? prose : <Section label="Approach">{prose}</Section>)}
      {plan.assumptions.length > 0 && (
        <Section label="Assumptions">
          <ul data-wf="PlanAssumptions" className="flex flex-col">
            {plan.assumptions.map((a) => (
              <li
                key={a.id}
                className="flex min-w-0 items-start gap-2.5 border-border border-t py-1.5 first:border-t-0 first:pt-0"
              >
                <span className="w-6 shrink-0 font-mono text-fg-faint text-xs leading-5">
                  {a.id}
                </span>
                <span className="min-w-0 flex-1 text-base text-fg leading-5">
                  <InlineText text={a.text} />
                </span>
                <span className="shrink-0">
                  {a.state === "confirmed" ? (
                    <Chip tone="success" size="sm">
                      Confirmed
                    </Chip>
                  ) : (
                    <Chip tone="stale" size="sm">
                      Open
                    </Chip>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {plan.prior_art.length > 0 && (
        <div
          data-wf="PlanPriorArt"
          className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
        >
          <span className="text-fg-faint">Prior art</span>
          {plan.prior_art.map((ref) => (
            <RefLink key={ref.target} target={ref.target} issueId={issueId} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Page variant: approach, assumptions and prior art behind one quiet row. */
function FoldedContext({ plan, detail }: { plan: Plan; detail: IssueDetail }) {
  const [open, setOpen] = useState(false);
  const openAssumptions = plan.assumptions.filter((a) => a.state === "open").length;
  const parts: string[] = [];
  if (plan.assumptions.length > 0) {
    parts.push(
      `${plan.assumptions.length} assumption${plan.assumptions.length === 1 ? "" : "s"}` +
        (openAssumptions > 0 ? ` (${openAssumptions} open)` : ""),
    );
  }
  if (plan.prior_art.length > 0) parts.push(`${plan.prior_art.length} prior art`);
  if (!plan.approach_md.trim() && parts.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-wf="PlanContextFold">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group/fold -mx-1.5 flex h-7 w-[calc(100%+--spacing(3))] min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-sm transition-colors duration-150 ease-wf hover:bg-subtle"
        >
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-fg-faint transition-transform duration-150 ease-wf group-data-[state=open]/fold:rotate-90"
          />
          <span className="shrink-0 font-medium text-fg-muted">Approach</span>
          {!open && parts.length > 0 && (
            <span className="min-w-0 truncate text-fg-faint">· {parts.join(" · ")}</span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="-mx-1 -mb-1 px-1 pt-3 pb-1">
        <PlanContext plan={plan} detail={detail} folded />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="font-medium text-fg-muted text-sm">{label}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- task header

const COUNT_ORDER: [TaskStatus, string][] = [
  ["done", "done"],
  ["review", "review"],
  ["in_progress", "in progress"],
  ["blocked", "blocked"],
  ["todo", "to do"],
  ["cancelled", "cancelled"],
];

/** "1 done · 1 review · 1 in progress · 2 to do · 1 ready" — zeros left out. */
function TaskCounts({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <p className="text-fg-faint text-sm">No tasks yet</p>;
  const parts = COUNT_ORDER.map(([status, label]) => ({
    key: status,
    n: tasks.filter((t) => t.status === status).length,
    label,
  })).filter((p) => p.n > 0);
  const ready = tasks.filter((t) => t.ready).length;
  if (ready > 0) parts.push({ key: "todo", n: ready, label: "ready" });

  return (
    <p
      data-wf="PlanTaskCounts"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-fg-faint text-sm"
    >
      {parts.map((p, i) => (
        <span key={`${p.key}-${p.label}`} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          <span>
            <span
              className={cn(
                "tabular",
                p.label === "blocked"
                  ? "text-danger"
                  : p.label === "ready"
                    ? "text-accent"
                    : "text-fg-muted",
              )}
            >
              {p.n}
            </span>{" "}
            {p.label}
          </span>
        </span>
      ))}
    </p>
  );
}

function ReadyToggle({
  count,
  on,
  onChange,
}: {
  count: number;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={on}
      disabled={count === 0}
      onClick={() => onChange(!on)}
      data-wf="PlanReadyToggle"
      className={cn(
        "gap-1.5 px-2",
        "aria-pressed:bg-accent-subtle aria-pressed:text-accent",
        "aria-pressed:hover:bg-accent-subtle aria-pressed:hover:text-accent",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", count > 0 ? "bg-accent" : "bg-fg-faint")}
      />
      Ready
      <span className={cn("tabular", on ? "text-accent" : "text-fg-muted")}>{count}</span>
    </Button>
  );
  if (count === 0) return button;
  return (
    <Tooltip
      content={on ? "Stop highlighting ready tasks" : "Highlight tasks that are ready to claim"}
    >
      {button}
    </Tooltip>
  );
}
