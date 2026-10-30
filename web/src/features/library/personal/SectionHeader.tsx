// The head of one section of the Personal home: a title, a count, one quiet line and, at the
// right, the section's action.
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SectionHeaderProps {
  id: string;
  title: string;
  count?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ id, title, count, hint, action, className }: SectionHeaderProps) {
  return (
    <header
      data-wf="SectionHeader"
      className={cn("flex min-w-0 items-end justify-between gap-3", className)}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="m-0 flex items-baseline gap-2 font-semibold text-fg text-lg">
          {title}
          {count !== undefined && (
            <span className="tabular font-normal text-fg-faint text-base">{count}</span>
          )}
        </h2>
        {hint && <p className="m-0 text-fg-muted text-base leading-snug">{hint}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </header>
  );
}
