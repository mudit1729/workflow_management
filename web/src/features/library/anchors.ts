// Headings and their anchors, the GitHub way. Pure, no React: the mock library model, the search
// index and the viewer all call it, so a link to `#rotate-keys` means the same heading everywhere.
import type { PageHeading } from "@/lib/api/types";

/** The anchor GitHub gives a heading: lowercase, punctuation dropped, each space a hyphen. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** The words of a heading without its markdown: links, code, emphasis, wiki links, images. */
export function plainHeading(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|?[^\]]*\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/([*_])(.+?)\1/g, "$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

/**
 * Every heading of a markdown body, in order, with a unique anchor (`rotate-keys`, then
 * `rotate-keys-1`). Fenced code is skipped. Lines are 1-based within `md`, which is how a
 * rendered heading finds its anchor again (`node.position.start.line`).
 */
export function headingsOf(md: string): PageHeading[] {
  const lines = md.split("\n");
  const out: PageHeading[] = [];
  const seen = new Map<string, number>();
  const push = (depth: number, raw: string, line: number) => {
    const text = plainHeading(raw);
    const base = slugify(text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ depth, text, anchor: n === 0 ? base : `${base}-${n}`, line });
  };
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "");
    const open = FENCE.exec(line);
    if (open) {
      const mark = (open[1] ?? "```")[0] as string;
      if (!fence) fence = mark;
      else if (fence === mark && line.trim().length === (open[1] ?? "").length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const atx = ATX.exec(line);
    if (atx) {
      push((atx[1] ?? "#").length, atx[2] ?? "", i + 1);
      continue;
    }
    // A text line over `===` or `---` is a heading too (level 1 and 2).
    const under = SETEXT.exec(lines[i + 1]?.replace(/\r$/, "") ?? "");
    if (under && line.trim() !== "" && !/^ {0,3}([-*+>]|\d+[.)]|#|\|)/.test(line) && !fence) {
      push(under[1]?.startsWith("=") ? 1 : 2, line.trim(), i + 1);
      i += 1;
    }
  }
  return out;
}
