// Git, PR and CI data (plan D2): the fixture applies only while the sample is loaded, it agrees
// with the plan.md and changes.md of the issues it names, and its times follow the clock.
import { describe, expect, test } from "vitest";
import { toTsSec } from "./delivery";
import fixture from "./fixtures/delivery-sample.json";
import { RECORDED_AT } from "./md/recorded-at";
import { diskFiles } from "./md/test-support";
import { SAMPLE } from "./sample-files";
import { createMockServer } from "./server";
import { createStore } from "./store";

const ISSUES = Object.keys(fixture.issues);

describe("the delivery data of the workspace", () => {
  test("a server on the sample answers 8 to 10 issues with git, PRs and CI", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    expect(ISSUES.length).toBeGreaterThanOrEqual(8);
    expect(ISSUES.length).toBeLessThanOrEqual(10);
    for (const id of ISSUES) {
      const d = await server.delivery(id);
      expect(d.commits.length, id).toBeGreaterThan(0);
      expect(d.prs.length, id).toBeGreaterThan(0);
      expect(d.pipelines.length, id).toBeGreaterThan(0);
    }
  });

  test("the shipped workspace and an issue without data start empty", async () => {
    // The shipped workspace has no issues: add one, and it has no delivery data.
    const server = createMockServer({ latency: 0 });
    const snap = await server.snapshot();
    expect(snap.issues).toHaveLength(0);
    const groupId = snap.groups.children[0]?.id ?? snap.groups.id;
    const res = await server.ops({
      op: "new_issue",
      base_rev: snap.rev,
      group: groupId,
      slug: "fresh",
      title: "Fresh work",
      template: "default",
    });
    const id = res.created as string;
    expect(await server.delivery(id)).toEqual({ commits: [], prs: [], pipelines: [] });
  });

  test("an issue that does not exist is a 404, not an empty list", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    await expect(server.delivery("wf-00000")).rejects.toThrow(/not found/i);
  });

  test("the fixture only applies while the sample is loaded: reset empties it, loading brings it back", async () => {
    const server = createMockServer({ latency: 0 });
    expect(server.store.delivery("wf-3k9x2").commits).toEqual([]);
    server.controls.loadSample();
    expect((await server.delivery("wf-3k9x2")).commits.length).toBeGreaterThan(0);
    server.controls.reset();
    expect(server.store.delivery("wf-3k9x2")).toEqual({ commits: [], prs: [], pipelines: [] });
    server.controls.loadSample();
    expect((await server.delivery("wf-3k9x2")).pipelines.length).toBeGreaterThan(0);
  });

  test("what a hold of the sample leaves behind comes back exactly", async () => {
    const server = createMockServer({ latency: 0 });
    server.controls.loadSample();
    server.store.updateDelivery("wf-3k9x2", (d) => ({ ...d, pipelines: d.pipelines.slice(1) }));
    const before = server.store.delivery("wf-3k9x2");
    const release = server.controls.holdSample();
    expect(server.store.delivery("wf-3k9x2").pipelines).toHaveLength(before.pipelines.length + 1);
    release();
    expect(server.store.delivery("wf-3k9x2")).toEqual(before);
  });
});

describe("the fixture agrees with the sample issues", () => {
  const files = diskFiles();
  const authors = [...files["authors.md"].matchAll(/^## @(\S+)/gm)].map((m) => m[1]);
  const issueDir = (id: string) => {
    const goal = Object.entries(files).find(
      ([path, text]) => path.endsWith("/goal.md") && new RegExp(`^id: ${id}$`, "m").test(text),
    );
    return goal?.[0].replace(/\/goal\.md$/, "");
  };

  test.each(ISSUES)("%s: every commit, PR and run is well formed", (id) => {
    const d = fixture.issues[id as keyof typeof fixture.issues];
    const prs = new Set(d.prs.map((p) => p.number));
    for (const c of d.commits) {
      expect(c.sha, c.subject).toMatch(/^[0-9a-f]{7}$/);
      expect(authors, c.subject).toContain(c.author);
      // The link to the issue is a trailer or the name of the branch (plan D2).
      expect(c.trailer === `Issue: ${id}` || c.branch.startsWith(`${id}/`), c.subject).toBe(true);
      if (c.pr) expect(prs.has(c.pr), `${c.subject} names PR ${c.pr}`).toBe(true);
      expect(c.files_changed).toBeGreaterThan(0);
    }
    for (const p of d.prs) {
      expect(authors, `#${p.number}`).toContain(p.author);
      expect(p.url ?? null).toBeNull();
      expect(["open", "draft", "merged", "closed"]).toContain(p.state);
    }
    const shas = new Set(d.commits.map((c) => c.sha));
    for (const r of d.pipelines) {
      expect(shas.has(r.sha), `${r.id} runs on ${r.sha}`).toBe(true);
      if (r.status === "completed") {
        expect(r.conclusion, r.id).toBeDefined();
        expect(r.duration_s, r.id).toBeGreaterThan(0);
      }
    }
  });

  test.each(ISSUES)("%s: the tasks and commits it names exist in the issue's files", (id) => {
    const dir = issueDir(id);
    expect(dir, `${id} is a sample issue`).toBeDefined();
    const plan = files[`${dir}/plan.md`] ?? "";
    const changes = files[`${dir}/changes.md`] ?? "";
    const d = fixture.issues[id as keyof typeof fixture.issues];
    for (const c of d.commits) {
      if ("task" in c && c.task)
        expect(plan, `${c.sha} names ${c.task}`).toContain(`### ${c.task}:`);
    }
    // Every commit a change entry records is in the delivery data.
    const recorded = [...changes.matchAll(/^- commit: ([0-9a-f]{7})$/gm)].map((m) => m[1]);
    const known = new Set(d.commits.map((c) => c.sha));
    for (const sha of recorded) expect(known.has(sha), `changes.md names ${sha}`).toBe(true);
  });

  test("wf-3k9x2 has commits for T-1 to T-3 with the trailer, an open PR and the CI failure its log records", () => {
    const d = fixture.issues["wf-3k9x2"];
    for (const task of ["T-1", "T-2", "T-3"])
      expect(
        d.commits.some((c) => "task" in c && c.task === task && c.trailer === "Issue: wf-3k9x2"),
        task,
      ).toBe(true);
    expect(d.prs.some((p) => p.state === "open" || p.state === "draft")).toBe(true);
    expect(d.prs.some((p) => p.checks.pending > 0)).toBe(true);
    // C-5wq7k: `rename_folder` failed on notify 9.0-rc.
    const failed = d.pipelines.find((r) => r.conclusion === "failure");
    expect(failed?.jobs.some((j) => j.name === "test" && j.conclusion === "failure")).toBe(true);
    expect(d.commits.find((c) => c.sha === failed?.sha)?.subject).toContain("9.0-rc");
  });

  test("wf-b1d7v records the CI timeout of C-8cw2n", () => {
    const failed = fixture.issues["wf-b1d7v"].pipelines.find((r) => r.conclusion === "failure");
    const rust = failed?.jobs.find((j) => j.name === "rust");
    expect(rust?.conclusion).toBe("failure");
    expect(rust?.duration_s).toBeGreaterThan(600);
    const fixed = fixture.issues["wf-b1d7v"].pipelines.find((r) => r.sha === "d90b4e3");
    expect(fixed?.jobs.find((j) => j.name === "rust")?.duration_s).toBe(74);
  });
});

describe("the data reads newest first and relative to now", () => {
  test("commits, PRs and runs are sorted by time, newest first", () => {
    const store = createStore({ disk: SAMPLE, sample: SAMPLE });
    store.loadSample();
    for (const id of ISSUES) {
      const d = store.delivery(id);
      const sorted = <T>(xs: T[], at: (x: T) => string) =>
        xs.every((x, i) => i === 0 || Date.parse(at(xs[i - 1])) >= Date.parse(at(x)));
      expect(
        sorted(d.commits, (c) => c.at),
        id,
      ).toBe(true);
      expect(
        sorted(d.prs, (p) => p.updated_at),
        id,
      ).toBe(true);
      expect(
        sorted(d.pipelines, (p) => p.started_at),
        id,
      ).toBe(true);
    }
  });

  test("times move with the clock the way the workspace files do", () => {
    const day = 86_400_000;
    const recorded = Date.parse(RECORDED_AT);
    const ago = (clock: number) => {
      const store = createStore({ disk: SAMPLE, sample: SAMPLE, clock: () => clock });
      store.loadSample();
      // The newest commit of wf-3k9x2, 33 minutes before RECORDED_AT in the fixture.
      return clock - Date.parse(store.delivery("wf-3k9x2").commits[0].at);
    };
    // Whatever the day, the newest commit reads the same age: the shift is the age of the recording.
    expect(ago(recorded + 40 * day)).toBe(ago(recorded + 3 * day));
    expect(ago(recorded + 3 * day)).toBe(33 * 60_000);
  });

  test("toTsSec writes a timestamp with seconds in the workspace offset", () => {
    expect(toTsSec(Date.parse("2026-10-22T10:57:41Z"))).toBe("2026-10-22T16:27:41+05:30");
  });
});
