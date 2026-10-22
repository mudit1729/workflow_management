// Side panel over the page. No dimming overlay: it reads as a panel, not a modal.
// Click outside or Esc closes it. Non-modal by default, so the page stays usable.
import { X } from "lucide-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";
import { focusInitial } from "./initial-focus";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  side?: "right" | "left";
  /** Panel width in px (default: the drawer width token). */
  width?: number;
  /** Trap focus and block the page behind (default false). */
  modal?: boolean;
  /** Render your own header; the title stays for screen readers. */
  hideHeader?: boolean;
  /** Extra header controls, left of the ×. */
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Clicks on these never count as "outside" (toasts, the prototype dev panel). */
const KEEP_OPEN = "[data-sonner-toaster], [data-sheet-keep-open]";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  width,
  modal = false,
  hideHeader = false,
  actions,
  className,
  bodyClassName,
  children,
}: SheetProps) {
  const body = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-wf="Sheet"
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={(e) => focusInitial(e, e.currentTarget as HTMLElement, body.current)}
          onInteractOutside={(e) => {
            const target = e.target as Element | null;
            if (target?.closest?.(KEEP_OPEN)) e.preventDefault();
          }}
          style={{ width: width ? `min(${width}px, 100vw)` : "min(var(--wf-drawer-w), 100vw)" }}
          className={cn(
            "fixed inset-y-0 z-overlay flex h-dvh flex-col bg-bg text-fg shadow-pop outline-none",
            side === "right" ? "right-0" : "left-0",
            "data-[state=open]:fade-in-0 data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:ease-wf",
            "data-[state=closed]:fade-out-0 data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:ease-wf",
            side === "right"
              ? "data-[state=closed]:slide-out-to-right-4 data-[state=open]:slide-in-from-right-4"
              : "data-[state=closed]:slide-out-to-left-4 data-[state=open]:slide-in-from-left-4",
            className,
          )}
        >
          {hideHeader ? (
            <VisuallyHidden.Root>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description>{description}</DialogPrimitive.Description>
              )}
            </VisuallyHidden.Root>
          ) : (
            <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-2 border-border border-b pr-2 pl-4">
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <DialogPrimitive.Title className="truncate font-semibold text-base text-fg">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="truncate text-fg-muted text-sm">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              {actions}
              <DialogPrimitive.Close asChild>
                <IconButton
                  size="sm"
                  label="Close"
                  shortcut="Escape"
                  icon={<X size={14} strokeWidth={1.75} />}
                />
              </DialogPrimitive.Close>
            </header>
          )}
          <div ref={body} className={cn("min-h-0 flex-1 overflow-y-auto pt-3", bodyClassName)}>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
