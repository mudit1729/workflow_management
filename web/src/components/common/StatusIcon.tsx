// Linear-style status glyphs, 14 px on a 14 × 14 grid, drawn in the status color. The check and
// the cross are knocked out of the filled disc in the page color (white in light, near-black in dark).
import type { ComponentProps, ReactNode } from "react";
import type { IssueStatus, TaskStatus } from "@/gen/types";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, statusColor, TASK_STATUS_LABEL } from "@/lib/status";

export interface StatusIconProps extends Omit<ComponentProps<"svg">, "children"> {
  status: IssueStatus | TaskStatus;
  size?: number;
}

const R = 5.75; // ring radius; with a 1.5 stroke the outer edge sits at 6.5
const DASHES = 10;
const DASH = 1.6;
const GAP = (2 * Math.PI * R) / DASHES - DASH; // ≈ 2.0, so the dashes close evenly

function label(status: IssueStatus | TaskStatus): string {
  return status === "todo" ? TASK_STATUS_LABEL.todo : STATUS_LABEL[status as IssueStatus];
}

export function StatusIcon({ status, size = 14, className, style, ...props }: StatusIconProps) {
  const ring = <circle cx="7" cy="7" r={R} fill="none" stroke="currentColor" strokeWidth="1.5" />;
  let glyph: ReactNode;
  switch (status) {
    case "backlog":
      glyph = (
        <circle
          cx="7"
          cy="7"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={`${DASH} ${GAP.toFixed(3)}`}
          transform="rotate(-90 7 7)"
        />
      );
      break;
    case "planned":
    case "todo":
      glyph = ring;
      break;
    case "in_progress":
      glyph = (
        <>
          {ring}
          <path d="M7 7 V4 A3 3 0 0 1 7 10 Z" fill="currentColor" />
        </>
      );
      break;
    case "review":
      glyph = (
        <>
          {ring}
          <path d="M7 7 V4 A3 3 0 1 1 4 7 Z" fill="currentColor" />
        </>
      );
      break;
    case "blocked":
      glyph = (
        <>
          {ring}
          <rect x="4" y="6.125" width="6" height="1.75" rx="0.5" fill="currentColor" />
        </>
      );
      break;
    case "done":
      glyph = (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path
            d="M4.4 7.2 6.2 9 9.6 5.3"
            fill="none"
            className="stroke-bg"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
      break;
    case "cancelled":
      glyph = (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path
            d="M5 5 9 9M9 5 5 9"
            fill="none"
            className="stroke-bg"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      );
      break;
  }
  return (
    <svg
      data-wf="StatusIcon"
      role="img"
      aria-label={label(status)}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      style={{ color: statusColor(status), ...style }}
      {...props}
    >
      {glyph}
    </svg>
  );
}
