// The 44 px board toolbar, the one top bar of the Board. Left: the Workflow view tabs, then the
// scope breadcrumb and a faint count summary. Right: text filter, "Needs you", author filter,
// cancelled, and Add work.
import { CircleX, MessageCircleQuestionMark, Plus, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { openAddWork } from "@/app/shell-store";
import { AuthorChip, AuthorStack, ViewTabs } from "@/components/common";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SearchInput,
  Skeleton,
  Tooltip,
} from "@/components/ui";
import type { GroupNode } from "@/gen/types";
import { cn } from "@/lib/cn";
import { useBoardSearch } from "@/lib/nav";
import { type BoardSummary, formatAuthorParam, parseAuthorParam } from "./filter";

export interface AuthorOption {
  handle: string;
  /** Issues in scope this author touches (owner, coordinator, lease, last activity). */
  count: number;
}

export interface BoardToolbarProps {
  /** Groups from the root down to the selected group. */
  chain: GroupNode[];
  /** Counts over the visible (filtered) issues. */
  summary: BoardSummary;
  /** Issues in scope before the author and text filters. */
  scopedTotal: number;
  filtered: boolean;
  authors: AuthorOption[];
  me: string;
  cancelledCount: number;
  /** Open requests for the acting person across the workspace, and the issues they sit in. */
  needsYou?: { requests: number; issues: number };
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const NO_REQUESTS = { requests: 0, issues: 0 } as const;

export function BoardToolbar({
  chain,
  summary,
  scopedTotal,
  filtered,
  authors,
  me,
  cancelledCount,
  needsYou = NO_REQUESTS,
}: BoardToolbarProps) {
  const [search, setSearch] = useBoardSearch();
  const selected = chain[chain.length - 1];
  const scoped = chain.length > 1;
  const showCancelled = search.show === "cancelled";
  const selectedAuthors = parseAuthorParam(search.author);

  // The field keeps what the person types in local state and the URL follows (it is stored
  // as typed; matching trims). A link or the back button that changes ?q= is adopted.
  const urlQuery = search.q ?? "";
  const [draft, setDraft] = useState(urlQuery);
  useEffect(
    () => setDraft((d) => (d === urlQuery || (d.trim() === "" && urlQuery === "") ? d : urlQuery)),
    [urlQuery],
  );
  const onQuery = (value: string) => {
    setDraft(value);
    setSearch({ q: value.trim() ? value : undefined });
  };

  // Add work asks where it goes; the group on show is only the starting answer.
  const addWork = () =>
    openAddWork(chain.length > 1 && selected ? { group: selected.id } : undefined);

  return (
    <header
      data-wf="BoardToolbar"
      className={cn(
        "flex h-[var(--wf-topbar-h)] shrink-0 items-center gap-2 border-border border-b bg-bg px-3 @md/board:gap-3",
        // On a phone the scope gets a line of its own under the 44 px bar: the filter, the count and
        // the buttons leave it two letters otherwise.
        scoped &&
          "@max-[479px]/board:h-auto @max-[479px]/board:flex-wrap @max-[479px]/board:gap-y-0",
      )}
    >
      <h1 className="sr-only">Workflow · Board</h1>
      <ViewTabs
        view="workflow"
        className={cn(scoped && "@max-[479px]/board:h-[var(--wf-topbar-h)]")}
      />
      {/* The divider sets real crumbs apart from the tabs. A lone "All issues" has none. */}
      <span
        aria-hidden
        className={cn(
          "hidden h-4 w-px shrink-0 bg-border",
          scoped && "@md/board:block @max-[479px]/board:hidden",
        )}
      />
      <GroupCrumbs chain={chain} onGroup={(group) => setSearch({ group })} />
      <SummaryLine summary={summary} scopedTotal={scopedTotal} filtered={filtered} />

      <div
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1.5",
          scoped && "@max-[479px]/board:h-[var(--wf-topbar-h)]",
        )}
      >
        <SearchInput
          size="sm"
          value={draft}
          onChange={onQuery}
          placeholder="Filter issues"
          aria-label="Filter issues by id, title or label"
          shortcut="/"
          className="w-24 max-md:w-28 max-md:min-[380px]:w-36 @3xl/board:w-40 @6xl/board:w-52"
        />

        <NeedsYouToggle
          active={search.needs === "me"}
          requests={needsYou.requests}
          issues={needsYou.issues}
          onChange={(on) => setSearch({ needs: on ? "me" : undefined })}
        />

        <AuthorFilter
          options={authors}
          selected={selectedAuthors}
          me={me}
          onChange={(handles) => setSearch({ author: formatAuthorParam(handles) })}
        />

        <Tooltip content={showCancelled ? "Hide cancelled issues" : "Show cancelled issues"}>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showCancelled}
            aria-label="Show cancelled issues"
            onClick={() => setSearch({ show: showCancelled ? undefined : "cancelled" })}
            className="hidden @3xl/board:inline-flex"
          >
            <CircleX {...ICON} />
            <span className="hidden @4xl/board:inline">Cancelled</span>
            {cancelledCount > 0 && <span className="text-fg-faint tabular">{cancelledCount}</span>}
          </Button>
        </Tooltip>

        <Tooltip content="Add work" shortcut="n">
          <Button
            data-wf="AddWorkButton"
            variant="primary"
            size="sm"
            onClick={addWork}
            aria-label="Add work"
          >
            <Plus {...ICON} />
            <span className="hidden @lg/board:inline">Add work</span>
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- breadcrumb

function GroupDot({ color }: { color: number }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ background: `var(--wf-hue-${color})` }}
    />
  );
}

/**
 * The scope breadcrumb. Where the board has the room (1152 px and up) it shows the whole chain;
 * narrower, it shows only the current scope (a quiet label, so it does not pass for a tab) so it
 * never fights the filters for space; on a phone (under 480 px) it takes a line of its own under
 * the bar and shows the whole chain there. With no group selected it says only "All issues": a
 * quiet label like the ancestors of a crumb, never the weight of the active tab. It appears from
 * 1024 px. The full path stays in the tooltip.
 */
function GroupCrumbs({
  chain,
  onGroup,
}: {
  chain: GroupNode[];
  onGroup: (id: string | undefined) => void;
}) {
  const groups = chain.slice(1);
  const crumb =
    "flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-fg-muted transition-colors duration-100 ease-wf hover:bg-muted hover:text-fg";
  // Narrow, the scope is a quiet label with its dot, so it cannot be read as a third tab.
  const current =
    "flex h-6 min-w-0 items-center gap-1.5 px-1.5 font-normal text-fg-muted @6xl/board:font-medium @6xl/board:text-fg";
  // The unscoped label stays quiet at every width: it is not a place to be, only a hint of the scope.
  const lone = "flex h-6 min-w-0 items-center gap-1.5 px-1.5 font-normal text-fg-muted";
  const path = groups.length > 0 ? ["All issues", ...groups.map((g) => g.title)].join(" / ") : "";
  // The whole chain needs about 190 px for two groups and 330 px for three; the tabs and filters
  // leave the crumbs about 190 px at 1152 px, so a third group waits for 1280 px (measured: at
  // 1440 px with the sidebar open, the current group was clipped to its first letter).
  const deep = groups.length >= 3;
  const showAncestors = deep
    ? "hidden @7xl/board:flex @max-[479px]/board:flex"
    : "hidden @6xl/board:flex @max-[479px]/board:flex";
  const showRoot = deep
    ? "hidden @7xl/board:block @max-[479px]/board:block"
    : "hidden @6xl/board:block @max-[479px]/board:block";
  const showSlash = deep
    ? "hidden @7xl/board:inline @max-[479px]/board:inline"
    : "hidden @6xl/board:inline @max-[479px]/board:inline";

  return (
    // Padding and a matching negative margin keep the focus rings of the buttons inside the clip.
    <nav
      data-wf="GroupCrumbs"
      aria-label="Board scope"
      title={path || undefined}
      className={cn(
        "-m-1 min-w-0 shrink overflow-hidden p-1",
        // "All issues" alone says nothing a tab does not. It shows where the bar has the room
        // (measured: narrower, the tabs, filters and the docked drawer's width squeeze it to "Al").
        // A scope on a phone is a full-width line under the bar, whole chain included.
        groups.length === 0
          ? "hidden @5xl/board:block"
          : "min-w-[7ch] @max-[479px]/board:order-last @max-[479px]/board:m-0 @max-[479px]/board:w-full @max-[479px]/board:basis-full @max-[479px]/board:px-0 @max-[479px]/board:pb-1.5",
      )}
    >
      <ol className="flex min-w-0 items-center gap-0.5 text-base">
        <li className={cn("shrink-0", groups.length > 0 && showRoot)}>
          {groups.length === 0 ? (
            <span aria-current="page" className={lone}>
              <span className="truncate">All issues</span>
            </span>
          ) : (
            <button type="button" className={crumb} onClick={() => onGroup(undefined)}>
              <span className="truncate">All issues</span>
            </button>
          )}
        </li>
        {groups.map((g, i) => {
          const last = i === groups.length - 1;
          return (
            <li
              key={g.id}
              className={cn(
                "items-center gap-0.5",
                last ? "flex min-w-0" : cn("shrink-0", showAncestors),
              )}
            >
              <span aria-hidden className={cn("text-fg-faint", showSlash)}>
                /
              </span>
              {last ? (
                <span aria-current="page" className={current} title={g.goal}>
                  <GroupDot color={g.color} />
                  <span className={cn("truncate", g.implicit && "italic")}>{g.title}</span>
                </span>
              ) : (
                <button type="button" className={crumb} onClick={() => onGroup(g.id)}>
                  <GroupDot color={g.color} />
                  <span className={cn("truncate", g.implicit && "italic")}>{g.title}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SummaryLine({
  summary,
  scopedTotal,
  filtered,
}: {
  summary: BoardSummary;
  scopedTotal: number;
  filtered: boolean;
}) {
  const parts = [
    filtered
      ? `${summary.total} of ${scopedTotal} issues`
      : `${summary.total} issue${summary.total === 1 ? "" : "s"}`,
  ];
  // Open requests for the acting person: the number the "Needs you" toggle shows.
  if (summary.needsYou > 0)
    parts.push(`${summary.needsYou} request${summary.needsYou === 1 ? "" : "s"} for you`);
  if (summary.stale > 0) parts.push(`${summary.stale} stale`);
  return (
    <span
      data-wf="BoardSummary"
      aria-live="polite"
      className="hidden min-w-0 truncate text-fg-faint text-sm tabular @7xl/board:block"
    >
      {parts.join(" · ")}
    </span>
  );
}

// ---------------------------------------------------------------- needs you

/**
 * "Needs you 3": shows only the issues with an open request for the person (`?needs=me`). It is
 * the inbox's job on the board: the count is the person's open requests across the workspace,
 * so it also tells them when the group on show has none and the requests are elsewhere.
 */
export function NeedsYouToggle({
  active,
  requests,
  issues,
  onChange,
}: {
  active: boolean;
  requests: number;
  issues: number;
  onChange: (on: boolean) => void;
}) {
  const tip = active
    ? "Show all issues"
    : requests === 0
      ? "Nothing needs you right now"
      : `${requests} open request${requests === 1 ? "" : "s"} for you in ${issues} issue${issues === 1 ? "" : "s"}. Show only those.`;
  return (
    <Tooltip content={tip}>
      <Button
        data-wf="NeedsYouToggle"
        variant="secondary"
        size="sm"
        aria-pressed={active}
        aria-label={`Needs you, ${requests} open request${requests === 1 ? "" : "s"}`}
        onClick={() => onChange(!active)}
        className={cn(
          // Accent means "waits on you": the pressed state and a count above zero use it.
          active && "border-accent/40 bg-accent-subtle text-accent hover:bg-accent-subtle",
        )}
      >
        <MessageCircleQuestionMark
          {...ICON}
          className={cn(!active && requests > 0 && "text-accent")}
        />
        <span className="hidden @2xl/board:inline">Needs you</span>
        <span
          className={cn(
            "tabular",
            active ? "text-accent" : requests > 0 ? "text-accent" : "text-fg-faint",
          )}
        >
          {requests}
        </span>
      </Button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- author filter

function AuthorFilter({
  options,
  selected,
  me,
  onChange,
}: {
  options: AuthorOption[];
  selected: string[];
  me: string;
  onChange: (handles: string[]) => void;
}) {
  const active = selected.length > 0;
  const toggle = (handle: string, on: boolean) =>
    onChange(on ? [...selected, handle] : selected.filter((h) => h !== handle));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-wf="AuthorFilter"
          variant="secondary"
          size="sm"
          aria-label={
            active
              ? `Author filter: ${selected.map((h) => `@${h}`).join(", ")}`
              : "Filter by author"
          }
          className={cn(active && "border-border-strong")}
        >
          {active ? (
            <AuthorStack handles={selected} max={3} size="xs" />
          ) : (
            <>
              <UsersRound {...ICON} />
              <span className="hidden @3xl/board:inline">Author</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Show issues touched by</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.handle}
            checked={selected.includes(o.handle)}
            onCheckedChange={(on: boolean) => toggle(o.handle, on)}
            onSelect={(e: Event) => e.preventDefault()}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <AuthorChip handle={o.handle} size="xs" variant="chip" />
              {o.handle === me && <span className="text-fg-faint text-xs">you</span>}
              <span className="ml-auto text-fg-faint text-xs tabular">{o.count}</span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<X {...ICON} />} onSelect={() => onChange([])}>
              Clear author filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------- loading

export function BoardToolbarSkeleton() {
  return (
    <div
      data-wf="BoardToolbar"
      aria-hidden
      className="flex h-[var(--wf-topbar-h)] shrink-0 items-center gap-3 border-border border-b bg-bg px-3"
    >
      <ViewTabs view="workflow" />
      <Skeleton className="hidden h-3.5 w-24 @md/board:block" />
      <Skeleton className="hidden h-3 w-40 @7xl/board:block" />
      <div className="ml-auto flex items-center gap-1.5">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-24" />
      </div>
    </div>
  );
}
