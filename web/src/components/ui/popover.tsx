import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-wf="Popover"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-popover w-72 rounded-md bg-bg p-3 text-fg shadow-pop outline-none",
          "max-h-(--radix-popover-content-available-height) origin-(--radix-popover-content-transform-origin) overflow-y-auto",
          "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:animate-in data-[state=open]:duration-100",
          "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:animate-out data-[state=closed]:duration-75",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
