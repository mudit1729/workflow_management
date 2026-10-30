// The frontmatter of a library page, read the tolerant way: a block that does not parse gives no
// keys and the page still shows (a library repo is written by hand and by agents).
import { parse } from "yaml";
import { splitFrontmatter } from "@/features/library/markdown";

export interface PageText {
  /** Top-level keys of the YAML block; empty without one, or when it does not parse. */
  data: Record<string, unknown>;
  /** The text after the closing fence. */
  body: string;
  /** Lines of the file before `body` starts. */
  lineOffset: number;
}

/** Split a page into its frontmatter keys and its body. Never throws. */
export function readPage(text: string): PageText {
  const split = splitFrontmatter(text);
  if (split.lineOffset === 0) return { data: {}, body: split.body, lineOffset: 0 };
  const lines = text.replace(/^﻿/, "").split("\n");
  const inner = lines.slice(1, split.lineOffset - 1).join("\n");
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = parse(inner);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      data = parsed as Record<string, unknown>;
  } catch {
    // Keep the page: the Source view shows the block as written.
  }
  return { data, body: split.body, lineOffset: split.lineOffset };
}

/** A key as one string (a number or a date counts), else undefined. */
export function str(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || v instanceof Date) return String(v);
  return undefined;
}

/** A key as a list of strings: a YAML list, or one string. */
export function list(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const one = str(data, key);
  return one ? [one] : [];
}

/** A handle without its `@`. */
export const handle = (s: string) => s.replace(/^@/, "");
