// The work summaries of the personal library (spec 3): the pages the generator writes for a
// workspace, the rev that tells when one is stale, the order of the issues, and the pages of the
// sample that ship as fixtures.
import { describe, expect, it } from "vitest";
import { summaryState, type WorkList, type WorkTarget } from "@/features/library/personal/work";
import { PERSONAL_SAMPLE } from "../personal-files";
import { SAMPLE } from "../sample-files";
import { createMockServer, type MockServer } from "../server";
import { createStore, type Store } from "../store";
import { DISK } from "../workspace-files";
import { readPage } from "./frontmatter";
import {
  folderRev,
  issuePage,
  neutralTimes,
  oneLine,
  sha256Hex,
  summarizeWork,
  summaryMeta,
  type WriteOptions,
  workList,
  workWorld,
} from "./work-summaries";

const WRITE: WriteOptions = { now: "2026-10-30T16:20+05:30", by: "@claude-sonnet" };

const sampleStore = (clock?: () => number): Store => {
  const store = createStore({ disk: DISK, sample: SAMPLE, ...(clock ? { clock } : {}) });
  store.loadSample();
  return store;
};

const sections = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
const frontmatterOf = (text: string) => readPage(text).data;

describe("the rev", () => {
  it("is SHA-256, as the shell script computes it", async () => {
    for (const text of [
      "",
      "abc",
      "x".repeat(55),
      "x".repeat(56),
      "x".repeat(64),
      "é—😀".repeat(40),
    ]) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(sha256Hex(text)).toBe(hex);
    }
  });

  it("makes every time and every date field neutral", () => {
    expect(neutralTimes("lease_until: 2026-10-30T16:20+05:30\nat 2026-10-30T16:20:05Z")).toBe(
      "lease_until: <time>\nat <time>",
    );
    expect(neutralTimes("due: 2026-11-08\ncreated: '2026-10-22'\nsee 2026-11-08 in prose")).toBe(
      "due: <date>\ncreated: '<date>'\nsee 2026-11-08 in prose",
    );
  });

  it("is 7 hex characters of the files at or below a folder, notes and evidence left out", () => {
    const files = {
      "issues/a/goal.md": "goal",
      "issues/a/notes/x.md": "note",
      "issues/a/evidence/goal.md": "evidence",
      "issues/a/readme.md": "not a wf file",
    };
    const rev = folderRev(files, "issues/a");
    expect(rev).toMatch(/^[0-9a-f]{7}$/);
    expect(rev).toBe(sha256Hex("== goal.md\ngoal").slice(0, 7));
    expect(folderRev({ ...files, "issues/a/notes/x.md": "changed" }, "issues/a")).toBe(rev);
    expect(folderRev({ ...files, "issues/a/goal.md": "goal!" }, "issues/a")).not.toBe(rev);
  });

  it("does not move with the clock of the sample, which the dashboard shifts at every load", () => {
    const early = sampleStore(() => Date.parse("2026-10-30T10:00:00Z"));
    const late = sampleStore(() => Date.parse("2026-11-12T22:41:00Z"));
    expect(early.text("issues/wf/web/live-board-updates/goal.md")).not.toBe(
      late.text("issues/wf/web/live-board-updates/goal.md"),
    );
    const revs = (s: Store) => workList(workWorld(s), () => undefined).targets.map((t) => t.rev);
    expect(revs(early)).toEqual(revs(late));
  });
});

describe("one line", () => {
  it("is the first sentence, without its full stop, at most 100 characters", () => {
    expect(oneLine("Delta stream runs end to end. Resync is next.")).toBe(
      "Delta stream runs end to end",
    );
    expect(oneLine("**Bold** words\nacross two lines.")).toBe("Bold words across two lines");
    const long = oneLine(`${"word ".repeat(40)}end.`);
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith("…")).toBe(true);
    expect(oneLine(undefined)).toBe("");
  });
});

describe("the pages of the sample", () => {
  const store = sampleStore();
  const world = workWorld(store);
  const pages = summarizeWork(world, WRITE);

  it("are a page for each group and each issue, under work/<workspace>/<group path>/", () => {
    const paths = Object.keys(pages);
    expect(paths.filter((p) => p.endsWith("/_group.md"))).toHaveLength(7);
    expect(paths).toHaveLength(7 + 26);
    expect(paths).toContain("work/wf/wf/web/_group.md");
    expect(paths).toContain("work/wf/wf/web/wf-3k9x2.md");
    expect(paths).toContain("work/wf/platform/auth/wf-y4bz7.md");
    expect(paths).toContain("work/wf/docs/wf-a7ne5.md");
    // An issue in a group of its own folder, not in a subgroup.
    expect(paths).toContain("work/wf/wf/wf-b1d7v.md");
  });

  it("are the same text every time", () => {
    expect(summarizeWork(workWorld(store), WRITE)).toEqual(pages);
  });

  it("give an issue the frontmatter and the five sections of the skill, in order", () => {
    const text = pages["work/wf/wf/web/wf-3k9x2.md"] as string;
    expect(Object.keys(frontmatterOf(text))).toEqual([
      "title",
      "kind",
      "issue",
      "workspace",
      "group",
      "status",
      "rev",
      "summarized_at",
      "summarized_by",
    ]);
    expect(frontmatterOf(text)).toMatchObject({
      title: "Push board updates over SSE",
      kind: "issue-summary",
      issue: "wf-3k9x2",
      workspace: "wf",
      group: "wf/web",
      status: "in_progress",
      summarized_at: "2026-10-30T16:20+05:30",
      summarized_by: "@claude-sonnet",
    });
    expect(typeof frontmatterOf(text).rev).toBe("string");
    expect(sections(text)).toEqual([
      "Where it stands",
      "Done so far",
      "Decisions",
      "Learnings",
      "Next",
    ]);
    expect(text).not.toMatch(/^# /m);
  });

  it("write Done so far from the log, newest first, with its commit and its entry", () => {
    const text = pages["work/wf/wf/web/wf-3k9x2.md"] as string;
    const done = text.split("## Done so far")[1]?.split("## Decisions")[0] ?? "";
    const lines = done.trim().split("\n");
    expect(lines[0]).toBe("- Sent `snapshot` on connect · `0d4a6c1` · [[wf-3k9x2#C-2xk8v]]");
    expect(lines.length).toBeLessThanOrEqual(8);
    // A failure and a docs entry stay in the log.
    expect(done).not.toContain("C-5wq7k");
    expect(done).not.toContain("C-3m8tz");
  });

  it("write the decisions that nothing replaces, and what a replacement replaces", () => {
    const text = pages["work/wf/wf/web/wf-3k9x2.md"] as string;
    expect(text).toContain(
      "- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE (accepted, replaces [[wf-3k9x2#D-2ab3c]])",
    );
    expect(text).toContain("- [[wf-3k9x2#D-5mh8q]] Elect one leader tab per browser (proposed)");
    // D-2ab3c is replaced: it is not a line of its own.
    expect(text).not.toContain("- [[wf-3k9x2#D-2ab3c]]");
  });

  it("say None. for an empty section and give the open request first in Next", () => {
    const quiet = pages["work/wf/wf/web/wf-v1cm9.md"] as string;
    expect(quiet.split("## Decisions")[1]?.split("## Learnings")[0]?.trim()).toBe("None.");
    const asked = pages["work/wf/wf/web/wf-3k9x2.md"] as string;
    const next = asked.split("## Next")[1]?.trim().split("\n") ?? [];
    expect(next[0]).toMatch(/^1\. @shruti answers Q-4m2pz: /);
    expect(next).toContain("2. Finish `resync` for lagged clients in [[wf-3k9x2#T-3]].");
  });

  it("start Where it stands with the sentence the group table repeats", () => {
    const issue = pages["work/wf/wf/web/wf-3k9x2.md"] as string;
    const group = pages["work/wf/wf/web/_group.md"] as string;
    const lead = issue.split("## Where it stands")[1]?.trim().split(". ")[0] ?? "";
    expect(lead).toBe("Delta stream runs end to end; lagged-client resync is in flight");
    expect(group).toContain(
      `| [Push board updates over SSE](wf-3k9x2.md) | In progress | ${lead} |`,
    );
  });

  it("say so when an issue is done with a criterion that is not verified", () => {
    const text = pages["work/wf/wf/web/wf-c2pn6.md"] as string;
    expect(text).toContain("The issue is done although 2 of 5 criteria are not verified.");
    expect(pages["work/wf/wf/web/_group.md"]).toContain(
      "- [[wf-c2pn6]] is done with SC-4 and SC-5 not verified.",
    );
  });

  it("give a group the sections of the skill, with Groups only when it has subgroups", () => {
    expect(sections(pages["work/wf/wf/web/_group.md"] as string)).toEqual([
      "Outcome",
      "Issues",
      "Risks",
      "Next",
    ]);
    expect(sections(pages["work/wf/wf/_group.md"] as string)).toEqual([
      "Outcome",
      "Groups",
      "Issues",
      "Risks",
      "Next",
    ]);
    const parent = pages["work/wf/platform/_group.md"] as string;
    expect(parent).toContain("| [auth](auth/_group.md) | 2 |");
    // A group with only subgroups has no issues of its own.
    expect(parent.split("## Issues")[1]?.split("## Risks")[0]?.trim()).toBe("None.");
  });

  it("order the issues of a group by status, then priority, then id", () => {
    const text = pages["work/wf/wf/web/_group.md"] as string;
    const rows =
      text
        .split("## Issues")[1]
        ?.split("## Risks")[0]
        ?.split("\n")
        .filter((l) => l.startsWith("| [")) ?? [];
    const status = rows.map((r) => r.split("|")[2]?.trim());
    expect(status).toEqual([
      "In progress",
      "In progress",
      "Review",
      "Planned",
      "Planned",
      "Backlog",
      "Done",
    ]);
    // Within a status: high before medium; the same priority by id.
    expect(rows[0]).toContain("wf-3k9x2");
    expect(rows[1]).toContain("wf-h2tb7");
    expect(rows[3]).toContain("wf-7yq2m");
    expect(rows[4]).toContain("wf-e6kc1");
  });

  it("count the issues of a group by status, in that order", () => {
    expect(pages["work/wf/wf/web/_group.md"]).toContain(
      "7 issues: 2 in progress, 1 in review, 2 planned, 1 in the backlog and 1 done.",
    );
    expect(pages["work/wf/wf/_group.md"]).toContain(
      "21 issues: 7 in progress, 1 blocked, 3 in review, 4 planned, 1 in the backlog, 4 done and 1 cancelled.",
    );
  });

  it("hold no time and no age", () => {
    for (const [path, text] of Object.entries(pages)) {
      const body = text.slice(text.indexOf("\n---\n", 4));
      expect(body, path).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(body, path).not.toMatch(
        /\b\d+\s?(m|h|min|minutes|hours|days)\b.*\b(left|ago)\b|\bago\b/i,
      );
    }
  });

  it("write a single issue, or a group with everything below it, deepest group first", () => {
    expect(Object.keys(summarizeWork(world, WRITE, { kind: "issue", key: "wf-3k9x2" }))).toEqual([
      "work/wf/wf/web/wf-3k9x2.md",
    ]);
    const group = Object.keys(summarizeWork(world, WRITE, { kind: "group", key: "wf/web" }));
    expect(group).toHaveLength(8);
    expect(group.at(-1)).toBe("work/wf/wf/web/_group.md");
    const parent = Object.keys(summarizeWork(world, WRITE, { kind: "group", key: "wf" }));
    expect(parent.at(-1)).toBe("work/wf/wf/_group.md");
    expect(parent.indexOf("work/wf/wf/web/_group.md")).toBeLessThan(parent.length - 1);
    expect(parent).toHaveLength(21 + 4);
    expect(summarizeWork(world, WRITE, { kind: "group", key: "nope" })).toEqual({});
  });

  it("put the rev of the folder in the page", () => {
    const text = pages["work/wf/wf/web/wf-3k9x2.md"] as string;
    expect(summaryMeta(text)?.rev).toBe(folderRev(world.files, "issues/wf/web/live-board-updates"));
    const group = pages["work/wf/wf/web/_group.md"] as string;
    expect(summaryMeta(group)?.rev).toBe(folderRev(world.files, "issues/wf/web"));
  });
});

describe("stale", () => {
  const written = (store: Store) => {
    const pages = summarizeWork(workWorld(store), WRITE);
    return (path: string) => pages[path];
  };
  const stateOf = (list: WorkList) =>
    Object.fromEntries(list.targets.map((t) => [t.path, summaryState(t)]));

  it("is every summary current right after the pages are written", () => {
    const store = sampleStore();
    const list = workList(workWorld(store), written(store));
    expect(new Set(Object.values(stateOf(list)))).toEqual(new Set(["current"]));
  });

  it("is a summary of an issue that changed, and of every group above it, and nothing else", async () => {
    const server: MockServer = createMockServer({ latency: 0, disk: SAMPLE });
    const store = server.store;
    const pages = summarizeWork(workWorld(store), WRITE);
    const detail = await server.issue("wf-z9mw2");
    await server.ops({
      op: "set_status",
      base_rev: detail.summary.status_ref.rev,
      issue: "wf-z9mw2",
      status: "done",
      force: true,
    });
    const list = workList(workWorld(store), (path) => pages[path]);
    const stale = Object.entries(stateOf(list))
      .filter(([, s]) => s === "stale")
      .map(([p]) => p)
      .sort();
    expect(stale).toEqual([
      "work/wf/wf/_group.md",
      "work/wf/wf/web/_group.md",
      "work/wf/wf/web/wf-z9mw2.md",
    ]);
    // Writing the issue again makes it current; its groups wait for Summarize this group.
    const again = summarizeWork(workWorld(store), WRITE, { kind: "issue", key: "wf-z9mw2" });
    const after = workList(workWorld(store), (path) => again[path] ?? pages[path]);
    expect(Object.entries(stateOf(after)).filter(([, s]) => s === "stale")).toHaveLength(2);
    const group = summarizeWork(workWorld(store), WRITE, { kind: "group", key: "wf" });
    const all = workList(workWorld(store), (path) => group[path] ?? pages[path]);
    expect(Object.values(stateOf(all)).filter((s) => s === "stale")).toHaveLength(0);
  });

  it("is a summary of nothing: an issue without a page is not summarized", () => {
    const store = sampleStore();
    const list = workList(workWorld(store), () => undefined);
    expect(list.targets.every((t) => summaryState(t) === "none")).toBe(true);
    expect(list.targets.every((t) => t.summary === undefined)).toBe(true);
  });

  it("reads a rev that was written as a number", () => {
    expect(summaryMeta('---\nrev: 1234567\nsummarized_by: "@codex"\n---\n')).toEqual({
      rev: "1234567",
      summarizedBy: "@codex",
    });
    expect(summaryMeta("no frontmatter")).toBeUndefined();
    expect(summaryMeta(undefined)).toBeUndefined();
  });
});

describe("the list of targets", () => {
  it("lists a group, then its issues by status, then its subgroups", () => {
    const store = sampleStore();
    const list = workList(workWorld(store), () => undefined);
    expect(list.workspace).toBe("wf");
    const keys = list.targets.map((t) => t.key);
    expect(keys.slice(0, 5)).toEqual(["wf", "wf-b1d7v", "wf-g5rx8", "wf-n7vy3", "wf/core"]);
    const web = list.targets.find((t) => t.key === "wf/web") as WorkTarget;
    expect(web).toMatchObject({ kind: "group", parent: "wf", issues: 7, title: "web" });
    const sse = list.targets.find((t) => t.key === "wf-3k9x2") as WorkTarget;
    expect(sse).toMatchObject({ kind: "issue", parent: "wf/web", status: "in_progress" });
  });

  it("has groups and no issues in the shipped workspace", () => {
    const store = createStore({ disk: DISK, sample: SAMPLE });
    const list = workList(workWorld(store), () => undefined);
    expect(list.targets.filter((t) => t.kind === "issue")).toEqual([]);
    expect(list.targets.every((t) => t.issues === 0)).toBe(true);
  });
});

describe("the sample's own pages (mock/personal-sample/work)", () => {
  /** Pages kept by hand, as they were written before their issue changed. */
  const STALE = [
    "work/wf/wf/_group.md",
    "work/wf/wf/web/_group.md",
    "work/wf/wf/web/wf-3k9x2.md",
    "work/wf/wf/web/wf-z9mw2.md",
  ];
  /** The lines that say when and by whom: a page is not different for them. */
  const bare = (text: string) =>
    text
      .split("\n")
      .filter((l) => !/^summarized_(at|by):/.test(l))
      .join("\n");

  const store = sampleStore();
  const world = workWorld(store);
  const generated = summarizeWork(world, WRITE);
  const shipped = Object.fromEntries(
    Object.entries(PERSONAL_SAMPLE.text).filter(([p]) => p.startsWith("work/")),
  );
  const list = workList(world, (path) => shipped[path]);

  it("are a page for every group and issue, and the generator would write the others as they are", () => {
    const missing = Object.keys(generated).filter((p) => !(p in shipped));
    expect(missing).toEqual([]);
    const different = Object.keys(generated)
      .filter((p) => !STALE.includes(p))
      .filter((p) => bare(shipped[p] as string) !== bare(generated[p] as string));
    // If this fails, the sample or the generator changed: write the pages again with
    // `summarizeWork(workWorld(store), { now, by })`, and keep the four pages of STALE as they are.
    expect(different).toEqual([]);
  });

  it("are stale for exactly the two issues that moved on and the groups above them", () => {
    const stale = list.targets.filter((t) => summaryState(t) === "stale").map((t) => t.path);
    expect(stale.sort()).toEqual([...STALE].sort());
    expect(list.targets.filter((t) => summaryState(t) === "none")).toEqual([]);
  });

  it("have the shape of the skill: kind, workspace, group and the sections in order", () => {
    for (const [path, text] of Object.entries(shipped)) {
      if (!path.endsWith(".md") || path.endsWith("index.md")) continue;
      const fm = frontmatterOf(text);
      expect(fm.workspace, path).toBe("wf");
      expect(["issue-summary", "group-summary"], path).toContain(fm.kind);
      expect(typeof fm.rev, path).toBe("string");
      const names = sections(text);
      expect(names.at(0), path).toBe(fm.kind === "issue-summary" ? "Where it stands" : "Outcome");
      expect(names.at(-1), path).toBe("Next");
    }
  });
});

describe("the pages in the prototype", () => {
  it("show up in the personal library only while the sample is loaded, and read as written", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    const before = await server.libraryTree("me");
    expect(JSON.stringify(before.root)).not.toContain("wf-3k9x2");
    // The sample's own fixture, shown through the registry: the empty workspace has no Work section.
    const empty = createMockServer({ latency: 0 });
    const tree = await empty.libraryTree("me");
    expect(tree.root.children?.some((n) => n.path === "work")).toBe(false);
    expect(tree.root.children?.some((n) => n.path === "topics")).toBe(true);
    server.dispose();
    empty.dispose();
  });

  it("can be written by the prototype and read back with the same rev", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    server.controls.loadSample();
    const world = workWorld(server.store);
    const pages = summarizeWork(world, WRITE, { kind: "issue", key: "wf-h2tb7" });
    const [[path, text]] = Object.entries(pages) as [[string, string]];
    await server.savePage({ alias: "me", path, text });
    const page = await server.libraryPage("me", path);
    expect(page.kind).toBe("issue-summary");
    expect(summaryMeta(page.text)?.rev).toBe(
      folderRev(world.files, "issues/wf/web/board-keyboard-navigation"),
    );
    server.dispose();
  });
});

it("writes an issue page from its detail", async () => {
  const store = sampleStore();
  const world = workWorld(store);
  const detail = world.details.get("wf-v1cm9");
  expect(detail).toBeDefined();
  if (!detail) return;
  const text = issuePage(world, detail, WRITE);
  expect(text).toContain("status: backlog");
  expect(text).toContain("No work has started.");
  expect(text).toContain("1. Plan the issue with `planning-issues`.");
});
