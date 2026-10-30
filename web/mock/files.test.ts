// The markdown files are the only source of the mock world: writing or editing a file changes
// the board, a hand edit through the file API is a normal write, a change on disk (the Vite
// watcher) is applied as an external write and an echo of the store's own text is ignored.
import { beforeEach, describe, expect, test } from "vitest";
import type { Conflict, ServerEvent } from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import { rebaseWorkspace } from "./md/rebase";
import { RECORDED_AT } from "./md/recorded-at";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";
import { createStore, type Store } from "./store";
import { toTs } from "./time";
import type { WorkspaceDisk } from "./workspace-bus";

let server: MockServer;
let store: Store;

beforeEach(() => {
  server = createMockServer({ latency: 0, disk: SAMPLE });
  store = server.store;
});

const GOAL = "issues/wf/web/live-board-updates/goal.md";
const CHANGES = "issues/wf/web/live-board-updates/changes.md";
const NEW_GOAL = "issues/wf/web/keyboard-cheat-sheet/goal.md";

const NEW_GOAL_TEXT = `---
id: wf-9zq4m
title: Keyboard cheat sheet
status: planned
priority: medium
size: s
owner: "@shruti"
created: 2026-10-22T16:30+05:30
---

## Context

A one-page list of the shortcuts, so a new reader finds them without asking.

## Success criteria

- [ ] SC-1: When a reader opens the sheet, the page shall list every shortcut within 1 s.
`;

function record(): { events: ServerEvent[]; stop: () => void } {
  const events: ServerEvent[] = [];
  return { events, stop: server.subscribe((e) => events.push(e)) };
}

async function failure(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error("expected the call to be rejected");
}

const issueOf = async (id: string) => (await server.snapshot()).issues.find((i) => i.id === id);

// ---------------------------------------------------------------- writing files

describe("a file written through the API changes the board", () => {
  test("a new goal.md adds an issue (and a card) to the snapshot", async () => {
    const before = await server.snapshot();
    expect(await issueOf("wf-9zq4m")).toBeUndefined();
    const { events, stop } = record();
    const res = await server.writeFile({ path: NEW_GOAL, text: NEW_GOAL_TEXT });
    stop();

    const issue = await issueOf("wf-9zq4m");
    expect(issue).toMatchObject({
      title: "Keyboard cheat sheet",
      status: "planned",
      path: "issues/wf/web/keyboard-cheat-sheet",
      group_path: ["wf", "web"],
    });
    const after = await server.snapshot();
    expect(after.issues).toHaveLength(before.issues.length + 1);
    expect(after.rev).not.toBe(before.rev);
    expect(res.rev).toBe(store.pathRev(NEW_GOAL));

    const web = after.groups.children[0].children.find((g) => g.slug === "web");
    expect(web?.issue_ids).toContain("wf-9zq4m");
    const delta = events.find((e) => e.event === "delta");
    expect(delta?.event === "delta" && delta.data.issues_upserted.map((i) => i.id)).toContain(
      "wf-9zq4m",
    );
    const activity = events.find((e) => e.event === "activity");
    expect(activity?.event === "activity" && activity.data).toMatchObject({
      issue_id: "wf-9zq4m",
      author: "shruti",
      title: "@shruti created goal.md",
    });
    expect((await server.issue("wf-9zq4m")).criteria).toHaveLength(1);
  });

  test("the new file shows in the file list with its owner and its findings", async () => {
    await server.writeFile({ path: NEW_GOAL, text: NEW_GOAL_TEXT });
    const file = (await server.files()).find((f) => f.path === NEW_GOAL);
    expect(file).toMatchObject({ kind: "md", issue: "wf-9zq4m" });
    expect(file?.bytes).toBe(new TextEncoder().encode(NEW_GOAL_TEXT).length);
    const read = await server.file(NEW_GOAL);
    expect(read.text).toBe(NEW_GOAL_TEXT);
    expect(read.rev).toBe(file?.rev);
  });

  test("a new folder with only goal.md and a bad name still loads", async () => {
    await server.writeFile({
      path: "issues/brand-new-group/first/goal.md",
      text: NEW_GOAL_TEXT.replace("wf-9zq4m", "wf-9zq5m"),
    });
    const issue = await issueOf("wf-9zq5m");
    expect(issue?.group_path).toEqual(["brand-new-group"]);
    const groups = (await server.snapshot()).groups.children.map((g) => g.slug);
    expect(groups).toContain("brand-new-group");
  });

  test("editing status: moves the card", async () => {
    const file = await server.file(GOAL);
    expect(file.text).toContain("\nstatus: in_progress\n");
    await server.writeFile({
      path: GOAL,
      text: (file.text as string).replace("\nstatus: in_progress\n", "\nstatus: review\n"),
      base_rev: file.rev,
    });
    expect((await issueOf("wf-3k9x2"))?.status).toBe("review");
    const after = await server.snapshot();
    expect(after.groups.rollup.by_status.review).toBeGreaterThan(0);
  });

  test("an edit of one anchor is re-found when another anchor of the file moved", async () => {
    // An op wrote SC-4 after the editor opened the file: the editor's rev is stale for the file.
    const file = await server.file(GOAL);
    const detail = await server.issue("wf-3k9x2");
    await server.ops({
      op: "toggle_criterion",
      base_rev: detail.criteria[3].edit.rev,
      issue: "wf-3k9x2",
      id: "SC-4",
      checked: true,
    });
    const err = await failure(() =>
      server.writeFile({ path: GOAL, text: `${file.text}\n`, base_rev: file.rev }),
    );
    expect(err.status).toBe(409);
    expect((err.body as Conflict).reason).toBe("goal.md changed by @shruti");
    expect((err.body as Conflict).file).toBe(GOAL);
    // Without a base rev the same save is an overwrite and goes through.
    await server.writeFile({ path: GOAL, text: `${file.text}\n` });
  });

  test("breaking the YAML shows F001 on the issue and keeps the card", async () => {
    const file = await server.file(GOAL);
    const text = (file.text as string).replace('owner: "@shruti"', "owner: @shruti");
    expect(text).not.toBe(file.text);
    await server.writeFile({ path: GOAL, text });
    const d = await server.issue("wf-3k9x2");
    const f001 = d.diagnostics.filter((x) => x.rule === "F001");
    expect(f001).toHaveLength(1);
    expect(f001[0]).toMatchObject({ severity: "error", file: GOAL });
    expect(text.split("\n")[f001[0].line - 1]).toContain("owner: @shruti");
    expect(d.goal.frontmatter_ok).toBe(false);
    expect(d.goal.raw).toBe(text);
    expect((await issueOf("wf-3k9x2"))?.lint.error).toBeGreaterThanOrEqual(1);
    expect((await server.files()).find((f) => f.path === GOAL)?.errors).toBeGreaterThanOrEqual(1);
    expect((await server.file(GOAL)).diagnostics.some((x) => x.rule === "F001")).toBe(true);

    // Fixing the text clears it again.
    await server.writeFile({ path: GOAL, text: file.text as string });
    const fixed = await server.issue("wf-3k9x2");
    expect(fixed.diagnostics.some((x) => x.rule === "F001")).toBe(false);
    expect(fixed.goal.frontmatter_ok).toBe(true);
  });

  test("a change entry written by hand shows in the log, with its author in the activity", async () => {
    const file = await server.file(CHANGES);
    const ts = toTs(store.now());
    const entry = `\n## ${ts} @codex — Hand-written entry {#C-9zz9z}\n- kind: progress\n- model: gpt-5-codex\n\nAdded by hand.\n`;
    const { events, stop } = record();
    await server.writeFile({ path: CHANGES, text: `${file.text}${entry}`, base_rev: file.rev });
    stop();
    const d = await server.issue("wf-3k9x2");
    expect(d.changes.at(-1)).toMatchObject({ id: "C-9zz9z", author: "codex", ts });
    expect(d.summary.last_activity).toMatchObject({ author: "codex", title: "Hand-written entry" });
    const activity = events.find((e) => e.event === "activity");
    // A file edit through the editor is the acting author's, even when the entry names another.
    expect(activity?.event === "activity" && activity.data.title).toBe("@shruti edited changes.md");
  });

  test("deleting a file removes what it described", async () => {
    await server.writeFile({ path: NEW_GOAL, text: NEW_GOAL_TEXT });
    expect(await issueOf("wf-9zq4m")).toBeDefined();
    const { events, stop } = record();
    await server.deleteFile({ path: NEW_GOAL, base_rev: store.pathRev(NEW_GOAL) });
    stop();
    expect(await issueOf("wf-9zq4m")).toBeUndefined();
    expect((await server.files()).some((f) => f.path === NEW_GOAL)).toBe(false);
    const delta = events.find((e) => e.event === "delta");
    expect(delta?.event === "delta" && delta.data.issues_removed).toContain("wf-9zq4m");
  });

  test("deleting an issue's plan.md drops the plan", async () => {
    const path = "issues/wf/web/live-board-updates/plan.md";
    expect((await server.issue("wf-3k9x2")).plan).not.toBeNull();
    await server.deleteFile({ path });
    expect((await server.issue("wf-3k9x2")).plan).toBeNull();
    expect((await issueOf("wf-3k9x2"))?.has_plan).toBe(false);
  });

  test("a stale delete is a 409 and a missing file is a 404", async () => {
    const err = await failure(() => server.deleteFile({ path: GOAL, base_rev: "deadbeef" }));
    expect(err.status).toBe(409);
    await expect(server.deleteFile({ path: "nope/missing.md" })).rejects.toThrow(/not found/);
    await expect(server.file("nope/missing.md")).rejects.toThrow(/not found/);
  });

  test("a save of the same text changes nothing", async () => {
    const file = await server.file(GOAL);
    const before = await server.snapshot();
    const { events, stop } = record();
    await server.writeFile({ path: GOAL, text: file.text as string, base_rev: file.rev });
    stop();
    expect(events).toHaveLength(0);
    expect((await server.snapshot()).rev).toBe(before.rev);
  });

  test("paths outside the workspace and binary files are refused", async () => {
    for (const path of [
      "",
      "../outside.md",
      "issues//x.md",
      "issues/x/",
      "a/./b.md",
      "a/.git/x.md",
    ]) {
      const err = await failure(() => server.writeFile({ path, text: "x" }));
      expect(err.status, path).toBe(422);
    }
    const png = (await server.files()).find((f) => f.kind === "image");
    expect(png?.path).toMatch(/sc2\.png$/);
    const err = await failure(() => server.writeFile({ path: png?.path ?? "", text: "x" }));
    expect(err.status).toBe(422);
    const big = await failure(() =>
      server.writeFile({ path: "x.md", text: "y".repeat(1_100_000) }),
    );
    expect(big.status).toBe(422);
  });

  test("garbage in any file leaves a working workspace", async () => {
    const paths = [
      GOAL,
      "issues/wf/web/live-board-updates/plan.md",
      "issues/wf/web/live-board-updates/current_state.md",
      "issues/wf/_group.md",
      "authors.md",
      "glossary.md",
      "workflow.toml",
      "library/patterns/review-promoted-items.md",
    ];
    for (const path of paths) {
      await server.writeFile({
        path,
        text: "\u0000---\n: : [\n## ## ##\n- [ ] SC-1\n```archify\n",
      });
      const snap = await server.snapshot();
      // A goal.md that cannot be read is still an issue, under an id made from its folder.
      expect(snap.issues.length, path).toBeGreaterThanOrEqual(25);
      expect(snap.groups.rollup.issues, path).toBeGreaterThanOrEqual(25);
      for (const i of snap.issues.slice(0, 3)) await server.issue(i.id);
    }
    expect(await server.search("board")).toBeDefined();
    const id = (await server.snapshot()).issues[0].id;
    expect(await server.context(id)).toContain(id);
  });

  test("workflow.toml, authors.md and glossary.md changes ask clients to resync", async () => {
    const authors = await server.file("authors.md");
    const { events, stop } = record();
    await server.writeFile({
      path: "authors.md",
      text: `${authors.text}\n## @newcomer\n- kind: human\n`,
    });
    stop();
    expect(events.map((e) => e.event)).toContain("resync");
    expect((await server.snapshot()).authors.some((a) => a.handle === "newcomer")).toBe(true);

    const glossary = await server.file("glossary.md");
    await server.writeFile({
      path: "glossary.md",
      text: `${glossary.text}\n## sprocket\n- kind: term\n- means: A toothed wheel used in the test.\n`,
    });
    expect((await server.glossary()).some((t) => t.term === "sprocket")).toBe(true);
  });

  test("a library item edited by hand shows in the library", async () => {
    const path = "library/patterns/review-promoted-items.md";
    const file = await server.file(path);
    const text = (file.text as string).replace(/^title: .*$/m, "title: Review every promoted item");
    expect(text).not.toBe(file.text);
    const { events, stop } = record();
    await server.writeFile({ path, text });
    stop();
    const delta = events.find((e) => e.event === "delta");
    const upserted = delta?.event === "delta" ? delta.data.library_upserted : [];
    expect(upserted.map((l) => l.title)).toContain("Review every promoted item");
    const info = (await server.files()).find((f) => f.path === path);
    expect(info?.library).toMatch(/^lib-/);
  });

  test("the diagram of a block written by hand appears, and a broken one is invalid", async () => {
    const path = "issues/wf/web/keyboard-cheat-sheet/goal.md";
    const block = (body: string) =>
      NEW_GOAL_TEXT.replace(
        "## Success criteria",
        `\`\`\`archify workflow id=cheat-flow\n${body}\n\`\`\`\n\n## Success criteria`,
      );
    const good = JSON.stringify({
      meta: { title: "Cheat sheet flow" },
      nodes: [
        { id: "a", label: "Open" },
        { id: "b", label: "Read" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    await server.writeFile({ path, text: block(good) });
    let d = await server.issue("wf-9zq4m");
    expect(d.diagrams).toHaveLength(1);
    expect(d.diagrams[0]).toMatchObject({ id: "cheat-flow", status: "unavailable", nodes: 2 });
    // No stand-in preview page exists for it, so it never turns ready.
    store.setArchify(true);
    d = await server.issue("wf-9zq4m");
    expect(d.diagrams[0].status).toBe("unavailable");
    expect(d.diagrams[0].url).toBe("");
    // Once the preview exists it does.
    store.setPreviews([...SAMPLE.previews, "cheat-flow"]);
    d = await server.issue("wf-9zq4m");
    expect(d.diagrams[0]).toMatchObject({ status: "ready" });
    expect(d.diagrams[0].url).toMatch(/diagrams\/cheat-flow\.html$/);

    await server.writeFile({ path, text: block(good.replace('"to":"b"', '"to":"zz"')) });
    d = await server.issue("wf-9zq4m");
    expect(d.diagrams[0].status).toBe("invalid");
    expect(d.diagnostics.some((x) => x.rule === "F011")).toBe(true);
  });
});

// ---------------------------------------------------------------- reset

describe("reset", () => {
  test("restores the pristine files and forgets every write of the session", async () => {
    // A stopped clock: the store shifts recorded times by the nearest whole minute, so a clock that
    // runs across a :30 second between the load and the reset would read as an edit.
    const now = Date.now();
    server = createMockServer({ latency: 0, disk: SAMPLE, clock: () => now });
    store = server.store;
    const before = new Map(store.paths().map((p) => [p, store.text(p)]));
    const snap = await server.snapshot();

    await server.writeFile({ path: NEW_GOAL, text: NEW_GOAL_TEXT });
    await server.deleteFile({ path: "issues/wf/web/live-board-updates/plan.md" });
    const file = await server.file(GOAL);
    await server.writeFile({ path: GOAL, text: `${file.text}\nExtra line.\n` });
    server.playNext();
    expect(store.text(GOAL)).toContain("Extra line.");
    expect(store.text("issues/wf/web/live-board-updates/plan.md")).toBeUndefined();

    server.controls.reset();
    expect(store.paths()).toEqual([...before.keys()].sort());
    for (const [p, t] of before) expect(store.text(p), p).toBe(t);
    const after = await server.snapshot();
    expect(after.issues).toEqual(snap.issues);
    expect(after.library).toEqual(snap.library);
    expect(after.inbox).toEqual(snap.inbox);
    expect(await issueOf("wf-9zq4m")).toBeUndefined();
  });

  test("a store made with its own disk resets to that disk", async () => {
    const disk: WorkspaceDisk = {
      ...SAMPLE,
      text: { ...SAMPLE.text, "issues/wf/web/keyboard-cheat-sheet/goal.md": NEW_GOAL_TEXT },
    };
    const own = createStore({ disk });
    expect(own.summary("wf-9zq4m")).toBeDefined();
    own.applyChanges([{ path: NEW_GOAL, text: null }], "shruti", "file");
    expect(own.summary("wf-9zq4m")).toBeUndefined();
    own.reset();
    expect(own.summary("wf-9zq4m")).toBeDefined();
  });
});

// ---------------------------------------------------------------- the watcher (files on disk)

describe("the mock watcher applies what changed on disk", () => {
  /** A copy of the disk with some files replaced (`null` removes one). */
  const diskWith = (changes: Record<string, string | null>): WorkspaceDisk => {
    const text = { ...SAMPLE.text };
    for (const [p, t] of Object.entries(changes)) {
      if (t === null) delete text[p];
      else text[p] = t;
    }
    return { ...SAMPLE, text };
  };

  test("identical text is ignored: no event, no new rev", () => {
    const { events, stop } = record();
    const rev = store.rev;
    expect(store.applyDisk(diskWith({}))).toBe(false);
    // The same text again, as a saved-without-change editor would send it.
    expect(store.applyDisk({ ...SAMPLE, text: { ...SAMPLE.text } })).toBe(false);
    stop();
    expect(events).toHaveLength(0);
    expect(store.rev).toBe(rev);
  });

  test("an update that equals what the store already holds is an echo", async () => {
    // The store holds T after an in-browser save; the disk then changes to the text T came from.
    const extra = "\n<!-- note -->\n";
    const onDisk = (SAMPLE.text[GOAL] as string) + extra;
    const held = rebaseWorkspace({ [GOAL]: onDisk }, store.shiftMs)[GOAL];
    await server.writeFile({ path: GOAL, text: held });
    const { events, stop } = record();
    const rev = store.rev;
    expect(store.applyDisk(diskWith({ [GOAL]: onDisk }))).toBe(false);
    stop();
    expect(events).toHaveLength(0);
    expect(store.rev).toBe(rev);
  });

  test("a changed file is re-read: delta, activity, and the author of a new entry", async () => {
    const entry = `\n## ${RECORDED_AT} @claude-sonnet — Disk entry {#C-8dd8d}\n- kind: progress\n\nWritten in an editor.\n`;
    const { events, stop } = record();
    const applied = store.applyDisk(
      diskWith({ [CHANGES]: (SAMPLE.text[CHANGES] as string) + entry }),
    );
    stop();
    expect(applied).toBe(true);
    const delta = events.find((e) => e.event === "delta");
    expect(delta?.event === "delta" && delta.data.details_changed).toContain("wf-3k9x2");
    const activity = events.filter((e) => e.event === "activity");
    expect(activity).toHaveLength(1);
    expect(activity[0].event === "activity" && activity[0].data).toMatchObject({
      issue_id: "wf-3k9x2",
      kind: "change",
      author: "claude-sonnet",
      title: "@claude-sonnet edited changes.md",
    });
    const d = await server.issue("wf-3k9x2");
    expect(d.changes.at(-1)?.id).toBe("C-8dd8d");
  });

  test("an edit without a new entry is attributed to disk", () => {
    const { events, stop } = record();
    store.applyDisk(
      diskWith({
        [GOAL]: (SAMPLE.text[GOAL] as string).replace(
          "\nstatus: in_progress\n",
          "\nstatus: review\n",
        ),
      }),
    );
    stop();
    const activity = events.find((e) => e.event === "activity");
    expect(activity?.event === "activity" && activity.data).toMatchObject({
      author: "disk",
      title: "@disk edited goal.md",
    });
    expect(store.summary("wf-3k9x2")?.status).toBe("review");
  });

  test("times typed into a file are shifted like every other time", async () => {
    // The clock is three days and seven minutes past the recording. A time typed five minutes
    // before RECORDED_AT is shifted by that much, so it reads five minutes before now.
    const recorded = Date.parse(RECORDED_AT);
    const now = recorded + 3 * 86_400_000 + 7 * 60_000;
    const own = createStore({ clock: () => now, disk: SAMPLE });
    const typed = toTs(recorded - 5 * 60_000);
    const entry = `\n## ${typed} @codex — Typed {#C-8ee8e}\n- kind: progress\n\nx\n`;
    own.applyDisk({
      ...SAMPLE,
      text: { ...SAMPLE.text, [CHANGES]: (SAMPLE.text[CHANGES] as string) + entry },
    });
    const c = own.issueSrc("wf-3k9x2")?.changes.find((x) => x.id === "C-8ee8e");
    expect(c?.ts).toBe(toTs(now - 5 * 60_000));
    expect(Date.parse(c?.ts as string)).toBe(now - 5 * 60_000);
  });

  test("a new file on disk adds an issue and a removed file removes it", async () => {
    const { events, stop } = record();
    store.applyDisk(diskWith({ [NEW_GOAL]: NEW_GOAL_TEXT }));
    expect(store.summary("wf-9zq4m")?.title).toBe("Keyboard cheat sheet");
    store.applyDisk(diskWith({}));
    stop();
    expect(store.summary("wf-9zq4m")).toBeUndefined();
    expect(events.filter((e) => e.event === "delta")).toHaveLength(2);
  });

  test("edits made in the browser stay when another file changes on disk", async () => {
    await server.writeFile({ path: NEW_GOAL, text: NEW_GOAL_TEXT });
    store.applyDisk(
      diskWith({
        "glossary.md": `${SAMPLE.text["glossary.md"]}\n## gizmo\n- kind: term\n- means: A thing in a test.\n`,
      }),
    );
    expect(store.summary("wf-9zq4m")).toBeDefined();
    expect((await server.glossary()).some((t) => t.term === "gizmo")).toBe(true);
  });

  test("a changed preview list re-derives the diagrams", async () => {
    store.setArchify(true);
    const ready = async () => (await server.issue("wf-skf01")).diagrams[0].status;
    expect(await ready()).toBe("ready");
    store.applyDisk({ ...SAMPLE, previews: [] });
    expect(await ready()).toBe("unavailable");
    store.applyDisk({ ...SAMPLE });
    expect(await ready()).toBe("ready");
  });
});
