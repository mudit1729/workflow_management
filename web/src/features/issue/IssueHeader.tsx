// Issue header: path + id + actions, title, property row, and derived signals.
import {
  ArrowUpRight,
  Ban,
  Calendar,
  Check,
  ChevronDown,
  CircleX,
  FileText,
  Link2,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AuthorChip,
  CopyButton,
  copyText,
  GroupPath,
  LintBadge,
  StatusSelect,
  useNow,
} from "@/components/common";
import { Button, IconButton, Tooltip } from "@/components/ui";
import { AskLibraryButton } from "@/features/ask";
import { CodexActions, useRunActive } from "@/features/codex";
import type { IssueDetail, Lease, Priority } from "@/gen/types";
import { cn } from "@/lib/cn";
import { absolute, hoursSince, parseTs } from "@/lib/format";
import { useHotkey } from "@/lib/hooks";
import { hrefFor, useCloseIssue, useGo, useOpenIssue } from "@/lib/nav";
import { HandoffButton } from "./HandoffPanel";
import { countBySeverity } from "./LintPanel";
import { SkillLink } from "./skill-hint";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

interface IssueHeaderProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
  /** Drawer only. Defaults to closing the drawer route. */
  onClose?: () => void;
  /** Shows the files and lint view (Files tab in the drawer, a sheet on the page). */
  onOpenFiles?: () => void;
}

export function IssueHeader({ detail, variant, onClose, onOpenFiles }: IssueHeaderProps) {
  const s = detail.summary;
  const go = useGo();
  const closeIssue = useCloseIssue();
  const close = onClose ?? closeIssue;
  const drawer = variant === "drawer";
  // Under 640 px the reference properties fold behind "Details"; status and owner stay.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lint = countBySeverity(detail.diagnostics);
  const lintTotal = lint.error + lint.warn + lint.info;

  const openPage = () => void go.issuePage(s.id);
  useHotkey("o", openPage, { enabled: drawer });

  const copyLink = () =>
    copyWithToast(new URL(hrefFor(`/i/${s.id}`), window.location.href).href, "Link copied");

  const metas: { key: string; always?: boolean; node: ReactNode }[] = [];
  if (s.priority !== "none") {
    metas.push({
      key: "priority",
      node: (
        <Meta wf="PriorityPill" tip="Priority">
          <PriorityGlyph priority={s.priority} />
          {PRIORITY_LABEL[s.priority]}
        </Meta>
      ),
    });
  }
  metas.push({
    key: "size",
    node: (
      <Meta wf="SizePill" tip="Size">
        Size {s.size.toUpperCase()}
      </Meta>
    ),
  });
  if (s.owner) {
    metas.push({
      key: "owner",
      always: true,
      node: (
        <Meta wf="OwnerPill" tip="Owner">
          <AuthorChip handle={s.owner} size="xs" variant="avatar" />
          <span>@{s.owner}</span>
        </Meta>
      ),
    });
  }
  if (s.due) {
    metas.push({
      key: "due",
      node: <DueMeta due={s.due} done={s.status === "done" || s.status === "cancelled"} />,
    });
  }
  if (s.blocked_by.length > 0)
    metas.push({ key: "blocked", node: <BlockedByMeta ids={s.blocked_by} /> });

  // The board page already owns the h1 ("Workflow · Board"), so the drawer title is an h2.
  const Title = drawer ? "h2" : "h1";

  // Handing an issue over hands over its content (goal 2): that button is `HandoffButton`, in the
  // row of the Codex buttons below. The icon buttons up here only point at the issue.
  const actions = (
    <HeaderAction label="Copy link" icon={<Link2 {...ICON} />} onClick={copyLink} copies />
  );

  return (
    <header
      data-wf="IssueHeader"
      data-variant={variant}
      className={cn(
        "flex shrink-0 flex-col",
        drawer ? "px-4 pt-2 pb-3" : "border-border border-b px-5 pt-5 pb-4",
      )}
    >
      {drawer && (
        <div className="flex h-7 items-center gap-2">
          <div className="group/id flex min-w-0 items-center gap-1 text-sm">
            {s.group_path.length > 0 && (
              <>
                <GroupPath path={s.group_path} className="min-w-0 truncate text-sm" />
                <span aria-hidden className="text-fg-faint">
                  /
                </span>
              </>
            )}
            <span className="shrink-0 font-mono text-fg-muted text-sm">{s.id}</span>
            <span className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/id:opacity-100">
              <CopyButton text={s.id} label="Copy issue id" />
            </span>
          </div>
          <div data-wf="IssueActions" className="ml-auto flex shrink-0 items-center gap-0.5">
            <HeaderAction
              label="Open in new page"
              shortcut="o"
              icon={<ArrowUpRight {...ICON} />}
              onClick={openPage}
            />
            {actions}
            <HeaderAction label="Close" shortcut="Escape" icon={<X {...ICON} />} onClick={close} />
          </div>
        </div>
      )}

      <div className={cn("flex items-start gap-3", drawer ? "mt-1" : "")}>
        <Title
          className={cn(
            "line-clamp-2 min-w-0 flex-1 font-semibold text-fg",
            drawer ? "text-lg" : "text-xl",
          )}
          title={s.title}
        >
          {s.title}
        </Title>
        {!drawer && (
          <div data-wf="IssueActions" className="flex shrink-0 items-center gap-1">
            {onOpenFiles && (
              <Button variant="secondary" size="sm" onClick={onOpenFiles}>
                <FileText {...ICON} />
                Files
                {detail.docs.length > 0 && (
                  <span className="text-fg-faint tabular">{detail.docs.length}</span>
                )}
                {lintTotal > 0 && <LintBadge counts={lint} variant="dot" />}
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>

      <div
        data-wf="IssueProperties"
        className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1.5", drawer ? "mt-2" : "mt-3")}
      >
        {/* The live signals keep their pills: status and the coordinator lease. */}
        <StatusSelect issue={s} size="sm" variant="pill" />
        {s.coordinator && (
          <span className={foldable(detailsOpen)}>
            <LeasePill lease={s.coordinator} />
          </span>
        )}
        {/* Reference data reads as one quiet line: no borders, faint dots between. It wraps as a
            whole below the pills when the header is narrow, so a dot never ends a row. */}
        <div
          data-wf="IssuePropertyLine"
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
        >
          {metas.map((m, i) => (
            <Fragment key={m.key}>
              {i > 0 && (
                <span aria-hidden className={cn("text-fg-faint", foldable(detailsOpen, "inline"))}>
                  ·
                </span>
              )}
              {m.always ? m.node : <span className={foldable(detailsOpen)}>{m.node}</span>}
            </Fragment>
          ))}
          {s.labels.length > 0 && (
            <span
              data-wf="IssueLabels"
              className={cn(
                "ml-1 items-center gap-1.5 text-fg-faint text-sm",
                foldable(detailsOpen, "flex"),
              )}
            >
              {s.labels.map((label) => (
                <span key={label} data-wf="LabelChip" title={`Label: ${label}`}>
                  #{label}
                </span>
              ))}
            </span>
          )}
          {lintTotal > 0 && (
            <span className={foldable(detailsOpen)}>
              <LintBadge counts={lint} variant="badge" onClick={onOpenFiles} />
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
          className="-mr-1.5 ml-auto px-1.5 text-fg-muted min-[640px]:hidden"
        >
          Details
          <ChevronDown
            {...ICON}
            className={cn("transition-transform duration-150 ease-wf", detailsOpen && "rotate-180")}
          />
        </Button>
      </div>

      {/* Work with Codex without leaving the board, or hand the issue over: start Codex on it, let
          it do the next step, or copy the whole context as markdown (with a view of it). Above the
          signals, so the run's strip stays put when a signal appears mid-run. */}
      <CodexActions issue={s} className={drawer ? "mt-3" : "mt-3.5"}>
        <HandoffButton issueId={s.id} compact />
        <AskLibraryButton issueId={s.id} />
      </CodexActions>

      <IssueSignals detail={detail} />
    </header>
  );
}

// ---------------------------------------------------------------- actions

function HeaderAction({
  label,
  shortcut,
  icon,
  onClick,
  copies = false,
}: {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => unknown;
  /** Swap the icon for a check for a moment after a successful copy. */
  copies?: boolean;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(false), 1500);
    return () => window.clearTimeout(t);
  }, [done]);

  const handle = async () => {
    const ok = await onClick();
    if (copies && ok === true) setDone(true);
  };

  return (
    <IconButton
      size="sm"
      label={label}
      shortcut={shortcut}
      icon={done ? <Check {...ICON} className="text-status-done" /> : icon}
      onClick={() => void handle()}
    />
  );
}

async function copyWithToast(text: string, message: string): Promise<boolean> {
  const ok = await copyText(text);
  if (ok) toast(message);
  else toast.error("Could not copy to the clipboard");
  return ok;
}

// ---------------------------------------------------------------- property pills

function Pill({
  wf,
  children,
  tip,
  tone = "neutral",
}: {
  /** The element name the user gives feedback on, e.g. "PriorityPill". */
  wf: string;
  children: ReactNode;
  tip?: ReactNode;
  tone?: "neutral" | "danger" | "stale";
}) {
  const pill = (
    <span
      data-wf={wf}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 text-sm",
        tone === "neutral" && "text-fg-muted",
        tone === "danger" && "text-danger",
        tone === "stale" && "text-stale-text",
      )}
    >
      {children}
    </span>
  );
  return tip ? <Tooltip content={tip}>{pill}</Tooltip> : pill;
}

/** Classes that hide a non-essential property under 640 px until "Details" is open. */
function foldable(open: boolean, display: "contents" | "flex" | "inline" = "contents"): string {
  // Whole class names, so Tailwind sees them.
  const closed = {
    contents: "hidden min-[640px]:contents",
    flex: "hidden min-[640px]:flex",
    inline: "hidden min-[640px]:inline",
  } as const;
  return open ? display : closed[display];
}

/** A property without a pill: icon and text on the quiet line (priority, size, owner, due). */
function Meta({
  wf,
  children,
  tip,
  tone = "neutral",
}: {
  /** The element name the user gives feedback on, e.g. "PriorityPill". */
  wf: string;
  children: ReactNode;
  tip?: ReactNode;
  tone?: "neutral" | "danger";
}) {
  const meta = (
    <span
      data-wf={wf}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap text-sm",
        tone === "danger" ? "text-danger" : "text-fg-muted",
      )}
    >
      {children}
    </span>
  );
  return tip ? <Tooltip content={tip}>{meta}</Tooltip> : meta;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

/** Linear-style priority glyph: three bars, or a filled alert square for urgent. */
function PriorityGlyph({ priority }: { priority: Priority }) {
  if (priority === "urgent") {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden className="text-danger">
        <rect x={1} y={1} width={12} height={12} rx={3} className="fill-current" />
        <rect x={6.25} y={3.5} width={1.5} height={4.5} rx={0.75} className="fill-bg" />
        <rect x={6.25} y={9.25} width={1.5} height={1.5} rx={0.75} className="fill-bg" />
      </svg>
    );
  }
  const filled = { high: 3, medium: 2, low: 1, none: 0 }[priority];
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
      {[4, 7, 10].map((h, i) => (
        <rect
          key={h}
          x={1.5 + i * 4}
          y={12 - h}
          width={3}
          height={h}
          rx={1}
          className={i < filled ? "fill-current" : "fill-border-strong"}
        />
      ))}
    </svg>
  );
}

function LeasePill({ lease }: { lease: Lease }) {
  const now = useNow();
  const ms = parseTs(lease.until) - now;
  const expired = lease.state === "expired" || (lease.state === "live" && ms <= 0);
  const none = lease.state === "none";
  const text = none
    ? "no lease"
    : expired
      ? `lease expired ${shortDuration(-ms)} ago`
      : `lease ${shortDuration(ms)} left`;
  const tip = none
    ? "Coordinator without a lease"
    : expired
      ? `Coordinator lease expired. It ended ${absolute(lease.until)}. The next step Codex does takes it over.`
      : `Coordinator lease until ${absolute(lease.until)}`;

  return (
    <Pill wf="LeasePill" tip={tip} tone={expired ? "stale" : "neutral"}>
      <Timer {...ICON} className={expired ? "text-stale" : "text-fg-faint"} />
      <AuthorChip handle={lease.holder} size="xs" variant="avatar" />
      <span className="text-fg-muted">@{lease.holder}</span>
      <span className={cn("tabular", expired ? "text-stale-text" : "text-fg-faint")}>{text}</span>
    </Pill>
  );
}

function DueMeta({ due, done }: { due: string; done: boolean }) {
  const now = useNow();
  const { label, days } = dueInfo(due, now);
  const overdue = days < 0 && !done;
  const tip = overdue
    ? `Overdue by ${days === -1 ? "1 day" : `${-days} days`}`
    : days === 0
      ? "Due today"
      : `Due ${due}`;
  return (
    <Meta wf="DuePill" tip={tip} tone={overdue ? "danger" : "neutral"}>
      <Calendar {...ICON} className={overdue ? "text-danger" : "text-fg-faint"} />
      <span className="tabular">{label}</span>
    </Meta>
  );
}

function BlockedByMeta({ ids }: { ids: string[] }) {
  const openIssue = useOpenIssue();
  return (
    <span data-wf="BlockedByPill" className="inline-flex h-6 items-center gap-1.5 text-sm">
      <Ban {...ICON} className="text-danger" />
      <span className="text-fg-muted">Blocked by</span>
      {ids.map((id, i) => (
        <span key={id} className="inline-flex items-center">
          <button
            type="button"
            onClick={() => void openIssue(id)}
            className="rounded-sm font-mono text-fg text-sm hover:underline"
          >
            {id}
          </button>
          {i < ids.length - 1 && <span className="text-fg-faint">,</span>}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- signals

interface SignalRow {
  key: string;
  tone: "danger" | "stale";
  rule: string;
  ruleTitle: string;
  text: ReactNode;
}

/** Derived signals (contract 1.6), shown only when present. */
function IssueSignals({ detail }: { detail: IssueDetail }) {
  const now = useNow();
  const s = detail.summary;
  // While Codex works, the log runs ahead of current_state.md on purpose (Q005): a row that comes
  // and goes mid-run would push the tabs down and up again.
  const running = useRunActive(s.id);
  const rows: SignalRow[] = [];

  if (s.signals.done_unmet) {
    const c = s.progress.criteria;
    const unverified = c.total - c.verified;
    rows.push({
      key: "done_unmet",
      tone: "danger",
      rule: "Q001",
      ruleTitle: "Done, but the success criteria are not met",
      text:
        unverified > 0
          ? `Marked done, but ${unverified} of ${c.total} criteria are not verified`
          : "Marked done, but the success criteria are not met",
    });
  }
  if (s.signals.stale) {
    const last = lastActivityTs(detail);
    rows.push({
      key: "stale",
      tone: "stale",
      rule: "Q003",
      ruleTitle: "Stale: in progress with no recent change or state update",
      text: last ? `No activity for ${longDuration(hoursSince(last, now))}` : "No recent activity",
    });
  }
  if (s.signals.state_behind_changes && !running) {
    const behind = changesSinceState(detail);
    rows.push({
      key: "state_behind_changes",
      tone: "stale",
      rule: "Q005",
      ruleTitle: "current_state is older than the latest change",
      text: (
        <>
          <code className="font-mono text-[0.95em]">current_state</code> is behind{" "}
          {behind > 0 ? `${behind} ${behind === 1 ? "change" : "changes"}` : "the latest change"}
        </>
      ),
    });
  }
  if (s.signals.in_progress_no_plan) {
    rows.push({
      key: "in_progress_no_plan",
      tone: "stale",
      rule: "Q002",
      ruleTitle: "In progress without a plan",
      text: (
        <>
          In progress without a plan. Do next step writes it with <SkillLink step="plan" />
        </>
      ),
    });
  }

  if (rows.length === 0) return null;

  return (
    <ul data-wf="IssueSignals" aria-label="Signals" className="mt-2.5 flex flex-col gap-1">
      {rows.map((r) => (
        <li
          key={r.key}
          className={cn(
            "flex min-h-7 items-center gap-2 rounded-md px-2.5 py-1 text-sm",
            r.tone === "danger" ? "bg-danger/8" : "bg-stale/10",
          )}
        >
          {r.tone === "danger" ? (
            <CircleX {...ICON} aria-label="Problem" className="shrink-0 text-danger" />
          ) : (
            <TriangleAlert {...ICON} aria-label="Warning" className="shrink-0 text-stale" />
          )}
          <span className="min-w-0 flex-1 truncate text-fg">{r.text}</span>
          <Tooltip content={r.ruleTitle}>
            <span className="shrink-0 font-mono text-fg-faint text-xs">{r.rule}</span>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

function lastActivityTs(detail: IssueDetail): string | undefined {
  const candidates = [
    detail.summary.last_activity?.ts,
    detail.summary.state_updated_at,
    detail.state?.updated_at,
  ].filter((t): t is string => Boolean(t));
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) => (parseTs(a) >= parseTs(b) ? a : b));
}

function changesSinceState(detail: IssueDetail): number {
  const since = detail.state?.updated_at ?? detail.summary.state_updated_at;
  if (!since) return detail.changes.length;
  const t = parseTs(since);
  return detail.changes.filter((c) => parseTs(c.ts) > t).length;
}

// ---------------------------------------------------------------- helpers

/** "34m", "2h", "3d" */
function shortDuration(ms: number): string {
  const min = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** "5 hours", "2 days" */
function longDuration(hours: number): string {
  if (hours < 1) return "less than an hour";
  if (hours < 48) {
    const h = Math.round(hours);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  return `${Math.round(hours / 24)} days`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date-only due values are local calendar days. */
function dueInfo(due: string, now: number): { label: string; days: number } {
  const [y, m, d] = due.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((date.getTime() - start.getTime()) / DAY_MS);
  if (days === 0) return { label: "Due today", days };
  if (days === 1) return { label: "Due tomorrow", days };
  const sameYear = date.getFullYear() === today.getFullYear();
  const label = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return { label: `Due ${label}`, days };
}
