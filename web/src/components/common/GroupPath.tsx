// Faint group trail: "wf / web".
import { cn } from "@/lib/cn";

export interface GroupPathProps {
  path: string[];
  className?: string;
}

export function GroupPath({ path, className }: GroupPathProps) {
  if (path.length === 0) return null;
  return (
    <span
      data-wf="GroupPath"
      title={path.join(" / ")}
      className={cn("inline-flex min-w-0 items-center truncate text-fg-faint text-xs", className)}
    >
      {path.map((seg, i) => (
        <span key={`${seg}-${i}`} className="inline-flex min-w-0 items-center">
          {i > 0 && (
            <span aria-hidden className="px-1 opacity-60">
              /
            </span>
          )}
          <span className="truncate">{seg}</span>
        </span>
      ))}
    </span>
  );
}
