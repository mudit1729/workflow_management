// The viewport-locked shell: [NavRail | Main]. Only inner regions scroll.
// Below 768 px the nav moves into a sheet opened from a 44 px top bar.
// Also mounts the shell overlays (palette, dialogs, move gate, prototype controls).
import { Outlet } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import { MoveGateDialog } from "@/components/common";
import { Button } from "@/components/ui";
import { useInbox, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLayoutMode } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { CommandPalette } from "./CommandPalette";
import { DevPanel } from "./DevPanel";
import { LiveBadge, NavRail } from "./NavRail";
import { NewGroupDialog } from "./NewGroupDialog";
import { NewIssueDialog } from "./NewIssueDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useShell } from "./shell-store";
import { GlobalShortcuts } from "./shortcuts";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export function AppShell() {
  const mobile = useLayoutMode() === "mobile";
  const navCollapsed = usePrefs((s) => s.navCollapsed);

  return (
    <div
      data-wf="AppShell"
      className={cn(
        // `relative`: sr-only text is absolutely positioned; the shell clips it so it cannot
        // extend the document and make the locked page scrollable.
        "relative grid h-dvh w-full overflow-hidden bg-bg text-fg",
        mobile
          ? "grid-cols-[minmax(0,1fr)] grid-rows-[var(--wf-topbar-h)_minmax(0,1fr)]"
          : "grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]",
      )}
    >
      {mobile ? <MobileTopBar /> : <NavRail collapsed={navCollapsed} />}

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <Outlet />
      </main>

      {mobile && <MobileNavSheet />}

      <CommandPalette />
      <ShortcutsDialog />
      <NewIssueDialog />
      <NewGroupDialog />
      <MoveGateDialog />
      <GlobalShortcuts />
    </div>
  );
}

function MobileTopBar() {
  const name = useSnapshot().data?.config.name ?? "wf";
  const { count } = useInbox();
  const setMobileNavOpen = useShell((s) => s.setMobileNavOpen);
  const setPaletteOpen = useShell((s) => s.setPaletteOpen);

  return (
    <header
      data-wf="MobileTopBar"
      className="flex min-w-0 items-center gap-2 border-border border-b bg-subtle px-2"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={count > 0 ? `Open navigation, ${count} need you` : "Open navigation"}
        onClick={() => setMobileNavOpen(true)}
        className="relative"
      >
        <Menu {...ICON} />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent ring-2 ring-subtle"
          />
        )}
      </Button>
      <span className="min-w-0 truncate font-medium text-base">{name}</span>
      <LiveBadge />
      <span className="flex-1" />
      <DevPanel placement="bar" />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search or jump to…"
        onClick={() => setPaletteOpen(true)}
      >
        <Search {...ICON} />
      </Button>
    </header>
  );
}

function MobileNavSheet() {
  const open = useShell((s) => s.mobileNavOpen);
  const setOpen = useShell((s) => s.setMobileNavOpen);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-wf="MobileNavSheet"
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col bg-subtle shadow-pop outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>Navigation</DialogPrimitive.Title>
          </VisuallyHidden.Root>
          <NavRail variant="sheet" onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
