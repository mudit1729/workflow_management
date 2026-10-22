// The workspace files hold absolute times, written at RECORDED_AT. To keep the prototype
// reading naturally ("12m ago", "lease 40m left", "due in 8 days") on any day, the loader
// shifts every time and date by the age of the recording before it reads the files.
import { RECORDED_AT } from "./recorded-at";

const MIN = 60_000;
const DAY = 86_400_000;

const TS = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})/g;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Offset of an RFC 3339 string in minutes (`Z` is 0). */
function offsetMin(offset: string): number {
  if (offset === "Z") return 0;
  const sign = offset[0] === "-" ? -1 : 1;
  return sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
}

/** Shift one RFC 3339 timestamp, keeping its offset and its precision. */
export function shiftTimestamp(ts: string, shiftMs: number): string {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(ts);
  if (!m) return ts;
  // The fields are local time; adding the shift to them moves the instant and keeps the offset.
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  const shifted = new Date(local + Math.round(shiftMs / MIN) * MIN);
  const date = `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  const sec = m[6] ? `:${pad(shifted.getUTCSeconds())}${m[7] ?? ""}` : "";
  return `${date}T${time}${sec}${m[8]}`;
}

/** Shift a `YYYY-MM-DD` date by whole days. */
export function shiftDate(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t + days * DAY).toISOString().slice(0, 10);
}

/**
 * Whole local days between the recording and the recording plus `shiftMs`, at the offset of
 * the recording. A date field moves by this many days, so "due in 8 days" stays 8 days.
 */
export function shiftDays(shiftMs: number, recordedAt: string = RECORDED_AT): number {
  const m = /^(\d{4}-\d{2}-\d{2})T.*(Z|[+-]\d{2}:\d{2})$/.exec(recordedAt);
  if (!m) return Math.round(shiftMs / DAY);
  const off = offsetMin(m[2]) * MIN;
  const start = Date.parse(recordedAt) + off;
  const end = start + Math.round(shiftMs / MIN) * MIN;
  return Math.round((Math.floor(end / DAY) * DAY - Math.floor(start / DAY) * DAY) / DAY);
}

/** Frontmatter keys that hold a date, not a timestamp. */
const DATE_KEYS = new Set(["due", "created", "last_reviewed", "review_after"]);
const DATE_LINE =
  /^(\s*(due|created|last_reviewed|review_after):\s*["']?)(\d{4}-\d{2}-\d{2})(["']?\s*)$/;

function rebaseText(text: string, shiftMs: number, days: number): string {
  const shiftedTimes = text.replace(TS, (whole) => shiftTimestamp(whole, shiftMs));
  if (!shiftedTimes.startsWith("---")) return shiftedTimes;
  // Date-only values live in the frontmatter: due, and the library dates.
  const lines = shiftedTimes.split("\n");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---") break;
    const m = DATE_LINE.exec(lines[i]);
    if (m && DATE_KEYS.has(m[2])) lines[i] = `${m[1]}${shiftDate(m[3], days)}${m[4]}`;
  }
  return lines.join("\n");
}

export interface RebaseOptions {
  /** When the files were written. Default: `RECORDED_AT`. */
  recordedAt?: string;
}

/**
 * Shift every RFC 3339 timestamp anywhere in the files by `shiftMs` (rounded to whole minutes),
 * and every date-only value of a date field by whole days. Offsets are kept.
 */
export function rebaseWorkspace(
  files: Record<string, string>,
  shiftMs: number,
  opts: RebaseOptions = {},
): Record<string, string> {
  const days = shiftDays(shiftMs, opts.recordedAt);
  const out: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) out[path] = rebaseText(text, shiftMs, days);
  return out;
}

/** The shift that makes a workspace recorded at `RECORDED_AT` read as if it was written `now`. */
export function shiftSinceRecording(now: number, recordedAt: string = RECORDED_AT): number {
  return now - Date.parse(recordedAt);
}
