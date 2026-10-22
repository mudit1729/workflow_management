// "4m", "3h", "Oct 9" with the absolute time in a tooltip. One shared 30 s clock for all instances.
import { useSyncExternalStore } from "react";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { absolute, parseTs, relativeLong, relativeShort } from "@/lib/format";

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current time, refreshed every 30 s. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
}

export interface RelativeTimeProps {
  ts: string;
  className?: string;
  /** "4 minutes ago" instead of "4m". */
  long?: boolean;
}

export function RelativeTime({ ts, className, long = false }: RelativeTimeProps) {
  const t = useNow();
  const valid = Number.isFinite(parseTs(ts));
  const text = !valid ? ts : long ? relativeLong(ts, t) : relativeShort(ts, t);
  return (
    <Tooltip content={valid ? absolute(ts) : "Unreadable timestamp"}>
      <time
        data-wf="RelativeTime"
        dateTime={ts}
        className={cn("whitespace-nowrap tabular", className)}
      >
        {text}
      </time>
    </Tooltip>
  );
}
