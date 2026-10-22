import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Quiet loading placeholder. Size it with classes (`h-3 w-24`). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-wf="Skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-sm bg-muted", className)}
      {...props}
    />
  );
}
