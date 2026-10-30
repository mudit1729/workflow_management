// The shipped workspace (`mock/workspace`): six groups, the library, the glossary and no issues,
// and the controls that move between it and the sample world (`mock/sample`): `loadSample()`,
// `reset()` and the counted `holdSample()` the Kit uses.
import { describe, expect, test } from "vitest";
import type { ServerEvent, WorkspaceSnapshot } from "@/gen/types";
import { EVENT_TARGETS, SCRIPT } from "./events";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";
import { createStore, type Store } from "./store";
import type { WorkspaceDisk } from "./workspace-bus";
import { DISK } from "./workspace-files";

const NOW = Date.now();

/** A store on the real shipped files and the real sample files. */
const shipped = () => createStore({ clock: () => NOW, disk: DISK, sample: SAMPLE });
const server = (): MockServer =>
  createMockServer({ latency: 0, disk: DISK, sample: SAMPLE, clock: () => NOW });

const SAMPLE_ISSUES = 26;
const GROUPS = ["wf", "core", "web", "skills", "platform", "auth"];

function groupTitles(s: WorkspaceSnapshot): string[] {
  const out: string[] = [];
  const walk = (n: WorkspaceSnapshot["groups"]) => {
    for (const c of n.children) {
      out.push(c.title);
      walk(c);
    }
  };
  walk(s.groups);
  return out;
}

/** Every text of a store, to compare two working copies exactly. */
const textsOf = (store: Store) => Object.fromEntries(store.paths().map((p) => [p, store.text(p)]));

function record(s: Store): { events: ServerEvent[]; stop: () => void } {
  const events: ServerEvent[] = [];
  return { events, stop: s.subscribe((e) => events.push(e)) };
}

// ---------------------------------------------------------------- what ships

describe("the shipped workspace", () => {
  test("loads with no issues, six groups, the library and the glossary", () => {
    const store = shipped();
    const snap = store.derived.snapshot;
    expect(snap.issues).toEqual([]);
    expect(snap.inbox).toEqual([]);
    expect([...groupTitles(snap)].sort()).toEqual([...GROUPS].sort());
    expect(snap.groups.rollup.issues).toBe(0);
    expect(snap.groups.rollup.percent).toBe(0);
    expect(snap.library).toHaveLength(10);
    expect(store.world.glossary.length).toBeGreaterThan(10);
    expect(snap.authors.length).toBeGreaterThan(3);
    expect(snap.config.name).toBe("wf");
    expect(store.sampleLoaded).toBe(false);
  });

  test("every group rolls up to zero", () => {
    const walk = (n: WorkspaceSnapshot["groups"]): number => {
      expect(n.rollup.issues, n.title).toBe(0);
      expect(n.issue_ids, n.title).toEqual([]);
      return 1 + n.children.reduce((sum, c) => sum + walk(c), 0);
    };
    // The implicit root plus the six groups.
    expect(walk(shipped().derived.snapshot.groups)).toBe(GROUPS.length + 1);
  });

  test("the only findings are dangling references from library items to sample issues", () => {
    // 18 × F009 (warn): each of the ten library items points at an entry of a sample issue
    // (`[[wf-3k9x2#D-7f3k2]]` and so on) that the empty workspace does not hold. Plus one Q013
    // (info): `splice-one-value-span` has a review overdue since 2026-10-25. No F-error.
    const store = shipped();
    const snap = store.derived.snapshot;
    expect(snap.diagnostics_count).toEqual({ error: 0, warn: 18, info: 1 });
    const found = [...store.derived.library.values()].flatMap((l) => l.diagnostics);
    expect(found.filter((x) => x.severity === "error")).toEqual([]);
    const f009 = found.filter((x) => x.rule === "F009");
    expect(f009).toHaveLength(18);
    expect(f009.every((x) => x.file.startsWith("library/"))).toBe(true);
    expect(found.filter((x) => x.rule !== "F009").map((x) => x.rule)).toEqual(["Q013"]);
    // The loader finds nothing else: groups, authors, glossary and config are clean.
    expect(
      Object.entries(store.source.diagnostics)
        .filter(([path]) => !path.startsWith("library/"))
        .flatMap(([, list]) => list),
    ).toEqual([]);
  });

  test("a new issue written into it appears on the board", async () => {
    const s = server();
    const snap = await s.snapshot();
    const web = snap.groups.children[0].children.find((g) => g.slug === "web");
    expect(web).toBeDefined();
    const result = await s.ops({
      op: "new_issue",
      base_rev: snap.rev,
      group: web?.id ?? "",
      slug: "first-issue",
      title: "First issue",
      template: "default",
    });
    expect(result.rev).not.toBe(snap.rev);
    const after = await s.snapshot();
    expect(after.issues.map((i) => i.title)).toEqual(["First issue"]);
    expect(after.groups.rollup.issues).toBe(1);
    expect(s.store.text("issues/wf/web/first-issue/goal.md")).toMatch(/^---\nid: wf-/);
  });

  test("a new group and an issue in it work end to end", async () => {
    const s = server();
    const snap = await s.snapshot();
    await s.ops({
      op: "new_group",
      base_rev: snap.rev,
      parent: snap.groups.id,
      slug: "ops",
      title: "Ops",
      color: 6,
    });
    const mid = await s.snapshot();
    const ops = mid.groups.children.find((g) => g.slug === "ops");
    expect(ops?.title).toBe("Ops");
    await s.ops({
      op: "new_issue",
      base_rev: mid.rev,
      group: ops?.id ?? "",
      slug: "pager-rota",
      title: "Pager rota",
      template: "default",
    });
    const after = await s.snapshot();
    expect(after.issues).toHaveLength(1);
    expect(after.groups.children.find((g) => g.slug === "ops")?.rollup.issues).toBe(1);
  });

  test("a goal.md saved through the file API appears too", async () => {
    const s = server();
    const snap = await s.snapshot();
    const web = snap.groups.children[0].children.find((g) => g.slug === "web");
    const text = `---\nid: wf-n4wk7\ntitle: Hand written\nstatus: backlog\ngroup: ${web?.id}\n---\n\n## Goal\n\nSay it.\n`;
    await s.writeFile({ path: "issues/wf/web/hand-written/goal.md", text });
    expect((await s.snapshot()).issues.map((i) => i.id)).toEqual(["wf-n4wk7"]);
  });
});

// ---------------------------------------------------------------- the live events

describe("the scripted live events on a workspace without their issues", () => {
  test("every event is skipped without a sound", () => {
    const store = shipped();
    const s = server();
    const { events, stop } = record(s.store);
    for (let i = 0; i < SCRIPT.length * 2; i++) expect(s.playNext()).toBeUndefined();
    expect(s.controls.playNextEvent()).toBeUndefined();
    stop();
    // No edit, no delta, no activity line, no toast source: the ring stays as it was.
    expect(events).toEqual([]);
    expect(s.store.events().filter((e) => e.event !== "resync")).toEqual([]);
    expect(textsOf(s.store)).toEqual(textsOf(store));
  });

  test("the targets exist only in the sample", () => {
    const ids = [
      EVENT_TARGETS.appendChange.issue,
      EVENT_TARGETS.rewriteState,
      EVENT_TARGETS.newBlockingQuestion,
      EVENT_TARGETS.leaseExpires.issue,
      EVENT_TARGETS.moveToReview,
      EVENT_TARGETS.markBlocked.issue,
      EVENT_TARGETS.appendDecision,
      EVENT_TARGETS.answerFyi.issue,
    ];
    const empty = shipped();
    const full = shipped();
    full.loadSample();
    for (const id of ids) {
      expect(empty.summary(id), id).toBeUndefined();
      expect(full.summary(id), id).toBeDefined();
    }
  });

  test("they play again once the sample is loaded", () => {
    const s = server();
    expect(s.controls.playNextEvent()).toBeUndefined();
    s.controls.loadSample();
    expect(s.controls.playNextEvent()).toBe(SCRIPT[0].name);
  });
});

// ---------------------------------------------------------------- loadSample and reset

describe("loadSample() and reset()", () => {
  test("loadSample brings the 26 sample issues and reset round-trips to empty", async () => {
    const s = server();
    const before = textsOf(s.store);
    const emptyBoard = await s.snapshot();

    expect(s.controls.loadSample()).toBe(SAMPLE_ISSUES);
    const full = await s.snapshot();
    expect(full.issues).toHaveLength(SAMPLE_ISSUES);
    expect(s.store.sampleLoaded).toBe(true);
    expect(full.issues.some((i) => i.id === "wf-3k9x2")).toBe(true);
    expect(full.inbox.length).toBeGreaterThan(0);

    s.controls.reset();
    expect(s.store.sampleLoaded).toBe(false);
    expect(textsOf(s.store)).toEqual(before);
    const back = await s.snapshot();
    expect(back.issues).toEqual([]);
    expect(back.groups).toEqual(emptyBoard.groups);
    expect(back.library).toEqual(emptyBoard.library);
    expect(back.inbox).toEqual([]);
    expect(back.diagnostics_count).toEqual(emptyBoard.diagnostics_count);
  });

  test("the sample world is the issues of mock/sample, every group included", async () => {
    const s = server();
    s.controls.loadSample();
    const snap = await s.snapshot();
    // `docs` is an implicit group of the sample (a folder without _group.md).
    expect([...groupTitles(snap)].sort()).toEqual([...GROUPS, "docs"].sort());
    expect(snap.library).toHaveLength(10);
    expect(snap.diagnostics_count.error).toBeGreaterThan(0);
  });

  test("it is one commit: one resync, no delta, no activity per file", () => {
    const store = shipped();
    const { events, stop } = record(store);
    store.loadSample();
    stop();
    expect(events.map((e) => e.event)).toEqual(["resync"]);
    expect(events[0].id).toBe(store.rev);
  });

  test("reset is one resync too", () => {
    const store = shipped();
    store.loadSample();
    const { events, stop } = record(store);
    store.reset();
    stop();
    expect(events.map((e) => e.event)).toEqual(["resync"]);
  });

  test("it keeps nothing of the previous working copy", async () => {
    const s = server();
    const snap = await s.snapshot();
    const web = snap.groups.children[0].children.find((g) => g.slug === "web");
    await s.ops({
      op: "new_issue",
      base_rev: snap.rev,
      group: web?.id ?? "",
      slug: "mine",
      title: "Mine",
      template: "default",
    });
    await s.writeFile({ path: "notes-of-mine.md", text: "# Mine\n" });
    expect(s.store.text("notes-of-mine.md")).toBeDefined();

    s.controls.loadSample();
    expect(s.store.text("notes-of-mine.md")).toBeUndefined();
    expect((await s.snapshot()).issues.some((i) => i.title === "Mine")).toBe(false);
    expect((await s.snapshot()).issues).toHaveLength(SAMPLE_ISSUES);

    s.controls.reset();
    expect(s.store.text("notes-of-mine.md")).toBeUndefined();
    expect((await s.snapshot()).issues).toEqual([]);
  });

  test("an edit of the sample is gone after reset, and loadSample starts it over", async () => {
    const s = server();
    s.controls.loadSample();
    const pristine = textsOf(s.store);
    await s.ops({
      op: "set_status",
      base_rev: (await s.snapshot()).issues.find((i) => i.id === "wf-3k9x2")?.status_ref.rev ?? "",
      issue: "wf-3k9x2",
      status: "review",
    });
    expect(textsOf(s.store)).not.toEqual(pristine);
    expect(s.controls.loadSample()).toBe(SAMPLE_ISSUES);
    expect(textsOf(s.store)).toEqual(pristine);
  });

  test("loadSample forgets an armed conflict", async () => {
    const s = server();
    s.controls.conflictNextWrite();
    s.controls.loadSample();
    const snap = await s.snapshot();
    await expect(
      s.ops({
        op: "set_status",
        base_rev: snap.issues.find((i) => i.id === "wf-3k9x2")?.status_ref.rev ?? "",
        issue: "wf-3k9x2",
        status: "review",
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------- the files on disk

describe("files that change on disk", () => {
  const withGroupGoal = (disk: WorkspaceDisk, goal: string): WorkspaceDisk => ({
    ...disk,
    text: { ...disk.text, "issues/wf/_group.md": goal },
  });

  test("a change to the shipped files waits while the sample is loaded", () => {
    const store = shipped();
    store.loadSample();
    const group = DISK.text["issues/wf/_group.md"] as string;
    const next = withGroupGoal(DISK, group.replace("Build wf v1", "Build wf v2"));
    expect(store.applyDisk(next)).toBe(false);
    expect(store.text("issues/wf/_group.md")).toBe(SAMPLE.text["issues/wf/_group.md"]);
    store.reset();
    expect(store.text("issues/wf/_group.md")).toContain("Build wf v2");
  });

  test("a change to the sample files reaches the mock only while the sample is loaded", () => {
    const store = shipped();
    const group = SAMPLE.text["issues/wf/_group.md"] as string;
    const next = withGroupGoal(SAMPLE, group.replace("Build wf v1", "Build wf v2"));
    // Not loaded: kept for the next "Load sample data".
    expect(store.applySample(next)).toBe(false);
    expect(store.text("issues/wf/_group.md")).toContain("Build wf v1");
    store.loadSample();
    expect(store.text("issues/wf/_group.md")).toContain("Build wf v2");
    // Loaded: applied as one commit with the activity of a disk edit.
    const again = withGroupGoal(SAMPLE, group.replace("Build wf v1", "Build wf v3"));
    expect(store.applySample(again)).toBe(true);
    expect(store.text("issues/wf/_group.md")).toContain("Build wf v3");
  });
});

// ---------------------------------------------------------------- the Kit hold

describe("holdSample() keeps the working copy for the Kit", () => {
  /** An empty workspace with edits of its own: a new file and a changed group. */
  function edited(): Store {
    const store = shipped();
    store.applyChanges(
      [
        { path: "notes-of-mine.md", text: "# Mine\n" },
        {
          path: "issues/wf/web/mine/goal.md",
          text: "---\nid: wf-m1n3e\ntitle: Mine\nstatus: backlog\n---\n\n## Goal\n\nKeep me.\n",
        },
      ],
      "shruti",
      "file",
    );
    return store;
  }

  test("shows the sample while held and gives the working copy back exactly", () => {
    const store = edited();
    const before = textsOf(store);
    expect(store.derived.snapshot.issues.map((i) => i.id)).toEqual(["wf-m1n3e"]);

    const release = store.holdSample();
    expect(store.sampleLoaded).toBe(true);
    expect(store.derived.snapshot.issues).toHaveLength(SAMPLE_ISSUES);
    expect(store.text("notes-of-mine.md")).toBeUndefined();

    release();
    expect(store.sampleLoaded).toBe(false);
    expect(textsOf(store)).toEqual(before);
    expect(store.derived.snapshot.issues.map((i) => i.id)).toEqual(["wf-m1n3e"]);
    expect(store.summary("wf-m1n3e")?.title).toBe("Mine");
  });

  test("hands the file history back too, so a stale rev still conflicts", () => {
    const store = edited();
    const rev = store.pathRev("notes-of-mine.md");
    const release = store.holdSample();
    release();
    expect(store.pathRev("notes-of-mine.md")).toBe(rev);
    expect(() => store.guardFile("notes-of-mine.md", rev)).not.toThrow();
  });

  test("nested and repeated holds count: the copy comes back once, after the last release", () => {
    const store = edited();
    const before = textsOf(store);
    const a = store.holdSample();
    const b = store.holdSample();
    // The second hold does not load the sample again, and does not save the sample as "mine".
    expect(store.sampleLoaded).toBe(true);
    a();
    expect(store.sampleLoaded).toBe(true);
    expect(store.derived.snapshot.issues).toHaveLength(SAMPLE_ISSUES);
    b();
    expect(store.sampleLoaded).toBe(false);
    expect(textsOf(store)).toEqual(before);

    // Again, as a remount (StrictMode) does: hold, release, hold, release.
    const c = store.holdSample();
    c();
    const d = store.holdSample();
    d();
    expect(textsOf(store)).toEqual(before);
  });

  test("releasing twice does nothing the second time", () => {
    const store = edited();
    const before = textsOf(store);
    const a = store.holdSample();
    const b = store.holdSample();
    a();
    a();
    // `a` released twice must not drop `b`'s hold.
    expect(store.sampleLoaded).toBe(true);
    b();
    expect(textsOf(store)).toEqual(before);
    b();
    expect(textsOf(store)).toEqual(before);
  });

  test("the edits made in the Kit are discarded; Reset inside the Kit gives the pristine sample", () => {
    const store = edited();
    const before = textsOf(store);
    const release = store.holdSample();
    const pristine = textsOf(store);
    store.applyChanges([{ path: "kit-scratch.md", text: "x" }], "shruti", "file");
    expect(store.text("kit-scratch.md")).toBe("x");
    store.reset();
    expect(store.sampleLoaded).toBe(true);
    expect(textsOf(store)).toEqual(pristine);
    release();
    expect(store.text("kit-scratch.md")).toBeUndefined();
    expect(textsOf(store)).toEqual(before);
  });

  test("a sample the user loaded comes back with its edits", () => {
    const store = shipped();
    store.loadSample();
    store.applyChanges([{ path: "notes-of-mine.md", text: "# Mine\n" }], "shruti", "file");
    const before = textsOf(store);
    const release = store.holdSample();
    expect(store.text("notes-of-mine.md")).toBeUndefined();
    release();
    expect(store.sampleLoaded).toBe(true);
    expect(textsOf(store)).toEqual(before);
  });

  test("clients are asked to read again on the way in and the way out", () => {
    const store = edited();
    const { events, stop } = record(store);
    const release = store.holdSample();
    release();
    stop();
    expect(events.map((e) => e.event)).toEqual(["resync", "resync"]);
  });

  test("files that changed on disk during the hold are applied after the restore", () => {
    const store = edited();
    const release = store.holdSample();
    const group = DISK.text["issues/wf/_group.md"] as string;
    store.applyDisk({
      ...DISK,
      text: { ...DISK.text, "issues/wf/_group.md": group.replace("Build wf v1", "Build wf v2") },
    });
    release();
    expect(store.text("issues/wf/_group.md")).toContain("Build wf v2");
    expect(store.text("notes-of-mine.md")).toBe("# Mine\n");
  });

  test("the server control wraps it and resets the player", () => {
    const s = server();
    const release = s.controls.holdSample();
    expect(s.controls.playNextEvent()).toBe(SCRIPT[0].name);
    release();
    expect(s.store.sampleLoaded).toBe(false);
    expect(s.controls.playNextEvent()).toBeUndefined();
  });
});

describe("clock", () => {
  test("the shipped workspace keeps real times; only the sample moves to the clock", () => {
    const store = shipped();
    expect(store.shiftMs).toBe(0);
    // A skill writes a log entry at the real time: the board shows that time, not a shifted one.
    const path = "README.md";
    const stamped = `${DISK.text[path]}\n<!-- written 2026-10-30T14:20+00:00 -->\n`;
    store.applyDisk({ ...DISK, text: { ...DISK.text, [path]: stamped } });
    expect(store.text(path)).toBe(stamped);
    store.loadSample();
    expect(store.shiftMs).not.toBe(0);
  });
});
