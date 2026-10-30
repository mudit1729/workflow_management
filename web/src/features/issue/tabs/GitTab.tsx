// Git tab: the pull requests and commits that carry this issue. Derived, never stored in the
// workspace (plan D2): a commit belongs to the issue when its message has the trailer
// `Issue: wf-xxxxx` or its branch is named `wf-xxxxx/…`; `gh` adds the pull requests and checks.
// The prototype reads a fixture, so there are no links out: `url` is null.
import {
  Check,
  CircleDashed,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquareWarning,
} from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { AuthorChip, copyText, EmptyState, RelativeTime } from "@/components/common";
import { Skeleton, Tooltip } from "@/components/ui";
import type { IssueDetail, Task, TaskId } from "@/gen/types";
import type { Commit, PullRequest, PullRequestState, ReviewState } from "@/lib/api";
import { useDelivery } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useIssueTab } from "@/lib/nav";
import { RunStateIcon, shortBranch, TrailerCopy, useFreshKeys } from "../delivery-ui";
import { TaskPill } from "../TaskPill";
import { useTaskFocus } from "../task-focus";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export interface GitTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function GitTab({ detail, variant }: GitTabProps) {
  const issueId = detail.summary.id;
  const { commits, prs, isLoading, error } = useDelivery(issueId);
  const { setTab } = useIssueTab();
  const focusTask = useTaskFocus((s) => s.focusTask);
  const tasks = useMemo(
    () => new Map(detail.plan?.phases.flatMap((p) => p.tasks).map((t) => [t.id, t]) ?? []),
    [detail.plan],
  );
  const fresh = useFreshKeys(
    [...prs.map((p) => `pr-${p.number}`), ...commits.map((c) => `commit-${c.sha}`)],
    !isLoading,
  );

  // The commit's task, selected in the Plan tab.
  const openTask = (task: TaskId) => {
    focusTask(issueId, task);
    void setTab("plan");
  };

  let body: ReactNode;
  if (isLoading) {
    body = <GitSkeleton />;
  } else if (error && commits.length === 0 && prs.length === 0) {
    body = (
      <p role="alert" className="py-6 text-center text-fg-muted text-sm">
        Could not read git data. {error.message}
      </p>
    );
  } else if (commits.length === 0 && prs.length === 0) {
    body = <GitEmpty issueId={issueId} />;
  } else {
    body = (
      <>
        <GitSection title="Pull requests" count={prs.length}>
          {prs.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {prs.map((pr) => (
                <PullRequestRow
                  key={pr.number}
                  pr={pr}
                  issueId={issueId}
                  fresh={fresh.has(`pr-${pr.number}`)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-fg-faint text-sm">
              No pull request yet. Open one from a branch named{" "}
              <code className="code-inline rounded-sm bg-muted px-1 py-px text-fg-muted">
                {issueId}/…
              </code>
              .
            </p>
          )}
        </GitSection>
        <GitSection title="Commits" count={commits.length}>
          {commits.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {commits.map((commit) => (
                <CommitRow
                  key={commit.sha}
                  commit={commit}
                  issueId={issueId}
                  task={commit.task ? tasks.get(commit.task) : undefined}
                  prs={prs}
                  onOpenTask={openTask}
                  fresh={fresh.has(`commit-${commit.sha}`)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-fg-faint text-sm">No commits listed for these pull requests.</p>
          )}
        </GitSection>
      </>
    );
  }

  return (
    <div data-wf="GitTab" data-variant={variant} className="flex min-w-0 flex-col gap-6">
      {body}
    </div>
  );
}

// ---------------------------------------------------------------- section

function GitSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0">
      <header className="mb-2 flex min-h-5 items-center gap-2">
        <h3 id={id} className="font-medium text-fg-muted text-sm">
          {title}
        </h3>
        <span className="text-fg-faint text-sm tabular">{count}</span>
      </header>
      {children}
    </section>
  );
}

function GitSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading git data"
      className="flex flex-col gap-2"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-16 w-full rounded-md" />
      <Skeleton className="mt-3 h-3 w-20" />
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-md" />
    </div>
  );
}

// ---------------------------------------------------------------- empty

/** Nothing links to the issue yet: say how a commit finds it. */
function GitEmpty({ issueId }: { issueId: string }) {
  const trailer = `Issue: ${issueId}`;
  const code = "code-inline rounded-sm bg-muted px-1 py-px text-fg";
  return (
    <div data-wf="GitEmpty">
      <EmptyState
        icon={<GitCommitHorizontal strokeWidth={1.75} />}
        title={`No commits mention ${issueId} yet.`}
        hint={
          <>
            Add <code className={code}>{trailer}</code> to a commit message or name the branch{" "}
            <code className={code}>{issueId}/…</code>
          </>
        }
        action={
          <div className="flex flex-col items-center gap-3">
            <TrailerCopy trailer={trailer} />
            <p className="max-w-[300px] text-fg-faint text-sm">
              Commits and pull requests come from git and GitHub. Nothing is stored in the
              workspace.
            </p>
          </div>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- pull requests

const PR_STATE: Record<
  PullRequestState,
  { label: string; icon: typeof GitPullRequest; color: string }
> = {
  open: { label: "Open", icon: GitPullRequest, color: "var(--wf-status-in_progress)" },
  draft: { label: "Draft", icon: GitPullRequestDraft, color: "var(--wf-status-backlog)" },
  merged: { label: "Merged", icon: GitMerge, color: "var(--wf-status-done)" },
  closed: { label: "Closed", icon: GitPullRequestClosed, color: "var(--wf-status-cancelled)" },
};

function PrStateBadge({ state }: { state: PullRequestState }) {
  const s = PR_STATE[state];
  const Icon = s.icon;
  return (
    <span
      data-wf="PrStateBadge"
      className="inline-flex h-5 shrink-0 items-center gap-1 self-center rounded-sm bg-muted px-1.5 font-medium text-fg-muted text-xs"
    >
      <Icon size={12} strokeWidth={1.75} aria-hidden style={{ color: s.color }} />
      {s.label}
    </span>
  );
}

const REVIEW: Record<ReviewState, { label: string; tone: string }> = {
  approved: { label: "Approved", tone: "text-success-text" },
  changes_requested: { label: "Changes requested", tone: "text-stale-text" },
  pending: { label: "Review pending", tone: "text-fg-faint" },
};

function ReviewMark({ review }: { review: ReviewState }) {
  const r = REVIEW[review];
  return (
    <span className={cn("inline-flex items-center gap-1", r.tone)}>
      {review === "approved" ? (
        <Check size={12} strokeWidth={2} aria-hidden />
      ) : review === "changes_requested" ? (
        <MessageSquareWarning size={12} strokeWidth={1.75} aria-hidden />
      ) : (
        <CircleDashed size={12} strokeWidth={1.75} aria-hidden />
      )}
      {r.label}
    </span>
  );
}

/** "5 passed · 1 pending", with the glyph of the worst state; failed is the only red. */
function ChecksSummary({ checks }: { checks: PullRequest["checks"] }) {
  const { passed, failed, pending } = checks;
  if (passed + failed + pending === 0) return <span>No checks</span>;
  const state = failed > 0 ? "failure" : pending > 0 ? "in_progress" : "success";
  return (
    <span className="inline-flex items-center gap-1.5">
      <RunStateIcon state={state} size={12} label="Checks" />
      <span>
        {failed > 0 && <span className="text-danger">{failed} failed</span>}
        {failed > 0 && passed + pending > 0 && " · "}
        {passed > 0 && `${passed} passed`}
        {passed > 0 && pending > 0 && " · "}
        {pending > 0 && `${pending} pending`}
      </span>
    </span>
  );
}

export function PullRequestRow({
  pr,
  issueId,
  fresh,
}: {
  pr: PullRequest;
  issueId: string;
  fresh: boolean;
}) {
  return (
    <li
      data-wf="PullRequestRow"
      data-pr={pr.number}
      className={cn("flex min-w-0 flex-col gap-1 px-3 py-2", fresh && "wf-flash")}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono text-fg-faint text-xs tabular">#{pr.number}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-base text-fg" title={pr.title}>
          {pr.title}
        </span>
        <PrStateBadge state={pr.state} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-fg-muted text-sm">
        <ReviewMark review={pr.review} />
        <Dot />
        <ChecksSummary checks={pr.checks} />
      </div>
      <div className="flex min-w-0 items-center gap-x-2 text-fg-faint text-sm">
        <BranchName branch={pr.branch} issueId={issueId} />
        <Dot />
        <AuthorChip handle={pr.author} className="shrink-0" />
        <Dot />
        <RelativeTime ts={pr.updated_at} />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- commits

export function CommitRow({
  commit,
  issueId,
  task,
  prs,
  onOpenTask,
  fresh,
}: {
  commit: Commit;
  issueId: string;
  task?: Task;
  prs: PullRequest[];
  onOpenTask: (task: TaskId) => void;
  fresh: boolean;
}) {
  const pr = commit.pr != null ? prs.find((p) => p.number === commit.pr) : undefined;
  return (
    <li
      data-wf="CommitRow"
      data-sha={commit.sha}
      className={cn("flex min-w-0 flex-col gap-1 px-3 py-2", fresh && "wf-flash")}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ShaButton commit={commit} issueId={issueId} />
        <span className="min-w-0 flex-1 truncate text-base text-fg" title={commit.subject}>
          {commit.subject}
        </span>
        {commit.task &&
          (task ? (
            <TaskPill
              task={task}
              size="sm"
              showTitle={false}
              showClaimant={false}
              onClick={() => onOpenTask(task.id)}
              aria-label={`Open ${task.id} in the plan`}
            />
          ) : (
            <span className="shrink-0 rounded-sm bg-muted px-1.5 font-mono text-fg-muted text-xs leading-5">
              {commit.task}
            </span>
          ))}
      </div>
      <div className="flex min-w-0 items-center gap-x-2 text-fg-faint text-sm">
        <AuthorChip handle={commit.author} className="shrink-0" />
        <Dot />
        <RelativeTime ts={commit.at} />
        <Dot />
        <BranchName branch={commit.branch} issueId={issueId} />
        {commit.pr != null && (
          <>
            <Dot />
            <PrJump number={commit.pr} state={pr?.state} />
          </>
        )}
      </div>
    </li>
  );
}

/** The 7-character sha in mono. Click copies it; the tooltip says how the commit found the issue. */
function ShaButton({ commit, issueId }: { commit: Commit; issueId: string }) {
  const [copied, setCopied] = useState(false);
  const how = commit.trailer
    ? `Linked by the trailer ${commit.trailer}`
    : `Linked by the branch name ${issueId}/…`;
  return (
    <Tooltip
      content={
        <div className="flex flex-col gap-0.5 py-0.5 text-xs">
          <span className="font-medium">{copied ? "Copied" : "Copy commit sha"}</span>
          <span className="opacity-75">{how}</span>
        </div>
      }
    >
      <button
        type="button"
        data-wf="CommitSha"
        aria-label={`Copy commit sha ${commit.sha}`}
        onClick={async () => {
          if (await copyText(commit.sha)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }
        }}
        className="shrink-0 cursor-default rounded-sm bg-muted px-1 font-mono text-fg-muted text-xs leading-5 tabular transition-colors duration-100 ease-wf hover:bg-border"
      >
        {commit.sha.slice(0, 7)}
      </button>
    </Tooltip>
  );
}

/** `#41`: scrolls to that pull request in this tab and flashes it. */
function PrJump({ number, state }: { number: number; state?: PullRequestState }) {
  const jump = (e: React.MouseEvent<HTMLButtonElement>) => {
    const tab = e.currentTarget.closest<HTMLElement>('[data-wf="GitTab"]');
    const row = tab?.querySelector<HTMLElement>(`[data-wf="PullRequestRow"][data-pr="${number}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    row.classList.remove("wf-flash");
    // Restart the animation when the same row is picked twice.
    void row.offsetWidth;
    row.classList.add("wf-flash");
    window.setTimeout(() => row.classList.remove("wf-flash"), 1500);
  };
  return (
    <Tooltip
      content={
        state ? `Pull request #${number} · ${PR_STATE[state].label}` : `Pull request #${number}`
      }
    >
      <button
        type="button"
        data-wf="PrJump"
        onClick={jump}
        aria-label={`Show pull request ${number}`}
        className="shrink-0 cursor-default rounded-sm font-mono text-fg-muted text-xs tabular hover:text-fg hover:underline"
      >
        #{number}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- bits

function Dot() {
  return (
    <span aria-hidden className="shrink-0 text-fg-faint">
      ·
    </span>
  );
}

/** The branch without the issue id every branch shares; the tooltip has the full name. */
function BranchName({ branch, issueId }: { branch: string; issueId: string }) {
  return (
    <Tooltip content={<span className="font-mono text-xs">{branch}</span>}>
      <span
        data-wf="BranchName"
        className="inline-flex min-w-0 max-w-full items-center gap-1 text-fg-muted"
      >
        <GitBranch {...ICON} size={12} aria-hidden className="shrink-0 text-fg-faint" />
        <span aria-hidden className="min-w-0 truncate font-mono text-xs">
          {shortBranch(branch, issueId)}
        </span>
        <span className="sr-only">Branch {branch}</span>
      </span>
    </Tooltip>
  );
}
