// The grammar of context links, the size estimate of the preview and the goal.md the Files
// dialog writes. Pure text and numbers: no DOM.
import { loadWorkspace } from "@mock/md";
import { newIssueGoal } from "@mock/md/edit";
import { describe, expect, test } from "vitest";
import { goalTemplate } from "@/features/files/templates";
import type { ContextLink } from "@/gen/types";
import { previewRows } from "./ContextPreview";
import {
  baseName,
  contextLinksOf,
  FILE_EXCERPT_CHARS,
  linkKeys,
  linkLine,
  parseLinkLine,
  parseLinks,
  relativePath,
  resolvePath,
} from "./links";
import { type ContextItem, isDraft, termLabel } from "./types";

const NOTES = "issues/wf/web/live-board-updates/notes/research.md";

describe("paths", () => {
  test("a path is written relative to the issue folder", () => {
    expect(relativePath("issues/wf/skills/new-issue", NOTES)).toBe(
      "../../web/live-board-updates/notes/research.md",
    );
    expect(relativePath("issues/wf/web/live-board-updates", NOTES)).toBe("notes/research.md");
    expect(relativePath("issues/wf/web/other", NOTES)).toBe(
      "../live-board-updates/notes/research.md",
    );
    expect(relativePath("", "glossary.md")).toBe("glossary.md");
    expect(relativePath("issues/a", "library/patterns/x.md")).toBe("../../library/patterns/x.md");
  });

  test("a relative path resolves back to the workspace path", () => {
    for (const dir of ["issues/wf/skills/new-issue", "issues/wf/web/live-board-updates", ""]) {
      expect(resolvePath(dir, relativePath(dir, NOTES))).toBe(NOTES);
    }
    expect(resolvePath("issues/a/b", "./x.md")).toBe("issues/a/b/x.md");
    expect(resolvePath("issues/a/b", "../../../../x.md")).toBe("x.md");
  });

  test("baseName is the last segment", () => {
    expect(baseName(NOTES)).toBe("research.md");
    expect(baseName("goal.md")).toBe("goal.md");
  });
});

describe("linkLine and parseLinkLine", () => {
  const dir = "issues/wf/skills/new-issue";
  const links: ContextLink[] = [
    { kind: "library", target: "lib-4tz7c", label: "Rescan subtrees instead of trusting notify" },
    { kind: "entry", target: "wf-3k9x2#D-7f3k2", label: "Push board updates over SSE" },
    { kind: "term", target: "lease", label: "a time-boxed claim on a task" },
    { kind: "term", target: "ready task", label: "a task with every dependency done" },
    { kind: "term", target: "needs-you request", label: "a question for a human" },
    { kind: "file", target: NOTES, label: "research notes" },
  ];

  test("each kind is one bullet in the documented shape", () => {
    expect(links.map((l) => linkLine(l, dir))).toEqual([
      "- [[lib-4tz7c]] Rescan subtrees instead of trusting notify",
      "- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE",
      "- Glossary: lease — a time-boxed claim on a task",
      "- Glossary: ready task — a task with every dependency done",
      "- Glossary: needs-you request — a question for a human",
      "- [research notes](../../web/live-board-updates/notes/research.md)",
    ]);
  });

  test("a bullet reads back to the link that wrote it", () => {
    for (const link of links) {
      const parsed = parseLinkLine(linkLine(link, dir), dir);
      expect({ kind: parsed.kind, target: parsed.target, label: parsed.label }).toEqual(link);
    }
  });

  test("an empty label leaves the bare reference", () => {
    expect(linkLine({ kind: "library", target: "lib-4tz7c", label: "" })).toBe("- [[lib-4tz7c]]");
    expect(linkLine({ kind: "term", target: "lease", label: "" })).toBe("- Glossary: lease");
    expect(
      linkLine({ kind: "file", target: NOTES, label: "" }, "issues/wf/web/live-board-updates"),
    ).toBe("- [research.md](notes/research.md)");
  });

  test("a label is one line and a file label has no brackets", () => {
    expect(linkLine({ kind: "library", target: "lib-1aaaa", label: "two\nlines  here" })).toBe(
      "- [[lib-1aaaa]] two lines here",
    );
    expect(
      linkLine(
        { kind: "file", target: NOTES, label: "[draft] notes" },
        "issues/wf/web/live-board-updates",
      ),
    ).toBe("- [draft notes](notes/research.md)");
  });

  test("spaces and parentheses in a path are escaped and come back", () => {
    const target = "issues/a/b/notes/Q3 plan (v2).md";
    const line = linkLine({ kind: "file", target, label: "Plan" }, "issues/a/b");
    expect(line).toBe("- [Plan](notes/Q3%20plan%20%28v2%29.md)");
    expect(parseLinkLine(line, "issues/a/b").target).toBe(target);
  });

  test("older bullets and other lines read too", () => {
    const read = (line: string) => {
      const p = parseLinkLine(line);
      return [p.kind, p.target, p.label];
    };
    expect(read("- [[lib-4tz7c]]: rescan subtrees.")).toEqual([
      "library",
      "lib-4tz7c",
      "rescan subtrees.",
    ]);
    expect(read("- [[wf-7p4dn]]: index scan.")).toEqual(["issue", "wf-7p4dn", "index scan."]);
    expect(read("- [[#D-7f3k2]] The decision")).toEqual(["entry", "#D-7f3k2", "The decision"]);
    expect(read("* [docs](https://example.com/a)")).toEqual([
      "url",
      "https://example.com/a",
      "docs",
    ]);
    expect(read("- `spec/api.md`: the SSE event types.")[0]).toBe("text");
    expect(read("Some words.")[0]).toBe("text");
  });

  test("a section reads as links, and only the Workdatabase kinds are context", () => {
    const md = [
      "- [[wf-7p4dn]]: index scan.",
      "",
      "- [[lib-4tz7c]] Rescan",
      "- Glossary: lease — a claim",
      "- [x](notes/a.md)",
      "- [web](https://example.com)",
    ].join("\n");
    expect(parseLinks(md, "issues/a").map((p) => p.kind)).toEqual([
      "issue",
      "library",
      "term",
      "file",
      "url",
    ]);
    expect(contextLinksOf(md, "issues/a")).toEqual([
      { kind: "library", target: "lib-4tz7c", label: "Rescan" },
      { kind: "term", target: "lease", label: "a claim" },
      { kind: "file", target: "issues/a/notes/a.md", label: "x" },
    ]);
    expect([...linkKeys(md, "issues/a")]).toContain("file:issues/a/notes/a.md");
  });
});

describe("termLabel", () => {
  test("the first sentence, as a phrase", () => {
    expect(
      termLabel(
        "A time-limited claim: `claimed_by` plus `lease_until`. It expires after 60 minutes.",
      ),
    ).toBe("a time-limited claim: `claimed_by` plus `lease_until`");
    expect(termLabel("UI state that never leaves the browser.")).toBe(
      "UI state that never leaves the browser",
    );
    expect(termLabel("x".repeat(200)).length).toBeLessThanOrEqual(140);
  });
});

describe("previewRows", () => {
  const lib = (id: string, status: "reviewed" | "draft"): ContextItem => ({
    kind: "library",
    target: id,
    label: id,
    title: id,
    status,
  });
  const file = (chars: number): ContextItem => ({
    kind: "file",
    target: "issues/a/notes/x.md",
    label: "x",
    title: "notes/x.md",
    chars,
  });

  test("a draft is listed and costs nothing", () => {
    const { rows, total } = previewRows([lib("lib-1aaaa", "draft")], 6000);
    expect(rows[0]).toMatchObject({ tokens: 0, injected: false, leftOut: false });
    expect(total).toBe(0);
    expect(isDraft(rows[0].item)).toBe(true);
  });

  test("a reviewed item is sized from its text plus the wrapper", () => {
    const { rows } = previewRows([lib("lib-1aaaa", "reviewed")], 6000, () => 1000);
    expect(rows[0].tokens).toBe(Math.ceil((1000 + 90) / 4));
    expect(rows[0].injected).toBe(true);
  });

  test("a file counts at most its excerpt", () => {
    const { rows } = previewRows([file(900_000)], 6000);
    expect(rows[0].tokens).toBeLessThanOrEqual(Math.ceil((FILE_EXCERPT_CHARS + 80 + 90) / 4));
  });

  test("past the budget the last items are left out and the total says by how much", () => {
    const items = [file(800), file(800), file(800)];
    const { rows, total } = previewRows(items, 500);
    const each = Math.ceil((800 + 90) / 4); // 223
    expect(rows.map((r) => r.tokens)).toEqual([each, each, each]);
    expect(total).toBe(each * 3);
    expect(rows.map((r) => r.leftOut)).toEqual([false, false, true]);
  });

  test("an item that does not fit takes every later one with it", () => {
    const items = [file(3000), file(40), file(40)];
    const { rows } = previewRows(items, 300);
    // The first one alone is over 300: nothing is kept, and the small ones after it go too.
    expect(rows.map((r) => r.leftOut)).toEqual([true, true, true]);
  });
});

describe("the goal.md the Files dialog writes", () => {
  const dir = "issues/wf/skills/new-issue";
  const links: ContextLink[] = [
    { kind: "library", target: "lib-4tz7c", label: "Rescan subtrees" },
    { kind: "term", target: "lease", label: "a claim" },
    { kind: "file", target: NOTES, label: "research notes" },
  ];

  test("has the same Links section as the New issue op", () => {
    const base = { id: "wf-9eeee", title: "Teach the lease", created: "2026-10-22T10:00+05:30" };
    const files = goalTemplate({ ...base, links, dir });
    const op = newIssueGoal({ ...base, links, dir });
    const tail = (s: string) => s.slice(s.indexOf("## Links"));
    expect(tail(files)).toBe(tail(op));
    expect(tail(files)).toContain(
      "- [research notes](../../web/live-board-updates/notes/research.md)",
    );
  });

  test("loads without an error and keeps the links", () => {
    const text = goalTemplate({ id: "wf-9eeee", title: "Teach the lease", links, dir });
    const path = `${dir}/goal.md`;
    const loaded = loadWorkspace({ [path]: text }, { now: Date.parse("2026-10-22T10:00:00Z") });
    expect(loaded.diagnostics[path].filter((d) => d.severity === "error")).toEqual([]);
    const src = loaded.world.issues.find((i) => i.goal.id === "wf-9eeee");
    expect(contextLinksOf(src?.links, dir)).toEqual(links);
  });

  test("without links there is no Links section", () => {
    expect(goalTemplate({ id: "wf-9eeee", title: "T" })).not.toContain("## Links");
  });

  test("the typed context replaces the placeholder", () => {
    const text = goalTemplate({
      id: "wf-9eeee",
      title: "T",
      context: "Because agents lose claims.",
    });
    expect(text).toContain("## Context\n\nBecause agents lose claims.\n\n## Success criteria");
  });
});
