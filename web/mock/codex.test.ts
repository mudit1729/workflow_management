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
const COORD_ID = "wf-y4bz7";
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

// wf-3k9x2 has a live coordinator lease of @claude-opus, so a run on it is a worker: it claims
// the task and appends log entries, and never rewrites goal.md or current_state.md.
describe("a next_step run as a worker", () => {
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

    // One file moves: the task is claimed by @codex with a lease. Another author holds the issue,
    // so goal.md keeps its claim.
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

  test("log is one change entry with the commit and the evidence; verify and done write no markdown", async () => {
    const run = await server.startCodexRun(ID, "next_step");

    // log: the steps are ticked, the task is done (a command verified it), one entry names it all.
    const log = await wait(PHASE_MS);
    expect(Object.keys(log).sort()).toEqual([changesPath(), planPath()].sort());
    const plan = log[planPath()] as { removed: string[]; added: string[] };
    expect(plan.removed).toEqual([
      "- status: in_progress",
      expect.stringMatching(/^- lease_until: /),
      "- [ ] Take the `wf-live` lock in each tab.",
      "- [ ] Relay events from the leader over `BroadcastChannel`.",
    ]);
    expect(plan.added).toEqual([
      "- status: done",
      "- [x] Take the `wf-live` lock in each tab.",
      "- [x] Relay events from the leader over `BroadcastChannel`.",
    ]);
    const sha = (await server.codexRuns(ID))[0].commit;
    expect(sha).toMatch(/^[0-9a-f]{7}$/);
    const added = (log[changesPath()] as { added: string[] }).added;
    expect(line(added, /^## /)).toMatch(
      /^## \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+05:30 @codex — Elected one leader tab over BroadcastChannel \{#C-[0-9a-hjkmnp-tv-z]{5}\}$/,
    );
    // The keys of format.md section 8, in order, with the commit, the result and the evidence.
    expect(added.slice(1, 8)).toEqual([
      "- kind: progress",
      "- task: T-4",
      "- result: pass",
      `- evidence: \`pnpm -C web test leader\` passed at \`${sha}\``,
      `- commit: ${sha}`,
      "- files: `web/src/lib/live/leader.ts`",
      "- model: gpt-5-codex",
    ]);
    // SC-4 is verified by hand: the run never ticks it, and says who has to.
    expect(added.join("\n")).not.toContain("criteria:");
    expect(added.join("\n")).toContain("SC-4 waits for a manual check by @shruti.");
    expect(added.join("\n")).toContain("Ran as a worker under another lease");
    expect(task(await server.issue(ID), "T-4")).toMatchObject({ status: "done" });
    // The commit lands with the entry (step 8 comes before step 9).
    expect((await server.delivery(ID)).commits[0]).toMatchObject({ sha, task: "T-4" });
    expect(states((await server.codexRuns(ID))[0])).toEqual([
      "claim:done",
      "log:running",
      "verify:pending",
      "done:pending",
    ]);

    // verify: a CI run starts on that commit in progress, and then passes. No file moves.
    expect(await wait(PHASE_MS)).toEqual({});
    const running = (await server.delivery(ID)).pipelines[0];
    expect(running).toMatchObject({
      id: expect.stringMatching(/^ci-\d+$/),
      workflow: "CI",
      trigger: "push",
      status: "in_progress",
      sha,
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

    // done: a worker leaves goal.md and current_state.md alone.
    expect(await wait(PHASE_MS / 2)).toEqual({});
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
    expect(pipelines[0].sha).toBe(commits[0].sha);
  });

  test("the edits land in order: claim, log; a worker has no state to finish", async () => {
    const activity: string[] = [];
    server.subscribe((e: ServerEvent) => {
      if (e.event === "activity") activity.push(`${e.data.author}: ${e.data.title}`);
    });
    await server.startCodexRun(ID, "next_step");
    await wait(3 * PHASE_MS);
    expect(activity).toEqual([
      "codex: Claimed T-4",
      "codex: Elected one leader tab over BroadcastChannel",
    ]);
  });

  test("another author's coordinator lease and current_state.md stay as they were", async () => {
    const goal = store.text(store.filePath(ID, "goal.md"));
    const state = store.text(statePath());
    await server.startCodexRun(ID, "next_step");
    const diff = await wait(3 * PHASE_MS);
    expect(Object.keys(diff)).not.toContain(statePath());
    expect(store.text(statePath())).toBe(state);
    expect(store.text(store.filePath(ID, "goal.md"))).toBe(goal);
    const detail = await server.issue(ID);
    expect(detail.state?.updated_by).toBe("claude-opus");
    expect(detail.summary.coordinator).toMatchObject({ holder: "claude-opus", state: "live" });
    // The request that waits for the person stays.
    expect(detail.state?.needs_you.some((r) => r.id === "Q-4m2pz" && !r.answered)).toBe(true);
  });

  test("a finished worker run adds no finding but the one that asks the coordinator to refresh", async () => {
    const rules = (d: IssueDetail) => d.diagnostics.map((x) => x.rule).sort();
    const before = rules(await server.issue(ID));
    await server.startCodexRun(ID, "next_step");
    await wait(3 * PHASE_MS);
    const after = await server.issue(ID);
    const left = [...before];
    const fresh: string[] = [];
    for (const rule of rules(after)) {
      const at = left.indexOf(rule);
      if (at < 0) fresh.push(rule);
      else left.splice(at, 1);
    }
    // The worker appended a change; the coordinator rewrites the state (Q005).
    expect(fresh).toEqual(["Q005"]);
    expect(after.summary.signals.state_behind_changes).toBe(true);
  });
});

// wf-y4bz7 is planned and no live coordinator holds it: the run takes the issue.
const COORD = "wf-y4bz7";

describe("a next_step run as the coordinator", () => {
  const goalPath = () => store.filePath(COORD, "goal.md");

  test("claim moves the issue to in_progress and takes the coordinator lease", async () => {
    const before = await server.issue(COORD);
    expect(before.summary.status).toBe("planned");
    const diff = await changed(() => server.startCodexRun(COORD, "next_step"));
    expect(Object.keys(diff).sort()).toEqual([goalPath(), store.filePath(COORD, "plan.md")].sort());
    const goal = diff[goalPath()] as { removed: string[]; added: string[] };
    expect(goal.added).toEqual(
      expect.arrayContaining([
        "status: in_progress",
        'claimed_by: "@codex"',
        expect.stringMatching(/^lease_until: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+05:30$/),
      ]),
    );
    expect(goal.removed).toContain("status: planned");

    // The keys sit in the order of format.md section 4: after `labels:`, before `blocked_by:`.
    const text = store.text(goalPath()) ?? "";
    const keys = [...text.split("\n---")[0].matchAll(/^([a-z_]+):/gm)].map((m) => m[1]);
    expect(keys.indexOf("claimed_by")).toBe(keys.indexOf("labels") + 1);
    expect(keys.indexOf("lease_until")).toBe(keys.indexOf("claimed_by") + 1);
    expect(keys.indexOf("blocked_by")).toBeGreaterThan(keys.indexOf("lease_until"));

    // The header and the board agree with the strip: in progress, @codex holds it.
    const after = await server.issue(COORD);
    expect(after.summary.status).toBe("in_progress");
    expect(after.summary.coordinator).toMatchObject({ holder: "codex", state: "live" });
  });

  test("the run releases the claim at the end, and ticks the criterion with evidence", async () => {
    await server.startCodexRun(COORD, "next_step");
    const diff = await wait(3 * PHASE_MS);
    const goal = diff[goalPath()] as { removed: string[]; added: string[] };
    const sha = (await server.codexRuns(COORD))[0].commit;
    // SC-1 is ticked by T-1's verify command: evidence names the command, the sha and the entry.
    expect(goal.added).toEqual([
      "- [x] SC-1: When the access token has 5 min left, the browser shall request a new token in the background.",
      expect.stringMatching(
        new RegExp(
          "^  - evidence: `pnpm -C web test token-refresh` passed at `" +
            sha +
            "`, see \\[\\[#C-[0-9a-hjkmnp-tv-z]{5}\\]\\]$",
        ),
      ),
      "  - verified_by: @codex",
    ]);
    const text = store.text(goalPath()) ?? "";
    expect(text).not.toContain("claimed_by");
    expect(text).not.toContain("lease_until");
    // Not every task is done, so the issue stays in progress.
    const detail = await server.issue(COORD);
    expect(detail.summary.status).toBe("in_progress");
    expect(detail.summary.coordinator).toBeUndefined();
    expect(detail.criteria[0]).toMatchObject({ state: "verified", verified_by: "codex" });

    // The change entry lists the criterion it ticked.
    const changes = store.text(changesPath(COORD)) ?? "";
    expect(changes).toMatch(
      /- criteria: SC-1\n- result: pass\n- evidence: `pnpm -C web test token-refresh`/,
    );
    expect(changes).toContain(`- commit: ${sha}`);
  });

  test("the state file says what moved, what is verified and what is next", async () => {
    await server.startCodexRun(COORD, "next_step");
    const diff = await wait(3 * PHASE_MS);
    const state = (diff[statePath(COORD)] as { added: string[] }).added.join("\n");
    expect(state).toContain('summary: "T-1 is done and SC-1 is verified; T-2 is next."');
    expect(state).toContain('updated_by: "@codex"');
    expect(state).toMatch(/- \[\[#T-1\]\] .+ See \[\[#C-/);
    expect(state).toMatch(/- \[\[#SC-1\]\] has evidence at [0-9a-f]{7}\. See \[\[#C-/);
    const detail = await server.issue(COORD);
    expect(detail.state?.summary).toBe("T-1 is done and SC-1 is verified; T-2 is next.");
    expect(detail.state?.updated_by).toBe("codex");
    expect(detail.state?.next_steps[0]).toMatch(/^Start \[\[#T-2\]\] /);
    // It caught up with the change entry, so there is no Q005.
    expect(detail.summary.signals.state_behind_changes).toBe(false);
  });

  test("a finished run adds no lint finding the issue did not have", async () => {
    const rules = (d: IssueDetail) => d.diagnostics.map((x) => x.rule).sort();
    const before = rules(await server.issue(COORD));
    await server.startCodexRun(COORD, "next_step");
    await wait(3 * PHASE_MS);
    const left = [...before];
    for (const rule of rules(await server.issue(COORD))) {
      const at = left.indexOf(rule);
      expect(at, `new finding ${rule}`).toBeGreaterThanOrEqual(0);
      left.splice(at, 1);
    }
  });

  test("an answered request is resolved first: the item leaves Needs you and an answer entry holds it", async () => {
    const before = await server.issue(COORD);
    const request = before.state?.needs_you.find((r) => r.id === "Q-5ys8j");
    expect(request).toMatchObject({ answered: false });
    await server.ops({
      op: "answer_request",
      base_rev: before.files_rev["current_state.md"],
      issue: COORD,
      id: "Q-5ys8j",
      answer: "Refresh 5 min before it expires.",
    });
    expect((await server.issue(COORD)).state?.needs_you[0]).toMatchObject({ answered: true });

    await server.startCodexRun(COORD, "next_step");
    const after = await server.issue(COORD);
    // The item is gone from the state and the question and answer sit in one entry.
    expect(after.state?.needs_you.some((r) => r.id === "Q-5ys8j")).toBe(false);
    const entry = after.changes.find((c) => c.title === "Resolved Q-5ys8j");
    expect(entry).toMatchObject({ author: "codex", kind: "answer" });
    expect(entry?.body_md).toBe(
      `**Q:** ${request?.question}\n**A:** Refresh 5 min before it expires. (@shruti)`,
    );
    expect(entry?.meta.commit).toBeUndefined();
    await wait(3 * PHASE_MS);
    expect((await server.issue(COORD)).diagnostics.map((d) => d.rule)).toEqual([]);
  });

  test("a task whose verify is manual goes to review, with a request for the person", async () => {
    // wf-g5rx8: planned, T-1 is verified by hand.
    const id = "wf-g5rx8";
    const ran = await server.startCodexRun(id, "next_step");
    expect(ran.task).toBe("T-1");
    const claimed = await server.issue(id);
    expect(task(claimed, "T-1")).toMatchObject({ status: "in_progress" });
    expect(claimed.summary.status).toBe("in_progress");
    await wait(PHASE_MS);
    const reviewed = await server.issue(id);
    // `review` is for `verify: manual` only: the task is not done, and no criterion is ticked.
    expect(task(reviewed, "T-1")).toMatchObject({ status: "review", claimed_by: "codex" });
    expect(task(reviewed, "T-1").lease_until).toBeUndefined();
    expect(reviewed.criteria.map((c) => c.checked)).toEqual(claimed.criteria.map((c) => c.checked));
    const entry = store.text(changesPath(id)) ?? "";
    expect(entry).not.toContain("result:");
    expect(entry).toContain("T-1 waits for a manual check by @");

    await wait(2 * PHASE_MS);
    const done = await server.issue(id);
    const request = done.state?.needs_you.find((r) => r.from === "codex" && !r.answered);
    expect(request).toMatchObject({ kind: "approval", ref: "[[#T-1]]" });
    expect(request?.question).toMatch(/^Check T-1 by hand: /);
    expect(done.state?.next_steps[0]).toMatch(/^Ask @\w+ to verify \[\[#T-1\]\] by hand\.$/);
    expect(done.state?.summary).toBe("T-1 is in review; it waits for a manual check.");
    // The task waits in Blocked, not in Done.
    expect(done.state?.blocked_md).toContain("[[#T-1]] waits for @");
    expect(done.state?.done_md ?? "").not.toContain("[[#T-1]]");
    // Every task is not done, so the issue stays in progress and the claim is gone.
    expect(done.summary.status).toBe("in_progress");
    expect(done.summary.coordinator).toBeUndefined();
  });

  test("a task without a verify command cannot be verified by the run", async () => {
    // wf-k8dv6: T-1 has no `verify:`.
    const id = "wf-k8dv6";
    await server.startCodexRun(id, "next_step");
    await wait(PHASE_MS);
    expect(task(await server.issue(id), "T-1").status).toBe("review");
  });

  test("when every task is done the issue goes to review and the claim is gone", async () => {
    // Finish the last open task of wf-y4bz7 by running until nothing is left.
    let guard = 0;
    for (; guard < 6; guard++) {
      const detail = await server.issue(COORD);
      const ready = detail.plan?.phases.flatMap((p) => p.tasks).some((t) => t.ready);
      if (!ready) break;
      await server.startCodexRun(COORD, "next_step");
      await wait(3 * PHASE_MS);
    }
    const detail = await server.issue(COORD);
    const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
    expect(tasks.every((t) => t.status === "done")).toBe(true);
    expect(detail.summary.status).toBe("review");
    expect(detail.summary.coordinator).toBeUndefined();
    // The gaps are listed, and the issue is never `done` with an unverified criterion.
    const unverified = detail.criteria.filter((c) => c.state !== "verified");
    if (unverified.length > 0)
      expect(detail.state?.next_steps.join("\n")).toMatch(
        /verify SC-\d+ by hand|Check the criteria/,
      );
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
      "delivery", // the commit lands
      "run running/log",
      "delivery", // the CI run starts
      "run running/verify",
      "delivery", // and passes
      "run done/done",
    ]);
  });

  test("setPhaseMs speeds up the runs that start afterwards", async () => {
    server.controls.setCodexPhaseMs(100);
    await server.startCodexRun(ID, "next_step");
    await wait(300);
    expect((await server.codexRuns(ID))[0].status).toBe("done");
  });

  test("a run on a planned issue that wf-t3jp5 already coordinates keeps its own lease", async () => {
    // wf-t3jp5: T-1 done, T-2 in progress by @codex, and @codex holds the issue. Finishing T-2
    // unlocks T-3.
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
    expect(after.state?.summary).toMatch(/^T-2 is done( and SC-\d+ is verified)?; T-3 is next\.$/);
    expect(after.state?.next_steps[0]).toBe(
      "Start [[#T-3]] Name dropped sections at the bundle end.",
    );
    expect(task(after, "T-3").ready).toBe(true);
    // The run gave the issue back.
    expect(after.summary.coordinator).toBeUndefined();
  });
});

// ---------------------------------------------------------------- nothing to do

describe("a run on every sample issue", () => {
  test("ends done or nothing_ready, adds no lint finding and leaves no timer", async () => {
    const snap = await server.snapshot();
    const rules = async (id: string) => (await server.issue(id)).diagnostics.map((d) => d.rule);
    const outcomes: Record<string, number> = {};
    for (const { id, coordinator } of snap.issues) {
      const before = await rules(id);
      // Another author's live coordinator lease makes the run a worker: it appends a change and
      // leaves current_state.md to the coordinator, which is what Q005 asks for.
      const worker =
        !!coordinator && coordinator.holder !== "codex" && coordinator.state === "live";
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
        if (at < 0 && worker && rule === "Q005") continue;
        expect(at, `${id}: new finding ${rule}`).toBeGreaterThanOrEqual(0);
        left.splice(at, 1);
      }
      // The strip and the board agree: a run that ended gives the issue back.
      if (run.status === "done" && !worker) {
        const after = await server.issue(id);
        expect(after.summary.coordinator?.holder, `${id}: still held`).not.toBe("codex");
      }
    }
    // An issue without a plan is planned first, so most sample issues now run.
    expect(outcomes.done).toBeGreaterThanOrEqual(10);
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

  test("a finished issue says so, a cancelled one too", async () => {
    await nothing("wf-7p4dn", "The issue is done.");
    await nothing("wf-n7vy3", "The issue is cancelled.");
    expect(NOTHING_READY.closed("done")).toBe("The issue is done.");
  });

  test("an issue whose tasks are all done says so", async () => {
    // wf-9gr4k is in review with its tasks waiting on one another; finish a plan to check the text.
    expect(NOTHING_READY.finished).toBe("Every task is done.");
    const id = "wf-y4bz7";
    for (let i = 0; i < 6; i++) {
      const run = await server.startCodexRun(id, "next_step");
      if (run.status === "nothing_ready") break;
      await wait(3 * PHASE_MS);
    }
    const last = (await server.codexRuns(id))[0];
    expect(last).toMatchObject({ status: "nothing_ready" });
    expect([NOTHING_READY.finished, NOTHING_READY.waiting]).toContain(last.reason);
  });

  test("an issue whose tasks wait on others says to wait", async () => {
    const detail = await server.issue("wf-9gr4k");
    const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
    expect(tasks.some((t) => t.ready)).toBe(false);
    expect(tasks.every((t) => t.status === "done")).toBe(false);
    await nothing("wf-9gr4k", "No ready task. Wait for the tasks in flight.");
  });

  test("goal.md blocked_by names an issue that is not done: the run says so and stops", async () => {
    // wf-w8vz4 is blocked by wf-r6jk2, which is in progress.
    await nothing("wf-w8vz4", NOTHING_READY.blockedBy("wf-r6jk2"));
    expect(NOTHING_READY.blockedBy("wf-r6jk2")).toBe("Waiting on wf-r6jk2: it is not done.");
  });

  test("a blocking request that names the task stops the run; one about another task does not", async () => {
    const stateFile = statePath();
    const text = store.text(stateFile) ?? "";
    // Q-4m2pz is blocking and refers to the decision that affects SC-1 and SC-3, not T-4 (SC-4).
    expect(text).toContain("Q-4m2pz");
    expect((await server.startCodexRun(ID, "next_step")).status).toBe("running");
    await wait(3 * PHASE_MS);

    // A second issue, with a blocking request that names its next task.
    const id = "wf-y4bz7";
    const file = statePath(id);
    const state = store.text(file) ?? "";
    await server.writeFile({
      path: file,
      text: state.replace(
        /^## Needs you\n/m,
        "## Needs you\n- [ ] Q-9zz9z: Which refresh margin does T-1 use?\n  - from: @claude-opus\n  - to: @shruti\n  - kind: question\n  - urgency: blocking\n  - asked: 2026-10-22T15:39+05:30\n  - answer:\n",
      ),
    });
    expect(store.text(file)).toContain("Q-9zz9z");
    await nothing(id, NOTHING_READY.request("Q-9zz9z", "Which refresh margin does T-1 use?"));
  });

  test("an issue without a plan is planned first, then its first task runs", async () => {
    const id = "wf-ss0lo";
    const planFile = store.filePath(id, "plan.md");
    expect(store.text(planFile)).toBeUndefined();
    const before = await server.issue(id);
    expect(before.summary.status).toBe("backlog");

    const run = await server.startCodexRun(id, "next_step");
    expect(run).toMatchObject({ status: "running", task: "T-1", phase: "claim" });
    expect(run.phases[0].label).toBe("Plan the issue, claim T-1");
    // The run says so itself, so the UI does not have to read the label.
    expect(run.plans).toBe(true);
    const plan = store.text(planFile) ?? "";
    // plan.md as planning-issues prescribes: frontmatter, approach, a phase, one task per criterion.
    expect(plan).toMatch(
      /^---\nupdated_at: .+\nupdated_by: "@codex"\nrevision: 1\n---\n\n## Approach\n/,
    );
    expect(plan).toContain("## Phase 1: Deliver the criteria");
    const detail = await server.issue(id);
    const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
    expect(tasks.map((t) => t.id)).toEqual(["T-1", "T-2", "T-3"]);
    expect(tasks.map((t) => t.satisfies)).toEqual([["SC-1"], ["SC-2"], ["SC-3"]]);
    expect(tasks.map((t) => t.depends_on)).toEqual([[], ["T-1"], ["T-2"]]);
    // Every criterion is covered, and each task proves its criterion the way the criterion says.
    expect(tasks[1].verify).toBe("cargo test -p wf-server oidc_session");
    expect(tasks[0].verify).toBe("manual");
    expect(tasks[0].status).toBe("in_progress");
    expect(detail.criteria.every((c) => c.satisfied_by.length === 1)).toBe(true);
    // The plan entry, the new state file and the status: backlog moved on to in_progress.
    expect(store.text(changesPath(id))).toMatch(
      /Wrote the plan with 3 tasks in 1 lane \{#C-[0-9a-hjkmnp-tv-z]{5}\}\n- kind: docs\n- files: `plan\.md`\n- model: gpt-5-codex/,
    );
    expect(detail.state?.summary).toBe("Planned: 3 tasks in 1 lane; T-1 is ready.");
    expect(detail.summary.status).toBe("in_progress");
    expect(detail.summary.coordinator).toMatchObject({ holder: "codex", state: "live" });
    expect(detail.diagnostics).toEqual([]);

    // The run goes on as any other: T-1 is verified by hand, so it ends in review.
    await wait(3 * PHASE_MS);
    const after = await server.issue(id);
    expect(task(after, "T-1").status).toBe("review");
    expect((await server.codexRuns(id))[0]).toMatchObject({
      status: "done",
      plans: true,
      review: true,
    });
    expect(after.diagnostics.map((d) => d.rule)).toEqual([]);
    expect(NOTHING_READY.noCriteria).toMatch(/no criteria/);
  });

  test("a cancelled planning run keeps the plan and puts the issue back to planned", async () => {
    const id = "wf-ss0lo";
    const goal = store.filePath(id, "goal.md");
    const before = store.text(goal);
    const run = await server.startCodexRun(id, "next_step");
    await server.cancelCodexRun(run.id);
    const detail = await server.issue(id);
    expect(detail.summary.status).toBe("planned");
    expect(detail.summary.coordinator).toBeUndefined();
    expect(detail.plan?.phases.flatMap((p) => p.tasks)).toHaveLength(3);
    expect(task(detail, "T-1")).toMatchObject({ status: "todo", ready: true });
    expect(store.text(goal)).not.toContain("claimed_by");
    expect(before).toContain("status: backlog");
  });

  test("it does not block the next try: only a running run does", async () => {
    await server.startCodexRun("wf-7p4dn", "next_step");
    await expect(server.startCodexRun("wf-7p4dn", "next_step")).resolves.toMatchObject({
      status: "nothing_ready",
    });
    expect(await server.codexRuns("wf-7p4dn")).toHaveLength(2);
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

  test("after the claim on a coordinator issue: goal.md gets its status back and loses the claim", async () => {
    const goal = store.filePath(COORD_ID, "goal.md");
    const before = texts();
    const run = await server.startCodexRun(COORD_ID, "next_step");
    expect(store.text(goal)).not.toBe(before.get(goal));
    await server.cancelCodexRun(run.id);
    // Status `planned` and the old claim come back; the task is in the queue again.
    expect(store.text(goal)).toContain("status: planned");
    expect(store.text(store.filePath(COORD_ID, "plan.md"))).toBe(
      before.get(store.filePath(COORD_ID, "plan.md")),
    );
    expect((await server.issue(COORD_ID)).summary.coordinator?.holder).not.toBe("codex");
  });

  test("during the CI run: the CI run is cancelled, the finished task and its entry stay", async () => {
    const run = await server.startCodexRun(COORD_ID, "next_step");
    await wait(2 * PHASE_MS);
    expect(task(await server.issue(COORD_ID), "T-1").status).toBe("done");
    const cancelled = await server.cancelCodexRun(run.id);
    expect(cancelled.reason).toBe("Stopped after the task was done; the state was not updated.");

    const ci = (await server.delivery(COORD_ID)).pipelines[0];
    expect(ci).toMatchObject({ status: "completed", conclusion: "cancelled" });
    expect(ci.duration_s).toBeGreaterThan(0);
    expect(ci.jobs.every((j) => j.conclusion === "cancelled")).toBe(true);
    // The work was done and logged: the task and the ticked criterion stay, the claim goes.
    const detail = await server.issue(COORD_ID);
    expect(task(detail, "T-1")).toMatchObject({ status: "done" });
    expect(detail.criteria[0].state).toBe("verified");
    expect(detail.summary.coordinator).toBeUndefined();
    // Entries are append-only: the log phase's entry stays.
    expect(store.text(changesPath(COORD_ID))).toContain("Started a refresh timer");
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
