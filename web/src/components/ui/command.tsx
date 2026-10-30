// cmdk, styled: a search field on top, grouped items with muted highlight and key caps.
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "./kbd";

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-wf="Command"
      className={cn("flex h-full w-full flex-col overflow-hidden bg-bg text-fg", className)}
      {...props}
    />
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-wf="CommandInput"
      className="flex h-11 shrink-0 items-center gap-2 border-border border-b px-3"
    >
      <Search aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" />
      <CommandPrimitive.Input
        className={cn(
          // 16 px on a phone: iOS Safari zooms the page when a smaller field is focused.
          "h-full min-w-0 flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none max-md:text-lg",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-wf="CommandList"
      className={cn(
        "max-h-[min(420px,60dvh)] scroll-py-1 overflow-y-auto overscroll-contain p-1",
        className,
      )}
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-wf="CommandEmpty"
      className={cn("px-3 py-8 text-center text-fg-muted text-sm", className)}
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-wf="CommandGroup"
      className={cn(
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1",
        "[&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-faint [&_[cmdk-group-heading]]:text-xs",
        className,
      )}
      {...props}
    />
  );
}

export interface CommandItemProps extends ComponentProps<typeof CommandPrimitive.Item> {
  icon?: ReactNode;
  shortcut?: string;
  /** Faint text after the label (an id, a group path). */
  hint?: ReactNode;
}

export function CommandItem({
  icon,
  shortcut,
  hint,
  className,
  children,
  ...props
}: CommandItemProps) {
  return (
    <CommandPrimitive.Item
      data-wf="CommandItem"
      className={cn(
        "relative flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-base text-fg outline-none",
        "data-[selected=true]:bg-muted data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45",
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-fg-muted [&>svg]:size-[14px]"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="max-w-[40%] shrink-0 truncate text-fg-faint text-sm">{hint}</span>}
      {shortcut && <Kbd combo={shortcut} className="ml-1" />}
    </CommandPrimitive.Item>
  );
}

export function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-wf="CommandSeparator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export function CommandLoading(props: ComponentProps<typeof CommandPrimitive.Loading>) {
  return <CommandPrimitive.Loading data-wf="CommandLoading" {...props} />;
}

export interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen-reader title. */
  title?: string;
  children: ReactNode;
  className?: string;
  /** Passed to the cmdk root (e.g. `shouldFilter={false}` for server search). */
  commandProps?: Omit<ComponentProps<typeof CommandPrimitive>, "children">;
  /** Where focus goes when the dialog closes. Radix sends it to a trigger, and a palette has none. */
  onCloseAutoFocus?: (event: Event) => void;
}

/** The ⌘K surface: a top-anchored dialog holding a `Command`. */
export function CommandDialog({
  open,
  onOpenChange,
  title = "Command palette",
  children,
  className,
  commandProps,
  onCloseAutoFocus,
}: CommandDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-dialog bg-scrim data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          data-wf="CommandDialog"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            "fixed top-[14dvh] left-1/2 z-dialog w-[calc(100vw-32px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-lg bg-bg shadow-pop outline-none",
            "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:animate-in data-[state=open]:duration-150",
            "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:animate-out data-[state=closed]:duration-100",
            className,
          )}
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          </VisuallyHidden.Root>
          <Command {...commandProps}>{children}</Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
