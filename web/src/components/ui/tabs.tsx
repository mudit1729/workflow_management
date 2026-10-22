// Underline tabs: a hairline under the list, a 2 px neutral bar under the active tab.
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-wf="TabsList"
      className={cn("flex h-9 shrink-0 items-stretch gap-4 border-border border-b", className)}
      {...props}
    />
  );
}

export interface TabsTriggerProps extends ComponentProps<typeof TabsPrimitive.Trigger> {
  /** A faint tabular count after the label (number or text such as "2/5"). */
  count?: ReactNode;
  /** `accent` for counts that ask for attention (needs-you). */
  countTone?: "faint" | "accent";
}

export function TabsTrigger({
  count,
  countTone = "faint",
  className,
  children,
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      data-wf="TabsTrigger"
      className={cn(
        "relative -mb-px inline-flex cursor-default select-none items-center gap-1.5 whitespace-nowrap rounded-t-sm border-transparent border-b-2 px-0.5",
        "font-medium text-base text-fg-muted transition-colors duration-100 ease-wf",
        "hover:text-fg data-[state=active]:border-fg data-[state=active]:text-fg",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && count !== null && (
        <span
          className={cn(
            "tabular text-sm",
            countTone === "accent" ? "font-medium text-accent" : "font-normal text-fg-faint",
          )}
        >
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-wf="TabsContent"
      className={cn("min-h-0 outline-none", className)}
      {...props}
    />
  );
}
