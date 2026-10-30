// Context links through the ops: `new_issue` with context and links, and `add_links`. Each test
// runs the Op on the mock server, then reads the files back: the line diff is the whole change,
// and the API shows what the links mean (the library item is used by one more issue).
import { beforeEach, describe, expect, test } from "vitest";
import type { ContextLink } from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import { lineDiff } from "./md/test-support";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";
import type { Store } from "./store";

let server: MockServer;
let store: Store;

beforeEach(() => {
  server = createMockServer({ latency: 0, disk: SAMPLE });
  store = server.store;
});

const NOTES = "issues/wf/web/live-board-updates/notes/research.md";
const REVIEWED: ContextLink = {
  kind: "library",
  target: "lib-4tz7c",
  label: "Rescan subtrees instead of trusting notify on macOS",
};
const DRAFT: ContextLink = {
  kind: "library",
  target: "lib-7nq3d",
  label: "Match glossary synonyms on whole words",
};
const FILE: ContextLink = { kind: "file", target: NOTES, label: "research notes" };
const TERM: ContextLink = { kind: "term", target: "lease", label: "a time-boxed claim on a task" };
const ENTRY: ContextLink = {
  kind: "entry",
  target: "wf-3k9x2#D-7f3k2",
  label: "Push board updates over SSE",
};

async function webGroup() {
  const snap = await server.snapshot();
  const web = snap.groups.children[0].children.find((g) => g.slug === "web");
  if (!web) throw new Error("no web group");
  return { snap, web };
}

const used = async (id: string) =>
  (await server.snapshot()).library.find((l) => l.id === id)?.used_by ?? -1;

async function newIssue(extra: Record<string, unknown> = {}) {
  const { snap, web } = await webGroup();
  const result = await server.ops({
    op: "new_issue",
    base_rev: snap.rev,
    group: web.id,
    slug: "teach-the-lease",
    title: "Teach agents the lease",
    template: "default",
    size: "m",
    ...extra,
  } as never);
  return { result, dir: `${web.path}/teach-the-lease`, web };
}

describe("new_issue with context", () => {
  test("writes the context and the links into the one goal.md it creates", async () => {
    const before = [...store.paths()];
    const usedBefore = await used("lib-4tz7c");
    const draftBefore = await used("lib-7nq3d");
    const { result, dir } = await newIssue({
      context_md: "Agents lose their claim and nobody tells them why.\n\nThey need the rule.",
      links: [REVIEWED, DRAFT, ENTRY, TERM, FILE],
    });
    expect(store.paths().filter((p) => !before.includes(p))).toEqual([`${dir}/goal.md`]);

    const text = store.text(`${dir}/goal.md`) ?? "";
    expect(text).toContain(
      "## Context\n\nAgents lose their claim and nobody tells them why.\n\nThey need the rule.\n",
    );
    const links = text.slice(text.indexOf("## Links"));
    expect(links).toBe(
      [
        "## Links",
        "",
        "- [[lib-4tz7c]] Rescan subtrees instead of trusting notify on macOS",
        "- [[lib-7nq3d]] Match glossary synonyms on whole words",
        "- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE",
        "- Glossary: lease — a time-boxed claim on a task",
        "- [research notes](../live-board-updates/notes/research.md)",
        "",
      ].join("\n"),
    );

    // The board reads it back: the context, the links, the counts.
    const detail = await server.issue(result.created ?? "");
    expect(detail.goal.context_md).toContain("Agents lose their claim");
    expect(detail.goal.links_md).toContain("[[lib-4tz7c]]");
    expect(detail.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(detail.diagnostics.filter((d) => d.rule === "F009")).toEqual([]);
    expect(await used("lib-4tz7c")).toBe(usedBefore + 1);
    expect(await used("lib-7nq3d")).toBe(draftBefore + 1);
    // The cited issue lists the new one as a backlink.
    const cited = await server.issue("wf-3k9x2");
    expect(cited.backlinks.some((b) => b.issue === result.created)).toBe(true);
  });

  test("without context or links it is the template", async () => {
    const { dir } = await newIssue();
    const text = store.text(`${dir}/goal.md`) ?? "";
    expect(text).toContain("Write this section before the issue is planned");
    expect(text).not.toContain("## Links");
  });

  test("a link to something that does not exist is a 422 and writes nothing", async () => {
    const before = store.rev;
    const { snap, web } = await webGroup();
    const attempt = server.ops({
      op: "new_issue",
      base_rev: snap.rev,
      group: web.id,
      slug: "teach-the-lease",
      title: "Teach agents the lease",
      template: "default",
      links: [{ kind: "library", target: "lib-zzzzz", label: "Nope" }],
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({
      status: 422,
      body: { gaps: ["Library item lib-zzzzz does not exist."] },
    });
    expect(store.rev).toBe(before);
  });

  test("a retired library item cannot be linked", async () => {
    const { snap, web } = await webGroup();
    await expect(
      server.ops({
        op: "new_issue",
        base_rev: snap.rev,
        group: web.id,
        slug: "x",
        title: "X",
        template: "default",
        links: [{ kind: "library", target: "lib-0rt4e", label: "Poll the snapshot" }],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("add_links", () => {
  const ID = "wf-z9mw2";
  const goalPath = () => store.filePath(ID, "goal.md");
  const rev = async () => (await server.issue(ID)).files_rev["goal.md"];

  test("appends bullets to ## Links and touches no other file", async () => {
    const before = store.text(goalPath()) ?? "";
    const others = new Map(store.paths().map((p) => [p, store.text(p)]));
    const usedBefore = await used("lib-7nq3d");
    await server.ops({
      op: "add_links",
      base_rev: await rev(),
      issue: ID,
      links: [DRAFT, TERM, FILE],
    });
    const after = store.text(goalPath()) ?? "";
    expect(lineDiff(before, after)).toEqual({
      removed: [],
      added: [
        "- [[lib-7nq3d]] Match glossary synonyms on whole words",
        "- Glossary: lease — a time-boxed claim on a task",
        "- [research notes](../live-board-updates/notes/research.md)",
      ],
    });
    for (const [p, t] of others) if (p !== goalPath()) expect(store.text(p)).toBe(t);
    expect(await used("lib-7nq3d")).toBe(usedBefore + 1);
    const detail = await server.issue(ID);
    expect(detail.goal.links_md).toContain("Glossary: lease");
  });

  test("an item that is already linked changes nothing", async () => {
    await server.ops({ op: "add_links", base_rev: await rev(), issue: ID, links: [DRAFT] });
    const revAfter = store.rev;
    await server.ops({ op: "add_links", base_rev: await rev(), issue: ID, links: [DRAFT] });
    expect(store.rev).toBe(revAfter);
  });

  test("creates ## Links when the file has none", async () => {
    const id = [...store.derived.dirs.entries()].find(([, d]) =>
      d.endsWith("/drawer-width-jump"),
    )?.[0];
    expect(id).toBeTruthy();
    const issue = id ?? "";
    const file = store.filePath(issue, "goal.md");
    const base = (await server.issue(issue)).files_rev["goal.md"];
    await server.ops({ op: "add_links", base_rev: base, issue, links: [REVIEWED] });
    const text = store.text(file) ?? "";
    expect(
      text
        .trimEnd()
        .endsWith(
          "## Links\n\n- [[lib-4tz7c]] Rescan subtrees instead of trusting notify on macOS",
        ),
    ).toBe(true);
  });

  test("a write to another part of goal.md does not conflict, a write to the links does", async () => {
    const stale = await rev();
    // Ticking a criterion moves the file rev but not the links.
    const d = await server.issue(ID);
    const open = d.criteria.find((c) => !c.checked);
    if (open)
      await server.ops({
        op: "toggle_criterion",
        base_rev: stale,
        issue: ID,
        id: open.id,
        checked: true,
      });
    await server.ops({ op: "add_links", base_rev: stale, issue: ID, links: [DRAFT] });
    // The first add moved the links: a client still on `stale` is told.
    await expect(
      server.ops({ op: "add_links", base_rev: stale, issue: ID, links: [TERM] }),
    ).rejects.toMatchObject({ status: 409 });
  });

  test("unknown targets are a 422", async () => {
    await expect(
      server.ops({
        op: "add_links",
        base_rev: await rev(),
        issue: ID,
        links: [{ kind: "file", target: "issues/nope.md", label: "nope" }],
      }),
    ).rejects.toMatchObject({
      status: 422,
      body: { gaps: ["File issues/nope.md does not exist."] },
    });
    await expect(
      server.ops({
        op: "add_links",
        base_rev: await rev(),
        issue: ID,
        links: [{ kind: "term", target: "frobnicate", label: "x" }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      server.ops({
        op: "add_links",
        base_rev: await rev(),
        issue: ID,
        links: [{ kind: "entry", target: "wf-3k9x2#D-00000", label: "x" }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      server.ops({ op: "add_links", base_rev: await rev(), issue: ID, links: [] }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
