// A line of small facts separated by dots that wraps without stranding a dot. Each fact carries
// its own dot as a pseudo-element, and the first fact of every line sits one gap to the left of
// the clip box, so a dot that would start or end a line is clipped instead of drawn. (The usual
// "a · b · c" with real separator nodes leaves a "·" at a line edge whenever it wraps.)
import { Children, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface MetaLineProps {
  children: ReactNode;
  className?: string;
  /** Classes for every fact (text color and size are set on the line itself). */
  itemClassName?: string;
  /** The element name for feedback (`data-wf`), when the line is a component of its own. */
  wf?: string;
}

export function MetaLine({ children, className, itemClassName, wf = "MetaLine" }: MetaLineProps) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    // Spans, not divs: a fact line sits inside buttons (a CI run's trigger) where only phrasing content is valid.
    <span data-wf={wf} className={cn("block min-w-0 overflow-hidden py-px", className)}>
      <span className="-ml-3 flex flex-wrap items-center gap-y-1">
        {items.map((item, i) => (
          <span
            key={i}
            className={cn(
              "relative ml-3 inline-flex min-w-0 max-w-full items-center whitespace-nowrap",
              "before:absolute before:-left-[9px] before:text-fg-faint before:content-['·']",
              itemClassName,
            )}
          >
            {item}
          </span>
        ))}
      </span>
    </span>
  );
}
