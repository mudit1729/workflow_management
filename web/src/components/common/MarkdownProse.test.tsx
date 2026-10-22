// Traced rendering: every block carries the line of the real file it came from.

import gotcha from "@mock/workspace/library/gotchas/notify-macos-rescan-subtrees.md?raw";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "@/features/library/markdown";
import { MarkdownProse } from "./MarkdownProse";

function render(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const lineOf = (text: string, exact: string) => text.split("\n").indexOf(exact) + 1;

/** Source lines found in the markup, as [tag, line] in document order. */
function traced(html: string): [string, number][] {
  return [...html.matchAll(/<(\w+)[^>]*data-src-line="(\d+)"/g)].map((m) => [
    m[1] as string,
    Number(m[2]),
  ]);
}

describe("MarkdownProse source lines", () => {
  // [[refs]] need the router and the data layer; they keep their line count as plain text.
  const { body: raw, lineOffset } = splitFrontmatter(gotcha);
  const body = raw.replace(/\[\[[^\]]+\]\]/g, "ref");
  const html = render(
    <MarkdownProse md={body} source={{ path: "library/gotchas/x.md", lineOffset, gutter: 40 }} />,
  );

  it("gives each heading, paragraph and list item its line in the file", () => {
    const lines = traced(html);
    const heading = (text: string) =>
      lines.find(([tag, n]) => tag === "h2" && n === lineOf(gotcha, text));
    expect(heading("## Symptom")).toBeTruthy();
    expect(heading("## Cause")).toBeTruthy();
    expect(heading("## Fix")).toBeTruthy();
    expect(heading("## Evidence")).toBeTruthy();
    const first = lineOf(gotcha, "1. Treat each event as a dirty hint for its path.");
    const items = lines.filter(([tag]) => tag === "li").map(([, n]) => n);
    expect(items.slice(0, 3)).toEqual([first, first + 1, first + 2]);
    const para = lineOf(gotcha, "## Symptom") + 2;
    expect(lines.some(([tag, n]) => tag === "p" && n === para)).toBe(true);
  });

  it("marks where each block ends", () => {
    expect(html).toMatch(/data-src-line="\d+" data-src-end="\d+"/);
  });

  it("leaves the output untouched without `source`", () => {
    const plain = render(<MarkdownProse md={body} />);
    expect(plain).not.toContain("data-src-line");
    expect(plain).not.toContain("SourceGutter");
  });

  it("traces tables by row and quotes by block", () => {
    const md = "> a quote\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    const out = traced(render(<MarkdownProse md={md} source={{ path: "n.md", gutter: 40 }} />));
    expect(out.filter(([tag]) => tag === "blockquote").map(([, n]) => n)).toEqual([1]);
    expect(out.filter(([tag]) => tag === "tr").map(([, n]) => n)).toEqual([3, 5]);
    expect(out.some(([tag, n]) => tag === "div" && n === 3)).toBe(true);
  });
});
