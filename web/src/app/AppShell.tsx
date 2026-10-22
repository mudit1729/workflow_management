// The viewport-locked shell: [NavRail | Main]. Only inner regions scroll.
// Below 768 px the nav moves into a sheet opened from a 44 px top bar.
// Also mounts the shell overlays (palette, dialogs, move gate, prototype controls).
import { Outlet } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import { useEffect, useRef } from "react";
import { MoveGateDialog } from "@/components/common";
import { Button } from "@/components/ui";
import { useInbox, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLayoutMode } from "@/lib/hooks";
import { CommandPalette } from "./CommandPalette";
import { DevPanel } from "./DevPanel";
import { LiveBadge, NavRail } from "./NavRail";
import { NewGroupDialog } from "./NewGroupDialog";
import { NewIssueDialog } from "./NewIssueDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useShell } from "./shell-store";
import { GlobalShortcuts } from "./shortcuts";
import { useNavRail } from "./useNavRail";

const ICON = { size: 14, strokeWidth: 1.75 } as const;
const OPEN_NAV_ID = "wf-open-nav";

export function AppShell() {
  const mobile = useLayoutMode() === "mobile";
  const mainRef = useRef<HTMLElement>(null);

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
      {/* The first stop for the keyboard: past the nav, onto the page. */}
      <button
        type="button"
        data-wf="SkipLink"
        onClick={() => mainRef.current?.focus()}
        className="absolute top-2 left-2 z-[60] -translate-y-16 rounded-md border border-border bg-bg px-3 py-1.5 font-medium text-base text-fg shadow-pop focus:translate-y-0"
      >
        Skip to content
      </button>

      {mobile ? <MobileTopBar /> : <RailSlot />}

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="flex min-h-0 min-w-0 flex-col overflow-hidden outline-none"
      >
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

/**
 * The rail's grid cell. Between 768 and 1099 px it is the 52 px icon rail; opened there, the full
 * rail floats over the page (same cell width, so the page does not jump) with a click-away layer.
 */
function RailSlot() {
  const rail = useNavRail();

  // Back at a wide width the overlay must not be waiting to reappear.
  const { narrow } = rail;
  useEffect(() => {
    if (!narrow) useShell.getState().setNarrowNavOpen(false);
  }, [narrow]);

  if (!rail.overlay) return <NavRail collapsed={rail.collapsed} />;

  return (
    <div
      data-wf="NavRailOverlay"
      className="relative h-full"
      style={{ width: "var(--wf-nav-w-collapsed)" }}
    >
      <div aria-hidden className="fixed inset-0 z-40" onClick={rail.close} />
      <div className="absolute inset-y-0 left-0 z-40 shadow-pop">
        <NavRail collapsed={false} onNavigate={rail.close} />
      </div>
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
        id={OPEN_NAV_ID}
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
          // The sheet has no Radix trigger, so hand focus back to the button that opened it.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById(OPEN_NAV_ID)?.focus();
          }}
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
