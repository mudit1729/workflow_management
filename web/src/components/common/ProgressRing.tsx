// Criteria progress: solid arc = verified, hatched arc = claimed, track = border color.
import { useId } from "react";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface ProgressRingProps {
  verified: number;
  claimed: number;
  total: number;
  size?: number;
  /** Show "2/5" (verified/total) to the right. */
  label?: boolean;
  className?: string;
}

export function progressText(verified: number, claimed: number, total: number): string {
  if (total === 0) return "No success criteria yet";
  return `${verified} verified · ${claimed} claimed · ${total} ${total === 1 ? "criterion" : "criteria"}`;
}

export function ProgressRing({
  verified,
  claimed,
  total,
  size = 14,
  label = false,
  className,
}: ProgressRingProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hatchId = `wf-hatch-${uid}`;
  const stroke = size >= 24 ? 3 : size >= 18 ? 2.5 : 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  const safeTotal = Math.max(total, 0);
  const v = safeTotal ? Math.min(verified, safeTotal) / safeTotal : 0;
  const cl = safeTotal
    ? Math.min(claimed, safeTotal - Math.min(verified, safeTotal)) / safeTotal
    : 0;
  const vLen = v * c;
  const cLen = cl * c;
  const tip = progressText(verified, claimed, total);
  const aria =
    total === 0
      ? "No success criteria"
      : `${verified} of ${total} criteria verified, ${claimed} claimed`;
  const period = size >= 24 ? 3 : 2.5;

  return (
    <Tooltip content={tip}>
      <span
        data-wf="ProgressRing"
        role="img"
        aria-label={aria}
        className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
          className="shrink-0 -rotate-90"
        >
          <defs>
            <pattern
              id={hatchId}
              patternUnits="userSpaceOnUse"
              width={period}
              height={period}
              patternTransform="rotate(45)"
            >
              <rect width={period / 2} height={period} style={{ fill: "var(--wf-status-done)" }} />
            </pattern>
          </defs>
          {total === 0 ? (
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              strokeWidth={Math.max(1.5, stroke - 0.5)}
              strokeDasharray="1.5 2"
              style={{ stroke: "var(--wf-border-strong)" }}
            />
          ) : (
            <>
              <circle
                cx={center}
                cy={center}
                r={r}
                fill="none"
                strokeWidth={stroke}
                style={{ stroke: "var(--wf-border-strong)" }}
              />
              {cLen > 0 && (
                <>
                  <circle
                    cx={center}
                    cy={center}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    strokeDasharray={`${cLen} ${c}`}
                    strokeDashoffset={-vLen}
                    style={{
                      stroke: "color-mix(in srgb, var(--wf-status-done) 28%, var(--wf-bg))",
                    }}
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    strokeDasharray={`${cLen} ${c}`}
                    strokeDashoffset={-vLen}
                    stroke={`url(#${hatchId})`}
                  />
                </>
              )}
              {vLen > 0 && (
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  strokeWidth={stroke}
                  strokeDasharray={`${vLen} ${c}`}
                  style={{ stroke: "var(--wf-status-done)" }}
                />
              )}
            </>
          )}
        </svg>
        {label && (
          <span className="text-fg-muted text-sm tabular leading-none">
            {verified}/{total}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
