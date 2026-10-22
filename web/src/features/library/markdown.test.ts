// Pure logic of the markdown viewer: frontmatter split, diagram fences that keep their lines,
// glossary term lines, and where the source tag goes. The texts are the files of the mock workspace.

import glossary from "@mock/workspace/glossary.md?raw";
import goal from "@mock/workspace/issues/wf/web/live-board-updates/goal.md?raw";
import gotcha from "@mock/workspace/library/gotchas/notify-macos-rescan-subtrees.md?raw";
import { describe, expect, it } from "vitest";
import { markerText } from "@/components/common/SourceLineMarker";
import { fenceDiagrams, glossaryLines, splitFrontmatter, traceLayout } from "./markdown";

const lineOf = (text: string, exact: string) => text.split("\n").indexOf(exact) + 1;

describe("splitFrontmatter", () => {
  it("cuts the block off by lines and keeps the body exactly", () => {
    const split = splitFrontmatter(gotcha);
    const close = gotcha.split("\n").indexOf("---", 1) + 1;
    expect(split.lineOffset).toBe(close);
    expect(split.body).toBe(gotcha.split("\n").slice(close).join("\n"));
    // A line of the body maps back to the file by the offset.
    const inBody = split.body.split("\n").indexOf("## Symptom") + 1;
    expect(inBody + split.lineOffset).toBe(lineOf(gotcha, "## Symptom"));
  });

  it("reads each key with the line it sits on", () => {
    const entries = splitFrontmatter(gotcha).entries ?? [];
    const by = Object.fromEntries(entries.map((e) => [e.key, e]));
    expect(entries.map((e) => e.key)).toEqual([
      "id",
      "title",
      "kind",
      "description",
      "status",
      "tags",
      "applies_to",
      "source",
      "authors",
      "reviewed_by",
      "created",
      "last_reviewed",
      "review_after",
    ]);
    expect(by.id?.line).toBe(lineOf(gotcha, "id: lib-4tz7c"));
    expect(by.review_after?.line).toBe(lineOf(gotcha, "review_after: 2027-04-19"));
    expect(by.review_after?.value).toBe("2027-04-19");
  });

  it("unquotes values and unrolls lists", () => {
    const by = Object.fromEntries((splitFrontmatter(gotcha).entries ?? []).map((e) => [e.key, e]));
    expect(by.tags?.value).toBe("notify, macos, watcher");
    expect(by.authors?.value).toBe("@codex, @claude-opus");
    expect(by.reviewed_by?.value).toBe("@shruti");
    // A block list keeps one item per line, dashes and quotes gone.
    expect(by.source?.value).toBe("[[wf-3k9x2#L-2gk7r]]\n[[wf-3k9x2#C-5wq7k]]");
  });

  it("works on the goal file", () => {
    const split = splitFrontmatter(goal);
    const by = Object.fromEntries((split.entries ?? []).map((e) => [e.key, e.value]));
    expect(by.id).toBe("wf-3k9x2");
    expect(by.owner).toBe("@shruti");
    expect(by.labels).toBe("live, sse");
    expect(by.blocked_by).toBe("");
    expect(split.body.split("\n").indexOf("## Context") + 1 + split.lineOffset).toBe(
      lineOf(goal, "## Context"),
    );
  });

  it("leaves a file without frontmatter alone", () => {
    const text = "# Title\n\nBody.\n";
    expect(splitFrontmatter(text)).toEqual({ body: text, lineOffset: 0 });
  });

  it("treats a block that never closes as no frontmatter", () => {
    const text = "---\nid: x\ntitle: unfinished\n\n## Heading\n";
    expect(splitFrontmatter(text)).toEqual({ body: text, lineOffset: 0 });
  });

  it("ignores a byte order mark and carriage returns", () => {
    const split = splitFrontmatter("﻿---\r\ntitle: Hello\r\n---\r\n# Body\r\n");
    expect(split.entries?.[0]).toEqual({ key: "title", value: "Hello", line: 2 });
    expect(split.lineOffset).toBe(3);
  });

  it("returns an empty list for an empty block", () => {
    expect(splitFrontmatter("---\n---\nBody")).toEqual({
      entries: [],
      body: "Body",
      lineOffset: 2,
    });
  });
});

describe("fenceDiagrams", () => {
  it("turns an archify block into a diagram fence and keeps every line number", () => {
    const out = fenceDiagrams(goal);
    expect(out.split("\n")).toHaveLength(goal.split("\n").length);
    expect(out).toContain("```wf-diagram\nlive-board-architecture\n");
    expect(out).not.toContain("```archify");
    // Lines after the block did not move.
    expect(lineOf(out, "## Success criteria")).toBe(lineOf(goal, "## Success criteria"));
  });

  it("leaves a block without an id, an unclosed block and other fences as they are", () => {
    const noId = "```archify flowchart\n{}\n```\n";
    expect(fenceDiagrams(noId)).toBe(noId);
    const open = "```archify flowchart id=x\n{}\n";
    expect(fenceDiagrams(open)).toBe(open);
    const code = "```ts\nconst a = 1;\n```\n";
    expect(fenceDiagrams(code)).toBe(code);
  });

  it("handles tilde fences and several blocks", () => {
    const text =
      "~~~archify flowchart id=a\n{\n}\n~~~\n\ntext\n\n```archify architecture id=b\n{}\n```\n";
    const out = fenceDiagrams(text);
    expect(out.split("\n")).toHaveLength(text.split("\n").length);
    expect(out).toContain("wf-diagram\na\n");
    expect(out).toContain("wf-diagram\nb\n");
  });
});

describe("glossaryLines", () => {
  it("gives the line of each term heading, keyed by lowercase term", () => {
    const lines = glossaryLines(glossary);
    expect(lines.get("workspace")).toBe(lineOf(glossary, "## workspace"));
    expect(lines.get("issue")).toBe(lineOf(glossary, "## issue"));
    expect(lines.has("glossary")).toBe(false);
    expect(lines.size).toBeGreaterThan(15);
  });

  it("skips headings inside code fences", () => {
    const lines = glossaryLines("# G\n\n```\n## fake\n```\n\n## real\n- kind: noun\n");
    expect([...lines]).toEqual([["real", 7]]);
  });
});

describe("traceLayout", () => {
  it("hangs the marker into the margin of a wide page", () => {
    const { gutter, hang } = traceLayout(832, 620, 24);
    expect(gutter).toBe(hang);
    expect(gutter).toBeGreaterThan(100);
  });

  it("uses the padding of a pane", () => {
    const { gutter } = traceLayout(432, 432, 24);
    expect(gutter).toBe(20);
  });

  it("has no marker on a phone or without room", () => {
    expect(traceLayout(342, 342, 24)).toEqual({ gutter: 0, hang: 0 });
    expect(traceLayout(432, 432, 0)).toEqual({ gutter: 0, hang: 0 });
  });
});

describe("markerText", () => {
  const path = "library/gotchas/notify-macos-rescan-subtrees.md";
  it("shows the whole path where there is room", () => {
    expect(markerText(path, 14, 400)).toEqual({ short: `${path}:14`, full: `${path}:14` });
  });
  it("falls back to the file name, then the end of the path, then the line", () => {
    expect(markerText(path, 14, 250).short).toBe("notify-macos-rescan-subtrees.md:14");
    expect(markerText(path, 14, 140).short.startsWith("…")).toBe(true);
    expect(markerText(path, 14, 140).short.endsWith("subtrees.md:14")).toBe(true);
    expect(markerText(path, 14, 24).short).toBe(":14");
    expect(markerText(path, 14, 24).full).toBe(`${path}:14`);
  });
});
