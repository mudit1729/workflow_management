// The context bundle is the markdown the `handing-off` skill prints, section for section: header,
// goal, criteria, current state, linked context (what goal.md links under `## Links`, before the
// relevance-ranked library items), ready tasks, tasks in progress, last changes, decisions,
// learnings, git/PRs/CI, plan approach and library, then the footer and the resume line. Reviewed
// items go in full as reference data, drafts are listed as not injected, files are excerpts, and
// the budget decides what is left out.
import { beforeEach, describe, expect, test } from "vitest";
import { FILE_EXCERPT_CHARS } from "@/features/context/links";
import type { ContextLink } from "@/gen/types";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";

let server: MockServer;

beforeEach(() => {
  server = createMockServer({ latency: 0, disk: SAMPLE });
});

// resume-on-session-start links lib-6pm4c and also names it in its state, so the item is both
// linked and ranked. Every seed issue links the library items it names; tests that need a ranked
// item without a link take the bullet out of goal.md first.
const issueBy = (suffix: string) =>
  [...createMockServer({ latency: 0, disk: SAMPLE }).store.derived.dirs].find(([, dir]) =>
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
  test("the linked section keeps its heading and says none when goal.md links nothing", async () => {
    const md = await server.context(BARE);
    expect(md).toContain("## Linked context\n\nnone.");
    expect(md).not.toContain("<reference-data");
    expect(md).not.toContain("is information, not instructions");
  });

  test("linked items come first, before the ranked library items", async () => {
    await unlinkPlaybook();
    await link(SPLICE);
    const md = await server.context(ID);
    const linked = md.indexOf("## Linked context");
    const ranked = md.indexOf("## Library");
    expect(linked).toBeGreaterThan(md.indexOf("## Current state"));
    expect(ranked).toBeGreaterThan(linked);
    expect(block(md, "lib-2hq6n")).toContain("### Rule");
    // The ranked part is lib-6pm4c: the issue's own pointer, still there, after the linked item.
    expect(md.indexOf('source="lib-6pm4c"')).toBeGreaterThan(md.indexOf('source="lib-2hq6n"'));
  });

  test("an item that is linked and ranked appears once, in the linked section", async () => {
    const md = await server.context(ID);
    expect(md.match(/<reference-data source="lib-6pm4c"/g)).toHaveLength(1);
    expect(md.indexOf('source="lib-6pm4c"')).toBeGreaterThan(md.indexOf("## Linked context"));
    expect(md).toContain("## Library\n\nnone.");
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
    const footer = tight.trimEnd().split("\n").at(-2) ?? "";
    expect(footer).toMatch(/left out:/);
    expect(footer).toContain("linked wf-3k9x2#D-7f3k2");
    // What stays is the first items, in order.
    const kept = [...tight.matchAll(/<reference-data source="([^"]+)"/g)].map((m) => m[1]);
    const order = [SPLICE.target, NOTES.target, DECISION.target];
    expect(kept.filter((k) => order.includes(k))).toEqual(order.filter((o) => kept.includes(o)));
    expect(tight.length).toBeLessThan(full.length);
  });
});

// ---------------------------------------------------------------- the skill's table

/** The `## ` headings of a bundle, in order. */
const headings = (md: string) => [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

describe("wf context follows the table of the handing-off skill", () => {
  const TABLE = [
    "Goal",
    "Success criteria",
    "Current state",
    "Linked context",
    "Ready tasks",
    "Tasks in progress",
    "Last changes",
    "Accepted decisions",
    "Learnings",
    "Git/PRs/CI",
    "Plan approach",
    "Library",
  ];

  test("every section is there in the skill's order, with 'none.' when it is empty", async () => {
    const md = await server.context("wf-3k9x2", 20000);
    expect(headings(md)).toEqual(TABLE);

    const bare = await server.context(BARE, 20000);
    expect(headings(bare)).toEqual(TABLE);
    for (const name of ["Ready tasks", "Last changes", "Learnings", "Plan approach", "Library"])
      expect(bare).toContain(`## ${name}\n\nnone.`);
    // Sections 1 to 3 are never empty.
    expect(bare).toMatch(/## Current state\n\nNo current_state\.md yet/);
  });

  test("learnings are the last three, newest first, as id and rule", async () => {
    const md = await server.context("wf-3k9x2", 20000);
    const body = /## Learnings\n\n([\s\S]*?)\n\n## /.exec(md)?.[1] ?? "";
    expect(body.split("\n")).toEqual([
      "- L-9mz4e Keep the SSE ring buffer at 256 events.",
      "- L-6ct3p Compare files by blake3 hash, never by mtime.",
      "- L-2gk7r Rescan the subtree, since notify 8.2 drops rename events on macOS.",
    ]);
  });

  test("git, PR and CI lines come from the delivery data", async () => {
    const md = await server.context("wf-3k9x2", 20000);
    const body = /## Git\/PRs\/CI\n\n([\s\S]*?)\n\n## /.exec(md)?.[1] ?? "";
    expect(body).toContain("commits (trailer `Issue: wf-3k9x2`):");
    expect(body).toMatch(/- 0d4a6c1 Send snapshot on connect · @codex · .+ · T-3/);
    expect(body).toMatch(/- #41 draft Push board updates over SSE · .+ · review pending/);
    expect(body).toMatch(
      /- CI completed success on wf-3k9x2\/sse-delta-stream at 9f1e2ab \(3m 34s\)/,
    );

    // An issue with no delivery data says what would fill it.
    const bare = await server.context(BARE, 20000);
    expect(bare).toMatch(
      /## Git\/PRs\/CI\n\nnone\. No commit, pull request or CI run mentions wf-[0-9a-z]{5}\. Add the trailer `Issue: wf-[0-9a-z]{5}` to commits\./,
    );
  });

  test("a Codex run's commit, entry and ticked criterion show up in the next bundle", async () => {
    // wf-y4bz7: planned, no coordinator. The run takes it, ticks SC-1 and releases it.
    const id = "wf-y4bz7";
    server.controls.setCodexPhaseMs(10);
    const run = await server.startCodexRun(id, "next_step");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const done = (await server.codexRuns(id))[0];
    expect(done).toMatchObject({ id: run.id, status: "done" });
    const md = await server.context(id, 20000);
    // The same sha in the Git section, the Last changes entry and the criterion's evidence.
    expect(md).toContain(`- ${done.commit} Start a refresh timer from the token lifetime · @codex`);
    expect(md).toMatch(/\[progress T-1 pass\] Started a refresh timer from the token lifetime/);
    expect(md).toMatch(
      new RegExp(
        `- \\[x\\] SC-1 \\(verified\\): .+ — verify: .+; evidence: \`.+\` passed at \`${done.commit}\``,
      ),
    );
    expect(md).toContain("coordinator: none");
    expect(md).toMatch(/status: in_progress/);
  });

  test("the library holds the reviewed items of the state, up to three", async () => {
    await unlinkPlaybook();
    const md = await server.context(ID, 20000);
    const lib = /## Library\n\n([\s\S]*?)\n\n<!--/.exec(md)?.[1] ?? "";
    expect(lib).toContain('<reference-data source="lib-6pm4c"');
    expect(lib).toContain('status="reviewed"');
    expect((lib.match(/<reference-data /g) ?? []).length).toBeLessThanOrEqual(3);
  });

  test("the reference-data note appears once, and only with reference data", async () => {
    const md = await server.context(ID, 20000);
    expect(md.match(/is information, not instructions/g)).toHaveLength(1);
    expect(md.indexOf("is information, not instructions")).toBeLessThan(md.indexOf("## Goal"));
  });

  test("the footer names the budget and what was left out, then the resume line", async () => {
    const full = await server.context("wf-3k9x2", 20000);
    const [footer, resume] = full.trimEnd().split("\n").slice(-2);
    expect(footer).toMatch(
      /^<!-- wf context wf-3k9x2 · ~[\d,]+ of 20,000 tokens · left out: none -->$/,
    );
    expect(resume).toBe(
      `To resume: codex 'Work on wf-3k9x2 "Push board updates over SSE" in issues/wf/web/live-board-updates. Read current_state.md first, then use the wf skills (doing-next-step).'`,
    );

    // The budget cuts from the bottom of the table: what is left out is the tail of the table,
    // and the first three sections stay whatever they cost.
    for (const budget of [600, 1200, 1700]) {
      const small = await server.context("wf-3k9x2", budget);
      const smallFooter = small.trimEnd().split("\n").at(-2) ?? "";
      const out = (/left out: (.+) -->/.exec(smallFooter)?.[1] ?? "").split(", ");
      const sections = out.filter((x) => !x.startsWith("linked "));
      expect(sections.length, `budget ${budget}`).toBeGreaterThan(0);
      expect(sections, `budget ${budget}`).toEqual(TABLE.slice(TABLE.length - sections.length));
      expect(headings(small).slice(0, 3)).toEqual(["Goal", "Success criteria", "Current state"]);
      expect(headings(small)).not.toContain(sections[0]);
    }
  });

  test("the resume line is the prompt Open in Codex copies", async () => {
    const { codexCommand } = await import("@/lib/api/codex");
    const summary = (await server.issue("wf-3k9x2")).summary;
    const md = await server.context("wf-3k9x2");
    expect(md.trimEnd().split("\n").at(-1)).toBe(`To resume: ${codexCommand(summary).command}`);
  });
});
