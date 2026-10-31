// The Ask panel's frame: a side panel that keeps the issue in view. It is a non-modal dialog, like
// `Sheet`, but it never closes on a click outside (the issue beside it is meant to be read and
// used while the panel is open), and it sits to the left of the issue drawer when there is room
// for both. Under 640 px it takes the whole width, and the issue is one tap away behind it.
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui";
import { focusInitial } from "@/components/ui/initial-focus";
import { cn } from "@/lib/cn";
import { usePathname } from "@/lib/nav";

const WIDTH = 440;
/** The room the page keeps at least, beside the panel and the issue. */
const PAGE_MIN = 360;

/**
 * How far from the right edge the panel sits: the width of the issue drawer when the drawer is on
 * screen and the panel fits beside it, else 0 (the panel covers the right edge). The drawer can be
 * resized by hand, so its width is followed.
 */
function useBesideIssue(): number {
  const path = usePathname();
  const [offset, setOffset] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route decides which drawer exists
  useEffect(() => {
    let watch: ResizeObserver | undefined;
    let timer: number | undefined;
    let stopped = false;
    const find = () => document.querySelector('[data-wf="IssueDrawer"]:not([data-mode="mobile"])');
    const measure = (el: Element | null) => {
      const room = window.innerWidth - WIDTH - PAGE_MIN;
      const w = el ? Math.round(el.getBoundingClientRect().width) : 0;
      setOffset(w > 0 && w <= room ? w : 0);
    };
    // The drawer mounts a moment after the route changes (it is a lazy chunk): look for it a while.
    const look = (tries: number) => {
      if (stopped) return;
      const el = find();
      if (!el && tries < 30) {
        timer = window.setTimeout(() => look(tries + 1), 100);
        return;
      }
      measure(el);
      if (el) {
        watch = new ResizeObserver(() => measure(el));
        watch.observe(el);
      }
    };
    look(0);
    const resize = () => measure(find());
    window.addEventListener("resize", resize);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      watch?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [path]);
  return offset;
}

export interface AskSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** The line under the title: which issue this asks for. */
  subtitle?: ReactNode;
  children: ReactNode;
}

export function AskSheet({ open, onClose, title, subtitle, children }: AskSheetProps) {
  const body = useRef<HTMLDivElement>(null);
  const offset = useBesideIssue();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-wf="AskPanel"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => focusInitial(e, e.currentTarget as HTMLElement, body.current)}
          // Only Esc, the × and the Ask library button close it. The issue drawer listens for Esc
          // too: one press closes the panel, the next closes the drawer.
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.stopPropagation()}
          style={{ width: `min(${WIDTH}px, 100vw)`, right: `${offset}px` }}
          className={cn(
            "fixed inset-y-0 z-overlay flex h-dvh flex-col border-border border-l bg-bg text-fg shadow-pop outline-none",
            "data-[state=open]:fade-in-0 data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:ease-wf",
            "data-[state=closed]:fade-out-0 data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:ease-wf",
            "data-[state=closed]:slide-out-to-right-4 data-[state=open]:slide-in-from-right-4",
          )}
        >
          <header className="flex min-h-(--wf-topbar-h) shrink-0 items-center gap-2 border-border border-b py-1.5 pr-2 pl-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <DialogPrimitive.Title className="truncate font-semibold text-base text-fg">
                {title}
              </DialogPrimitive.Title>
              {subtitle}
            </div>
            <IconButton
              size="sm"
              label="Close"
              shortcut="Escape"
              icon={<X size={14} strokeWidth={1.75} />}
              onClick={onClose}
            />
          </header>
          <div ref={body} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
