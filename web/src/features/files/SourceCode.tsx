// The read-only text of a file: line numbers, light highlighting, a marker on each line with a
// finding, and a short fade on the lines a save just changed. Long lines scroll sideways inside
// the block; they never wrap.
import { memo, type Ref, useMemo } from "react";
import type { Diagnostic } from "@/gen/types";
import { cn } from "@/lib/cn";
import {
  type HighlightedLine,
  highlightSource,
  type Lang,
  type LineKind,
  type Tone,
} from "./highlight";
import {
  diagnosticsByLine,
  SourceGutter,
  SRC_METRICS,
  SRC_PAD,
  worstSeverity,
} from "./SourceGutter";

const TONE: Record<Tone, string> = {
  plain: "",
  faint: "text-fg-faint",
  muted: "text-fg-muted",
  strong: "font-medium text-fg",
  accent: "text-accent",
  ok: "text-status-done",
};

const KIND: Partial<Record<LineKind, string>> = {
  heading: "font-medium",
  "archify-fence": "bg-subtle",
  "archify-code": "bg-subtle",
};

export interface SourceCodeProps {
  text: string;
  lang: Lang;
  diagnostics?: readonly Diagnostic[];
  /** Lines to fade in for a moment (after a save). */
  flash?: ReadonlySet<number>;
  /** The line a "jump to finding" landed on. */
  activeLine?: number;
  scrollerRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function SourceCode({
  text,
  lang,
  diagnostics = [],
  flash,
  activeLine,
  scrollerRef,
  className,
}: SourceCodeProps) {
  const lines = useMemo(() => highlightSource(text, lang), [text, lang]);
  const byLine = useMemo(() => diagnosticsByLine(diagnostics, lines.length), [diagnostics, lines]);

  return (
    <section
      ref={scrollerRef}
      data-wf="SourceCode"
      aria-label="File text"
      className={cn(
        "relative min-h-0 overflow-auto overscroll-contain bg-bg text-fg outline-none",
        "focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
        SRC_METRICS,
        className,
      )}
    >
      <div className="flex min-h-full w-max min-w-full">
        <SourceGutter lineCount={lines.length} diagnostics={byLine} activeLine={activeLine} />
        <div
          className="min-w-0 flex-1"
          style={{ paddingTop: SRC_PAD, paddingBottom: SRC_PAD, tabSize: 2 }}
        >
          {lines.map((l, i) => {
            const n = i + 1;
            const ds = byLine.get(n);
            return (
              <Line
                key={n}
                n={n}
                line={l}
                severity={ds ? worstSeverity(ds) : undefined}
                flash={flash?.has(n) ?? false}
                active={n === activeLine}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

const Line = memo(function Line({
  n,
  line,
  severity,
  flash,
  active,
}: {
  n: number;
  line: HighlightedLine;
  severity?: "error" | "warn" | "info";
  flash: boolean;
  active: boolean;
}) {
  return (
    <div
      data-line={n}
      className={cn(
        "h-(--wf-src-lh) whitespace-pre pr-6 pl-3 leading-(--wf-src-lh)",
        KIND[line.kind],
        severity === "error" && "bg-danger/8",
        severity === "warn" && "bg-stale/10",
        (flash || active) && "wf-flash",
      )}
    >
      {line.tokens.map((t, i) => (
        <span key={i} className={TONE[t.tone] || undefined}>
          {t.text}
        </span>
      ))}
    </div>
  );
});
