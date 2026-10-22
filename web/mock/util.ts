// Small pure helpers shared by the mock server: content revs, IDs, text positions.

/** Short content rev: FNV-1a 32-bit as 8 hex chars (stands in for blake3). */
export function rev(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Crockford base32, lowercase, without i, l, o, u (contract 1.3). */
export const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

/** A random 5-char Crockford ID body that is not in `taken`. */
export function randomId(taken: (id: string) => boolean, prefix = ""): string {
  for (;;) {
    let s = "";
    for (let i = 0; i < 5; i++) s += CROCKFORD[Math.floor(Math.random() * 32)];
    if (!taken(prefix + s)) return prefix + s;
  }
}

/** A deterministic Crockford ID body from a string (used for implicit groups). */
export function hashId(text: string): string {
  let h = Number.parseInt(rev(text), 16);
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += CROCKFORD[h % 32];
    h = Math.floor(h / 32);
  }
  return s;
}

/** Group color 1–8 from the hash of an ID or path. */
export function hashColor(text: string): number {
  return (Number.parseInt(rev(text), 16) % 8) + 1;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const encoder = new TextEncoder();
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

export interface TextPos {
  line: number; // 1-based
  col: number; // 1-based
  span: [number, number]; // byte span
}

/** Position of the first occurrence of `needle` at or after `from`, or line 1 when absent. */
export function posOf(text: string, needle: string, from = 0): TextPos {
  const at = needle ? text.indexOf(needle, from) : -1;
  if (at < 0) return { line: 1, col: 1, span: [0, 0] };
  const before = text.slice(0, at);
  const line = before.split("\n").length;
  const col = at - before.lastIndexOf("\n");
  const start = byteLength(before);
  return { line, col, span: [start, start + byteLength(needle)] };
}

export function lineOf(text: string, needle: string, from = 0): number {
  return posOf(text, needle, from).line;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function clone<T>(x: T): T {
  return structuredClone(x);
}
