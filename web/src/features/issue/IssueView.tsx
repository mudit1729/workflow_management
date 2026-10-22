// The issue frame: header plus tabs (drawer, narrow page) or columns (page).
import { CircleAlert, FileX } from "lucide-react";
import { type ReactNode, useState } from "react";
import { EmptyState, LintBadge } from "@/components/common";
import {
  Button,
  Segmented,
  Sheet,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import type { Diagnostic, IssueDetail, IssueId, LintCounts } from "@/gen/types";
import { useIssue, useIssueSummary, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useHotkey, useMediaQuery } from "@/lib/hooks";
import { ISSUE_TABS, type IssueTab, useCloseIssue, useGo, useIssueTab } from "@/lib/nav";
import { IssueHeader } from "./IssueHeader";
import { IssueSkeleton } from "./IssueSkeleton";
import { FilesTab } from "./tabs/FilesTab";
import { GoalTab } from "./tabs/GoalTab";
import { LogTab } from "./tabs/LogTab";
import { NowTab } from "./tabs/NowTab";
import { PlanTab } from "./tabs/PlanTab";

export type IssueVariant = "drawer" | "page";

interface IssueViewProps {
  id: IssueId;
  variant: IssueVariant;
}

export function IssueView({ id, variant }: IssueViewProps) {
  const query = useIssue(id);
  const detail = query.data;

  // Data wins over a failed background refetch: keep showing what we have.
  if (!detail) {
    if (query.isPending) return <IssueSkeleton variant={variant} />;
    return (
      <IssueUnavailable
        id={id}
        variant={variant}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  // Keyed by id: switching issues resets scroll positions and local view state.
  return variant === "drawer" ? (
    <DrawerFrame key={detail.summary.id} detail={detail} />
  ) : (
    <PageFrame key={detail.summary.id} detail={detail} />
  );
}

// ---------------------------------------------------------------- drawer

function DrawerFrame({ detail }: { detail: IssueDetail }) {
  const { setTab } = useIssueTab();
  return (
    <div data-wf="IssueView" data-variant="drawer" className="flex h-full min-h-0 flex-col">
      <IssueHeader detail={detail} variant="drawer" onOpenFiles={() => setTab("files")} />
      <IssueTabs detail={detail} variant="drawer" />
    </div>
  );
}

/** Now · Goal · Plan · Log · Files, each panel its own scroll region. Keys 1–5 switch. */
function IssueTabs({ detail, variant }: { detail: IssueDetail; variant: IssueVariant }) {
  const { tab, setTab } = useIssueTab();
  const counts = tabCounts(detail);

  useHotkey(["1", "2", "3", "4", "5"], (e) => {
    const next = ISSUE_TABS[Number(e.key) - 1];
    if (next) setTab(next);
  });

  const panel = "min-h-0 flex-1 overflow-y-auto p-4 outline-none";

  return (
    <Tabs
      value={tab}
      onValueChange={(v: string) => setTab(v as IssueTab)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList aria-label="Issue sections" className="px-4">
        <TabsTrigger
          value="now"
          count={counts.needsYou > 0 ? counts.needsYou : undefined}
          countTone="accent"
          title={counts.needsYou > 0 ? `${counts.needsYou} needs you` : undefined}
        >
          Now
        </TabsTrigger>
        <TabsTrigger
          value="goal"
          count={
            counts.criteria.total > 0
              ? `${counts.criteria.verified}/${counts.criteria.total}`
              : undefined
          }
          title={
            counts.criteria.total > 0
              ? `${counts.criteria.verified} of ${counts.criteria.total} criteria verified`
              : undefined
          }
        >
          Goal
        </TabsTrigger>
        <TabsTrigger
          value="plan"
          count={counts.tasks.total > 0 ? `${counts.tasks.done}/${counts.tasks.total}` : undefined}
          title={
            counts.tasks.total > 0
              ? `${counts.tasks.done} of ${counts.tasks.total} tasks done`
              : undefined
          }
        >
          Plan
        </TabsTrigger>
        <TabsTrigger value="log" count={counts.log > 0 ? counts.log : undefined}>
          Log
        </TabsTrigger>
        <TabsTrigger
          value="files"
          count={
            counts.docs > 0 || counts.lintTotal > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                {counts.docs > 0 && counts.docs}
                {counts.lintTotal > 0 && <LintBadge counts={counts.lint} variant="dot" />}
              </span>
            ) : undefined
          }
        >
          Files
        </TabsTrigger>
      </TabsList>
      <TabsContent value="now" className={panel}>
        <NowTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="goal" className={panel}>
        <GoalTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="plan" className={panel}>
        <PlanTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="log" className={panel}>
        <LogTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="files" className={panel}>
        <FilesTab detail={detail} variant={variant} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------- page

function PageFrame({ detail }: { detail: IssueDetail }) {
  const [filesOpen, setFilesOpen] = useState(false);
  const { setTab } = useIssueTab();
  const narrow = useMediaQuery("(max-width: 767px)");
  const wide = useMediaQuery("(min-width: 1100px)");
  const counts = tabCounts(detail);

  return (
    <div data-wf="IssueView" data-variant="page" className="flex h-full min-h-0 flex-col">
      <IssueHeader
        detail={detail}
        variant="page"
        onOpenFiles={() => (narrow ? setTab("files") : setFilesOpen(true))}
      />
      {narrow ? (
        <IssueTabs detail={detail} variant="page" />
      ) : wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 divide-x divide-border">
          <Column label="Now and goal">
            <NowGoalSections detail={detail} counts={counts} />
          </Column>
          <Column label="Plan">
            <ColumnSection title="Plan" meta={<PlanCount counts={counts} />}>
              <PlanTab detail={detail} variant="page" />
            </ColumnSection>
          </Column>
          <Column label="Log">
            <ColumnSection
              title="Log"
              meta={
                counts.log > 0 && <TabCount label={`${counts.log} entries`}>{counts.log}</TabCount>
              }
            >
              <LogTab detail={detail} variant="page" />
            </ColumnSection>
          </Column>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
          <Column label="Now and goal">
            <NowGoalSections detail={detail} counts={counts} />
          </Column>
          <PlanOrLogColumn detail={detail} counts={counts} />
        </div>
      )}
      <Sheet open={filesOpen} onOpenChange={setFilesOpen} side="right" width={560} title="Files">
        <div className="px-4 pb-4">
          <FilesTab detail={detail} variant="page" onNavigate={() => setFilesOpen(false)} />
        </div>
      </Sheet>
    </div>
  );
}

function NowGoalSections({ detail, counts }: { detail: IssueDetail; counts: TabCounts }) {
  return (
    <>
      <ColumnSection
        title="Now"
        meta={
          counts.needsYou > 0 && (
            <TabCount tone="accent" label={`${counts.needsYou} needs you`}>
              {counts.needsYou}
            </TabCount>
          )
        }
      >
        <NowTab detail={detail} variant="page" />
      </ColumnSection>
      <ColumnSection
        title="Goal"
        className="border-t border-border"
        meta={
          counts.criteria.total > 0 && (
            <TabCount
              label={`${counts.criteria.verified} of ${counts.criteria.total} criteria verified`}
            >
              {counts.criteria.verified}/{counts.criteria.total}
            </TabCount>
          )
        }
      >
        <GoalTab detail={detail} variant="page" />
      </ColumnSection>
    </>
  );
}

/** Medium widths: Plan and Log share the second column behind a Segmented. */
function PlanOrLogColumn({ detail, counts }: { detail: IssueDetail; counts: TabCounts }) {
  const { tab, setTab } = useIssueTab();
  const view: "plan" | "log" = tab === "log" ? "log" : "plan";
  return (
    <Column label="Plan and log">
      <div className="sticky top-0 z-10 flex h-10 items-center bg-bg px-5">
        <Segmented<"plan" | "log">
          size="sm"
          aria-label="Show plan or log"
          value={view}
          onChange={(v: "plan" | "log") => setTab(v)}
          options={[
            {
              value: "plan",
              label:
                counts.tasks.total > 0 ? (
                  <>
                    Plan
                    <span className="font-normal text-fg-faint tabular">
                      {counts.tasks.done}/{counts.tasks.total}
                    </span>
                  </>
                ) : (
                  "Plan"
                ),
            },
            { value: "log", label: "Log", count: counts.log > 0 ? counts.log : undefined },
          ]}
        />
      </div>
      <div className="px-5 pt-1 pb-8">
        {view === "plan" ? (
          <PlanTab detail={detail} variant="page" />
        ) : (
          <LogTab detail={detail} variant="page" />
        )}
      </div>
    </Column>
  );
}

function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      data-wf="IssueColumn"
      className="min-h-0 min-w-0 overflow-y-auto overscroll-contain"
    >
      {children}
    </section>
  );
}

/** A column section with a sticky title; the next section's title pushes it away. */
function ColumnSection({
  title,
  meta,
  className,
  children,
}: {
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <h2 className="sticky top-0 z-10 flex h-10 items-center gap-2 bg-bg px-5 font-medium text-fg-faint text-sm">
        {title}
        {meta}
      </h2>
      <div className="px-5 pt-1 pb-8">{children}</div>
    </div>
  );
}

function PlanCount({ counts }: { counts: TabCounts }) {
  if (counts.tasks.total === 0) return null;
  return (
    <TabCount label={`${counts.tasks.done} of ${counts.tasks.total} tasks done`}>
      {counts.tasks.done}/{counts.tasks.total}
    </TabCount>
  );
}

// ---------------------------------------------------------------- counts

interface TabCounts {
  needsYou: number;
  criteria: { verified: number; total: number };
  tasks: { done: number; total: number };
  log: number;
  docs: number;
  lint: LintCounts;
  lintTotal: number;
}

function tabCounts(detail: IssueDetail): TabCounts {
  const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
  const openRequests = detail.state?.needs_you.filter((n) => !n.answered).length;
  const lint = lintCounts(detail.diagnostics);
  return {
    needsYou: openRequests ?? detail.summary.signals.needs_you,
    criteria: {
      verified: detail.criteria.filter((c) => c.state === "verified").length,
      total: detail.criteria.length,
    },
    tasks: { done: tasks.filter((t) => t.status === "done").length, total: tasks.length },
    log: detail.changes.length + detail.decisions.length + detail.learnings.length,
    docs: detail.docs.length,
    lint,
    lintTotal: lint.error + lint.warn + lint.info,
  };
}

function lintCounts(diagnostics: Diagnostic[]): LintCounts {
  const counts: LintCounts = { error: 0, warn: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity] += 1;
  return counts;
}

/** Count after a column title; matches the TabsTrigger count style. Accent only for needs-you. */
function TabCount({
  children,
  label,
  tone = "faint",
}: {
  children: ReactNode;
  label: string;
  tone?: "faint" | "accent";
}) {
  return (
    <span
      data-wf="TabCount"
      className={cn(
        "tabular text-sm",
        tone === "accent" ? "font-medium text-accent" : "font-normal text-fg-faint",
      )}
    >
      <span aria-hidden>{children}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------- not found / error

function IssueUnavailable({
  id,
  variant,
  error,
  onRetry,
}: {
  id: IssueId;
  variant: IssueVariant;
  error: unknown;
  onRetry: () => void;
}) {
  const close = useCloseIssue();
  const go = useGo();
  const snapshot = useSnapshot();
  const summary = useIssueSummary(id);
  const status = (error as { status?: number } | null)?.status;
  // Not found: the server says 404, or the loaded snapshot has no such issue.
  const notFound = !error || status === 404 || (snapshot.data != null && summary == null);
  const back = () => (variant === "drawer" ? close() : go.board());

  return (
    <div
      data-wf="IssueView"
      data-variant={variant}
      data-state={notFound ? "not-found" : "error"}
      className="flex h-full min-h-0 items-center justify-center p-6"
    >
      {notFound ? (
        <EmptyState
          icon={<FileX size={20} strokeWidth={1.75} />}
          title={`Issue ${id} not found`}
          hint="Check the id. The issue folder may have moved or been deleted."
          action={
            <Button variant="secondary" size="sm" onClick={back}>
              Back to board
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<CircleAlert size={20} strokeWidth={1.75} />}
          title={`Could not load ${id}`}
          hint={errorMessage(error)}
          command="wf doctor"
          action={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={back}>
                Back to board
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The server did not answer. Check that wf serve is running.";
}
