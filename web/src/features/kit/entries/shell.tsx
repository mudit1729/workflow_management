import { useEffect } from "react";
import { toast } from "sonner";
import { GroupTree } from "@/app/GroupTree";
import { getMockControls } from "@/app/mock-controls";
import { LiveBadge, NavRail } from "@/app/NavRail";
import { NotifyBanner } from "@/app/NotifyBanner";
import { RouteError, RouteNotFound, RoutePending } from "@/app/RouteStates";
import { openCommandPalette, openShortcuts, useShell } from "@/app/shell-store";
import { Button, Chip } from "@/components/ui";
import type { ActivityEvent } from "@/gen/types";
import { requestMove, useSnapshot } from "@/lib/api";
import { useLiveStatus } from "@/lib/live";
import { announce } from "@/lib/live/notify";
import { entry, type KitEntry, Row, Sandbox, V, WithSummary } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/app";

// The prototype pill inside NavRail drives one global flag, so every copy would open at once.
const HIDE_DEV_PANEL = "[&_[data-wf=DevPanel]]:hidden";

// ---------------------------------------------------------------- NavRail, GroupTree

function NavRailBody() {
  return (
    <>
      <V
        label="expanded · 232 px · on Workflow · Board"
        note="The Prototype pill is hidden in these frames; see DevPanel. Links stay in the kit."
        width={232}
        height={640}
      >
        <Sandbox path="/w">
          <div className={`flex min-h-0 flex-1 ${HIDE_DEV_PANEL}`}>
            <NavRail />
          </div>
        </Sandbox>
      </V>
      <V label="expanded · on Library · Files" width={232} height={640}>
        <Sandbox path="/files">
          <div className={`flex min-h-0 flex-1 ${HIDE_DEV_PANEL}`}>
            <NavRail />
          </div>
        </Sandbox>
      </V>
      <V
        label="collapsed · 52 px · one icon per view"
        note="Hover an icon: the tooltip lists the view's sub-views."
        width={52}
        height={640}
      >
        <Sandbox path="/skills">
          <div className={`flex min-h-0 flex-1 ${HIDE_DEV_PANEL}`}>
            <NavRail collapsed />
          </div>
        </Sandbox>
      </V>
      <V label="sheet (phone overlay) · on Library · Library" width={280} height={640}>
        <Sandbox path="/lib">
          <div className={`flex min-h-0 flex-1 [&>nav]:flex-1 ${HIDE_DEV_PANEL}`}>
            <NavRail variant="sheet" />
          </div>
        </Sandbox>
      </V>
    </>
  );
}

function GroupTreeBody() {
  return (
    <>
      <V label="expanded" width={232} height={340}>
        <div className="min-h-0 flex-1 overflow-y-auto bg-subtle py-2">
          <GroupTree />
        </div>
      </V>
      <V label="collapsed rail (dots, titles in tooltips)" width={52} height={340}>
        <div className="min-h-0 flex-1 overflow-y-auto bg-subtle py-2">
          <GroupTree collapsed />
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- overlays opened from the shell

function CommandPaletteBody() {
  return (
    <V label="open" note="The same palette ⌘K opens. Mounted once by the shell.">
      <Button variant="secondary" size="sm" onClick={openCommandPalette}>
        Open the command palette
      </Button>
    </V>
  );
}

function ShortcutsDialogBody() {
  return (
    <V label="open" note="Press ? anywhere outside a text field.">
      <Button variant="secondary" size="sm" onClick={openShortcuts}>
        Open the shortcuts
      </Button>
    </V>
  );
}

function NotifyBannerBody() {
  return (
    <V
      label="two blocking requests · in the nav"
      note="Shows only while a blocking request waits on you, notifications are off, the browser supports them and you have not said Not now. It lives in the nav now that the inbox is gone."
      width={232}
    >
      <div className="bg-subtle py-2">
        <NotifyBanner blocking={2} className="mx-2" />
      </div>
    </V>
  );
}

function DevPanelBody() {
  const open = useShell((s) => s.devPanelOpen);
  const setOpen = useShell((s) => s.setDevPanelOpen);
  return (
    <V
      label="open the one in the nav"
      note="It lives in the nav footer (bottom-left, floating when the nav is collapsed or on a phone). Press . to toggle."
    >
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
        {open ? "Close" : "Open"} the prototype controls
      </Button>
    </V>
  );
}

function MoveGateDialogBody() {
  return (
    <>
      <V
        label="illegal move"
        note="Backlog → Done is not in the transition table. Confirming really moves the mock issue."
      >
        <WithSummary id="wf-v1cm9">
          {(s) => (
            <Button variant="secondary" size="sm" onClick={() => requestMove(s, "done")}>
              Move {s.id} to Done
            </Button>
          )}
        </WithSummary>
      </V>
      <V
        label="done gate"
        note="In progress → Done is legal, but criteria, tasks and a lease are still open."
      >
        <WithSummary id={ISSUE.rich}>
          {(s) => (
            <Button variant="secondary" size="sm" onClick={() => requestMove(s, "done")}>
              Move {s.id} to Done
            </Button>
          )}
        </WithSummary>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- Toaster

function ToasterBody() {
  const snapshot = useSnapshot().data;
  const notable = (kind: "needs_you" | "blocked" | "lease_expired") => {
    const event: ActivityEvent = {
      rev: `kit-${Date.now()}`,
      issue_id: ISSUE.rich,
      kind: kind === "needs_you" ? "request" : kind === "blocked" ? "status" : "lease",
      author: kind === "needs_you" ? "claude-opus" : "codex",
      title:
        kind === "needs_you"
          ? "Approve keeping SSE instead of WebSocket for the board?"
          : kind === "blocked"
            ? "Moved from in_progress to blocked"
            : "Lease on T-3 ran out",
      ts: new Date().toISOString(),
      notable: kind,
    };
    announce(event, snapshot);
  };
  return (
    <>
      <V label="plain" note="Bottom-right, at most three at a time.">
        <Row>
          <Button variant="secondary" size="sm" onClick={() => toast("Link copied")}>
            Info toast
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast.success("Moved to Review")}>
            Success
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast.error("Could not save the change", { description: "Try again in a moment." })
            }
          >
            Error
          </Button>
        </Row>
      </V>
      <V
        label="409 conflict (shape)"
        note="Warning with an action. The real one comes from any write after Prototype > Conflict next write."
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.warning("goal.md changed by @codex — reapply?", {
              description: "Your change was not saved.",
              duration: 10_000,
              action: { label: "Reapply", onClick: () => toast("Reapplied") },
            })
          }
        >
          Conflict toast
        </Button>
      </V>
      <V label="422 rejected (shape)">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.error("4 of 5 criteria not verified (3 open, 1 claimed without evidence)", {
              description: "Verify them, or move to Done anyway.",
            })
          }
        >
          Rejected toast
        </Button>
      </V>
      <V
        label="notable live activity"
        note="Only needs-you, blocked and expired-lease events toast. “Open” opens the issue."
      >
        <Row>
          <Button variant="secondary" size="sm" onClick={() => notable("needs_you")}>
            Needs you
          </Button>
          <Button variant="secondary" size="sm" onClick={() => notable("blocked")}>
            Blocked
          </Button>
          <Button variant="secondary" size="sm" onClick={() => notable("lease_expired")}>
            Lease expired
          </Button>
        </Row>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- LiveBadge

function LiveBadgeBody() {
  const { state } = useLiveStatus();
  const set = (next: "live" | "reconnecting" | "offline") => getMockControls()?.setConnection(next);
  // Leave the connection as it was found when the kit closes.
  useEffect(() => () => getMockControls()?.setConnection("live"), []);
  return (
    <>
      <V
        label="connection (mock)"
        note="Drives the same switch as Prototype > Connection; it resets when you leave the kit."
      >
        <Row>
          {(["live", "reconnecting", "offline"] as const).map((s) => (
            <Button
              key={s}
              variant={state === s ? "subtle" : "secondary"}
              size="sm"
              aria-pressed={state === s}
              onClick={() => set(s)}
            >
              {s}
            </Button>
          ))}
        </Row>
      </V>
      <V label="chip (nav header)" note="Renders nothing while live.">
        <div className="flex h-8 items-center gap-2 rounded-md bg-subtle px-3">
          <span className="font-medium text-base">wf</span>
          <LiveBadge />
          {state === "live" && <Chip tone="outline">live: nothing shows</Chip>}
        </div>
      </V>
      <V label="compact dot (collapsed nav)">
        <div className="relative flex h-8 w-12 items-center justify-center rounded-md bg-subtle">
          <span className="relative">
            <span className="flex size-5 items-center justify-center rounded-md bg-fg font-semibold text-bg text-xs">
              wf
            </span>
            <LiveBadge compact />
          </span>
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- route states

function RoutePendingBody() {
  return (
    <V label="loading" width={420} height={120}>
      <RoutePending />
    </V>
  );
}

function RouteNotFoundBody() {
  return (
    <V label="unknown address" width={520} height={240}>
      <Sandbox path="/boards/old-link" quiet>
        <RouteNotFound />
      </Sandbox>
    </V>
  );
}

function RouteErrorBody() {
  return (
    <V label="a view failed" width={520} height={320}>
      <RouteError
        error={new Error("Snapshot request failed with status 500")}
        reset={() => undefined}
      />
    </V>
  );
}

export const shellEntries: KitEntry[] = [
  entry(
    "Shell",
    "NavRail",
    `${SRC}/NavRail.tsx`,
    "One rail holds the workspace and its two views (Workflow: Board; Library: Personal, Team libraries, Files and Skills), the Groups tree that filters the board, and Kit; it folds to one icon per view at 52 px when the board needs the room. What needs you is a filter of the board, not an item here.",
    NavRailBody,
  ),
  entry(
    "Shell",
    "GroupTree",
    `${SRC}/GroupTree.tsx`,
    "Groups are how work is organized on disk, so the tree makes scope one click: it shows roll-up counts, a status bar and a needs-you dot per group.",
    GroupTreeBody,
  ),
  entry(
    "Shell",
    "CommandPalette",
    `${SRC}/CommandPalette.tsx`,
    "Jumping to any issue, group or library item and running actions from the keyboard is the fastest way through a workspace this size.",
    CommandPaletteBody,
  ),
  entry(
    "Shell",
    "ShortcutsDialog",
    `${SRC}/ShortcutsDialog.tsx`,
    "Single-key shortcuts are only usable if they can be looked up in one keystroke, so the list is always one ? away.",
    ShortcutsDialogBody,
  ),
  entry(
    "Shell",
    "NotifyBanner",
    "src/app/NotifyBanner.tsx",
    "Blocking requests are worth a browser notification, but only if you ask for them; the banner asks once, in the nav, and then gets out of the way.",
    NotifyBannerBody,
  ),
  entry(
    "Shell",
    "DevPanel",
    `${SRC}/DevPanel.tsx`,
    "The prototype runs on mock data, so one small panel drives live events, conflicts, connection loss and archify, letting reviewers see every state without a daemon.",
    DevPanelBody,
  ),
  entry(
    "Shell",
    "MoveGateDialog",
    "src/components/common/MoveGateDialog.tsx",
    "Illegal moves and unfinished work get one explicit stop that names the gaps, so a status change is never silently wrong and never impossible.",
    MoveGateDialogBody,
  ),
  entry(
    "Shell",
    "Toaster",
    "src/components/common/Toaster.tsx",
    "Conflicts, rejected writes and notable live events must reach you wherever you are, in one calm corner, with the action to resolve them.",
    ToasterBody,
  ),
  entry(
    "Shell",
    "LiveBadge",
    `${SRC}/NavRail.tsx`,
    "Live updates are a promise; when the stream drops the badge says so, so nobody trusts a board that stopped moving.",
    LiveBadgeBody,
  ),
  entry(
    "Shell",
    "RoutePending",
    `${SRC}/RouteStates.tsx`,
    "A route that takes more than 200 ms shows a quiet loading line instead of a blank pane.",
    RoutePendingBody,
  ),
  entry(
    "Shell",
    "RouteNotFound",
    `${SRC}/RouteStates.tsx`,
    "Old and mistyped links land somewhere helpful: the address that failed and a way back to the board.",
    RouteNotFoundBody,
  ),
  entry(
    "Shell",
    "RouteError",
    `${SRC}/RouteStates.tsx`,
    "When a view crashes the page says your files are safe and gives you the details to report, instead of a white screen.",
    RouteErrorBody,
  ),
];
