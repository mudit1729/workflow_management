// The left navigation. Workspace "wf" holds two views: Workflow (work in motion: Board) and
// Library (everything stored: Personal, Team libraries with the workspace's own first and "+ Add
// team library", Files, Skills). Below them the Groups tree,
// which filters the Workflow board, then Kit (prototype tools) and the display controls. What needs
// you is a filter of the board, not a place in the nav. 232 px, or a
// 52 px icon rail when collapsed (⌘B or [): one icon per view, tooltips list the sub-views.
// Below 768 px AppShell shows it inside a sheet (variant "sheet").
import { Link } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Component,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Rows2,
  Rows3,
  Search,
  Sun,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  AuthorChip,
  SUBVIEWS,
  useActiveSubView,
  useViewCounts,
  VIEWS,
  type ViewCounts,
  type WfSubView,
  type WfView,
} from "@/components/common";
import { Button, Chip, Kbd, Segmented, Tooltip } from "@/components/ui";
import { useLibraries, useMe, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLiveStatus } from "@/lib/live";
import { libraryPath, usePathname } from "@/lib/nav";
import { type Density, type ThemePref, usePrefs } from "@/lib/prefs";
import { DevPanel } from "./DevPanel";
import { GroupTree } from "./GroupTree";
import { NotifyBanner, useBlockingForMe } from "./NotifyBanner";
import { openAddLibrary, useShell } from "./shell-store";
import { useNavRail } from "./useNavRail";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export interface NavRailProps {
  collapsed?: boolean;
  /** "sheet" is the mobile overlay: always expanded, no collapse control. */
  variant?: "rail" | "sheet";
  /** Called after any navigation from the nav (the mobile sheet closes). */
  onNavigate?: () => void;
}

export function NavRail({ collapsed = false, variant = "rail", onNavigate }: NavRailProps) {
  const isCollapsed = variant === "rail" && collapsed;
  const setPaletteOpen = useShell((s) => s.setPaletteOpen);

  return (
    <nav
      data-wf="NavRail"
      aria-label="Main"
      data-collapsed={isCollapsed || undefined}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-subtle",
        variant === "rail" &&
          "border-border border-r transition-[width] duration-150 ease-wf motion-reduce:transition-none",
      )}
      style={
        variant === "rail"
          ? { width: isCollapsed ? "var(--wf-nav-w-collapsed)" : "var(--wf-nav-w)" }
          : undefined
      }
    >
      <NavHeader collapsed={isCollapsed} />

      <div className={cn("pb-2", isCollapsed ? "flex justify-center px-2" : "px-2")}>
        {isCollapsed ? (
          <Tooltip content="Search or jump to…" shortcut="mod+k" side="right">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search or jump to…"
              onClick={() => {
                setPaletteOpen(true);
                onNavigate?.();
              }}
            >
              <Search {...ICON} />
            </Button>
          </Tooltip>
        ) : (
          <button
            type="button"
            data-wf="NavSearchButton"
            onClick={() => {
              setPaletteOpen(true);
              onNavigate?.();
            }}
            className="flex h-7 w-full items-center gap-2 rounded-md border border-border bg-bg px-2 text-fg-faint transition-colors duration-100 ease-wf hover:border-border-strong hover:text-fg-muted"
          >
            <Search {...ICON} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-left">Search or jump…</span>
            {/* A touch screen has no ⌘K. */}
            {variant === "rail" && <Kbd combo="mod+k" />}
          </button>
        )}
      </div>

      <NavItems collapsed={isCollapsed} onNavigate={onNavigate} />

      <div
        className={cn(
          "flex h-7 shrink-0 items-center pt-3",
          isCollapsed ? "justify-center px-2" : "px-4",
        )}
      >
        {isCollapsed ? (
          <span aria-hidden className="h-px w-4 bg-border" />
        ) : (
          <Tooltip content="Pick a group to filter the Workflow board" side="right">
            <span className="font-medium text-fg-faint text-xs">Groups</span>
          </Tooltip>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-1 pb-3">
        <GroupTree collapsed={isCollapsed} onSelect={onNavigate} />
      </div>

      {!isCollapsed && <NavNotifyBanner />}

      <div
        className={cn(
          "flex shrink-0 items-center pb-2",
          isCollapsed ? "justify-center px-2" : "justify-between gap-2 px-2",
        )}
      >
        <KitLink collapsed={isCollapsed} onNavigate={onNavigate} />
        {variant === "rail" && !isCollapsed && <DevPanel placement="nav" />}
      </div>

      <NavFooter collapsed={isCollapsed} sheet={variant === "sheet"} />
    </nav>
  );
}

// ---------------------------------------------------------------- header

function WorkspaceMark() {
  return (
    <span
      aria-hidden
      className="flex size-5 shrink-0 items-center justify-center rounded-md bg-fg font-semibold text-bg text-xs leading-none tracking-tight"
    >
      wf
    </span>
  );
}

function NavHeader({ collapsed }: { collapsed: boolean }) {
  const name = useSnapshot().data?.config.name;
  const me = useMe();
  const live = useLiveStatus().state === "live";

  if (collapsed) {
    return (
      <div className="flex h-[var(--wf-topbar-h)] shrink-0 items-center justify-center">
        <span className="relative">
          <WorkspaceMark />
          <LiveBadge compact />
        </span>
        <span className="sr-only">{name ?? "wf"} workspace</span>
      </div>
    );
  }

  return (
    <div
      data-wf="WorkspaceHeader"
      className="flex h-[var(--wf-topbar-h)] shrink-0 items-center gap-2 pr-3 pl-4"
    >
      <WorkspaceMark />
      <div className="flex min-w-0 flex-col items-start">
        {/* The connection state takes the micro-label's line while it is not live, so the two
            never fight for the same few pixels beside the name. */}
        {live ? (
          <span className="max-w-full truncate text-fg-faint text-xs leading-[14px]">
            Workspace
          </span>
        ) : (
          <LiveBadge />
        )}
        <span className="max-w-full truncate font-medium text-base text-fg leading-[16px]">
          {name ?? "wf"}
        </span>
      </div>
      {me && (
        <Tooltip content={`Acting as @${me}`} side="bottom">
          <span className="ml-auto flex shrink-0" data-wf="ActingAs">
            <AuthorChip handle={me} variant="avatar" size="sm" />
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/** SC-3: the live stream state, shown only when it is not live. */
export function LiveBadge({ compact = false }: { compact?: boolean }) {
  const { state } = useLiveStatus();
  if (state === "live") return null;

  const reconnecting = state === "reconnecting";
  const label = reconnecting ? "Reconnecting…" : "Offline";
  const hint = reconnecting
    ? "Live updates paused. Retrying the connection to wf serve."
    : "No connection to wf serve. The board may be out of date and writes will fail.";

  if (compact) {
    return (
      <Tooltip content={`${label} ${hint}`} side="right">
        <span
          data-wf="LiveBadge"
          role="status"
          className={cn(
            "absolute -top-1 -right-1 size-2 rounded-full ring-2 ring-subtle",
            reconnecting ? "animate-pulse bg-stale" : "bg-danger",
          )}
        >
          <span className="sr-only">{label}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={hint} side="bottom">
      <span data-wf="LiveBadge" role="status" className="inline-flex shrink-0">
        <Chip
          tone={reconnecting ? "stale" : "danger"}
          icon={
            reconnecting ? (
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-stale" />
            ) : (
              <WifiOff size={12} strokeWidth={1.75} aria-hidden />
            )
          }
        >
          {label}
        </Chip>
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- items

const VIEW_ORDER: WfView[] = ["workflow", "workdatabase"];

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const active = useActiveSubView();
  const counts = useViewCounts();
  const activeView = active ? SUBVIEWS[active].view : undefined;

  return (
    <ul
      aria-label="Views"
      className={cn("flex flex-col gap-px", collapsed ? "items-center px-2" : "px-2")}
    >
      {VIEW_ORDER.map((view) => (
        <li key={view} data-wf="NavView" data-view={view}>
          {collapsed ? (
            <CollapsedView
              view={view}
              current={activeView === view}
              active={active}
              onNavigate={onNavigate}
            />
          ) : (
            <ExpandedView
              view={view}
              current={activeView === view}
              active={active}
              counts={counts}
              onNavigate={onNavigate}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** What a sub-view shows after its name: how many things it holds, or nothing. */
function subCount(sub: WfSubView, counts: ViewCounts): number | undefined {
  switch (sub) {
    case "personal":
      return counts.personal;
    case "team":
      return counts.team;
    case "files":
      return counts.files;
    case "skills":
      return counts.skills;
    default:
      return undefined;
  }
}

const SUB_COUNT_LABEL: Partial<Record<WfSubView, string>> = {
  personal: "pages",
  team: "libraries",
  files: "files",
  skills: "skills",
};

function ExpandedView({
  view,
  current,
  active,
  counts,
  onNavigate,
}: {
  view: WfView;
  /** The route is inside this view. */
  current: boolean;
  active: WfSubView | undefined;
  counts: ViewCounts;
  onNavigate?: () => void;
}) {
  const def = VIEWS[view];
  const Icon = def.icon;
  const home = SUBVIEWS[def.home];

  return (
    <>
      <Link
        to={home.to}
        onClick={onNavigate}
        className="flex h-7 items-center gap-2 rounded-md px-2 font-medium text-base text-fg transition-colors duration-100 ease-wf hover:bg-muted/70"
      >
        <Icon
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className={cn("shrink-0", current ? "text-fg" : "text-fg-faint")}
        />
        <span className="min-w-0 flex-1 truncate">{def.label}</span>
      </Link>
      <ul
        aria-label={`${def.label} views`}
        className="mt-px mb-1 ml-[15px] flex flex-col gap-px border-border border-l pl-1"
      >
        {def.subs.map((sub) => {
          const subDef = SUBVIEWS[sub];
          const n = subCount(sub, counts);
          const here = active === sub;
          return (
            <li key={sub}>
              <Link
                to={subDef.to}
                onClick={onNavigate}
                aria-current={here ? "page" : undefined}
                className={cn(
                  "flex h-7 items-center gap-2 rounded-md pr-2 pl-[11px] text-base transition-colors duration-100 ease-wf",
                  here ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{subDef.label}</span>
                {n !== undefined && (
                  <span className="tabular text-fg-faint text-xs">
                    {n}
                    <span className="sr-only"> {SUB_COUNT_LABEL[sub]}</span>
                  </span>
                )}
                {sub === "files" && counts.fileErrors > 0 && (
                  <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-danger" />
                )}
              </Link>
              {sub === "team" && <TeamLibraryRows onNavigate={onNavigate} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * The team libraries under their row: the workspace's own first, then each one added, then the
 * button that adds another by its GitHub link.
 */
function TeamLibraryRows({ onNavigate }: { onNavigate?: () => void }) {
  const libraries = useLibraries().data?.filter((l) => l.kind !== "personal") ?? [];
  const path = usePathname();
  return (
    <ul
      data-wf="NavTeamLibraries"
      aria-label="Team libraries"
      className="mt-px mb-0.5 ml-[11px] flex flex-col gap-px border-border border-l pl-1"
    >
      {libraries.map((l) => {
        const base = libraryPath(l.alias);
        const here = path === base || path.startsWith(`${base}/`);
        return (
          <li key={l.alias}>
            <Link
              to="/lib/t/$alias"
              params={{ alias: l.alias }}
              onClick={onNavigate}
              aria-current={here ? "page" : undefined}
              title={l.kind === "workspace" ? `${l.name} (${l.alias})` : l.name}
              className={cn(
                "flex h-7 items-center rounded-md pr-2 pl-[11px] text-base transition-colors duration-100 ease-wf",
                here ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
            </Link>
          </li>
        );
      })}
      <li>
        <button
          type="button"
          onClick={() => {
            openAddLibrary();
            onNavigate?.();
          }}
          className="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 pl-[11px] text-fg-faint text-base transition-colors duration-100 ease-wf hover:bg-muted/70 hover:text-fg"
        >
          <Plus {...ICON} aria-hidden />
          Add team library
        </button>
      </li>
    </ul>
  );
}

function CollapsedView({
  view,
  current,
  active,
  onNavigate,
}: {
  view: WfView;
  current: boolean;
  active: WfSubView | undefined;
  onNavigate?: () => void;
}) {
  const def = VIEWS[view];
  const Icon = def.icon;
  const home = SUBVIEWS[def.home];

  return (
    <Tooltip
      side="right"
      shortcut={def.shortcut}
      content={
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{def.label}</span>
          <span>{def.subs.map((sub) => SUBVIEWS[sub].label).join(" · ")}</span>
        </span>
      }
    >
      <Link
        to={home.to}
        onClick={onNavigate}
        aria-label={def.label}
        aria-current={active === def.home ? "page" : undefined}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-colors duration-100 ease-wf",
          current ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
        )}
      >
        <Icon size={14} strokeWidth={1.75} aria-hidden />
      </Link>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- notifications

/** The opt-in for browser notifications, shown while a blocking request waits on me. */
function NavNotifyBanner() {
  const blocking = useBlockingForMe();
  return <NotifyBanner blocking={blocking} className="mx-2 mb-2 shrink-0" />;
}

// ---------------------------------------------------------------- Kit

/** Kit holds the prototype's own tools: the component gallery. It sits above the footer. */
function KitLink({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const here = usePathname().startsWith("/kit");
  const link = collapsed ? (
    <Tooltip side="right" shortcut="g k" content="Kit · prototype tools">
      <Link
        to="/kit"
        onClick={onNavigate}
        aria-label="Kit, prototype tools"
        aria-current={here ? "page" : undefined}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-colors duration-100 ease-wf",
          here ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
        )}
      >
        <Component {...ICON} aria-hidden />
      </Link>
    </Tooltip>
  ) : (
    <Link
      to="/kit"
      onClick={onNavigate}
      aria-current={here ? "page" : undefined}
      title="Prototype tools: every component, by name"
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-base transition-colors duration-100 ease-wf",
        here ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
      )}
    >
      <Component {...ICON} aria-hidden className={here ? "text-fg" : "text-fg-faint"} />
      Kit
    </Link>
  );
  return (
    <div data-wf="NavKit" className={cn(collapsed && "flex justify-center")}>
      {link}
    </div>
  );
}

// ---------------------------------------------------------------- footer

const THEME_ICON: Record<ThemePref, ReactNode> = {
  system: <Monitor {...ICON} />,
  light: <Sun {...ICON} />,
  dark: <Moon {...ICON} />,
};
const THEME_LABEL: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };
const THEME_NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const DENSITY_LABEL: Record<Density, string> = { comfy: "Comfortable", compact: "Compact" };

function useNotificationToggle() {
  const notifications = usePrefs((s) => s.notifications);
  const setNotifications = usePrefs((s) => s.setNotifications);

  async function toggle() {
    if (notifications) {
      setNotifications(false);
      return;
    }
    if (typeof Notification === "undefined") {
      toast.error("This browser does not support notifications.");
      return;
    }
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast("Notifications are blocked", {
        description: "Allow notifications for this site in your browser settings, then try again.",
      });
      return;
    }
    setNotifications(true);
  }

  return { notifications, toggle };
}

function NavFooter({ collapsed, sheet }: { collapsed: boolean; sheet: boolean }) {
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const density = usePrefs((s) => s.density);
  const setDensity = usePrefs((s) => s.setDensity);
  const toggleNav = useNavRail().toggle;
  const setShortcutsOpen = useShell((s) => s.setShortcutsOpen);
  const { notifications, toggle: toggleNotifications } = useNotificationToggle();

  const nextDensity: Density = density === "comfy" ? "compact" : "comfy";
  const densityButton = (
    <Tooltip content={`Density: ${DENSITY_LABEL[density]}`} side={collapsed ? "right" : "top"}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Density: ${DENSITY_LABEL[density]}. Switch to ${DENSITY_LABEL[nextDensity].toLowerCase()}`}
        onClick={() => setDensity(nextDensity)}
      >
        {density === "compact" ? <Rows3 {...ICON} /> : <Rows2 {...ICON} />}
      </Button>
    </Tooltip>
  );

  const notifyLabel = notifications
    ? "Notifications on for blocking requests"
    : "Notifications off";
  const notifyButton = (
    <Tooltip content={notifyLabel} side={collapsed ? "right" : "top"}>
      <Button
        variant="ghost"
        size="icon-sm"
        role="switch"
        aria-checked={notifications}
        aria-label="Notify me about blocking requests"
        onClick={toggleNotifications}
        className={cn(notifications && "text-fg")}
      >
        {notifications ? <Bell {...ICON} /> : <BellOff {...ICON} />}
      </Button>
    </Tooltip>
  );

  if (collapsed) {
    return (
      <div
        data-wf="NavFooter"
        className="flex shrink-0 flex-col items-center gap-1 border-border border-t px-2 py-2"
      >
        <DevPanel placement="rail" />
        <Tooltip content={`Theme: ${THEME_LABEL[theme]}`} side="right">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[THEME_NEXT[theme]].toLowerCase()}`}
            onClick={() => setTheme(THEME_NEXT[theme])}
          >
            {THEME_ICON[theme]}
          </Button>
        </Tooltip>
        {densityButton}
        {notifyButton}
        <Tooltip content="Keyboard shortcuts" shortcut="?" side="right">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
            className="font-medium text-sm"
          >
            ?
          </Button>
        </Tooltip>
        {!sheet && (
          <Tooltip content="Expand sidebar" shortcut="mod+b" side="right">
            <Button variant="ghost" size="icon-sm" aria-label="Expand sidebar" onClick={toggleNav}>
              <PanelLeftOpen {...ICON} />
            </Button>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div
      data-wf="NavFooter"
      className="flex shrink-0 flex-col gap-1 border-border border-t px-2 pt-2 pb-1.5"
    >
      <div className="flex items-center gap-1">
        <Segmented<ThemePref>
          size="sm"
          aria-label="Theme"
          value={theme}
          onChange={setTheme}
          options={(["system", "light", "dark"] as const).map((value) => ({
            value,
            icon: THEME_ICON[value],
            label: null,
            title: `${THEME_LABEL[value]} theme`,
          }))}
        />
        <span className="flex-1" />
        {densityButton}
        {notifyButton}
      </div>
      {/* Shortcuts and the collapse control are for a keyboard and a wide screen: not on a phone. */}
      {!sheet && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="flex h-6 items-center gap-2 rounded-md px-1 text-fg-faint text-xs transition-colors duration-100 ease-wf hover:text-fg-muted"
          >
            <Kbd combo="?" />
            Shortcuts
          </button>
          <span className="flex-1" />
          <Tooltip content="Collapse sidebar" shortcut="mod+b" side="top">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse sidebar"
              onClick={toggleNav}
            >
              <PanelLeftClose {...ICON} />
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
