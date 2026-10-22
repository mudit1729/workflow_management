// Every Op and every scripted live event is a minimal text edit of the workspace files. Each
// test runs the Op through the mock server, then reads the files back: the line diff is the
// whole change, no other file moved, and the API shows what the Op means.
import { beforeEach, describe, expect, test } from "vitest";
import type { IssueDetail } from "@/gen/types";
import { EVENT_TARGETS, SCRIPT } from "./events";
import { lineDiff } from "./md/test-support";
import { createMockServer, type MockServer } from "./server";
import type { Store } from "./store";

let server: MockServer;
let store: Store;

beforeEach(() => {
  server = createMockServer({ latency: 0 });
  store = server.store;
});

// ---------------------------------------------------------------- helpers

const ID = "wf-3k9x2";

/** Every text file of the working copy. */
function texts(): Map<string, string> {
  return new Map(
    store
      .paths()
      .flatMap((p) => (store.text(p) === undefined ? [] : [[p, store.text(p) as string]])),
  );
}

/** What an action changed: the files that differ, each with its line diff. */
async function changed(run: () => Promise<unknown> | unknown) {
  const before = texts();
  await run();
  const after = texts();
  const out: Record<string, { removed: string[]; added: string[] } | "created" | "deleted"> = {};
  for (const [p, t] of after) {
    const was = before.get(p);
    if (was === undefined) out[p] = "created";
    else if (was !== t) out[p] = lineDiff(was, t);
  }
  for (const p of before.keys()) if (!after.has(p)) out[p] = "deleted";
  return out;
}

const goalPath = (id = ID) => store.filePath(id, "goal.md");
const planPath = (id = ID) => store.filePath(id, "plan.md");
const statePath = (id = ID) => store.filePath(id, "current_state.md");

const detail = (id = ID) => server.issue(id);
const tasksOf = (d: IssueDetail) => d.plan?.phases.flatMap((p) => p.tasks) ?? [];

// ---------------------------------------------------------------- the Ops

describe("each Op is a minimal file edit", () => {
  test("set_status flips one line of goal.md", async () => {
    const d = await detail();
    const diff = await changed(() =>
      server.ops({
        op: "set_status",
        base_rev: d.summary.status_ref.rev,
        issue: ID,
        status: "review",
      }),
    );
    expect(diff).toEqual({
      [goalPath()]: { removed: ["status: in_progress"], added: ["status: review"] },
    });
    expect((await detail()).summary.status).toBe("review");
    expect((await server.snapshot()).issues.find((i) => i.id === ID)?.status).toBe("review");
  });

  test("set_status with force writes the same line", async () => {
    const d = await detail("wf-ss0lo");
    const diff = await changed(() =>
      server.ops({
        op: "set_status",
        base_rev: d.summary.status_ref.rev,
        issue: "wf-ss0lo",
        status: "done",
        force: true,
      }),
    );
    expect(diff).toEqual({
      [goalPath("wf-ss0lo")]: { removed: ["status: backlog"], added: ["status: done"] },
    });
  });

  test("a refused move writes nothing", async () => {
    const d = await detail("wf-ss0lo");
    const diff = await changed(() =>
      server
        .ops({
          op: "set_status",
          base_rev: d.summary.status_ref.rev,
          issue: "wf-ss0lo",
          status: "done",
        })
        .catch(() => undefined),
    );
    expect(diff).toEqual({});
  });

  test("toggle_criterion ticks one checkbox", async () => {
    const d = await detail();
    const sc4 = d.criteria.find((c) => c.id === "SC-4");
    const diff = await changed(() =>
      server.ops({
        op: "toggle_criterion",
        base_rev: sc4?.edit.rev ?? "",
        issue: ID,
        id: "SC-4",
        checked: true,
      }),
    );
    const entry = diff[goalPath()];
    expect(entry).not.toBe("created");
    if (typeof entry === "string") throw new Error("expected a line diff");
    expect(entry.removed).toHaveLength(1);
    expect(entry.added).toHaveLength(1);
    expect(entry.removed[0]).toMatch(/^- \[ \] SC-4: /);
    expect(entry.added[0]).toBe(entry.removed[0].replace("- [ ]", "- [x]"));
    expect(Object.keys(diff)).toEqual([goalPath()]);
    expect((await detail()).criteria.find((c) => c.id === "SC-4")?.state).toBe("claimed");
  });

  test("unticking a verified criterion drops its evidence lines", async () => {
    const d = await detail();
    const sc1 = d.criteria.find((c) => c.id === "SC-1");
    expect(sc1?.state).toBe("verified");
    const diff = await changed(() =>
      server.ops({
        op: "toggle_criterion",
        base_rev: sc1?.edit.rev ?? "",
        issue: ID,
        id: "SC-1",
        checked: false,
      }),
    );
    const entry = diff[goalPath()];
    if (typeof entry === "string" || !entry) throw new Error("expected a line diff");
    expect(entry.added).toHaveLength(1);
    expect(entry.added[0]).toMatch(/^- \[ \] SC-1: /);
    expect(entry.removed.filter((l) => l.startsWith("  - evidence:"))).toHaveLength(1);
    expect(entry.removed.filter((l) => l.startsWith("  - verified_by:"))).toHaveLength(1);
    expect((await detail()).criteria.find((c) => c.id === "SC-1")?.state).toBe("open");
  });

  test("set_task_status to in_progress claims the task in plan.md", async () => {
    const d = await detail();
    const t4 = tasksOf(d).find((t) => t.id === "T-4");
    const diff = await changed(() =>
      server.ops({
        op: "set_task_status",
        base_rev: t4?.edit.rev ?? "",
        issue: ID,
        task: "T-4",
        status: "in_progress",
      }),
    );
    expect(Object.keys(diff)).toEqual([planPath()]);
    const entry = diff[planPath()];
    if (typeof entry === "string") throw new Error("expected a line diff");
    expect(entry.removed).toEqual(["- status: todo"]);
    expect(entry.added[0]).toBe("- status: in_progress");
    expect(entry.added.slice(1).map((l) => l.split(":")[0])).toEqual([
      "- claimed_by",
      "- lease_until",
    ]);
    const after = tasksOf(await detail()).find((t) => t.id === "T-4");
    expect(after).toMatchObject({ status: "in_progress", claimed_by: "shruti", lease: "live" });
  });

  test("set_task_status back to todo releases the claim", async () => {
    const d = await detail();
    const t3 = tasksOf(d).find((t) => t.id === "T-3");
    expect(t3?.claimed_by).toBeTruthy();
    const diff = await changed(() =>
      server.ops({
        op: "set_task_status",
        base_rev: t3?.edit.rev ?? "",
        issue: ID,
        task: "T-3",
        status: "todo",
      }),
    );
    const entry = diff[planPath()];
    if (typeof entry === "string" || !entry) throw new Error("expected a line diff");
    expect(entry.added).toEqual(["- status: todo"]);
    expect(entry.removed.map((l) => l.split(":")[0])).toEqual([
      "- status",
      "- claimed_by",
      "- lease_until",
    ]);
    expect(tasksOf(await detail()).find((t) => t.id === "T-3")).toMatchObject({
      status: "todo",
      claimed_by: undefined,
    });
  });

  test("toggle_step ticks one step", async () => {
    const d = await detail();
    const step = tasksOf(d).find((t) => t.id === "T-3")?.steps[1];
    const diff = await changed(() =>
      server.ops({
        op: "toggle_step",
        base_rev: step?.edit.rev ?? "",
        issue: ID,
        task: "T-3",
        index: 2,
        checked: true,
      }),
    );
    const entry = diff[planPath()];
    if (typeof entry === "string" || !entry) throw new Error("expected a line diff");
    expect(entry.removed).toHaveLength(1);
    expect(entry.added).toEqual(entry.removed.map((l) => l.replace("- [ ]", "- [x]")));
    expect(Object.keys(diff)).toHaveLength(1);
  });

  test("answer_request ticks the request and adds who answered and when", async () => {
    const item = (await server.snapshot()).inbox.find((i) => i.id === "Q-4m2pz");
    const diff = await changed(() =>
      server.ops({
        op: "answer_request",
        base_rev: item?.edit.rev ?? "",
        issue: ID,
        id: "Q-4m2pz",
        answer: "approve",
      }),
    );
    expect(Object.keys(diff)).toEqual([statePath()]);
    const entry = diff[statePath()];
    if (typeof entry === "string") throw new Error("expected a line diff");
    // The empty `answer:` line gives way to the answer; two lines are added after it.
    expect(entry.removed).toHaveLength(2);
    expect(entry.removed[0]).toMatch(/^- \[ \] Q-4m2pz: /);
    expect(entry.removed[1].trim()).toBe("- answer:");
    expect(entry.added[0]).toMatch(/^- \[x\] Q-4m2pz: /);
    expect(entry.added.slice(1).map((l) => l.trim().split(":")[0])).toEqual([
      "- answer",
      "- answered_by",
      "- answered_at",
    ]);
    expect(entry.added).toContain("  - answer: approve");
    expect(entry.added).toContain("  - answered_by: @shruti");
  });

  test("promote writes a library draft and a review request, and nothing else", async () => {
    const before = await detail();
    const learning = before.learnings.find((l) => l.promote === "candidate" && !l.promoted_to);
    const diff = await changed(() =>
      server.ops({
        op: "promote",
        base_rev: "x",
        issue: ID,
        entry: learning?.id ?? "",
        kind: "pattern",
      }),
    );
    const paths = Object.keys(diff);
    expect(paths).toHaveLength(2);
    expect(paths).toContain(statePath());
    const lib = paths.find((p) => p.startsWith("library/"));
    expect(lib).toMatch(/^library\/patterns\/[a-z0-9-]+\.md$/);
    expect(diff[lib as string]).toBe("created");
    const state = diff[statePath()];
    if (typeof state === "string") throw new Error("expected a line diff");
    expect(state.removed).toEqual([]);
    expect(state.added.join("\n")).toMatch(/Review the draft/);
    // The draft is a file: its text carries the backlink to the entry.
    expect(store.text(lib as string)).toContain(`[[${ID}#${learning?.id}]]`);
    expect((await server.snapshot()).library.some((l) => l.path === lib)).toBe(true);
  });

  test("approve_library edits the item and closes the review request", async () => {
    const promoted = await server.ops({
      op: "promote",
      base_rev: "x",
      issue: ID,
      entry: (await detail()).learnings.find((l) => l.promote === "candidate" && !l.promoted_to)
        ?.id as string,
      kind: "pattern",
    });
    const libId = promoted.created as string;
    const item = await server.libraryItem(libId);
    const diff = await changed(() =>
      server.ops({ op: "approve_library", base_rev: item.edit.rev, id: libId }),
    );
    expect(Object.keys(diff).sort()).toEqual([item.edit.file, statePath()].sort());
    const lib = diff[item.edit.file];
    if (typeof lib === "string") throw new Error("expected a line diff");
    expect(lib.removed).toContain("status: draft");
    expect(lib.added).toContain("status: reviewed");
    expect(lib.added.some((l) => l.startsWith("reviewed_by:"))).toBe(true);
    const state = diff[statePath()];
    if (typeof state === "string") throw new Error("expected a line diff");
    expect(state.added.some((l) => /^- \[x\] Q-/.test(l))).toBe(true);
    const after = (await detail()).state?.needs_you.find((r) => r.ref === `[[${libId}]]`);
    expect(after).toMatchObject({ answered: true, answer: "approve", answered_by: "shruti" });
  });

  test("new_issue creates one goal.md", async () => {
    const snap = await server.snapshot();
    const web = snap.groups.children[0].children.find((g) => g.slug === "web");
    const diff = await changed(() =>
      server.ops({
        op: "new_issue",
        base_rev: snap.rev,
        group: web?.id ?? "",
        slug: "retry-button",
        title: "Add a retry button",
        template: "bug",
        size: "s",
      }),
    );
    expect(diff).toEqual({ [`${web?.path}/retry-button/goal.md`]: "created" });
    const text = store.text(`${web?.path}/retry-button/goal.md`) ?? "";
    expect(text).toMatch(/^---\nid: wf-[0-9a-z]{5}\ntitle: Add a retry button\nstatus: backlog\n/);
    expect(text).toContain("size: s");
    expect(text).toContain("labels: [bug]");
    expect((await server.snapshot()).issues.some((i) => i.title === "Add a retry button")).toBe(
      true,
    );
  });

  test("new_group creates one _group.md under its parent", async () => {
    const snap = await server.snapshot();
    const parent = snap.groups.children[0];
    const diff = await changed(() =>
      server.ops({
        op: "new_group",
        base_rev: snap.rev,
        parent: parent.id,
        slug: "ops",
        title: "Ops",
        color: 6,
      }),
    );
    expect(diff).toEqual({ [`${parent.path}/ops/_group.md`]: "created" });
    const text = store.text(`${parent.path}/ops/_group.md`) ?? "";
    expect(text).toContain("title: Ops");
    expect(text).toContain("color: 6");
  });

  test("the activity of a move feeds last_activity but is not in any file", async () => {
    const d = await detail();
    await server.ops({
      op: "set_status",
      base_rev: d.summary.status_ref.rev,
      issue: ID,
      status: "review",
    });
    const last = (await detail()).summary.last_activity;
    expect(last).toMatchObject({ kind: "status", author: "shruti", title: "In progress → Review" });
    for (const text of texts().values()) expect(text).not.toContain("In progress → Review");
    // `reset` forgets it with the rest of the session.
    server.controls.reset();
    expect((await detail()).summary.last_activity?.kind).not.toBe("status");
  });
});

// ---------------------------------------------------------------- the live events

describe("each scripted event is a minimal file edit", () => {
  /** The files each event changes, in the order SCRIPT lists the events. */
  const EXPECTED: (() => string[])[] = [
    () => [store.filePath("wf-3k9x2", "changes.md"), store.filePath("wf-3k9x2", "plan.md")],
    () => [store.filePath("wf-3k9x2", "current_state.md")],
    () => [store.filePath("wf-x5hd3", "current_state.md")],
    () => [store.filePath("wf-skf01", "plan.md")],
    () => [store.filePath("wf-h2tb7", "goal.md")],
    () => [store.filePath("wf-t3jp5", "goal.md"), store.filePath("wf-t3jp5", "changes.md")],
    () => [store.filePath("wf-skf01", "decisions.md")],
    () => [store.filePath("wf-y4bz7", "current_state.md")],
  ];

  test("the eight events change the files they name and no others", async () => {
    for (let i = 0; i < SCRIPT.length; i++) {
      const diff = await changed(() => {
        expect(server.playNext(), `event ${i + 1}`).toBe(SCRIPT[i].name);
      });
      expect(Object.keys(diff).sort(), SCRIPT[i].name).toEqual(EXPECTED[i]().sort());
    }
  });

  test("an event appends: nothing in the files is rewritten", async () => {
    const diff = await changed(() => server.playNext());
    const entry = diff[store.filePath("wf-3k9x2", "changes.md")];
    if (typeof entry === "string" || !entry) throw new Error("expected a line diff");
    expect(entry.removed).toEqual([]);
    expect(
      entry.added.some((l) => /^## \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+05:30 @codex /.test(l)),
    ).toBe(true);
    const plan = diff[store.filePath("wf-3k9x2", "plan.md")];
    if (typeof plan === "string" || !plan) throw new Error("expected a line diff");
    expect(plan.removed).toHaveLength(1);
    expect(plan.added).toEqual(plan.removed.map((l) => l.replace("- [ ]", "- [x]")));
  });

  test("the loop replays twice and every file still reads without an error finding", async () => {
    for (let i = 0; i < 2 * SCRIPT.length; i++) server.playNext();
    const snap = await server.snapshot();
    for (const issue of snap.issues) {
      const d = await server.issue(issue.id);
      const broken = d.diagnostics.filter(
        (x) => /^F00[1-5]$/.test(x.rule) && issue.id !== "wf-7yq2m",
      );
      expect(broken, issue.id).toEqual([]);
    }
    expect(snap.issues).toHaveLength(26);
    const t = EVENT_TARGETS;
    expect(store.text(store.filePath(t.rewriteState, "current_state.md"))).toContain("claude-opus");
  });
});
