import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export function CollapsibleContent({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-wf="CollapsibleContent"
      className={cn(
        "overflow-hidden",
        "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:duration-150 data-[state=open]:duration-200 data-[state=open]:ease-wf",
        className,
      )}
      {...props}
    />
  );
}
