// The line-number column beside a source block: numbers, and a marker on each line that has a
// lint finding. Sticky at the left, so it stays put while a long line scrolls sideways. The view
// and the editor use the same gutter, so their lines align to the pixel.
import { CircleX, Info, TriangleAlert } from "lucide-react";
import { memo } from "react";
import { Tooltip } from "@/components/ui";
import type { Diagnostic, Severity } from "@/gen/types";
import { cn } from "@/lib/cn";

/** Line height as a custom property: 20 px comfortable, 18 px compact. Set on the scroller. */
export const SRC_METRICS =
  "[--wf-src-lh:20px] [:root[data-density=compact]_&]:[--wf-src-lh:18px] font-mono text-sm";
export const SRC_PAD = 8;

const RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function worstSeverity(ds: readonly Diagnostic[]): Severity {
  return ds.reduce<Severity>((w, d) => (RANK[d.severity] < RANK[w] ? d.severity : w), "info");
}

/** Group findings by line, clamped into 1..lineCount so a stale line never vanishes. */
export function diagnosticsByLine(
  diagnostics: readonly Diagnostic[],
  lineCount: number,
): Map<number, Diagnostic[]> {
  const map = new Map<number, Diagnostic[]>();
  for (const d of diagnostics) {
    const line = Math.min(Math.max(d.line || 1, 1), Math.max(lineCount, 1));
    const list = map.get(line);
    if (list) list.push(d);
    else map.set(line, [d]);
  }
  return map;
}

const SEVERITY_NOUN: Record<Severity, string> = { error: "Error", warn: "Warning", info: "Info" };

export function SeverityGlyph({ severity, size = 14 }: { severity: Severity; size?: number }) {
  const p = { size, strokeWidth: 1.75, "aria-hidden": true, "data-wf": "SeverityGlyph" } as const;
  if (severity === "error") return <CircleX {...p} className="text-danger" />;
  if (severity === "warn") return <TriangleAlert {...p} className="text-stale" />;
  return <Info {...p} className="text-fg-faint" />;
}

/** "S06 · Hedge word 'probably'. Fix: …" for one finding, as text. */
export function diagnosticText(d: Diagnostic): string {
  return `${d.rule} · ${d.message}${d.fix ? ` Fix: ${d.fix}` : ""}`;
}

/** Width of the gutter for a file of `lineCount` lines: the digits, the marker and the padding. */
export function gutterWidth(lineCount: number): string {
  const digits = Math.max(2, String(lineCount).length);
  return `calc(${digits}ch + 36px)`;
}

export interface GutterCellProps {
  line: number;
  diagnostics?: ReadonlyMap<number, Diagnostic[]>;
  /** The line just jumped to; its number reads stronger. */
  activeLine?: number;
}

/**
 * One gutter row: the marker of a finding on the line, then its number, aligned with the first
 * visual line of a wrapped line. The view and the editor draw the same cell.
 */
export function GutterCell({ line, diagnostics, activeLine }: GutterCellProps) {
  const ds = diagnostics?.get(line);
  const severity = ds ? worstSeverity(ds) : undefined;
  return (
    <div
      data-gutter-line={line}
      className="flex items-start gap-1 pr-2 pl-1.5 leading-(--wf-src-lh)"
    >
      <span className="flex h-(--wf-src-lh) w-4 shrink-0 items-center justify-center">
        {ds && severity && <Marker line={line} diagnostics={ds} severity={severity} />}
      </span>
      <span
        className={cn(
          "tabular h-(--wf-src-lh) min-w-0 flex-1 text-right",
          severity === "error" && "text-danger",
          severity === "warn" && "text-stale",
          line === activeLine && "font-medium text-fg",
        )}
      >
        {line}
      </span>
    </div>
  );
}

export interface SourceGutterProps {
  lineCount: number;
  diagnostics?: ReadonlyMap<number, Diagnostic[]>;
  /** The line just jumped to; its number reads stronger. */
  activeLine?: number;
}

export const SourceGutter = memo(function SourceGutter({
  lineCount,
  diagnostics,
  activeLine,
}: SourceGutterProps) {
  return (
    <div
      data-wf="SourceGutter"
      className="sticky left-0 z-10 shrink-0 select-none border-border border-r bg-bg text-fg-faint"
      style={{
        width: gutterWidth(lineCount),
        paddingTop: SRC_PAD,
        paddingBottom: SRC_PAD,
      }}
    >
      {Array.from({ length: lineCount }, (_, i) => (
        <GutterCell key={i + 1} line={i + 1} diagnostics={diagnostics} activeLine={activeLine} />
      ))}
    </div>
  );
});

function Marker({
  line,
  diagnostics,
  severity,
}: {
  line: number;
  diagnostics: Diagnostic[];
  severity: Severity;
}) {
  const label = `Line ${line}: ${diagnostics.map(diagnosticText).join("; ")}`;
  return (
    <Tooltip
      side="right"
      content={
        <span className="flex flex-col gap-1">
          {diagnostics.map((d) => (
            <span key={`${d.rule}:${d.col}:${d.span[0]}`}>
              <span className="font-mono">{d.rule}</span> · {d.message}
              {d.fix && <span className="opacity-70"> Fix: {d.fix}</span>}
            </span>
          ))}
        </span>
      }
    >
      <button
        type="button"
        aria-label={`${SEVERITY_NOUN[severity]}. ${label}`}
        className="flex size-4 cursor-default items-center justify-center rounded-sm hover:bg-muted"
      >
        <SeverityGlyph severity={severity} />
      </button>
    </Tooltip>
  );
}
