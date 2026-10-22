// A native <select> in the field style. Native on purpose: it is keyboard and screen-reader
// complete, and on a phone it opens the system picker.
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div data-wf="NativeSelect" className="relative min-w-0">
      <select
        className={cn(
          "h-7 w-full min-w-0 appearance-none truncate rounded-md border border-border bg-bg pr-7 pl-2 text-base text-fg",
          "transition-[border-color,box-shadow] duration-100 ease-wf hover:border-border-strong",
          "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={14}
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-faint"
      />
    </div>
  );
}
