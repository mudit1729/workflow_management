// The left navigation: workspace, search, views, the group tree and the
// display controls. 232 px, or a 52 px icon rail when collapsed (⌘B or [).
// Below 768 px AppShell shows it inside a sheet (variant "sheet").
import { Link } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Component,
  Inbox,
  LayoutGrid,
  Library,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rows2,
  Rows3,
  Search,
  Sun,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AuthorChip } from "@/components/common";
import { Button, Chip, Kbd, Segmented, Tooltip } from "@/components/ui";
import { useInbox, useMe, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLiveStatus } from "@/lib/live";
import { usePathname } from "@/lib/nav";
import { type Density, type ThemePref, usePrefs } from "@/lib/prefs";
import { DevPanel } from "./DevPanel";
import { GroupTree } from "./GroupTree";
import { useShell } from "./shell-store";

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
            <Kbd combo="mod+k" />
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
          <span className="font-medium text-fg-faint text-xs">Groups</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-1 pb-3">
        <GroupTree collapsed={isCollapsed} onSelect={onNavigate} />
      </div>

      {variant === "rail" && !isCollapsed && (
        <div className="px-3 pb-2">
          <DevPanel placement="nav" />
        </div>
      )}

      <NavFooter collapsed={isCollapsed} showCollapse={variant === "rail"} />
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
    <div className="flex h-[var(--wf-topbar-h)] shrink-0 items-center gap-2 pr-3 pl-4">
      <WorkspaceMark />
      <span className="min-w-0 truncate font-medium text-base text-fg">{name ?? "wf"}</span>
      <LiveBadge />
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
              <WifiOff aria-hidden />
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

type NavTo = "/w" | "/inbox" | "/lib" | "/kit";

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const snapshot = useSnapshot().data;
  const { count: inboxCount } = useInbox();

  const openIssues =
    snapshot?.issues.filter((i) => i.status !== "done" && i.status !== "cancelled").length ?? 0;
  const libraryItems = snapshot?.library.filter((l) => l.status !== "retired").length ?? 0;

  const items: {
    to: NavTo;
    label: string;
    icon: ReactNode;
    shortcut: string;
    active: boolean;
    count?: number;
    countLabel?: string;
    accent?: boolean;
  }[] = [
    {
      to: "/w",
      label: "Board",
      icon: <LayoutGrid {...ICON} />,
      shortcut: "g w",
      active: path.startsWith("/w") || path.startsWith("/i/"),
      count: snapshot ? openIssues : undefined,
      countLabel: "open issues",
    },
    {
      to: "/inbox",
      label: "Inbox",
      icon: <Inbox {...ICON} />,
      shortcut: "g i",
      active: path.startsWith("/inbox"),
      count: inboxCount > 0 ? inboxCount : undefined,
      countLabel: "need you",
      accent: true,
    },
    {
      to: "/lib",
      label: "Library",
      icon: <Library {...ICON} />,
      shortcut: "g l",
      active: path.startsWith("/lib"),
      count: snapshot ? libraryItems : undefined,
      countLabel: "items",
    },
    {
      to: "/kit",
      label: "Kit",
      icon: <Component {...ICON} />,
      shortcut: "g k",
      active: path.startsWith("/kit"),
    },
  ];

  return (
    <ul className={cn("flex flex-col gap-px", collapsed ? "items-center px-2" : "px-2")}>
      {items.map((item) => (
        <li key={item.to}>
          {collapsed ? (
            <Tooltip
              side="right"
              shortcut={item.shortcut}
              content={item.count !== undefined ? `${item.label} · ${item.count}` : item.label}
            >
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-label={item.label}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "relative flex size-7 items-center justify-center rounded-md transition-colors duration-100 ease-wf",
                  item.active
                    ? "bg-muted text-fg"
                    : "text-fg-muted hover:bg-muted/70 hover:text-fg",
                )}
              >
                {item.icon}
                {item.accent && item.count !== undefined && (
                  <span
                    aria-hidden
                    className="absolute top-1 right-1 size-1.5 rounded-full bg-accent ring-2 ring-subtle"
                  />
                )}
              </Link>
            </Tooltip>
          ) : (
            <Link
              to={item.to}
              onClick={onNavigate}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-2 rounded-md px-2 text-base transition-colors duration-100 ease-wf",
                item.active ? "bg-muted text-fg" : "text-fg-muted hover:bg-muted/70 hover:text-fg",
              )}
            >
              <span className={cn("flex shrink-0", item.active ? "text-fg" : "text-fg-faint")}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.count !== undefined &&
                (item.accent ? (
                  <span className="tabular flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-medium text-accent-fg text-xs leading-none">
                    {item.count}
                    <span className="sr-only"> {item.countLabel}</span>
                  </span>
                ) : (
                  <span className="tabular text-fg-faint text-xs">
                    {item.count}
                    <span className="sr-only"> {item.countLabel}</span>
                  </span>
                ))}
            </Link>
          )}
        </li>
      ))}
    </ul>
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

function NavFooter({ collapsed, showCollapse }: { collapsed: boolean; showCollapse: boolean }) {
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const density = usePrefs((s) => s.density);
  const setDensity = usePrefs((s) => s.setDensity);
  const toggleNav = usePrefs((s) => s.toggleNav);
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
        {showCollapse && (
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
        {showCollapse && (
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
        )}
      </div>
    </div>
  );
}
