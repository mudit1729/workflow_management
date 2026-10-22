// Modal dialog: dimmed overlay, centered card with title, optional description and close.
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";
import { focusInitial } from "./initial-focus";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

const contentVariants = cva(
  [
    "fixed z-50 flex flex-col overflow-hidden rounded-lg bg-bg text-fg shadow-pop outline-none",
    "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:animate-in data-[state=open]:duration-150",
    "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:animate-out data-[state=closed]:duration-100",
  ],
  {
    variants: {
      size: {
        sm: "top-1/2 left-1/2 max-h-[calc(100dvh-64px)] w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2",
        md: "top-1/2 left-1/2 max-h-[calc(100dvh-64px)] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2",
        lg: "top-1/2 left-1/2 max-h-[calc(100dvh-64px)] w-[calc(100vw-32px)] max-w-[760px] -translate-x-1/2 -translate-y-1/2",
        full: "inset-6",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface DialogContentProps
  extends Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  /** Hide the × button (use when the footer has an explicit Cancel). */
  hideClose?: boolean;
  /** Extra controls in the header, left of the × (e.g. "Copy JSON"). */
  actions?: ReactNode;
  /** Classes for the body wrapper (default: 16 px padding, scrolls). */
  bodyClassName?: string;
}

export function DialogContent({
  title,
  description,
  size = "md",
  hideClose = false,
  actions,
  bodyClassName,
  className,
  children,
  onOpenAutoFocus,
  ...props
}: DialogContentProps) {
  const body = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/20 dark:bg-black/50",
          "data-[state=open]:fade-in-0 data-[state=open]:animate-in data-[state=open]:duration-150",
          "data-[state=closed]:fade-out-0 data-[state=closed]:animate-out data-[state=closed]:duration-100",
        )}
      />
      <DialogPrimitive.Content
        data-wf="Dialog"
        // Without a description, tell Radix there is none on purpose.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(contentVariants({ size }), className)}
        onOpenAutoFocus={(e) => {
          onOpenAutoFocus?.(e);
          focusInitial(e, e.currentTarget as HTMLElement, body.current);
        }}
        {...props}
      >
        <header className="flex shrink-0 items-start gap-3 px-4 pt-3.5 pb-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
            <DialogPrimitive.Title className="truncate font-semibold text-fg text-md leading-snug">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-fg-muted text-sm">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          {(actions || !hideClose) && (
            <div className="-mt-0.5 -mr-1.5 flex shrink-0 items-center gap-1">
              {actions}
              {!hideClose && (
                <DialogPrimitive.Close asChild>
                  <IconButton
                    size="sm"
                    label="Close"
                    shortcut="Escape"
                    icon={<X size={14} strokeWidth={1.75} />}
                  />
                </DialogPrimitive.Close>
              )}
            </div>
          )}
        </header>
        <div ref={body} className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", bodyClassName)}>
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Right-aligned action row at the end of a dialog body. */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-wf="DialogFooter"
      className={cn("mt-4 flex items-center justify-end gap-2", className)}
      {...props}
    />
  );
}
