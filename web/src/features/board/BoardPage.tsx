// /w: the board. Builds one view model from the snapshot and the URL search
// (group, swim, author, q, show) and hands it to the toolbar and the board.
import { BellOff, FolderX, Plus, SearchX, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { openAddWork } from "@/app/shell-store";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui";
import { ASK, addThen, SkillHint } from "@/features/issue/skill-hint";
import type { IssueSummary, WorkspaceSnapshot } from "@/gen/types";
import { issuesInGroup, useInbox, useMe, useSnapshot } from "@/lib/api";
import { type BoardSearch, useBoardSearch } from "@/lib/nav";
import { BoardToolbar, BoardToolbarSkeleton } from "./BoardToolbar";
import {
  applyFilter,
  basePathOf,
  boardColumns,
  buildLanes,
  filterFromSearch,
  groupChain,
  hasActiveFilter,
  issueAuthors,
  type NeedsYou,
  needsYou,
  singleLane,
  summarize,
} from "./filter";
import { BoardSkeleton, KanbanBoard } from "./KanbanBoard";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

function buildModel(data: WorkspaceSnapshot, search: BoardSearch, mine: NeedsYou) {
  const needs = mine.issues;
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
  const visible = applyFilter(inScope, filter, needs);
  const filtered = hasActiveFilter(filter);
  // What "Needs you" would show here and elsewhere, for the empty state's hint.
  const needsHere = scoped.filter((i: IssueSummary) => needs.has(i.id)).length;
  const needsAnywhere = data.issues.filter(
    (i: IssueSummary) => needs.has(i.id) && (filter.showCancelled || i.status !== "cancelled"),
  ).length;

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
    /** Issues in the whole workspace: zero means a clean slate, whatever the scope or filters. */
    total: data.issues.length,
    selected,
    scoped,
    visible,
    filtered,
    cancelledCount,
    needsHere,
    needsElsewhere: Math.max(0, needsAnywhere - needsHere),
    canSwim,
    swim,
    lanes,
    columns: boardColumns(filter.showCancelled),
    basePath: basePathOf(chain),
    // Counted as the toolbar's "Needs you" toggle counts: open requests for the acting person.
    summary: summarize(visible, mine),
    authors,
  };
}

export function BoardPage() {
  const snapshot = useSnapshot();
  const me = useMe();
  const [search, setSearch] = useBoardSearch();
  const inbox = useInbox();
  const data = snapshot.data;
  const { group, swim, author, q, show, needs } = search;

  // Open requests for the acting person: the toolbar's count and the "Needs you" filter.
  const mine: NeedsYou = useMemo(() => needsYou(inbox.all, me), [inbox.all, me]);

  const model = useMemo(
    () => (data ? buildModel(data, { group, swim, author, q, show, needs }, mine) : null),
    [data, group, swim, author, q, show, needs, mine],
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
                : "The workspace server did not answer. Try again in a moment."
            }
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
      needsYou={{ requests: mine.requests, issues: mine.issues.size }}
    />
  );

  const scopeGroup = model.chain.length > 1 ? model.selected.id : undefined;
  // "Add work" opens at the first question; "Add one issue" skips it.
  const addWork = () => openAddWork(scopeGroup ? { group: scopeGroup } : undefined);
  const addIssue = () => openAddWork({ kind: "issue", group: scopeGroup });
  // The buttons first, then the one skill that does the same without the dashboard.
  const addActions = (scope?: string) => (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" size="sm" onClick={addWork}>
          <Plus size={14} strokeWidth={1.75} />
          Add work
        </Button>
        <Button variant="secondary" size="sm" onClick={addIssue}>
          Add one issue
        </Button>
      </div>
      <SkillHint step="add" prompt={(skill, flow) => ASK.addWork(scope, skill, addThen(flow))} />
    </div>
  );

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
  } else if (model.total === 0) {
    // A clean slate: no issue anywhere. Say so once, at board level, and offer the two ways in.
    body = (
      <Centered>
        <EmptyState
          title="No work yet"
          hint="Add a group of work and Codex splits it into issues, or add one issue."
          action={addActions()}
        />
      </Centered>
    );
  } else if (search.needs === "me" && model.visible.length === 0) {
    body = (
      <Centered>
        <EmptyState
          icon={<BellOff {...ICON} />}
          title="Nothing needs you"
          hint={needsHint({
            here: model.needsHere,
            elsewhere: model.needsElsewhere,
            scope: model.chain.length > 1 ? model.selected.title : undefined,
          })}
          action={
            model.needsHere > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSearch({ q: undefined, author: undefined })}
              >
                Clear filters
              </Button>
            ) : model.needsElsewhere > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setSearch({ group: undefined })}>
                Show all groups
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setSearch({ needs: undefined })}>
                Show all issues
              </Button>
            )
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
            hint="Add work here and Codex splits it into issues."
            action={addActions(model.chain.length > 1 ? model.selected.title : undefined)}
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
        mine={mine}
      />
    );
  }

  return <Frame toolbar={toolbar}>{body}</Frame>;
}

/** What "Nothing needs you" says: why, and where the requests are when they are elsewhere. */
function needsHint({
  here,
  elsewhere,
  scope,
}: {
  here: number;
  elsewhere: number;
  scope?: string;
}): string {
  if (here > 0) return "Nothing here needs you with the filters you set.";
  if (elsewhere > 0)
    return `${elsewhere} issue${elsewhere === 1 ? "" : "s"} outside ${scope ?? "this view"} ${elsewhere === 1 ? "needs" : "need"} you.`;
  return "You have no open requests. Agents ask here when they need a decision.";
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
