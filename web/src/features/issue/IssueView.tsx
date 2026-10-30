// The issue frame: header plus tabs (drawer, narrow page) or columns (page).
import { CircleAlert, FileX, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { EmptyState, LintBadge } from "@/components/common";
import {
  Button,
  IconButton,
  Sheet,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import type { IssueDetail, IssueId, LintCounts } from "@/gen/types";
import { NotFoundError, useDelivery, useIssue, useIssueSummary, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useHotkey, useMediaQuery } from "@/lib/hooks";
import { ISSUE_TABS, type IssueTab, useCloseIssue, useGo, useIssueTab } from "@/lib/nav";
import { CiDot, ciTitle, type DeliveryCounts, deliveryCounts, gitTitle } from "./delivery-ui";
import { IssueHeader } from "./IssueHeader";
import { IssueSkeleton } from "./IssueSkeleton";
import { countBySeverity } from "./LintPanel";
import { CiTab } from "./tabs/CiTab";
import { CriteriaTab } from "./tabs/CriteriaTab";
import { FilesTab } from "./tabs/FilesTab";
import { GitTab } from "./tabs/GitTab";
import { GoalTab } from "./tabs/GoalTab";
import { LogTab } from "./tabs/LogTab";
import { NowTab } from "./tabs/NowTab";
import { PlanTab } from "./tabs/PlanTab";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export type IssueVariant = "drawer" | "page";

interface IssueViewProps {
  id: IssueId;
  variant: IssueVariant;
}

export function IssueView({ id, variant }: IssueViewProps) {
  const query = useIssue(id);
  const detail = query.data;

  // Data wins over a failed background refetch: keep showing what we have. Except a 404: the
  // issue is gone (its folder was deleted, or Reset data / the Kit put another workspace back),
  // so the copy we still hold must not stay on screen.
  const gone = query.error instanceof NotFoundError;
  if (!detail || gone) {
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

/**
 * Now · Goal · Criteria · Plan · Log · Git · CI · Files, each panel its own scroll region. Keys 1–8
 * switch. Eight labels do not always fit a 440 px drawer or a phone, so the strip scrolls sideways
 * there and keeps the active tab in view.
 */
function IssueTabs({ detail, variant }: { detail: IssueDetail; variant: IssueVariant }) {
  const { tab, setTab } = useIssueTab();
  const counts = useTabCounts(detail);

  useHotkey(["1", "2", "3", "4", "5", "6", "7", "8"], (e) => {
    const next = ISSUE_TABS[Number(e.key) - 1];
    if (next) setTab(next);
  });

  // `relative` keeps absolutely positioned descendants (sr-only text) inside the scroll region,
  // so they never extend the page's scrollable area.
  const panel = "relative min-h-0 flex-1 overflow-y-auto p-4 outline-none";

  return (
    <Tabs
      value={tab}
      onValueChange={(v: string) => setTab(v as IssueTab)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabStrip active={tab}>
        <TabsList aria-label="Issue sections" className="min-w-max gap-3 px-4">
          <TabsTrigger
            value="now"
            count={counts.needsYou > 0 ? counts.needsYou : undefined}
            countTone="accent"
            title={counts.needsYou > 0 ? `${counts.needsYou} needs you` : undefined}
          >
            Now
          </TabsTrigger>
          <TabsTrigger value="goal">Goal</TabsTrigger>
          <TabsTrigger
            value="criteria"
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
            Criteria
          </TabsTrigger>
          <TabsTrigger
            value="plan"
            count={
              counts.tasks.total > 0 ? `${counts.tasks.done}/${counts.tasks.total}` : undefined
            }
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
            value="git"
            count={counts.delivery.commits > 0 ? counts.delivery.commits : undefined}
            title={gitTitle(counts.delivery)}
          >
            Git
          </TabsTrigger>
          <TabsTrigger
            value="ci"
            count={counts.delivery.latest ? <CiDot state={counts.delivery.latest} /> : undefined}
            title={ciTitle(counts.delivery.latest)}
          >
            CI
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
      </TabStrip>
      <TabsContent value="now" className={panel}>
        <NowTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="goal" className={panel}>
        <GoalTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="criteria" className={panel}>
        <CriteriaTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="plan" className={panel}>
        <PlanTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="log" className={panel}>
        <LogTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="git" className={panel}>
        <GitTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="ci" className={panel}>
        <CiTab detail={detail} variant={variant} />
      </TabsContent>
      <TabsContent value="files" className={panel}>
        <FilesTab detail={detail} variant={variant} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Scrolls the tab list sideways when its labels do not fit, with the scrollbar hidden and a fade
 * on the side that has more. The active tab is brought into view when it changes (keys 1–8, a
 * link from another tab).
 */
function TabStrip({ active, children }: { active: IssueTab; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const activeRef = useRef(active);
  activeRef.current = active;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    // A count or a dot that arrives later widens a tab: keep the active one in view then too.
    const list = el.firstElementChild;
    let listWidth = list?.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      read();
      const width = list?.getBoundingClientRect().width;
      if (width !== listWidth) {
        listWidth = width;
        revealActive(el);
      }
    });
    ro.observe(el);
    if (list) ro.observe(list);
    return () => {
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the active tab changes
  useEffect(() => {
    if (ref.current) revealActive(ref.current);
  }, [active]);

  const fade = "24px";
  const mask: CSSProperties["maskImage"] =
    edges.left && edges.right
      ? `linear-gradient(to right, transparent, black ${fade}, black calc(100% - ${fade}), transparent)`
      : edges.right
        ? `linear-gradient(to right, black calc(100% - ${fade}), transparent)`
        : edges.left
          ? `linear-gradient(to left, black calc(100% - ${fade}), transparent)`
          : undefined;

  return (
    <div
      ref={ref}
      data-wf="TabStrip"
      className="shrink-0 scroll-px-6 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      style={{ maskImage: mask }}
    >
      {children}
    </div>
  );
}

/** Scrolls the strip so the active tab is fully in view (scroll-padding keeps it off the fades). */
function revealActive(strip: HTMLElement) {
  strip
    .querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ---------------------------------------------------------------- page

function PageFrame({ detail }: { detail: IssueDetail }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const { setTab } = useIssueTab();
  const narrow = useMediaQuery("(max-width: 767px)");
  // Three columns by the width of the page region, not the viewport: the nav rail takes 232 px.
  const wide = useElementWidth(rootRef) >= THREE_COLUMNS_MIN;
  const counts = useTabCounts(detail);

  // A file picked in the Files sheet: close the sheet and bring its section into view.
  const showSection = (tab: IssueTab) => {
    setFilesOpen(false);
    window.requestAnimationFrame(() => scrollToSection(rootRef.current, tab));
  };

  return (
    <div
      ref={rootRef}
      data-wf="IssueView"
      data-variant="page"
      className="flex h-full min-h-0 flex-col"
    >
      <IssueHeader
        detail={detail}
        variant="page"
        onOpenFiles={() => (narrow ? setTab("files") : setFilesOpen(true))}
      />
      {narrow ? (
        <IssueTabs detail={detail} variant="page" />
      ) : wide ? (
        // Now and Goal | Plan and Criteria | Log, Git and CI. Files sits behind the header button.
        <div
          data-wf="IssueColumns"
          className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(480px,1.3fr)_minmax(0,1fr)] divide-x divide-border"
        >
          <Column label="Now and goal">
            <NowGoalSections detail={detail} counts={counts} />
          </Column>
          <Column label="Plan and criteria">
            <ColumnSection section="plan" title="Plan" meta={<PlanCount counts={counts} />}>
              <PlanTab detail={detail} variant="page" />
            </ColumnSection>
            <CriteriaSection detail={detail} counts={counts} className="border-border border-t" />
          </Column>
          <ViewColumn
            label="Log, git and CI"
            views={["log", "git", "ci"]}
            detail={detail}
            counts={counts}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
          <Column label="Now and goal">
            <NowGoalSections detail={detail} counts={counts} />
          </Column>
          <ViewColumn
            label="Plan, criteria, log, git and CI"
            views={["plan", "criteria", "log", "git", "ci"]}
            detail={detail}
            counts={counts}
          />
        </div>
      )}
      <Sheet open={filesOpen} onOpenChange={setFilesOpen} side="right" width={560} title="Files">
        <div className="px-4 pb-4">
          <FilesTab detail={detail} variant="page" onNavigate={showSection} />
        </div>
      </Sheet>
    </div>
  );
}

/** The page region needs this much width for Now and goal, a 480 px Plan and the Log side by side. */
const THREE_COLUMNS_MIN = 1080;

/** Live width of an element's box. 0 until measured (a layout effect, so before first paint). */
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function NowGoalSections({ detail, counts }: { detail: IssueDetail; counts: TabCounts }) {
  return (
    <>
      <ColumnSection
        section="now"
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
      <ColumnSection section="goal" title="Goal" className="border-border border-t">
        <GoalTab detail={detail} variant="page" />
      </ColumnSection>
    </>
  );
}

function CriteriaSection({
  detail,
  counts,
  className,
}: {
  detail: IssueDetail;
  counts: TabCounts;
  className?: string;
}) {
  return (
    <ColumnSection
      section="criteria"
      title="Criteria"
      className={className}
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
      <CriteriaTab detail={detail} variant="page" />
    </ColumnSection>
  );
}

type ColumnView = "plan" | "criteria" | "log" | "git" | "ci";

/**
 * A column whose body is one of several views, picked from a row of titles that looks like the
 * other columns' section titles: Plan · Criteria · Log · Git · CI at medium widths, Log · Git · CI
 * in the third column of the wide page. The view follows the `tab` search param when it names one
 * of the column's views; any other tab (a T-n pill asks for Plan while the wide page shows the
 * plan in its own column) leaves the view where it is.
 */
function ViewColumn({
  label,
  views,
  detail,
  counts,
}: {
  label: string;
  views: ColumnView[];
  detail: IssueDetail;
  counts: TabCounts;
}) {
  const { tab, setTab } = useIssueTab();
  const [view, setView] = useState<ColumnView>(() =>
    views.includes(tab as ColumnView) ? (tab as ColumnView) : views[0],
  );
  const [lastTab, setLastTab] = useState(tab);
  // Follow the search param during render (no flash of the old view).
  if (tab !== lastTab) {
    setLastTab(tab);
    if (views.includes(tab as ColumnView) && tab !== view) setView(tab as ColumnView);
  }

  const count: Record<ColumnView, ReactNode> = {
    plan: counts.tasks.total > 0 ? `${counts.tasks.done}/${counts.tasks.total}` : undefined,
    criteria:
      counts.criteria.total > 0
        ? `${counts.criteria.verified}/${counts.criteria.total}`
        : undefined,
    log: counts.log > 0 ? counts.log : undefined,
    git: counts.delivery.commits > 0 ? counts.delivery.commits : undefined,
    ci: counts.delivery.latest ? <CiDot state={counts.delivery.latest} /> : undefined,
  };
  const title: Record<ColumnView, string | undefined> = {
    plan:
      counts.tasks.total > 0
        ? `${counts.tasks.done} of ${counts.tasks.total} tasks done`
        : undefined,
    criteria:
      counts.criteria.total > 0
        ? `${counts.criteria.verified} of ${counts.criteria.total} criteria verified`
        : undefined,
    log: undefined,
    git: gitTitle(counts.delivery),
    ci: ciTitle(counts.delivery.latest),
  };
  const name: Record<ColumnView, string> = {
    plan: "Plan",
    criteria: "Criteria",
    log: "Log",
    git: "Git",
    ci: "CI",
  };

  return (
    <Column label={label}>
      <Tabs
        value={view}
        onValueChange={(v: string) => {
          setView(v as ColumnView);
          void setTab(v as IssueTab);
        }}
      >
        <TabsList
          aria-label={label}
          // Same height and weight as a column title; the shown view reads darker.
          className="sticky top-0 z-raised h-10 gap-3.5 border-b-0 bg-bg px-5"
        >
          {views.map((v) => (
            <TabsTrigger
              key={v}
              value={v}
              count={count[v]}
              title={title[v]}
              className="border-b-0 text-fg-faint text-sm hover:text-fg-muted data-[state=active]:text-fg"
            >
              {name[v]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={view} data-section={view} className="px-5 pt-1 pb-8">
          {view === "plan" && <PlanTab detail={detail} variant="page" />}
          {view === "criteria" && <CriteriaTab detail={detail} variant="page" />}
          {view === "log" && <LogTab detail={detail} variant="page" />}
          {view === "git" && <GitTab detail={detail} variant="page" />}
          {view === "ci" && <CiTab detail={detail} variant="page" />}
        </TabsContent>
      </Tabs>
    </Column>
  );
}

function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      data-wf="IssueColumn"
      className="relative min-h-0 min-w-0 overflow-y-auto overscroll-contain"
    >
      {children}
    </section>
  );
}

/** A column section with a sticky title; the next section's title pushes it away. */
function ColumnSection({
  section,
  title,
  meta,
  className,
  children,
}: {
  section: IssueTab;
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-section={section} className={className}>
      <h2 className="sticky top-0 z-raised flex h-10 items-center gap-2 bg-bg px-5 font-medium text-fg-faint text-sm">
        {title}
        {meta}
      </h2>
      <div className="px-5 pt-1 pb-8">{children}</div>
    </div>
  );
}

/** Scrolls the column that holds `tab`'s section so the section starts at the top. */
function scrollToSection(root: HTMLElement | null, tab: IssueTab) {
  const section = root?.querySelector<HTMLElement>(`[data-section="${tab}"]`);
  const column = section?.closest<HTMLElement>('[data-wf="IssueColumn"]');
  if (!section || !column) return;
  const top =
    section.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop;
  column.scrollTo({ top, behavior: "smooth" });
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
  delivery: DeliveryCounts;
  docs: number;
  lint: LintCounts;
  lintTotal: number;
}

/** What the tab strip, the column titles and the segmented controls count. */
function useTabCounts(detail: IssueDetail): TabCounts {
  const { commits, prs, pipelines } = useDelivery(detail.summary.id);
  const delivery = deliveryCounts({ commits, prs, pipelines });
  const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
  const openRequests = detail.state?.needs_you.filter((n) => !n.answered).length;
  const lint = countBySeverity(detail.diagnostics);
  return {
    needsYou: openRequests ?? detail.summary.signals.needs_you,
    criteria: {
      verified: detail.criteria.filter((c) => c.state === "verified").length,
      total: detail.criteria.length,
    },
    tasks: { done: tasks.filter((t) => t.status === "done").length, total: tasks.length },
    log: detail.changes.length + detail.decisions.length + detail.learnings.length,
    delivery,
    docs: detail.docs.length,
    lint,
    lintTotal: lint.error + lint.warn + lint.info,
  };
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
      className="relative flex h-full min-h-0 items-center justify-center p-6"
    >
      {variant === "drawer" && (
        <div className="absolute top-2 right-3">
          <IconButton
            size="sm"
            label="Close"
            shortcut="Escape"
            icon={<X {...ICON} />}
            onClick={() => void close()}
          />
        </div>
      )}
      {notFound ? (
        <EmptyState
          icon={<FileX {...ICON} />}
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
          icon={<CircleAlert {...ICON} />}
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
