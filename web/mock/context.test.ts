// `wf context <id>`: what goal.md links under `## Links` comes first as "Linked context",
// before the relevance-ranked library items. Reviewed items go in full as reference data, drafts
// are listed as not injected, files are excerpts, and the budget decides what is left out.
import { beforeEach, describe, expect, test } from "vitest";
import { FILE_EXCERPT_CHARS } from "@/features/context/links";
import type { ContextLink } from "@/gen/types";
import { createMockServer, type MockServer } from "./server";

let server: MockServer;

beforeEach(() => {
  server = createMockServer({ latency: 0 });
});

// resume-on-session-start links lib-6pm4c and also names it in its state, so the item is both
// linked and ranked. Every seed issue links the library items it names; tests that need a ranked
// item without a link take the bullet out of goal.md first.
const issueBy = (suffix: string) =>
  [...createMockServer({ latency: 0 }).store.derived.dirs].find(([, dir]) =>
    dir.endsWith(`/${suffix}`),
  )?.[0] as string;
const ID = issueBy("resume-on-session-start");
const BARE = issueBy("drawer-width-jump");

const SPLICE: ContextLink = { kind: "library", target: "lib-2hq6n", label: "Splice one value" };
const DRAFT: ContextLink = { kind: "library", target: "lib-7nq3d", label: "Whole-word matching" };
const TERM: ContextLink = { kind: "term", target: "lease", label: "a time-boxed claim on a task" };
const NOTES: ContextLink = {
  kind: "file",
  target: "issues/wf/web/live-board-updates/notes/research.md",
  label: "research notes",
};
const PLAN: ContextLink = {
  kind: "file",
  target: "issues/wf/web/live-board-updates/plan.md",
  label: "the plan",
};
const DECISION: ContextLink = {
  kind: "entry",
  target: "wf-3k9x2#D-7f3k2",
  label: "Push board updates over SSE",
};

async function link(...links: ContextLink[]) {
  const d = await server.issue(ID);
  await server.ops({
    op: "add_links",
    base_rev: d.files_rev["goal.md"],
    issue: ID,
    links,
  });
}

/** Take the bullet of lib-6pm4c out of goal.md, so the item is ranked but not linked. */
async function unlinkPlaybook() {
  const path = server.store.filePath(ID, "goal.md");
  const text = server.store.text(path) ?? "";
  const next = text.replace(/^- \[\[lib-6pm4c\]\].*\n/m, "");
  expect(next).not.toBe(text);
  await server.writeFile({ path, text: next });
}

/** The text of a `<reference-data>` block by source, or undefined. */
const block = (md: string, source: string) =>
  new RegExp(`<reference-data source="${source}"[^>]*>[\\s\\S]*?</reference-data>`).exec(md)?.[0];

describe("wf context with linked items", () => {
  test("the bundle has no linked section when goal.md links nothing", async () => {
    const md = await server.context(BARE);
    expect(md).not.toContain("Linked context");
  });

  test("linked items come first, before the ranked library items", async () => {
    await unlinkPlaybook();
    await link(SPLICE);
    const md = await server.context(ID);
    const linked = md.indexOf("## Linked context");
    const ranked = md.indexOf("## Library (reference data");
    expect(linked).toBeGreaterThan(0);
    expect(ranked).toBeGreaterThan(linked);
    expect(block(md, "lib-2hq6n")).toContain("### Rule");
    // The ranked part is lib-6pm4c: the issue's own pointer, still there, after the linked item.
    expect(md.indexOf('source="lib-6pm4c"')).toBeGreaterThan(md.indexOf('source="lib-2hq6n"'));
  });

  test("an item that is linked and ranked appears once, in the linked section", async () => {
    const md = await server.context(ID);
    expect(md.match(/<reference-data source="lib-6pm4c"/g)).toHaveLength(1);
    expect(md.indexOf('source="lib-6pm4c"')).toBeGreaterThan(md.indexOf("## Linked context"));
    expect(md).not.toContain("## Library (reference data");
  });

  test("a draft is listed by name and its body stays out", async () => {
    await link(DRAFT);
    const md = await server.context(ID);
    expect(md).toContain("**Listed, not injected**");
    expect(md).toContain(
      'lib-7nq3d "Match glossary synonyms on whole words": draft, not injected until reviewed.',
    );
    expect(md).not.toContain('source="lib-7nq3d"');
    expect(md).not.toContain("Anchor each word with");
  });

  test("a linked file is an excerpt, a term and a decision are reference data", async () => {
    await link(NOTES, PLAN, TERM, DECISION);
    const md = await server.context(ID, 20000);
    // A short file goes in whole.
    const notes = block(md, NOTES.target) ?? "";
    expect(notes).toContain("# Delivering board updates");
    expect(notes).toContain("Elect one leader tab per browser");
    expect(notes).not.toContain("excerpt:");
    // A long one is cut at a line, and says how much it left out.
    const plan = block(md, PLAN.target) ?? "";
    expect(plan).toContain("revision:");
    expect(plan.length).toBeLessThan(FILE_EXCERPT_CHARS + 400);
    expect(plan).toMatch(/… \(excerpt: [\d,]+ more characters in the file\)/);
    expect(block(md, "glossary:lease")).toContain("lease: a time-boxed claim on a task");
    const decision = block(md, "wf-3k9x2#D-7f3k2") ?? "";
    expect(decision).toContain("# D-7f3k2 Push board updates over SSE");
    expect(decision).toContain("Decision:");
    expect(decision).toContain("Because:");
  });

  test("a link to a file that is gone is listed as not found", async () => {
    await link(NOTES);
    // Delete the file from the working copy; the link stays in goal.md.
    await server.deleteFile({ path: NOTES.target });
    const md = await server.context(ID);
    expect(md).toContain(`\`${NOTES.target}\`: file not found.`);
  });

  test("the budget drops the last linked items first and the footer names them", async () => {
    await link(SPLICE, NOTES, DECISION);
    const full = await server.context(ID, 6000);
    expect(full).not.toMatch(/left out:.*linked/);
    // Too small for the three items after the goal, the criteria and the state.
    const tight = await server.context(ID, 800);
    const footer = tight.trimEnd().split("\n").at(-1) ?? "";
    expect(footer).toMatch(/left out:/);
    expect(footer).toContain("linked wf-3k9x2#D-7f3k2");
    // What stays is the first items, in order.
    const kept = [...tight.matchAll(/<reference-data source="([^"]+)"/g)].map((m) => m[1]);
    const order = [SPLICE.target, NOTES.target, DECISION.target];
    expect(kept.filter((k) => order.includes(k))).toEqual(order.filter((o) => kept.includes(o)));
    expect(tight.length).toBeLessThan(full.length);
  });
});
