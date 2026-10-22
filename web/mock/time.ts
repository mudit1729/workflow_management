// Mock clock helpers. Every seed timestamp is relative to the real clock, so the
// prototype always reads naturally ("12m ago", "lease 40m left"). Timestamps are
// RFC 3339 with the workspace offset +05:30 and minute precision (contract 1.3).
import type { DateStr, Ts } from "@/gen/types";

const MIN = 60_000;
const OFFSET_MIN = 5 * 60 + 30; // +05:30

const pad = (n: number) => String(n).padStart(2, "0");

/** Format an epoch-ms instant as "YYYY-MM-DDTHH:MM+05:30". */
export function toTs(ms: number): Ts {
  const d = new Date(Math.floor(ms / MIN) * MIN + OFFSET_MIN * MIN);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}+05:30`;
}

/** Format an epoch-ms instant as the workspace-local date "YYYY-MM-DD". */
export function toDate(ms: number): DateStr {
  return toTs(ms).slice(0, 10);
}

/** The current instant as a timestamp. */
export function nowTs(): Ts {
  return toTs(Date.now());
}

/** A timestamp `minutes` before now. */
export function ago(minutes: number): Ts {
  return toTs(Date.now() - minutes * MIN);
}

/** A timestamp `minutes` after now. */
export function ahead(minutes: number): Ts {
  return toTs(Date.now() + minutes * MIN);
}

/** A wall-clock time (+05:30) on the day `d` days before today. */
export function daysAgo(d: number, hh: number, mm: number): Ts {
  const today = toDate(Date.now());
  const [y, m, day] = today.split("-").map(Number);
  // Midnight of that local day, in UTC ms.
  const localMidnightUtc = Date.UTC(y, m - 1, day - d) - OFFSET_MIN * MIN;
  return toTs(localMidnightUtc + (hh * 60 + mm) * MIN);
}

/** A local date `days` from today (negative for the past). */
export function dateIn(days: number): DateStr {
  return toDate(Date.now() + days * 24 * 60 * MIN);
}

/** Epoch ms of a timestamp. */
export function tsMs(ts: string): number {
  return new Date(ts).getTime();
}
