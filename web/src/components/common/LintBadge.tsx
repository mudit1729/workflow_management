// Lint summary: a 6 px dot (cards, tabs) or a compact badge with per-severity counts.
import { CircleX, Info, TriangleAlert } from "lucide-react";
import type { LintCounts } from "@/gen/types";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface LintBadgeProps {
  counts: LintCounts;
  variant?: "dot" | "badge";
  onClick?: () => void;
  className?: string;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function lintSummary(c: LintCounts): string {
  const parts: string[] = [];
  if (c.error) parts.push(plural(c.error, "error", "errors"));
  if (c.warn) parts.push(plural(c.warn, "warning", "warnings"));
  if (c.info) parts.push(plural(c.info, "info", "info"));
  return parts.length ? `Lint: ${parts.join(" · ")}` : "Lint: no findings";
}

export function LintBadge({ counts, variant = "badge", onClick, className }: LintBadgeProps) {
  const total = counts.error + counts.warn + counts.info;
  if (total === 0) return null;
  const summary = lintSummary(counts);

  if (variant === "dot") {
    const color = counts.error ? "bg-danger" : counts.warn ? "bg-stale" : "bg-fg-faint";
    const dot = (
      <span
        data-wf="LintBadge"
        role="img"
        aria-label={summary}
        className={cn("inline-block size-[6px] shrink-0 rounded-full", color, className)}
      />
    );
    if (!onClick) return <Tooltip content={summary}>{dot}</Tooltip>;
    return (
      <Tooltip content={summary}>
        <button
          type="button"
          aria-label={summary}
          onClick={onClick}
          className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-muted"
        >
          <span className={cn("size-[6px] rounded-full", color)} />
        </button>
      </Tooltip>
    );
  }

  const body = (
    <>
      {counts.error > 0 && (
        <span className="inline-flex items-center gap-1 text-danger">
          <CircleX aria-hidden size={12} strokeWidth={2} />
          <span className="tabular">{counts.error}</span>
        </span>
      )}
      {counts.warn > 0 && (
        <span className="inline-flex items-center gap-1 text-[color-mix(in_srgb,var(--wf-signal-stale)_78%,var(--wf-text))]">
          <TriangleAlert aria-hidden size={12} strokeWidth={2} />
          <span className="tabular">{counts.warn}</span>
        </span>
      )}
      {counts.info > 0 && (
        <span className="inline-flex items-center gap-1 text-fg-faint">
          <Info aria-hidden size={12} strokeWidth={2} />
          <span className="tabular">{counts.info}</span>
        </span>
      )}
    </>
  );
  const classes = cn(
    "inline-flex h-5 shrink-0 items-center gap-2 rounded-sm border border-border px-1.5 font-medium text-xs",
    className,
  );
  return (
    <Tooltip content={onClick ? `${summary} · Open the findings` : summary}>
      {onClick ? (
        <button
          data-wf="LintBadge"
          type="button"
          aria-label={summary}
          onClick={onClick}
          className={cn(classes, "cursor-default hover:bg-subtle")}
        >
          {body}
        </button>
      ) : (
        <span data-wf="LintBadge" role="img" aria-label={summary} className={classes}>
          {body}
        </span>
      )}
    </Tooltip>
  );
}
