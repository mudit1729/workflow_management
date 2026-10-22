// Context links in goal.md: the bullets a new issue starts with, and `addLinks` into an
// existing file. Every edit is a pure text change: the line diff is the whole change, the file
// still loads without an error, and it is still in canonical form.
import { describe, expect, test } from "vitest";
import { contextLinksOf, parseLinks } from "@/features/context/links";
import type { ContextLink } from "@/gen/types";
import { addLinks, newIssueGoal } from "./edit";
import { loadWorkspace } from "./index";
import { rebaseWorkspace } from "./rebase";
import { RECORDED_AT } from "./recorded-at";
import { diskFiles, lineDiff, rerender } from "./test-support";

const DAY = 86_400_000;
const RECORDED = Date.parse(RECORDED_AT);
const NOW = RECORDED + 3 * DAY;
const files = rebaseWorkspace(diskFiles(), NOW - RECORDED);
const SC2 = "issues/wf/web/live-board-updates/evidence/sc2.png";
const loaded0 = loadWorkspace(files, { now: NOW, binary: { [SC2]: { url: SC2, bytes: 95362 } } });

const dirOf = (issue: string) => loaded0.issueDirs[issue];
const goalOf = (issue: string) => files[`${dirOf(issue)}/goal.md`];

const LIB: ContextLink = {
  kind: "library",
  target: "lib-4tz7c",
  label: "Rescan subtrees instead of trusting notify on macOS",
};
const DRAFT: ContextLink = {
  kind: "library",
  target: "lib-7nq3d",
  label: "Match glossary synonyms on whole words",
};
const ENTRY: ContextLink = {
  kind: "entry",
  target: "wf-3k9x2#D-7f3k2",
  label: "Push board updates over SSE",
};
const TERM: ContextLink = {
  kind: "term",
  target: "lease",
  label: "a time-boxed claim on a task",
};
const NOTES: ContextLink = {
  kind: "file",
  target: "issues/wf/web/live-board-updates/notes/research.md",
  label: "research notes",
};

function canonical(path: string, next: string): void {
  const loaded = loadWorkspace({ ...files, [path]: next }, { now: NOW });
  expect(rerender(loaded, path), `${path} is in canonical form`).toBe(next);
}

const errors = (path: string, text: string) =>
  loadWorkspace({ ...files, [path]: text }, { now: NOW }).diagnostics[path].filter(
    (d) => d.severity === "error",
  );

describe("new issue with context and links", () => {
  const dir = "issues/wf/skills/new-issue";
  const base = {
    id: "wf-9eeee",
    title: "Teach agents the lease",
    created: "2026-10-22T10:00+05:30",
  };

  test("the typed context replaces the template placeholder", () => {
    const goal = newIssueGoal({
      ...base,
      context: "Agents lose their claim.\n\nThey need to know why.\n",
      dir,
    });
    expect(goal).toContain(
      "## Context\n\nAgents lose their claim.\n\nThey need to know why.\n\n## Success criteria",
    );
    expect(goal).not.toContain("write-goal");
    expect(goal).not.toContain("## Links");
  });

  test("an empty context keeps the template text", () => {
    const plain = newIssueGoal({ ...base, dir });
    expect(newIssueGoal({ ...base, context: "  \n ", dir })).toBe(plain);
    expect(plain).toContain("Run the `write-goal` skill");
  });

  test("links become the bullets of ## Links, after the criteria, in the order given", () => {
    const goal = newIssueGoal({
      ...base,
      context: "Why this matters.",
      links: [LIB, DRAFT, ENTRY, TERM, NOTES],
      dir,
    });
    const tail = goal.slice(goal.indexOf("## Links"));
    expect(tail).toBe(
      [
        "## Links",
        "",
        "- [[lib-4tz7c]] Rescan subtrees instead of trusting notify on macOS",
        "- [[lib-7nq3d]] Match glossary synonyms on whole words",
        "- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE",
        "- Glossary: lease — a time-boxed claim on a task",
        "- [research notes](../../web/live-board-updates/notes/research.md)",
        "",
      ].join("\n"),
    );
    expect(goal.indexOf("## Success criteria")).toBeLessThan(goal.indexOf("## Links"));
  });

  test("the file loads clean, links resolve and the text is canonical", () => {
    const goal = newIssueGoal({ ...base, links: [LIB, ENTRY, TERM, NOTES], dir });
    const path = `${dir}/goal.md`;
    expect(errors(path, goal)).toEqual([]);
    const loaded = loadWorkspace({ ...files, [path]: goal }, { now: NOW });
    expect(loaded.diagnostics[path].filter((d) => d.rule === "F009")).toEqual([]);
    const src = loaded.world.issues.find((i) => i.goal.id === "wf-9eeee");
    expect(contextLinksOf(src?.links, dir).map((l) => [l.kind, l.target])).toEqual([
      ["library", "lib-4tz7c"],
      ["entry", "wf-3k9x2#D-7f3k2"],
      ["term", "lease"],
      ["file", NOTES.target],
    ]);
    canonical(path, goal);
  });

  test("the same item twice is one bullet", () => {
    const goal = newIssueGoal({ ...base, links: [LIB, LIB], dir });
    expect(goal.match(/lib-4tz7c/g)).toHaveLength(1);
  });
});

describe("addLinks", () => {
  test("appends to an existing ## Links section and changes nothing else", () => {
    const goal = goalOf("wf-3k9x2");
    const dir = dirOf("wf-3k9x2");
    const next = addLinks(goal, [DRAFT, TERM], dir);
    expect(lineDiff(goal, next)).toEqual({
      removed: [],
      added: [
        "- [[lib-7nq3d]] Match glossary synonyms on whole words",
        "- Glossary: lease — a time-boxed claim on a task",
      ],
    });
    // The new bullets sit right after the last bullet that was there.
    const lines = next.split("\n");
    const at = lines.indexOf("- [[lib-7nq3d]] Match glossary synonyms on whole words");
    expect(lines[at - 1]).toBe("- `spec/api.md`: the SSE event types.");
    canonical(`${dir}/goal.md`, next);
  });

  test("skips items the section already links", () => {
    const goal = goalOf("wf-3k9x2");
    const dir = dirOf("wf-3k9x2");
    expect(addLinks(goal, [LIB], dir)).toBe(goal);
    const once = addLinks(goal, [DRAFT], dir);
    expect(addLinks(once, [DRAFT, LIB], dir)).toBe(once);
  });

  test("a file already linked under another spelling is not linked twice", () => {
    const goal = goalOf("wf-3k9x2");
    const dir = dirOf("wf-3k9x2");
    const once = addLinks(goal, [NOTES], dir);
    expect(once).toContain("- [research notes](notes/research.md)");
    expect(addLinks(once, [{ ...NOTES, label: "the notes" }], dir)).toBe(once);
  });

  test("creates ## Links after ## Out of scope when it is missing", () => {
    const issue = "wf-z9mw2";
    const goal = `${goalOf(issue)
      .replace(/\n## Links\n[\s\S]*$/, "")
      .trimEnd()}\n`;
    expect(goal).toContain("## Out of scope");
    expect(goal).not.toContain("## Links");
    const next = addLinks(goal, [LIB, NOTES], dirOf(issue));
    expect(lineDiff(goal, next).removed).toEqual([]);
    expect(next).toBe(
      `${goal}\n## Links\n\n- [[lib-4tz7c]] Rescan subtrees instead of trusting notify on macOS\n- [research notes](../live-board-updates/notes/research.md)\n`,
    );
    const lines = next.split("\n");
    expect(lines.indexOf("## Links")).toBeGreaterThan(lines.indexOf("## Out of scope"));
    expect(next.endsWith("notes/research.md)\n")).toBe(true);
    canonical(`${dirOf(issue)}/goal.md`, next);
  });

  test("creates ## Links after the success criteria when there is no ## Out of scope", () => {
    const id =
      Object.entries(loaded0.issueDirs).find(([, d]) => d.endsWith("/drawer-width-jump"))?.[0] ??
      "";
    expect(id).not.toBe("");
    const goal = goalOf(id);
    expect(goal).not.toContain("## Out of scope");
    expect(goal).not.toContain("## Links");
    const next = addLinks(goal, [ENTRY], dirOf(id));
    expect(next).toBe(
      `${goal.trimEnd()}\n\n## Links\n\n- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE\n`,
    );
    expect(next.indexOf("## Success criteria")).toBeLessThan(next.indexOf("## Links"));
    canonical(`${dirOf(id)}/goal.md`, next);
  });

  test("creates ## Links in the middle of a file before a section it should precede", () => {
    // A trailing unknown section stays after the new one's neighbour, and a blank line separates.
    const goal =
      "---\nid: wf-aaaaa\ntitle: A\ncreated: 2026-10-22T10:00+05:30\n---\n\n## Context\n\nx\n\n## Success criteria\n\n- [ ] SC-1: The system shall work.\n  - verify: manual\n\n## Notes\n\nlater\n";
    const next = addLinks(goal, [TERM], "issues/a");
    expect(next).toBe(
      "---\nid: wf-aaaaa\ntitle: A\ncreated: 2026-10-22T10:00+05:30\n---\n\n## Context\n\nx\n\n## Success criteria\n\n- [ ] SC-1: The system shall work.\n  - verify: manual\n\n## Links\n\n- Glossary: lease — a time-boxed claim on a task\n\n## Notes\n\nlater\n",
    );
  });

  test("fills an empty ## Links section", () => {
    const goal = "## Context\n\nx\n\n## Links\n\n## Other\n\ny\n";
    expect(addLinks(goal, [TERM], "")).toBe(
      "## Context\n\nx\n\n## Links\n\n- Glossary: lease — a time-boxed claim on a task\n\n## Other\n\ny\n",
    );
  });

  test("does not read a heading inside a code fence", () => {
    const goal = "## Context\n\n```md\n## Links\n```\n\n## Success criteria\n\n- [ ] SC-1: x\n";
    const next = addLinks(goal, [TERM], "");
    expect(next.split("\n").filter((l) => l === "## Links")).toHaveLength(2);
    expect(next.endsWith("## Links\n\n- Glossary: lease — a time-boxed claim on a task\n")).toBe(
      true,
    );
  });

  test("keeps CRLF line endings", () => {
    const goal = "## Context\r\n\r\nx\r\n\r\n## Links\r\n\r\n- [[wf-7p4dn]]: scan.\r\n";
    const next = addLinks(goal, [TERM], "");
    expect(next).toBe(`${goal}- Glossary: lease — a time-boxed claim on a task\r\n`);
  });
});

describe("reading links", () => {
  test("old and new bullets read the same", () => {
    const parsed = parseLinks(
      [
        "- [[lib-4tz7c]]: rescan subtrees.",
        "- [[lib-4tz7c]] Rescan subtrees",
        "- [[wf-7p4dn]]: index scan and snapshot.",
        "- `spec/api.md`: the SSE event types.",
      ].join("\n"),
    ).map((p) => [p.kind, p.target, p.label]);
    expect(parsed).toEqual([
      ["library", "lib-4tz7c", "rescan subtrees."],
      ["library", "lib-4tz7c", "Rescan subtrees"],
      ["issue", "wf-7p4dn", "index scan and snapshot."],
      ["text", "- `spec/api.md`: the SSE event types.", ""],
    ]);
  });
});
