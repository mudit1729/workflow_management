// "Do next step" (plan D4): a simulated run whose phases are real markdown edits through the
// store, a fake commit and a fake CI run. Fake timers drive the clock, so a 6 s run takes no time.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { IssueDetail, ServerEvent } from "@/gen/types";
import { ApiError, NotFoundError } from "@/lib/api/error";
import type { CodexRun } from "@/lib/api/types";
import { type CodexEvent, NOTHING_READY, PHASE_MS, pastTense } from "./codex";
import { lineDiff } from "./md/test-support";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";
import type { Store } from "./store";

let server: MockServer;
let store: Store;

beforeEach(() => {
  // Before the server, so the store's clock is the fake one.
  vi.useFakeTimers();
  server = createMockServer({ latency: 0, disk: SAMPLE });
  store = server.store;
});

afterEach(() => {
  server.dispose();
  vi.useRealTimers();
});

const ID = "wf-3k9x2";
const planPath = (id = ID) => store.filePath(id, "plan.md");
const changesPath = (id = ID) => store.filePath(id, "changes.md");
const statePath = (id = ID) => store.filePath(id, "current_state.md");

// ---------------------------------------------------------------- helpers

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

/** Move the clock and let every timer and promise that is due run. */
const wait = (ms: number) => changed(() => vi.advanceTimersByTimeAsync(ms));

const task = (d: IssueDetail, id: string) => {
  const found = d.plan?.phases.flatMap((p) => p.tasks).find((t) => t.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

const states = (run: CodexRun) => run.phases.map((p) => `${p.id}:${p.state}`);

/** The first line of a diff that matches, so a test names the line it cares about. */
const line = (lines: string[] | undefined, re: RegExp) => lines?.find((l) => re.test(l));

// ---------------------------------------------------------------- one run, phase by phase

describe("a next_step run", () => {
  test("picks the next ready task and claims it at once", async () => {
    const before = await server.issue(ID);
    expect(task(before, "T-4").ready).toBe(true);

    const diff = await changed(async () => {
      const run = await server.startCodexRun(ID, "next_step");
      expect(run).toMatchObject({
        issue: ID,
        kind: "next_step",
        status: "running",
        by: "codex",
        task: "T-4",
        task_title: "Elect one leader tab over BroadcastChannel",
        phase: "claim",
      });
      expect(run.id).toMatch(/^run-[0-9a-hjkmnp-tv-z]{5}$/);
      expect(states(run)).toEqual([
        "claim:running",
        "log:pending",
        "verify:pending",
        "done:pending",
      ]);
      expect(run.phases.map((p) => p.label)).toEqual([
        "Claim T-4",
        "Log the change",
        "Run CI",
        "Finish T-4",
      ]);
    });

    // One file moves: the task is claimed by @codex with a lease. Nothing else.
    expect(Object.keys(diff)).toEqual([planPath()]);
    const d = diff[planPath()] as { removed: string[]; added: string[] };
    expect(d.removed).toEqual(["- status: todo"]);
    expect(d.added).toEqual([
      "- status: in_progress",
      "- claimed_by: @codex",
      expect.stringMatching(/^- lease_until: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+05:30$/),
    ]);
    const after = task(await server.issue(ID), "T-4");
    expect(after).toMatchObject({ status: "in_progress", claimed_by: "codex", lease: "live" });
  });

  test("log, verify and done follow about 2 s apart, each one a real edit", async () => {
    const run = await server.startCodexRun(ID, "next_step");
    const planBefore = store.text(planPath()) as string;

    // log: one change entry in changes.md, by @codex, in the past tense, with the task's files.
    const log = await wait(PHASE_MS);
    expect(Object.keys(log)).toEqual([changesPath()]);
    const added = (log[changesPath()] as { added: string[] }).added;
    expect(line(added, /^## /)).toMatch(
      /^## \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+05:30 @codex — Elected one leader tab over BroadcastChannel \{#C-[0-9a-hjkmnp-tv-z]{5}\}$/,
    );
    expect(added).toContain("- kind: progress");
    expect(added).toContain("- task: T-4");
    expect(added).toContain("- files: `web/src/lib/live/leader.ts`");
    expect(added).toContain("- model: gpt-5-codex");
    expect(added).toContain("Worked through 2 steps of T-4 in `web/src/lib/live/leader.ts`.");
    expect(states((await server.codexRuns(ID))[0])).toEqual([
      "claim:done",
      "log:running",
      "verify:pending",
      "done:pending",
    ]);

    // verify: the task goes to review, a CI run starts in progress, and then passes.
    const verify = await wait(PHASE_MS);
    expect(Object.keys(verify)).toEqual([planPath()]);
    expect(verify[planPath()]).toEqual({
      removed: ["- status: in_progress"],
      added: ["- status: review"],
    });
    const running = (await server.delivery(ID)).pipelines[0];
    expect(running).toMatchObject({
      id: expect.stringMatching(/^ci-\d+$/),
      workflow: "CI",
      trigger: "push",
      status: "in_progress",
      branch: `${ID}/elect-one-leader-tab-over-broadcastchannel`,
    });
    expect(running.conclusion).toBeUndefined();
    expect(running.jobs.map((j) => j.name)).toEqual(["typecheck", "biome", "vitest", "build"]);
    expect(running.jobs.every((j) => j.conclusion === undefined)).toBe(true);

    expect(await wait(PHASE_MS / 2)).toEqual({});
    const passed = (await server.delivery(ID)).pipelines[0];
    expect(passed).toMatchObject({ id: running.id, status: "completed", conclusion: "success" });
    expect(passed.duration_s).toBe(6 + 41 + 73 + 25);
    expect(passed.jobs.every((j) => j.conclusion === "success" && (j.duration_s ?? 0) > 0)).toBe(
      true,
    );

    // done: the steps are ticked, the task is done, the state moves on, a commit lands.
    const done = await wait(PHASE_MS / 2);
    expect(Object.keys(done).sort()).toEqual([planPath(), statePath()].sort());
    const plan = done[planPath()] as { removed: string[]; added: string[] };
    expect(plan.removed).toEqual([
      "- status: review",
      expect.stringMatching(/^- lease_until: /),
      "- [ ] Take the `wf-live` lock in each tab.",
      "- [ ] Relay events from the leader over `BroadcastChannel`.",
    ]);
    expect(plan.added).toEqual([
      "- status: done",
      "- [x] Take the `wf-live` lock in each tab.",
      "- [x] Relay events from the leader over `BroadcastChannel`.",
    ]);
    expect(store.text(planPath())).not.toBe(planBefore);

    const finalRun = (await server.codexRuns(ID))[0];
    expect(finalRun).toMatchObject({ id: run.id, status: "done", phase: "done" });
    expect(states(finalRun)).toEqual(["claim:done", "log:done", "verify:done", "done:done"]);
    expect(finalRun.finished_at).toBeDefined();
    expect(finalRun.pipeline).toBe(running.id);

    // The commit has the trailer, the subject of the task and the sha the CI run ran on.
    const { commits, pipelines } = await server.delivery(ID);
    expect(commits[0]).toEqual({
      sha: finalRun.commit,
      subject: "Elect one leader tab over BroadcastChannel",
      author: "codex",
      at: expect.stringMatching(/\d{2}:\d{2}:\d{2}\+05:30$/),
      branch: `${ID}/elect-one-leader-tab-over-broadcastchannel`,
      task: "T-4",
      files_changed: 1,
      trailer: `Issue: ${ID}`,
    });
    expect(commits[0].sha).toMatch(/^[0-9a-f]{7}$/);
    expect(pipelines[0].sha).toBe(commits[0].sha);
  });

  test("the edits land in order: claim, log, verify, done", async () => {
    const activity: string[] = [];
    server.subscribe((e: ServerEvent) => {
      if (e.event === "activity") activity.push(`${e.data.author}: ${e.data.title}`);
    });
    await server.startCodexRun(ID, "next_step");
    await wait(3 * PHASE_MS);
    expect(activity).toEqual([
      "codex: Claimed T-4",
      "codex: Elected one leader tab over BroadcastChannel",
      "codex: Moved T-4 to review",
      "codex: Finished T-4",
    ]);
  });

  test("the state file says what moved and what is next", async () => {
    await server.startCodexRun(ID, "next_step");
    const diff = await wait(3 * PHASE_MS);
    const state = (diff[statePath()] as { removed: string[]; added: string[] }).added.join("\n");
    expect(state).toContain('summary: "T-4 is done; no task is ready yet."');
    expect(state).toContain('updated_by: "@codex"');
    expect(state).toMatch(
      /- \[\[#T-4\]\] Elect one leader tab over BroadcastChannel\. See \[\[#C-/,
    );
    const detail = await server.issue(ID);
    expect(detail.state?.summary).toBe("T-4 is done; no task is ready yet.");
    expect(detail.state?.updated_by).toBe("codex");
    // The request that waits for the person stays.
    expect(detail.state?.needs_you.some((r) => r.id === "Q-4m2pz" && !r.answered)).toBe(true);
  });

  test("a finished run adds no lint finding the issue did not have", async () => {
    const rules = (d: IssueDetail) => d.diagnostics.map((x) => x.rule).sort();
    const before = rules(await server.issue(ID));
    await server.startCodexRun(ID, "next_step");
    await wait(3 * PHASE_MS);
    const after = await server.issue(ID);
    const left = [...before];
    for (const rule of rules(after)) {
      const at = left.indexOf(rule);
      expect(at, `new finding ${rule}`).toBeGreaterThanOrEqual(0);
      left.splice(at, 1);
    }
    // current_state.md caught up with the change entry, so Q005 is gone.
    expect(after.summary.signals.state_behind_changes).toBe(false);
  });

  test("a task that unlocks the next one points to it", async () => {
    // wf-t3jp5: T-1 done, T-2 in progress by @codex. Finishing T-2 unlocks T-3.
    const id = "wf-t3jp5";
    const before = await server.issue(id);
    expect(task(before, "T-3").status).toBe("todo");
    expect(task(before, "T-3").ready).toBe(false);
    // Hand the claim to the run: the person puts T-2 back in the queue.
    const snap = await server.snapshot();
    expect(snap.issues.find((i) => i.id === id)).toBeDefined();
    await server.ops({
      op: "set_task_status",
      base_rev: before.files_rev["plan.md"],
      issue: id,
      task: "T-2",
      status: "todo",
    });
    const run = await server.startCodexRun(id, "next_step");
    expect(run.task).toBe("T-2");
    await wait(3 * PHASE_MS);
    const after = await server.issue(id);
    expect(task(after, "T-2").status).toBe("done");
    expect(after.state?.summary).toBe("T-2 is done; T-3 is next.");
    expect(after.state?.next_steps[0]).toBe(
      "Start [[#T-3]] Name dropped sections at the bundle end.",
    );
    expect(task(after, "T-3").ready).toBe(true);
  });

  test("the live stream hears each move of the run and each change of the delivery data", async () => {
    const heard: string[] = [];
    server.subscribeCodex((e: CodexEvent) =>
      heard.push(e.event === "run" ? `run ${e.run.status}/${e.run.phase}` : "delivery"),
    );
    await server.startCodexRun(ID, "next_step");
    await wait(3 * PHASE_MS);
    expect(heard).toEqual([
      "run running/claim",
      "run running/log",
      "delivery", // the CI run starts
      "run running/verify",
      "delivery", // and passes
      "delivery", // the commit lands
      "run done/done",
    ]);
  });

  test("setPhaseMs speeds up the runs that start afterwards", async () => {
    server.controls.setCodexPhaseMs(100);
    await server.startCodexRun(ID, "next_step");
    await wait(300);
    expect((await server.codexRuns(ID))[0].status).toBe("done");
  });
});

// ---------------------------------------------------------------- nothing to do

describe("a run on every sample issue", () => {
  test("ends done or nothing_ready, adds no lint finding and leaves no timer", async () => {
    const snap = await server.snapshot();
    const rules = async (id: string) => (await server.issue(id)).diagnostics.map((d) => d.rule);
    const outcomes: Record<string, number> = {};
    for (const { id } of snap.issues) {
      const before = await rules(id);
      await server.startCodexRun(id, "next_step");
      await vi.advanceTimersByTimeAsync(3 * PHASE_MS + 10);
      const run = (await server.codexRuns(id))[0];
      expect(["done", "nothing_ready"], `${id}: ${run.status} ${run.reason ?? ""}`).toContain(
        run.status,
      );
      outcomes[run.status] = (outcomes[run.status] ?? 0) + 1;
      const left = [...before];
      for (const rule of await rules(id)) {
        const at = left.indexOf(rule);
        expect(at, `${id}: new finding ${rule}`).toBeGreaterThanOrEqual(0);
        left.splice(at, 1);
      }
    }
    expect(outcomes.done).toBeGreaterThanOrEqual(5);
    expect(outcomes.nothing_ready).toBeGreaterThanOrEqual(10);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a next_step run with nothing ready", () => {
  const nothing = async (id: string, reason: string) => {
    const diff = await changed(async () => {
      const run = await server.startCodexRun(id, "next_step");
      expect(run).toMatchObject({ issue: id, status: "nothing_ready", reason, phases: [] });
      expect(run.task).toBeUndefined();
      expect(run.finished_at).toBe(run.started_at);
    });
    // It ends at once and writes nothing.
    expect(diff).toEqual({});
    expect((await server.codexRuns(id))[0]).toMatchObject({ status: "nothing_ready", reason });
  };

  test("an issue without a plan says to plan it", async () => {
    await nothing("wf-ss0lo", "No ready task. Plan the issue first.");
    expect(NOTHING_READY.unplanned).toBe("No ready task. Plan the issue first.");
  });

  test("an issue whose tasks are all done says so", async () => {
    await nothing("wf-7p4dn", "Every task is done.");
    expect(NOTHING_READY.finished).toBe("Every task is done.");
  });

  test("an issue whose tasks wait on others says to wait", async () => {
    const detail = await server.issue("wf-9gr4k");
    const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
    expect(tasks.some((t) => t.ready)).toBe(false);
    expect(tasks.every((t) => t.status === "done")).toBe(false);
    await nothing("wf-9gr4k", "No ready task. Wait for the tasks in flight.");
  });

  test("it does not block the next try: only a running run does", async () => {
    await server.startCodexRun("wf-ss0lo", "next_step");
    await expect(server.startCodexRun("wf-ss0lo", "next_step")).resolves.toMatchObject({
      status: "nothing_ready",
    });
    expect(await server.codexRuns("wf-ss0lo")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- one run per issue, errors

describe("starting a run", () => {
  test("one active run per issue; another issue may run beside it", async () => {
    await server.startCodexRun(ID, "next_step");
    const err = await server.startCodexRun(ID, "next_step").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect(((err as ApiError).body as { gaps?: string[] }).gaps).toEqual([
      `Codex is already working on ${ID}.`,
    ]);

    const snap = await server.snapshot();
    const other = snap.issues.find((i) => i.id !== ID && i.progress.tasks.ready > 0);
    expect(other, "a second sample issue has a ready task").toBeDefined();
    await expect(server.startCodexRun(other?.id ?? "", "next_step")).resolves.toMatchObject({
      status: "running",
    });
    expect((await server.codexRuns()).filter((r) => r.status === "running")).toHaveLength(2);
    // Once the first run ends, the issue takes a new one.
    await wait(3 * PHASE_MS);
    expect((await server.codexRuns(ID))[0].status).toBe("done");
    await expect(server.startCodexRun(ID, "next_step")).resolves.toBeDefined();
  });

  test("an unknown issue is a 404 and an unknown kind a 422", async () => {
    await expect(server.startCodexRun("wf-00000", "next_step")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(server.startCodexRun(ID, "dance" as never)).rejects.toBeInstanceOf(ApiError);
  });

  test("runs list newest first, for one issue or for all", async () => {
    await server.startCodexRun("wf-ss0lo", "next_step");
    await server.startCodexRun(ID, "next_step");
    await server.startCodexRun("wf-7p4dn", "next_step");
    expect((await server.codexRuns()).map((r) => r.issue)).toEqual(["wf-7p4dn", ID, "wf-ss0lo"]);
    expect((await server.codexRuns(ID)).map((r) => r.issue)).toEqual([ID]);
    expect(await server.codexRuns("wf-9gr4k")).toEqual([]);
  });
});

// ---------------------------------------------------------------- cancel

describe("cancelling a run", () => {
  test("after the claim: the task goes back to the queue and nothing more is written", async () => {
    const before = texts();
    const run = await server.startCodexRun(ID, "next_step");
    const cancelled = await server.cancelCodexRun(run.id);
    expect(cancelled).toMatchObject({
      id: run.id,
      status: "cancelled",
      reason: "Stopped before the task finished.",
    });
    expect(cancelled.finished_at).toBeDefined();

    // The claim is released: the plan reads as before.
    expect(store.text(planPath())).toBe(before.get(planPath()));
    expect(task(await server.issue(ID), "T-4")).toMatchObject({ status: "todo", ready: true });
    expect(task(await server.issue(ID), "T-4").claimed_by).toBeUndefined();

    // The timers are gone: no log entry, no CI run, no commit, however long we wait.
    const diff = await wait(10 * PHASE_MS);
    expect(diff).toEqual({});
    const { commits, pipelines } = await server.delivery(ID);
    expect(commits.some((c) => c.author === "codex" && c.task === "T-4")).toBe(false);
    expect(pipelines.some((p) => p.id.startsWith("ci-4"))).toBe(false);
  });

  test("during the CI run: the run is cancelled too, and the entry already written stays", async () => {
    const run = await server.startCodexRun(ID, "next_step");
    await wait(2 * PHASE_MS);
    expect(task(await server.issue(ID), "T-4").status).toBe("review");
    await server.cancelCodexRun(run.id);

    const ci = (await server.delivery(ID)).pipelines[0];
    expect(ci).toMatchObject({ status: "completed", conclusion: "cancelled" });
    expect(ci.duration_s).toBeGreaterThan(0);
    expect(ci.jobs.every((j) => j.conclusion === "cancelled")).toBe(true);
    expect(task(await server.issue(ID), "T-4")).toMatchObject({ status: "todo" });
    // Entries are append-only: the log phase's entry stays.
    expect(store.text(changesPath())).toContain("Elected one leader tab over BroadcastChannel");
    expect(await wait(10 * PHASE_MS)).toEqual({});
  });

  test("a run that ended cannot be cancelled, and an unknown run is a 404", async () => {
    const run = await server.startCodexRun(ID, "next_step");
    await wait(3 * PHASE_MS);
    await expect(server.cancelCodexRun(run.id)).rejects.toMatchObject({ status: 422 });
    await expect(server.cancelCodexRun("run-00000")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("a run that stops early leaves no phase running, and says where it stopped", async () => {
    const run = await server.startCodexRun(ID, "next_step");
    await wait(PHASE_MS);
    const cancelled = await server.cancelCodexRun(run.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.phase).toBe("log");
    expect(states(cancelled)).toEqual([
      "claim:done",
      "log:pending",
      "verify:pending",
      "done:pending",
    ]);
    expect(states((await server.codexRuns(ID))[0])).toEqual(states(cancelled));
  });

  test("the issue takes a new run after a cancel", async () => {
    const first = await server.startCodexRun(ID, "next_step");
    await server.cancelCodexRun(first.id);
    const second = await server.startCodexRun(ID, "next_step");
    expect(second.id).not.toBe(first.id);
    expect(second.task).toBe("T-4");
  });
});

// ---------------------------------------------------------------- the world changes under a run

describe("a run whose task changes under it", () => {
  test("stops with a reason when the person moves the task", async () => {
    const run = await server.startCodexRun(ID, "next_step");
    const detail = await server.issue(ID);
    await server.ops({
      op: "set_task_status",
      base_rev: detail.files_rev["plan.md"],
      issue: ID,
      task: "T-4",
      status: "todo",
    });
    const before = texts();
    await wait(PHASE_MS);
    const failed = (await server.codexRuns(ID))[0];
    expect(failed).toMatchObject({
      id: run.id,
      status: "failed",
      reason: "T-4 changed while Codex worked on it.",
    });
    expect(texts()).toEqual(before);
    expect(await wait(5 * PHASE_MS)).toEqual({});
  });

  test("a failed run leaves no phase running", async () => {
    await server.startCodexRun(ID, "next_step");
    const detail = await server.issue(ID);
    await server.ops({
      op: "set_task_status",
      base_rev: detail.files_rev["plan.md"],
      issue: ID,
      task: "T-4",
      status: "todo",
    });
    await wait(PHASE_MS);
    const failed = (await server.codexRuns(ID))[0];
    expect(failed.status).toBe("failed");
    // The task changed during the claim phase, before the log phase began.
    expect(failed.phase).toBe("claim");
    expect(failed.phases.some((p) => p.state === "running")).toBe(false);
  });

  test("a run that started during a hold of the sample ends when the hold is released", async () => {
    const release = server.controls.holdSample();
    await server.startCodexRun(ID, "next_step");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    release();
    // The saved working copy is back: the run does not outlive the sample it started on.
    expect(vi.getTimerCount()).toBe(0);
    expect(await server.codexRuns()).toEqual([]);
    expect(await wait(5 * PHASE_MS)).toEqual({});
    expect(await server.codexRuns()).toEqual([]);
  });

  test("two holds: the runs end with the last release, not the first", async () => {
    const first = server.controls.holdSample();
    const second = server.controls.holdSample();
    await server.startCodexRun(ID, "next_step");
    first();
    expect((await server.codexRuns())[0]?.status).toBe("running");
    first(); // releasing twice counts once
    expect((await server.codexRuns())[0]?.status).toBe("running");
    second();
    expect(await server.codexRuns()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("stops when the workspace is replaced under it", async () => {
    await server.startCodexRun(ID, "next_step");
    server.controls.loadSample();
    expect(await server.codexRuns()).toEqual([]);
    expect(await wait(5 * PHASE_MS)).toEqual({});
    expect(
      server.store.delivery(ID).commits.every((c) => c.author !== "codex" || c.task !== "T-4"),
    ).toBe(true);
  });

  test("Reset data stops the runs too", async () => {
    await server.startCodexRun(ID, "next_step");
    server.controls.reset();
    expect(await server.codexRuns()).toEqual([]);
    expect(await wait(5 * PHASE_MS)).toEqual({});
  });
});

// ---------------------------------------------------------------- the past tense

describe("pastTense", () => {
  test.each([
    ["Build the SSE delta stream", "Built the SSE delta stream"],
    ["Add Span to the meta-list model", "Added Span to the meta-list model"],
    ["Drop sections in a fixed order", "Dropped sections in a fixed order"],
    ["Apply the diff", "Applied the diff"],
    ["Display the badge", "Displayed the badge"],
    [
      "Release expired claims after the grace period",
      "Released expired claims after the grace period",
    ],
    ["Write the plan", "Wrote the plan"],
    ["Split the work", "Split the work"],
    ["Ship index and watcher", "Shipped index and watcher"],
    ["Elect one leader tab over BroadcastChannel", "Elected one leader tab over BroadcastChannel"],
  ])("%s", (title, past) => {
    expect(pastTense(title)).toBe(past);
  });

  test("a title without a plain verb first becomes 'Worked on …'", () => {
    expect(pastTense("SSE delta stream")).toBe("Worked on SSE delta stream");
    expect(pastTense("Property-test the splice")).toBe("Worked on property-test the splice");
    expect(pastTense("404 page")).toBe("Worked on 404 page");
  });
});
