// Time formatting. Activity times come from file content, never from mtime.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function parseTs(ts: string): number {
  // RFC 3339 with offset and minute precision ("2026-10-22T14:05+05:30") parses natively.
  return new Date(ts).getTime();
}

/** "now", "4m", "3h", "2d", "Oct 9" */
export function relativeShort(ts: string, now = Date.now()): string {
  const d = now - parseTs(ts);
  const a = Math.abs(d);
  const future = d < 0;
  let s: string;
  if (a < MIN) return "now";
  if (a < HOUR) s = `${Math.round(a / MIN)}m`;
  else if (a < DAY) s = `${Math.round(a / HOUR)}h`;
  else if (a < 14 * DAY) s = `${Math.round(a / DAY)}d`;
  else return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return future ? `in ${s}` : s;
}

/** "4 minutes ago", "in 25 minutes" */
export function relativeLong(ts: string, now = Date.now()): string {
  const d = now - parseTs(ts);
  const a = Math.abs(d);
  const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  let s: string;
  if (a < MIN) return "just now";
  if (a < HOUR) s = fmt(Math.round(a / MIN), "minute");
  else if (a < DAY) s = fmt(Math.round(a / HOUR), "hour");
  else s = fmt(Math.round(a / DAY), "day");
  return d < 0 ? `in ${s}` : `${s} ago`;
}

/** Absolute, for tooltips: "Thu 22 Oct, 14:05 (+05:30)" — keeps the file's offset visible. */
export function absolute(ts: string): string {
  const m = ts.match(/([+-]\d{2}:\d{2}|Z)$/);
  const date = new Date(ts);
  const local = date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return m ? `${local} · written ${ts}` : local;
}

/** Day key for timeline grouping: "Today", "Yesterday", "Tue 20 Oct". */
export function dayLabel(ts: string, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(n) - startOf(d)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function hoursSince(ts: string, now = Date.now()): number {
  return (now - parseTs(ts)) / HOUR;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
