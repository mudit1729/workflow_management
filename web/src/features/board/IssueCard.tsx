// IssueCard: one issue on the board. Calm by default (title, path, progress);
// signals appear only when present; the hover footer adds tasks and last activity.
import {
  Ban,
  CircleAlert,
  Ellipsis,
  Hourglass,
  MessageCircleQuestionMark,
  TimerOff,
} from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AuthorChip,
  AuthorStack,
  GroupPath,
  LintBadge,
  ProgressRing,
  RelativeTime,
} from "@/components/common";
import { Chip } from "@/components/ui";
import type { IssueSummary, Priority } from "@/gen/types";
import { cn } from "@/lib/cn";
import { hoursSince } from "@/lib/format";
import { useRecentlyChanged } from "@/lib/live";
import { hrefFor, useOpenIssue } from "@/lib/nav";
import { STATUS_LABEL, statusColor } from "@/lib/status";
import { useDraggableCard } from "./dnd";
import { ALL_LANE, relativeGroupPath } from "./filter";
import { IssueCardMenu, type IssueCardMenuView } from "./IssueCardMenu";
import { BoardCardContext } from "./useBoardKeys";

export interface IssueCardProps {
  issue: IssueSummary;
  /** Open in the drawer. Defaults to the board's open-issue state. */
  selected?: boolean;
  /** Defaults to opening the drawer (or the full page below 768 px). */
  onOpen?: (issue: IssueSummary) => void;
  dragDisabled?: boolean;
  /** Swimlane id; drops are allowed only inside the same lane. */
  lane?: string;
  className?: string;
}

const ICON = { size: 12, strokeWidth: 1.75 } as const;

export function IssueCard({
  issue,
  selected,
  onOpen,
  dragDisabled,
  lane = ALL_LANE,
  className,
}: IssueCardProps) {
  const board = useContext(BoardCardContext);
  const openIssue = useOpenIssue();
  const flash = useRecentlyChanged(issue.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ open: boolean; view: IssueCardMenuView }>({
    open: false,
    view: "all",
  });

  const dragging = useDraggableCard(rootRef, {
    issue,
    lane,
    disabled: dragDisabled || board == null,
    preview: () => <IssueCardPreview issue={issue} />,
  });

  // `s` on the board asks the focused card to open its Move menu.
  const menuRequest = board?.menuRequest;
  useEffect(() => {
    if (menuRequest && menuRequest.id === issue.id) setMenu({ open: true, view: "move" });
  }, [menuRequest, issue.id]);

  const isSelected = selected ?? (board != null && board.selectedId === issue.id);
  const tabIndex = board == null || board.tabStopId === issue.id ? 0 : -1;
  const href = hrefFor(`/i/${issue.id}`);
  const path = relativeGroupPath(issue.group_path, board?.basePath ?? []);
  const holders = issue.lease_holders;
  const chips = signalChips(issue);
  const last = issue.last_activity;

  const open = () => (onOpen ? onOpen(issue) : openIssue(issue.id));

  const onRootClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // React bubbles clicks out of portals (menus, hover cards); ignore those.
    if (!rootRef.current?.contains(target)) return;
    if (target.closest("button, [role='menuitem']")) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    open();
  };

  const onLinkClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
      e.stopPropagation(); // the browser opens a new tab
      return;
    }
    e.preventDefault(); // the card root opens the drawer
  };

  const onLinkKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      open();
    }
  };

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(e.target as Node) || e.shiftKey) return; // ⇧ keeps the native menu
    e.preventDefault();
    setMenu({ open: true, view: "all" });
  };

  return (
    <div
      ref={rootRef}
      data-wf="IssueCard"
      data-issue-id={issue.id}
      data-status={issue.status}
      data-selected={isSelected || undefined}
      onClick={onRootClick}
      onContextMenu={onContextMenu}
      onFocus={() => board?.setFocusedId(issue.id)}
      className={cn(
        "group/card relative isolate scroll-mt-12 scroll-mb-3 rounded-md border px-3 py-2.5",
        "select-none transition-[border-color,background-color,opacity] duration-150 ease-wf",
        isSelected
          ? "border-accent bg-accent-subtle"
          : "border-border bg-bg hover:border-border-strong",
        "has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-1 has-[[data-card-link]:focus-visible]:outline-focus",
        dragging && "opacity-40",
        className,
      )}
    >
      {flash && (
        <span
          aria-hidden
          className="wf-flash pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
        />
      )}

      <div className="flex items-start gap-2">
        <PriorityGlyph priority={issue.priority} />
        <a
          data-card-link
          href={href}
          draggable={false}
          tabIndex={tabIndex}
          onClick={onLinkClick}
          onKeyDown={onLinkKeyDown}
          className={cn(
            "line-clamp-2 min-w-0 flex-1 font-medium text-base leading-[18px] outline-none",
            issue.status === "cancelled" ? "text-fg-muted line-through" : "text-fg",
          )}
        >
          {issue.title}
          <span className="sr-only">
            , {STATUS_LABEL[issue.status]}
            {issue.priority !== "none" ? `, ${issue.priority} priority` : ""}
          </span>
        </a>
        <span className="mt-0.5 shrink-0">
          <ProgressRing
            verified={issue.progress.criteria.verified}
            claimed={issue.progress.criteria.claimed}
            total={issue.progress.criteria.total}
            size={14}
          />
        </span>
      </div>

      <div className="mt-1 flex min-w-0 items-center gap-2 text-fg-faint text-xs">
        {path.length > 0 && <GroupPath path={path} className="min-w-0 truncate" />}
        <span className="ml-auto shrink-0 font-mono tabular">{issue.id}</span>
      </div>

      {(chips.length > 0 || holders.length > 0) && (
        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">{chips}</div>
          {holders.length > 0 && (
            <span className="ml-auto shrink-0">
              <AuthorStack handles={holders} max={3} size="xs" />
            </span>
          )}
        </div>
      )}

      {/* Hover / focus footer: animates 0 → auto height with the grid-rows trick. */}
      <div
        data-expanded={menu.open || undefined}
        className={cn(
          "grid grid-rows-[0fr] transition-[grid-template-rows] duration-150 ease-wf",
          "group-focus-within/card:grid-rows-[1fr] group-hover/card:grid-rows-[1fr] data-[expanded]:grid-rows-[1fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 flex items-center gap-2 border-border border-t pt-1.5 text-fg-muted text-xs">
            <span className="min-w-0 truncate tabular">{taskLine(issue)}</span>
            {last && (
              <span
                className="ml-auto flex shrink-0 items-center gap-1.5 text-fg-faint"
                title={last.title}
              >
                <AuthorChip handle={last.author} variant="avatar" size="xs" />
                <RelativeTime ts={last.ts} />
              </span>
            )}
            <IssueCardMenu
              issue={issue}
              open={menu.open}
              view={menu.view}
              onOpenChange={(next) =>
                setMenu((m) => (next ? { open: true, view: "all" } : { ...m, open: false }))
              }
              onMoved={() => {
                if (menu.view === "move") board?.focusCard(issue.id);
              }}
            >
              <button
                type="button"
                tabIndex={tabIndex}
                aria-label={`Actions for ${issue.id}`}
                className={cn(
                  "-mr-1.5 grid size-6 shrink-0 place-items-center rounded-sm text-fg-muted",
                  "transition-colors duration-100 ease-wf hover:bg-muted hover:text-fg",
                  "data-[state=open]:bg-muted data-[state=open]:text-fg",
                  !last && "ml-auto",
                )}
              >
                <Ellipsis size={14} strokeWidth={1.75} />
              </button>
            </IssueCardMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- parts

/** Urgent: a filled danger tile with "!". High: three ascending bars. Others: nothing. */
function PriorityGlyph({ priority }: { priority: Priority }) {
  if (priority === "urgent") {
    return (
      <span
        role="img"
        aria-label="Urgent priority"
        title="Urgent"
        className="mt-0.5 grid size-[14px] shrink-0 place-items-center rounded-[3px] bg-danger font-semibold text-[10px] text-accent-fg leading-none"
      >
        !
      </span>
    );
  }
  if (priority === "high") {
    return (
      <svg
        role="img"
        aria-label="High priority"
        viewBox="0 0 14 14"
        className="mt-0.5 size-[14px] shrink-0 text-fg-muted"
      >
        <title>High priority</title>
        <rect x="1.5" y="8" width="3" height="4.5" rx="0.75" fill="currentColor" />
        <rect x="5.5" y="5" width="3" height="7.5" rx="0.75" fill="currentColor" />
        <rect x="9.5" y="1.5" width="3" height="11" rx="0.75" fill="currentColor" />
      </svg>
    );
  }
  return null;
}

function staleFor(ts: string): string {
  const h = hoursSince(ts);
  return h < 24 ? `${Math.max(1, Math.round(h))}h` : `${Math.round(h / 24)}d`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Signal chips in a fixed order; each only when the signal is present. */
function signalChips(issue: IssueSummary): ReactNode[] {
  const s = issue.signals;
  const out: ReactNode[] = [];

  if (s.needs_you > 0) {
    const title =
      s.needs_you_blocking > 0
        ? `${plural(s.needs_you, "open request")} · ${s.needs_you_blocking} blocking`
        : plural(s.needs_you, "open request");
    out.push(
      <Chip
        key="needs-you"
        tone="accent"
        size="xs"
        icon={<MessageCircleQuestionMark {...ICON} />}
        title={title}
      >
        <span className="tabular">{s.needs_you}</span>
        {s.needs_you_blocking > 0 && (
          <span aria-hidden className="ml-0.5 inline-block size-1.5 rounded-full bg-accent" />
        )}
        <span className="sr-only">{title}</span>
      </Chip>,
    );
  }

  if (issue.blocked_by.length > 0 && issue.status !== "done" && issue.status !== "cancelled") {
    out.push(
      <Chip
        key="blocked"
        tone="danger"
        size="xs"
        icon={<Ban {...ICON} />}
        title={`Blocked by ${issue.blocked_by.join(", ")}`}
      >
        Blocked
      </Chip>,
    );
  }

  if (s.stale) {
    const since = issue.last_activity?.ts ?? issue.state_updated_at;
    out.push(
      <Chip
        key="stale"
        tone="stale"
        size="xs"
        icon={<Hourglass {...ICON} />}
        title="No change entry or state update within the staleness window (Q003)"
      >
        {since ? `Stale ${staleFor(since)}` : "Stale"}
      </Chip>,
    );
  }

  if (s.lease_expired) {
    out.push(
      <Chip
        key="lease"
        tone="stale"
        size="xs"
        icon={<TimerOff {...ICON} />}
        title="A lease ran out without a heartbeat (Q004). Another agent can steal it."
      >
        Lease expired
      </Chip>,
    );
  }

  if (s.done_unmet) {
    const c = issue.progress.criteria;
    const unmet = Math.max(1, c.total - c.verified);
    out.push(
      <Chip
        key="unmet"
        tone="danger"
        size="xs"
        icon={<CircleAlert {...ICON} />}
        title={`Marked done, but ${unmet} of ${c.total} criteria are not verified (Q001)`}
      >
        {unmet === 1 ? "1 criterion unmet" : `${unmet} criteria unmet`}
      </Chip>,
    );
  }

  if (issue.lint.error + issue.lint.warn > 0) {
    out.push(<LintBadge key="lint" counts={issue.lint} variant="dot" />);
  }

  return out;
}

function taskLine(issue: IssueSummary): string {
  const t = issue.progress.tasks;
  if (t.total > 0) return `${t.done}/${t.total} tasks${t.ready > 0 ? ` · ${t.ready} ready` : ""}`;
  return issue.has_plan ? "No tasks yet" : "No plan";
}

/**
 * The native drag image: a compact card. Rendered into a detached root, so it
 * uses no context-bound components (tooltips, hover cards).
 */
export function IssueCardPreview({ issue }: { issue: IssueSummary }) {
  return (
    <div
      data-wf="IssueCardPreview"
      className="flex w-[248px] items-center gap-2 rounded-md border border-border-strong bg-bg px-3 py-2 font-sans text-base text-fg shadow-pop"
    >
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full border-2"
        style={{ borderColor: statusColor(issue.status) }}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{issue.title}</span>
      <span className="shrink-0 font-mono text-fg-faint text-xs">{issue.id}</span>
    </div>
  );
}
