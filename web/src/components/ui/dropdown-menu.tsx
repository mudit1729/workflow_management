// Menus: hairline-ringed popover surface, 28 px items, muted highlight, key caps on the right.
import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "./kbd";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;
export const DropdownMenuSub = MenuPrimitive.Sub;
export const DropdownMenuPortal = MenuPrimitive.Portal;

const surface = [
  "z-50 min-w-[180px] overflow-y-auto overflow-x-hidden rounded-md bg-bg p-1 text-fg shadow-pop outline-none",
  "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:animate-in data-[state=open]:duration-100",
  "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:animate-out data-[state=closed]:duration-75",
].join(" ");

const item = [
  "group relative flex min-h-7 cursor-default select-none items-center gap-2 rounded-sm px-2 text-base outline-none",
  "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
].join(" ");

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "start",
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-wf="DropdownMenu"
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          surface,
          "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

function IconSlot({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center text-fg-muted [&>svg]:size-[14px]"
    >
      {children}
    </span>
  );
}

function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  if (!hint) return <span className="min-w-0 flex-1 truncate">{children}</span>;
  return (
    <span className="flex min-w-0 flex-1 flex-col py-1">
      <span className="truncate leading-snug">{children}</span>
      <span className="truncate text-fg-faint text-xs leading-snug">{hint}</span>
    </span>
  );
}

export interface DropdownMenuItemProps extends ComponentProps<typeof MenuPrimitive.Item> {
  icon?: ReactNode;
  /** Hotkey combo shown as key caps on the right. */
  shortcut?: string;
  /** A second, faint line under the label. */
  hint?: ReactNode;
  /** Shows a check on the right (current value in a single-choice menu). */
  selected?: boolean;
  /** Selectable but de-emphasized (e.g. a move that needs confirmation). */
  muted?: boolean;
  tone?: "default" | "danger";
  inset?: boolean;
}

export function DropdownMenuItem({
  icon,
  shortcut,
  hint,
  selected,
  muted,
  tone = "default",
  inset,
  className,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-wf="DropdownMenuItem"
      className={cn(
        item,
        inset && !icon && "pl-8",
        muted && "text-fg-muted",
        tone === "danger" && "text-danger data-[highlighted]:bg-danger/10",
        className,
      )}
      {...props}
    >
      {icon && <IconSlot>{icon}</IconSlot>}
      <Label hint={hint}>{children}</Label>
      {selected && <Check aria-hidden size={14} strokeWidth={2} className="shrink-0 text-fg-muted" />}
      {shortcut && <Kbd combo={shortcut} className="ml-1" />}
    </MenuPrimitive.Item>
  );
}

export interface DropdownMenuCheckboxItemProps
  extends ComponentProps<typeof MenuPrimitive.CheckboxItem> {
  icon?: ReactNode;
  shortcut?: string;
  hint?: ReactNode;
}

export function DropdownMenuCheckboxItem({
  icon,
  shortcut,
  hint,
  className,
  children,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      data-wf="DropdownMenuCheckboxItem"
      className={cn(item, className)}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-[14px] shrink-0 items-center justify-center rounded-sm border-[1.5px] border-border-strong bg-bg transition-colors duration-100",
          "group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent",
        )}
      >
        <MenuPrimitive.ItemIndicator>
          <Check size={10} strokeWidth={3} className="text-accent-fg" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {icon && <IconSlot>{icon}</IconSlot>}
      <Label hint={hint}>{children}</Label>
      {shortcut && <Kbd combo={shortcut} className="ml-1" />}
    </MenuPrimitive.CheckboxItem>
  );
}

export interface DropdownMenuRadioItemProps extends ComponentProps<typeof MenuPrimitive.RadioItem> {
  icon?: ReactNode;
  shortcut?: string;
  hint?: ReactNode;
}

export function DropdownMenuRadioItem({
  icon,
  shortcut,
  hint,
  className,
  children,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem data-wf="DropdownMenuRadioItem" className={cn(item, className)} {...props}>
      {icon && <IconSlot>{icon}</IconSlot>}
      <Label hint={hint}>{children}</Label>
      <MenuPrimitive.ItemIndicator className="flex shrink-0 items-center">
        <Check aria-hidden size={14} strokeWidth={2} className="text-fg-muted" />
      </MenuPrimitive.ItemIndicator>
      {shortcut && <Kbd combo={shortcut} className="ml-1" />}
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      data-wf="DropdownMenuLabel"
      className={cn("px-2 pt-1.5 pb-1 font-medium text-fg-faint text-xs", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
  );
}

export interface DropdownMenuSubTriggerProps
  extends ComponentProps<typeof MenuPrimitive.SubTrigger> {
  icon?: ReactNode;
}

export function DropdownMenuSubTrigger({
  icon,
  className,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <MenuPrimitive.SubTrigger
      data-wf="DropdownMenuSubTrigger"
      className={cn(item, "data-[state=open]:bg-muted", className)}
      {...props}
    >
      {icon && <IconSlot>{icon}</IconSlot>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" />
    </MenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubContent>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent
        data-wf="DropdownMenuSubContent"
        collisionPadding={8}
        className={cn(
          surface,
          "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}
