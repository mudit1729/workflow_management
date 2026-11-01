// The "Do next step" run follows the skills flow (skills-flow-spec 4.3): its Plan phase names the
// Plan skill in effect, finish = review puts the task in review, commit = none records no commit
// and has no CI phase, each custom step after Do next step is a phase of its own, and a required
// one that fails stops the run with a failure change and a request. Fake timers drive the clock.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CodexRun } from "@/lib/api/types";
import { PHASE_MS } from "./codex";
import { setTomlKey } from "./md/toml-edit";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";

let server: MockServer;

beforeEach(() => {
  vi.useFakeTimers();
  server = createMockServer({ latency: 0, disk: SAMPLE });
});

afterEach(() => {
  server.dispose();
  vi.useRealTimers();
});

/** An issue with criteria and no plan: the run plans first (it is the coordinator). */
const UNPLANNED = "wf-ss0lo";
/** An issue with a plan and a ready task. */
const PLANNED = "wf-3k9x2";

const skill = (name: string) =>
  `---\nname: ${name}\ndescription: Use when the workspace needs ${name}. Avoid for anything else.\n---\n\n# ${name}\n`;

async function addSkill(name: string) {
  await server.writeFile({ path: `skills/${name}/SKILL.md`, text: skill(name) });
}

/** Edit workflow.toml with the line editor, as the Settings page does. */
async function toml(edit: (text: string) => string) {
  const text = server.store.text("workflow.toml") as string;
  await server.writeFile({ path: "workflow.toml", text: edit(text) });
}

const finishRun = async (run: CodexRun): Promise<CodexRun> => {
  await vi.advanceTimersByTimeAsync(12 * PHASE_MS);
  const done = (await server.codexRuns(run.issue)).find((r) => r.id === run.id);
  if (!done) throw new Error("the run is gone");
  return done;
};

const ids = (run: CodexRun) => run.phases.map((p) => p.id);

describe("the built-in flow", () => {
  test("every phase carries the built-in skill that ran it", async () => {
    const run = await server.startCodexRun(PLANNED, "next_step");
    expect(run.phases.map((p) => [p.id, p.skill])).toEqual([
      ["claim", "doing-next-step"],
      ["log", "logging-work"],
      ["verify", "doing-next-step"],
      ["done", "doing-next-step"],
    ]);
    expect((await finishRun(run)).status).toBe("done");
  });

  test("an unplanned issue plans first with planning-issues, and the label is today's", async () => {
    const run = await server.startCodexRun(UNPLANNED, "next_step");
    expect(run.phases[0]).toMatchObject({
      id: "claim",
      label: "Plan the issue, claim T-1",
      skill: "planning-issues",
    });
  });
});

describe("the Plan step", () => {
  test("a run that plans first names the Plan skill in effect", async () => {
    await addSkill("acme-planning");
    server.controls.setFlow("plan", "ws:acme-planning");
    const run = await server.startCodexRun(UNPLANNED, "next_step");
    expect(run.phases[0]).toMatchObject({
      label: "Plan the issue (ws:acme-planning), claim T-1",
      skill: "ws:acme-planning",
    });
    expect(run.plans).toBe(true);
  });

  test("a Plan skill that does not exist is the built-in one", async () => {
    server.controls.setFlow("plan", "ws:gone");
    const run = await server.startCodexRun(UNPLANNED, "next_step");
    expect(run.phases[0]).toMatchObject({
      label: "Plan the issue, claim T-1",
      skill: "planning-issues",
    });
  });

  test("max_tasks splits a plan into phases of that many tasks", async () => {
    await toml((t) => setTomlKey(t, "flow.plan", "max_tasks", 1));
    const run = await server.startCodexRun(UNPLANNED, "next_step");
    await finishRun(run);
    const detail = await server.issue(UNPLANNED);
    const phases = detail.plan?.phases ?? [];
    expect(phases.length).toBeGreaterThan(1);
    for (const phase of phases) expect(phase.tasks).toHaveLength(1);
  });
});

describe("the Do next step options", () => {
  test("finish = review puts the task in review and says it waits for a check", async () => {
    await toml((t) => setTomlKey(t, "flow.do", "finish", "review"));
    const run = await server.startCodexRun(PLANNED, "next_step");
    const task = run.task as string;
    const ended = await finishRun(run);
    expect(ended).toMatchObject({ status: "done", review: true });
    const detail = await server.issue(PLANNED);
    const live = detail.plan?.phases.flatMap((p) => p.tasks).find((t) => t.id === task);
    expect(live?.status).toBe("review");
    // A task in review is not done, so no criterion is ticked by the run.
    const changes = server.store.text(server.store.filePath(PLANNED, "changes.md")) ?? "";
    expect(changes).toContain("The flow sends every task to review");
  });

  test("my override beats the team's: finish = review for me only", async () => {
    server.libraryRegistry.savePersonalConfig({
      text: setTomlKey(server.libraryRegistry.personalConfig().text, "flow.do", "finish", "review"),
    });
    const run = await server.startCodexRun(PLANNED, "next_step");
    expect((await finishRun(run)).review).toBe(true);
  });

  test("commit = none records no commit and has no CI phase", async () => {
    await toml((t) => setTomlKey(t, "flow.do", "commit", "none"));
    const before = (await server.delivery(PLANNED)).commits.length;
    const run = await server.startCodexRun(PLANNED, "next_step");
    expect(ids(run)).toEqual(["claim", "log", "done"]);
    const ended = await finishRun(run);
    expect(ended.status).toBe("done");
    expect(ended.commit).toBeUndefined();
    expect(ended.pipeline).toBeUndefined();
    expect((await server.delivery(PLANNED)).commits).toHaveLength(before);
    const changes = server.store.text(server.store.filePath(PLANNED, "changes.md")) ?? "";
    const last = changes.slice(changes.lastIndexOf("\n## "));
    expect(last).not.toMatch(/- commit:/);
  });
});

describe("custom steps after Do next step", () => {
  beforeEach(async () => {
    await addSkill("checking-security");
    await toml((t) => {
      let out = t;
      for (const [k, v] of [
        ["after", "do"],
        ["skill", "ws:checking-security"],
        ["label", "Security check"],
        ["required", true],
        ["order", 1],
      ] as const)
        out = setTomlKey(out, "flow.custom.security-check", k, v);
      return out;
    });
  });

  test("each one is a phase between verify and done, and passes", async () => {
    const run = await server.startCodexRun(PLANNED, "next_step");
    expect(run.phases.map((p) => [p.id, p.label, p.skill])).toEqual([
      ["claim", `Claim ${run.task}`, "doing-next-step"],
      ["log", "Log the change", "logging-work"],
      ["verify", "Run CI", "doing-next-step"],
      ["custom:security-check", "Security check", "ws:checking-security"],
      ["done", `Finish ${run.task}`, "doing-next-step"],
    ]);
    const ended = await finishRun(run);
    expect(ended.status).toBe("done");
    expect(ended.phases.every((p) => p.state === "done")).toBe(true);
  });

  test("a required step that fails stops the run with a failure change and a request", async () => {
    server.controls.failCustomStep("security-check");
    const run = await server.startCodexRun(UNPLANNED, "next_step");
    const ended = await finishRun(run);
    expect(ended.status).toBe("failed");
    expect(ended.reason).toContain("Security check failed");
    // The phases after it never ran.
    expect(ended.phases.find((p) => p.id === "done")?.state).toBe("pending");
    const changes = server.store.text(server.store.filePath(UNPLANNED, "changes.md")) ?? "";
    expect(changes).toContain("Security check failed");
    expect(changes).toMatch(/- kind: failure/);
    expect(changes).toMatch(/- result: fail/);
    const detail = await server.issue(UNPLANNED);
    const open = detail.state?.needs_you.filter((r) => !r.answered) ?? [];
    expect(open.map((r) => r.question)).toContainEqual(
      expect.stringContaining("Security check failed"),
    );
    // The run let go of what it held.
    expect(detail.summary.coordinator).toBeUndefined();
  });

  test("an optional step that fails is logged and the run goes on", async () => {
    await toml((t) => setTomlKey(t, "flow.custom.security-check", "required", false));
    server.controls.failCustomStep("security-check");
    const run = await server.startCodexRun(PLANNED, "next_step");
    const ended = await finishRun(run);
    expect(ended.status).toBe("done");
    const changes = server.store.text(server.store.filePath(PLANNED, "changes.md")) ?? "";
    expect(changes).toContain("Security check failed");
    expect(changes).toContain("It is optional, so the run went on.");
    const detail = await server.issue(PLANNED);
    expect(
      (detail.state?.needs_you ?? []).some((r) => /Security check failed/.test(r.question)),
    ).toBe(false);
  });

  test("a step whose skill does not exist does not run", async () => {
    await toml((t) => setTomlKey(t, "flow.custom.security-check", "skill", "ws:gone"));
    const run = await server.startCodexRun(PLANNED, "next_step");
    expect(ids(run)).toEqual(["claim", "log", "verify", "done"]);
  });

  test("resetFlow takes the flow and the failures away", async () => {
    server.controls.failCustomStep("security-check");
    server.controls.resetFlow();
    expect(server.store.text("workflow.toml")).not.toContain("[flow");
    const run = await server.startCodexRun(PLANNED, "next_step");
    expect(ids(run)).toEqual(["claim", "log", "verify", "done"]);
  });
});

describe("the context bundle", () => {
  test("the Hand off options are the bundle's: how many changes, and the budget", async () => {
    const lines = async () => {
      const bundle = await server.context(PLANNED, 100_000);
      const section = bundle.split("\n## ").find((p) => p.startsWith("Last changes")) ?? "";
      return section.split("\n").filter((l) => l.startsWith("- ")).length;
    };
    expect(await lines()).toBe(5);
    await toml((t) => setTomlKey(t, "context", "changes", 2));
    expect(await lines()).toBe(2);
  });

  test("has no flow line for the built-in flow, and names the flow when it differs", async () => {
    const plain = await server.context(PLANNED);
    expect(plain).not.toContain("skills flow:");
    expect(plain).toMatch(/\(doing-next-step\)\.'\n$/);

    await addSkill("acme-planning");
    await addSkill("acme-doing");
    await toml((t) => {
      let out = setTomlKey(t, "flow.plan", "skill", "ws:acme-planning");
      out = setTomlKey(out, "flow.do", "skill", "ws:acme-doing");
      return setTomlKey(out, "flow.do", "finish", "review");
    });
    const bundle = await server.context(PLANNED);
    expect(bundle).toContain(
      "skills flow: Plan: ws:acme-planning (team) · Do next step: ws:acme-doing (team) · Do next step: tasks finish in review (team)",
    );
    // The resume line names the Do next step skill in effect.
    expect(bundle).toMatch(/use the wf skills \(ws:acme-doing\)\.'\n$/);
  });
});
