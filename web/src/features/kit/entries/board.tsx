import { useState } from "react";
import { Button } from "@/components/ui";
import {
  BoardPage,
  IssueCard,
  IssueCardMenu,
  IssueCardPreview,
  MiniStatusBar,
} from "@/features/board";
import { BoardToolbar, BoardToolbarSkeleton } from "@/features/board/BoardToolbar";
import {
  type BoardLane,
  buildLanes,
  compareCards,
  groupChain,
  issueAuthors,
  laneSummary,
  singleLane,
  summarize,
} from "@/features/board/filter";
import { BoardSkeleton, KanbanBoard } from "@/features/board/KanbanBoard";
import {
  ColumnHeader,
  DropLine,
  EmptyDropArea,
  FoldedColumn,
  KanbanColumn,
} from "@/features/board/KanbanColumn";
import { Swimlane } from "@/features/board/Swimlane";
import type { GroupNode, IssueStatus, IssueSummary, WorkspaceSnapshot } from "@/gen/types";
import { issuesInGroup } from "@/lib/api";
import { BOARD_COLUMNS } from "@/lib/status";
import { entry, type KitEntry, Sandbox, V, WithSnapshot, WithSummary } from "../kit-ui";
import { ISSUE, LONG_TITLE } from "./data";

const SRC = "src/features/board";

// ---------------------------------------------------------------- IssueCard

function Card({
  id,
  label,
  note,
  tweak,
  selected,
  footer,
}: {
  id: string;
  label: string;
  note?: string;
  tweak?: (s: IssueSummary) => IssueSummary;
  selected?: boolean;
  /** Force the hover footer open, to review it without a pointer. */
  footer?: boolean;
}) {
  return (
    <V label={label} note={note} width={264}>
      <WithSummary id={id}>
        {(s) => (
          <div className={footer ? "[&_[data-wf=IssueCardFooter]]:grid-rows-[1fr]" : undefined}>
            <IssueCard issue={tweak ? tweak(s) : s} selected={selected} />
          </div>
        )}
      </WithSummary>
    </V>
  );
}

function IssueCardBody() {
  return (
    <>
      <Card id={ISSUE.plain} label="default" note="Title, path, progress ring, one live lease." />
      <Card id={ISSUE.rich} label="needs you, blocking" />
      <Card id={ISSUE.blocked} label="blocked" />
      <Card id={ISSUE.stale} label="stale" />
      <Card id={ISSUE.leaseExpired} label="lease expired" />
      <Card id={ISSUE.doneUnmet} label="done with unmet criteria" />
      <Card id={ISSUE.badYaml} label="lint errors" />
      <Card id={ISSUE.heavyLint} label="lint warnings" />
      <Card id={ISSUE.rich} label="selected" selected />
      <Card
        id={ISSUE.plain}
        label="long title"
        tweak={(s) => ({ ...s, title: LONG_TITLE })}
        note="Two lines, then an ellipsis."
      />
      <Card
        id={ISSUE.plain}
        label="no criteria"
        tweak={(s) => ({
          ...s,
          progress: { ...s.progress, criteria: { total: 0, claimed: 0, verified: 0 } },
        })}
        note="The ring turns dashed."
      />
      <Card
        id={ISSUE.plain}
        label="urgent priority"
        tweak={(s) => ({ ...s, priority: "urgent" })}
      />
      <Card id={ISSUE.crowded} label="three leases" />
      <Card id={ISSUE.cancelled} label="cancelled" />
      <Card id={ISSUE.cleanDone} label="done, clean" />
      <Card
        id={ISSUE.rich}
        label="hover footer (forced open)"
        footer
        note="Tasks, ready count, last activity and the … menu."
      />
    </>
  );
}

// ---------------------------------------------------------------- IssueCardPreview, IssueCardMenu

function IssueCardPreviewBody() {
  return (
    <V label="drag image" width={264}>
      <WithSummary id={ISSUE.rich}>{(s) => <IssueCardPreview issue={s} />}</WithSummary>
    </V>
  );
}

function MenuDemo({ view }: { view: "all" | "move" }) {
  const [open, setOpen] = useState(false);
  return (
    <WithSummary id="wf-v1cm9">
      {(s) => (
        <IssueCardMenu issue={s} open={open} onOpenChange={setOpen} view={view}>
          <Button variant="secondary" size="sm">
            {view === "all" ? "Open the … menu" : "Open the Move menu (s)"}
          </Button>
        </IssueCardMenu>
      )}
    </WithSummary>
  );
}

function IssueCardMenuBody() {
  return (
    <>
      <V label="all actions" note="Right-click a card or press the … button.">
        <MenuDemo view="all" />
      </V>
      <V label="move only" note="What the s key opens.">
        <MenuDemo view="move" />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- KanbanColumn

function columnOf(status: IssueStatus, snap: WorkspaceSnapshot): IssueSummary[] {
  return snap.issues.filter((i) => i.status === status).sort(compareCards);
}

function ColumnFrame({
  status,
  label,
  onFold,
}: {
  status: IssueStatus;
  label: string;
  onFold?: boolean;
}) {
  return (
    <V label={label} width={272} height={460}>
      <WithSnapshot>
        {(snap) => (
          <div className="flex min-h-0 flex-1 justify-center bg-subtle p-1">
            <KanbanColumn
              status={status}
              issues={columnOf(status, snap)}
              onFold={onFold ? () => undefined : undefined}
            />
          </div>
        )}
      </WithSnapshot>
    </V>
  );
}

function KanbanColumnBody() {
  return (
    <>
      <ColumnFrame status="in_progress" label="normal" />
      <ColumnFrame status="backlog" label="foldable (hover the header)" onFold />
      <V label="empty" width={272} height={200}>
        <div className="flex min-h-0 flex-1 justify-center bg-subtle p-1">
          <KanbanColumn status="blocked" issues={[]} />
        </div>
      </V>
      <V label="folded rail" width={52} height={260}>
        <div className="flex min-h-0 flex-1 justify-center bg-subtle p-1">
          <FoldedColumn status="done" count={4} onUnfold={() => undefined} />
        </div>
      </V>
      <V label="ColumnHeader" width={264}>
        <ColumnHeader status="review" count={3} onFold={() => undefined} />
      </V>
      <V label="EmptyDropArea · resting" width={248}>
        <EmptyDropArea status="done" active={false} />
      </V>
      <V label="EmptyDropArea · drop active" width={248}>
        <EmptyDropArea status="done" active />
      </V>
      <V label="DropLine" width={248} note="The accent line where a dragged card will land.">
        <div className="relative mt-2 h-6 rounded-md border border-border border-dashed">
          <DropLine />
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- BoardToolbar

function chainTo(root: GroupNode, id: string): GroupNode[] {
  const chain = groupChain(root, id);
  return chain.length ? chain : [root];
}

function ToolbarDemo({
  label,
  width,
  group,
  filtered,
  swim,
}: {
  label: string;
  width: number;
  group?: string;
  filtered?: boolean;
  swim: "child" | "none";
}) {
  return (
    <V label={label} width={width}>
      <WithSnapshot>
        {(snap) => {
          const chain = group ? chainTo(snap.groups, group) : [snap.groups];
          const scope = issuesInGroup(chain[chain.length - 1], snap.issues);
          const open = scope.filter((i) => i.status !== "cancelled");
          const visible = filtered ? open.filter((i) => i.signals.needs_you > 0) : open;
          const authors = snap.authors
            .map((a) => ({
              handle: a.handle,
              count: open.filter((i) => issueAuthors(i).includes(a.handle)).length,
            }))
            .sort((a, b) => b.count - a.count);
          return (
            <div className="@container/board overflow-hidden rounded-md border border-border">
              <Sandbox path="/w">
                <BoardToolbar
                  chain={chain}
                  summary={summarize(visible)}
                  scopedTotal={open.length}
                  filtered={Boolean(filtered)}
                  authors={authors}
                  me={snap.config.author}
                  canSwim={chain[chain.length - 1].children.length > 0}
                  swim={swim}
                  cancelledCount={scope.length - open.length}
                />
              </Sandbox>
            </div>
          );
        }}
      </WithSnapshot>
    </V>
  );
}

function BoardToolbarBody() {
  return (
    <>
      <ToolbarDemo label="all issues, swimlanes by group" width={1040} swim="child" />
      <ToolbarDemo
        label="inside wf / core (no subgroups)"
        width={1040}
        group="g-core1"
        swim="none"
      />
      <ToolbarDemo label="filtered view" width={1040} filtered swim="child" />
      <ToolbarDemo label="narrow board (container query)" width={560} group="g-web01" swim="none" />
    </>
  );
}

// ---------------------------------------------------------------- Swimlane

function lanesOf(snap: WorkspaceSnapshot): BoardLane[] {
  const wf = snap.groups.children.find((g) => g.id === "g-wf001") ?? snap.groups;
  return buildLanes(wf, issuesInGroup(wf, snap.issues), { hideEmpty: false });
}

function SwimlaneDemo({
  lane,
  folded,
  startCollapsed,
}: {
  lane: BoardLane;
  folded: IssueStatus[];
  startCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(Boolean(startCollapsed));
  const [open, setOpen] = useState<IssueStatus[]>([]);
  return (
    <div className="bg-subtle">
      <Swimlane
        lane={lane}
        columns={BOARD_COLUMNS}
        isFolded={(s) => folded.includes(s) && !open.includes(s)}
        onUnfold={(s) => setOpen((o) => [...o, s])}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        active={null}
      />
    </div>
  );
}

function SwimlaneBody() {
  return (
    <WithSnapshot>
      {(snap) => {
        const lanes = lanesOf(snap);
        const web = lanes.find((l) => l.title === "web") ?? lanes[0];
        const core = lanes.find((l) => l.title === "core") ?? lanes[0];
        const direct = lanes.find((l) => l.id === "__direct");
        const empty: BoardLane = { ...singleLane([]), id: "g-empty", title: "design" };
        return (
          <>
            <V
              label="expanded, backlog and done folded"
              fill
              className="overflow-x-auto rounded-md border border-border"
            >
              <SwimlaneDemo lane={web} folded={["backlog", "done"]} />
            </V>
            <V
              label="expanded, nothing folded"
              fill
              className="overflow-x-auto rounded-md border border-border"
            >
              <SwimlaneDemo lane={core} folded={[]} />
            </V>
            <V
              label="collapsed"
              note={laneSummary(core.issues)}
              fill
              className="rounded-md border border-border"
            >
              <SwimlaneDemo lane={core} folded={["backlog", "done"]} startCollapsed />
            </V>
            {direct && (
              <V
                label="“No subgroup” lane"
                fill
                className="overflow-x-auto rounded-md border border-border"
              >
                <SwimlaneDemo lane={direct} folded={["backlog", "done"]} />
              </V>
            )}
            <V label="empty lane" fill className="rounded-md border border-border">
              <SwimlaneDemo lane={empty} folded={[]} />
            </V>
          </>
        );
      }}
    </WithSnapshot>
  );
}

// ---------------------------------------------------------------- MiniStatusBar

function MiniStatusBarBody() {
  return (
    <WithSnapshot>
      {(snap) => {
        const lanes = lanesOf(snap);
        const pick = (title: string) => lanes.find((l) => l.title === title)?.issues ?? [];
        return (
          <>
            <V label="whole workspace · 32 px">
              <MiniStatusBar issues={snap.issues} />
            </V>
            <V label="web">
              <MiniStatusBar issues={pick("web")} />
            </V>
            <V label="core">
              <MiniStatusBar issues={pick("core")} />
            </V>
            <V label="only cancelled">
              <MiniStatusBar issues={snap.issues.filter((i) => i.status === "cancelled")} />
            </V>
          </>
        );
      }}
    </WithSnapshot>
  );
}

// ---------------------------------------------------------------- KanbanBoard, BoardPage

function KanbanBoardBody() {
  return (
    <>
      <V
        label="columns, one lane"
        note="Live: j k h l move between cards while this board is mounted."
        fill
        height={520}
      >
        <WithSnapshot>
          {(snap) => (
            <div className="relative min-h-0 flex-1 bg-subtle">
              <KanbanBoard
                columns={BOARD_COLUMNS}
                lanes={[singleLane(snap.issues.filter((i) => i.status !== "cancelled"))]}
                swimlanes={false}
                basePath={[]}
              />
            </div>
          )}
        </WithSnapshot>
      </V>
      <V label="loading · toolbar and board skeletons" fill height={360}>
        <div className="@container/board flex min-h-0 flex-1 flex-col">
          <Sandbox path="/w" quiet>
            <BoardToolbarSkeleton />
          </Sandbox>
          <div className="relative min-h-0 flex-1 bg-subtle">
            <BoardSkeleton />
          </div>
        </div>
      </V>
    </>
  );
}

function BoardPageBody() {
  return (
    <V
      label="toolbar + swimlanes, as /w"
      note="Filters and group changes stay in the kit's private router."
      fill
      height={560}
    >
      <BoardPage />
    </V>
  );
}

export const boardEntries: KitEntry[] = [
  entry(
    "Workflow · Board",
    "IssueCard",
    `${SRC}/IssueCard.tsx`,
    "It is the board's unit of attention: calm by default, and every signal (needs you, blocked, stale, lease, unmet criteria, lint) appears only when it is true, so a glance down a column shows what needs a human.",
    IssueCardBody,
  ),
  entry(
    "Workflow · Board",
    "IssueCardPreview",
    `${SRC}/IssueCard.tsx`,
    "The drag image has to be light enough to carry across a crowded board, so it keeps only status, title and id.",
    IssueCardPreviewBody,
  ),
  entry(
    "Workflow · Board",
    "IssueCardMenu",
    `${SRC}/IssueCardMenu.tsx`,
    "Moving, opening in a page and copying a link must work from the keyboard and the right-click, without turning the card into a button row.",
    IssueCardMenuBody,
  ),
  entry(
    "Workflow · Board",
    "KanbanColumn",
    `${SRC}/KanbanColumn.tsx`,
    "A column is both a status filter and a drop target; it scrolls on its own so one long column never pushes the others off screen.",
    KanbanColumnBody,
  ),
  entry(
    "Workflow · Board",
    "BoardToolbar",
    `${SRC}/BoardToolbar.tsx`,
    "The Workflow tabs, scope, filters and New issue sit in one 44 px bar that adapts to the width of the board, so the drawer can dock beside it without crowding it.",
    BoardToolbarBody,
  ),
  entry(
    "Workflow · Board",
    "Swimlane",
    `${SRC}/Swimlane.tsx`,
    "Bands per child group let a coordinator see every lane of work in one board while the rule that cards never cross lanes keeps ownership clear.",
    SwimlaneBody,
  ),
  entry(
    "Workflow · Board",
    "MiniStatusBar",
    `${SRC}/Swimlane.tsx`,
    "A 32 px segmented bar answers 'how far along is this group' without opening it, and keeps the colors tied to status.",
    MiniStatusBarBody,
  ),
  entry(
    "Workflow · Board",
    "KanbanBoard",
    `${SRC}/KanbanBoard.tsx`,
    "The board region joins columns, swimlanes, drag and the keyboard model, so the whole workspace is one scannable surface.",
    KanbanBoardBody,
  ),
  entry(
    "Workflow · Board",
    "BoardPage",
    `${SRC}/BoardPage.tsx`,
    "The route that turns the snapshot and the URL filters into one view model, so the toolbar, the board and the keyboard always agree.",
    BoardPageBody,
  ),
];
