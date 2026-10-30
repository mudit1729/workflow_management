// Small pieces both the card and the dialog show for diagrams that cannot render.
import { Unplug } from "lucide-react";
import type { ReactNode } from "react";
import type { DiagramError } from "@/gen/types";
import { cn } from "@/lib/cn";

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code data-wf="InlineCode" className="rounded-sm bg-muted px-1 py-px font-mono text-fg text-xs">
      {children}
    </code>
  );
}

/** Archify's errors: the JSON path in mono, then what is wrong. */
export function DiagramErrors({
  errors,
  lines,
  className,
}: {
  errors: DiagramError[];
  /** The source line of each error, when known. */
  lines?: (number | undefined)[];
  className?: string;
}) {
  return (
    <ul
      data-wf="DiagramErrors"
      className={cn(
        "divide-y divide-border overflow-hidden rounded-md border border-border bg-bg",
        className,
      )}
    >
      {errors.map((error, i) => (
        <li
          key={`${error.path}-${i}`}
          className="flex min-w-0 flex-col gap-0.5 px-2.5 py-1.5 text-sm @sm:flex-row @sm:items-baseline @sm:gap-2.5"
        >
          <code className="shrink-0 font-mono text-danger text-xs">{error.path}</code>
          <span className="min-w-0 flex-1 text-fg-muted">{error.msg}</span>
          {lines?.[i] && (
            <span className="shrink-0 text-fg-faint text-xs tabular @sm:ml-auto">
              line {lines[i]}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The calm "no preview here" message. `facts` is the quiet line under it (nodes, location);
 * `hint` is one more quiet line below that (a prototype-only way out).
 */
export function UnavailableNote({
  facts,
  action,
  hint,
}: {
  facts: ReactNode;
  action?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div data-wf="DiagramUnavailable" className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-fg-muted">
        <Unplug size={14} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-base text-fg">Diagram preview unavailable</p>
        <p className="text-fg-muted text-sm">
          Archify or node is not installed here, so the picture is not drawn. The source stays
          readable.
        </p>
        <p className="mt-0.5 text-fg-faint text-xs tabular">{facts}</p>
        {hint}
      </div>
      {action}
    </div>
  );
}
