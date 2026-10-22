import { HoverCard as HoverCardPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function HoverCard({
  openDelay = 400,
  closeDelay = 120,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />;
}

export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export function HoverCardContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-wf="HoverCard"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-popover w-64 rounded-md bg-bg p-3 text-fg shadow-pop outline-none",
          "origin-(--radix-hover-card-content-transform-origin)",
          "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:animate-in data-[state=open]:duration-100",
          "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:animate-out data-[state=closed]:duration-75",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
