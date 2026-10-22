// /w: the board. Builds one view model from the snapshot and the URL search
// (group, swim, author, q, show) and hands it to the toolbar and the board.
import { FolderX, Plus, SearchX, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { openNewIssue } from "@/app/shell-store";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui";
import type { IssueSummary, WorkspaceSnapshot } from "@/gen/types";
import { issuesInGroup, useMe, useSnapshot } from "@/lib/api";
import { type BoardSearch, useBoardSearch } from "@/lib/nav";
import { BoardToolbar, BoardToolbarSkeleton } from "./BoardToolbar";
import {
  applyFilter,
  basePathOf,
  boardColumns,
  buildLanes,
  filterFromSearch,
  groupChain,
  groupSlugPath,
  hasActiveFilter,
  issueAuthors,
  singleLane,
  summarize,
} from "./filter";
import { BoardSkeleton, KanbanBoard } from "./KanbanBoard";

const ICON = { size: 16, strokeWidth: 1.75 } as const;

function buildModel(data: WorkspaceSnapshot, search: BoardSearch) {
  const root = data.groups;
  const chain = search.group ? groupChain(root, search.group) : [root];
  const missing = chain.length === 0;
  const selected = chain[chain.length - 1] ?? root;

  const inScope = issuesInGroup(selected, data.issues);
  const filter = filterFromSearch(search);
  const cancelledCount = inScope.filter((i: IssueSummary) => i.status === "cancelled").length;
  const scoped = filter.showCancelled
    ? inScope
    : inScope.filter((i: IssueSummary) => i.status !== "cancelled");
  const visible = applyFilter(inScope, filter);
  const filtered = hasActiveFilter(filter);

  const canSwim = selected.children.length > 0;
  const swim: "child" | "none" = canSwim ? (search.swim ?? "child") : "none";
  const lanes =
    swim === "child"
      ? buildLanes(selected, visible, { hideEmpty: filtered })
      : [singleLane(visible)];

  // Author options: everyone known, plus any handle already in the filter.
  const handles = new Set(data.authors.map((a) => a.handle));
  for (const h of filter.authors) handles.add(h);
  const authors = [...handles]
    .map((handle) => ({
      handle,
      count: scoped.filter((i: IssueSummary) => issueAuthors(i).includes(handle)).length,
    }))
    .sort(
      (a, b) =>
        Number(b.handle === data.config.author) - Number(a.handle === data.config.author) ||
        b.count - a.count ||
        a.handle.localeCompare(b.handle),
    );

  return {
    chain: missing ? [root] : chain,
    missing,
    selected,
    scoped,
    visible,
    filtered,
    cancelledCount,
    canSwim,
    swim,
    lanes,
    columns: boardColumns(filter.showCancelled),
    basePath: basePathOf(chain),
    summary: summarize(visible),
    authors,
    slugPath: groupSlugPath(selected, data.config.issues_dir),
  };
}

export function BoardPage() {
  const snapshot = useSnapshot();
  const me = useMe();
  const [search, setSearch] = useBoardSearch();
  const data = snapshot.data;
  const { group, swim, author, q, show } = search;

  const model = useMemo(
    () => (data ? buildModel(data, { group, swim, author, q, show }) : null),
    [data, group, swim, author, q, show],
  );

  if (snapshot.isError && !data) {
    return (
      <Frame toolbar={<BoardToolbarSkeleton />}>
        <Centered>
          <EmptyState
            icon={<TriangleAlert {...ICON} />}
            title="The board did not load"
            hint={
              snapshot.error instanceof Error
                ? snapshot.error.message
                : "The workspace server did not answer. Check that wf serve is running."
            }
            command="wf serve"
            action={
              <Button variant="secondary" size="sm" onClick={() => snapshot.refetch()}>
                Try again
              </Button>
            }
          />
        </Centered>
      </Frame>
    );
  }

  if (!model) {
    return (
      <Frame toolbar={<BoardToolbarSkeleton />}>
        <BoardSkeleton />
      </Frame>
    );
  }

  const toolbar = (
    <BoardToolbar
      chain={model.chain}
      summary={model.summary}
      scopedTotal={model.scoped.length}
      filtered={model.filtered}
      authors={model.authors}
      me={me}
      canSwim={model.canSwim}
      swim={model.swim}
      cancelledCount={model.cancelledCount}
    />
  );

  const newIssue = () => openNewIssue(model.chain.length > 1 ? model.selected.id : undefined);

  let body: ReactNode;
  if (model.missing) {
    body = (
      <Centered>
        <EmptyState
          icon={<FolderX {...ICON} />}
          title="This group does not exist"
          hint={`Nothing matches ${group}. The group may have been renamed or moved.`}
          action={
            <Button variant="secondary" size="sm" onClick={() => setSearch({ group: undefined })}>
              Show all issues
            </Button>
          }
        />
      </Centered>
    );
  } else if (model.scoped.length === 0) {
    const title = model.chain.length > 1 ? model.selected.title : "this workspace";
    const hiddenCancelled = model.cancelledCount > 0 && show !== "cancelled";
    body = (
      <Centered>
        {hiddenCancelled ? (
          <EmptyState
            title={`No open issues in ${title}`}
            hint={`${model.cancelledCount} cancelled issue${model.cancelledCount === 1 ? " is" : "s are"} hidden.`}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSearch({ show: "cancelled" })}
              >
                Show cancelled
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`No issues in ${title} yet`}
            hint="Create one here, or let an agent write the goal."
            skill="write-goal"
            command={`wf new issue ${model.slugPath || "<group-path>"}/<slug> --title "…"`}
            action={
              <Button variant="primary" size="sm" onClick={newIssue}>
                <Plus size={14} strokeWidth={1.75} />
                New issue
              </Button>
            }
          />
        )}
      </Centered>
    );
  } else if (model.visible.length === 0) {
    body = (
      <Centered>
        <EmptyState
          icon={<SearchX {...ICON} />}
          title="No issues match"
          hint={filterHint(q, author)}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSearch({ q: undefined, author: undefined })}
            >
              Clear filters
            </Button>
          }
        />
      </Centered>
    );
  } else {
    body = (
      <KanbanBoard
        columns={model.columns}
        lanes={model.lanes}
        swimlanes={model.swim === "child"}
        basePath={model.basePath}
      />
    );
  }

  return <Frame toolbar={toolbar}>{body}</Frame>;
}

function filterHint(q?: string, author?: string): string {
  const parts: string[] = [];
  if (q?.trim()) parts.push(`text “${q.trim()}”`);
  if (author) {
    const handles = author
      .split(",")
      .filter(Boolean)
      .map((h) => `@${h}`);
    parts.push(`author ${handles.join(" or ")}`);
  }
  return parts.length
    ? `Nothing in this view matches ${parts.join(" and ")}.`
    : "Nothing in this view matches the filters.";
}

function Frame({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) {
  return (
    // `@container`: the toolbar adapts to the board's own width, which shrinks
    // when the drawer docks beside it.
    <div
      data-wf="BoardPage"
      className="@container/board flex h-full min-h-0 min-w-0 flex-col bg-bg"
    >
      {toolbar}
      <div className="relative min-h-0 min-w-0 flex-1 bg-subtle">{children}</div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center overflow-auto p-6">{children}</div>;
}
