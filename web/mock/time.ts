// Mock clock helpers. The workspace files hold times from the day they were recorded; the store
// shifts them to the real clock (`md/rebase.ts`), so the prototype always reads naturally
// ("12m ago", "lease 40m left"). Timestamps are RFC 3339 with the workspace offset +05:30 and
// minute precision (contract 1.3).
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

/** A local date `days` from today (negative for the past). */
export function dateIn(days: number): DateStr {
  return toDate(Date.now() + days * 24 * 60 * MIN);
}

/** Epoch ms of a timestamp. */
export function tsMs(ts: string): number {
  return new Date(ts).getTime();
}
