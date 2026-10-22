// The 44 px board toolbar. Left: the scope breadcrumb and a faint count summary.
// Right: text filter, author filter, swimlanes, cancelled, and New issue.
import { CircleX, Plus, Rows3, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { openNewIssue } from "@/app/shell-store";
import { AuthorChip, AuthorStack } from "@/components/common";
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
  Segmented,
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
  /** The selected group has child groups, so swimlanes are possible. */
  canSwim: boolean;
  swim: "child" | "none";
  cancelledCount: number;
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export function BoardToolbar({
  chain,
  summary,
  scopedTotal,
  filtered,
  authors,
  me,
  canSwim,
  swim,
  cancelledCount,
}: BoardToolbarProps) {
  const [search, setSearch] = useBoardSearch();
  const selected = chain[chain.length - 1];
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

  const newIssue = () => openNewIssue(chain.length > 1 ? selected?.id : undefined);

  return (
    <header
      data-wf="BoardToolbar"
      className="flex h-[var(--wf-topbar-h)] shrink-0 items-center gap-3 border-border border-b bg-bg px-3"
    >
      <GroupCrumbs chain={chain} onGroup={(group) => setSearch({ group })} />
      <SummaryLine summary={summary} scopedTotal={scopedTotal} filtered={filtered} />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SearchInput
          size="sm"
          value={draft}
          onChange={onQuery}
          placeholder="Filter issues"
          aria-label="Filter issues by id, title or label"
          shortcut="/"
          className="w-32 @xl/board:w-40 @4xl/board:w-52"
        />

        <AuthorFilter
          options={authors}
          selected={selectedAuthors}
          me={me}
          onChange={(handles) => setSearch({ author: formatAuthorParam(handles) })}
        />

        <SwimlaneToggle
          canSwim={canSwim}
          value={swim}
          groupTitle={chain.length > 1 ? selected?.title : undefined}
          onChange={(v) => setSearch({ swim: v === "child" ? undefined : v })}
        />

        <Tooltip content={showCancelled ? "Hide cancelled issues" : "Show cancelled issues"}>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showCancelled}
            aria-label="Show cancelled issues"
            onClick={() => setSearch({ show: showCancelled ? undefined : "cancelled" })}
            className="hidden @xl/board:inline-flex"
          >
            <CircleX {...ICON} />
            <span className="hidden @4xl/board:inline">Cancelled</span>
            {cancelledCount > 0 && <span className="text-fg-faint tabular">{cancelledCount}</span>}
          </Button>
        </Tooltip>

        <Tooltip content="New issue" shortcut="n">
          <Button variant="primary" size="sm" onClick={newIssue} aria-label="New issue">
            <Plus {...ICON} />
            <span className="hidden @lg/board:inline">New issue</span>
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
  const current = "flex h-6 min-w-0 items-center gap-1.5 px-1.5 font-medium text-fg";

  return (
    <nav data-wf="GroupCrumbs" aria-label="Board scope" className="min-w-0 shrink">
      <ol className="flex min-w-0 items-center gap-0.5 text-base">
        <li className="shrink-0">
          {groups.length === 0 ? (
            <span aria-current="page" className={current}>
              All issues
            </span>
          ) : (
            <button type="button" className={crumb} onClick={() => onGroup(undefined)}>
              All issues
            </button>
          )}
        </li>
        {groups.map((g, i) => {
          const last = i === groups.length - 1;
          return (
            <li key={g.id} className={cn("flex min-w-0 items-center gap-0.5", !last && "shrink-0")}>
              <span aria-hidden className="text-fg-faint">
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
  if (summary.needsYou > 0)
    parts.push(`${summary.needsYou} need${summary.needsYou === 1 ? "s" : ""} you`);
  if (summary.stale > 0) parts.push(`${summary.stale} stale`);
  return (
    <span
      data-wf="BoardSummary"
      aria-live="polite"
      className="hidden min-w-0 truncate text-fg-faint text-sm tabular @3xl/board:block"
    >
      {parts.join(" · ")}
    </span>
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
              <span className="hidden @2xl/board:inline">Author</span>
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

// ---------------------------------------------------------------- swimlanes

function SwimlaneToggle({
  canSwim,
  value,
  groupTitle,
  onChange,
}: {
  canSwim: boolean;
  value: "child" | "none";
  groupTitle?: string;
  onChange: (v: "child" | "none") => void;
}) {
  const tip = canSwim
    ? "Split the board into one band per child group"
    : groupTitle
      ? `${groupTitle} has no subgroups, so there is nothing to split by`
      : "There are no groups to split by";

  return (
    <div data-wf="SwimlaneToggle" className="hidden items-center gap-2 @xl/board:flex">
      <span className="hidden text-fg-faint text-sm @5xl/board:inline">Swimlanes</span>
      <Tooltip content={tip}>
        <span className={cn("inline-flex", !canSwim && "cursor-not-allowed")}>
          <Segmented<"child" | "none">
            size="sm"
            aria-label="Swimlanes"
            disabled={!canSwim}
            value={canSwim ? value : "none"}
            onChange={onChange}
            options={[
              { value: "child", label: "Groups", icon: <Rows3 {...ICON} /> },
              { value: "none", label: "None" },
            ]}
          />
        </span>
      </Tooltip>
    </div>
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
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="hidden h-3 w-40 @3xl/board:block" />
      <div className="ml-auto flex items-center gap-1.5">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-24" />
      </div>
    </div>
  );
}
