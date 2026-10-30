// Codex from the browser: the command "Open in Codex" copies, starting and stopping a run through
// the hook by the connected agent (simulated, or on a bridge), and the live bridge that puts a
// run's moves into the cached lists.
import { beforeEach, describe, expect, test, vi } from "vitest";
import readme from "../../../../plugins/workflow/README.md?raw";
import handingOff from "../../../../plugins/workflow/skills/handing-off/SKILL.md?raw";
import format from "../../../../plugins/workflow/skills/using-wf/references/format.md?raw";
import { loadMock } from "./mock-bridge";

const toasts = vi.hoisted(() => {
  const fn = Object.assign(vi.fn(), {
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  });
  return fn;
});
vi.mock("sonner", () => ({ toast: toasts }));

import { AgentNotConnectedError, agentControls, agentStore } from "./agent";
import {
  BridgeError,
  type BridgeRun,
  type BridgeStatus,
  BridgeUnreachableError,
  bridge,
} from "./bridge-client";
import { api } from "./client";
import {
  codexCommand,
  connectCodexLive,
  forgetBridgeRuns,
  fromBridgeRun,
  useStartCodexRun,
  withBridgeRuns,
} from "./codex";
import { qk } from "./keys";
import { queryClient } from "./query-client";
import { resumeCommand, resumePrompt } from "./resume";
import { capture } from "./test-support";
import type { CodexRun, Delivery } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ID = "wf-3k9x2";

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  // "Do next step" needs an agent: the simulated Codex answers.
  agentControls.simulate("codex");
  forgetBridgeRuns();
  const mock = await loadMock();
  mock.mockControls.loadSample();
  // Slower than the mock's own 80 to 160 ms of latency, so a run is still going on the next call.
  mock.mockControls.setCodexPhaseMs(300);
  queryClient.clear();
});

describe("codexCommand", () => {
  const issue = {
    id: "wf-3k9x2",
    title: "Push board updates over SSE",
    path: "issues/wf/web/live-board-updates",
  };

  test("the prompt names the issue and its folder and points at the skill", () => {
    expect(codexCommand(issue).prompt).toBe(
      'Work on wf-3k9x2 "Push board updates over SSE" in issues/wf/web/live-board-updates. Read current_state.md first, then use the wf skills (doing-next-step).',
    );
  });

  test("the command is codex and the prompt in single quotes", () => {
    expect(codexCommand(issue).command).toBe(
      `codex 'Work on wf-3k9x2 "Push board updates over SSE" in issues/wf/web/live-board-updates. Read current_state.md first, then use the wf skills (doing-next-step).'`,
    );
  });

  test("a single quote in the title survives the shell", () => {
    const { prompt, command } = codexCommand({ ...issue, title: "Don't poll the board" });
    expect(prompt).toContain(`"Don't poll the board"`);
    expect(command).toBe(`codex '${prompt.replace(/'/g, "'\\''")}'`);
    expect(command).toContain(`Don'\\''t`);
  });

  test("it is pure: the same issue gives the same command", () => {
    expect(codexCommand(issue)).toEqual(codexCommand({ ...issue }));
  });

  test("the prompt is the resume prompt of format.md section 15, word for word", () => {
    // One string in four places: the button, the bundle's last line, the README and handing-off.
    const template =
      'Work on <id> "<title>" in <issue path>. Read current_state.md first, then use the wf skills (doing-next-step).';
    expect(format).toContain(template);
    const filled = template
      .replace("<id>", issue.id)
      .replace("<title>", issue.title)
      .replace("<issue path>", issue.path);
    expect(codexCommand(issue).prompt).toBe(filled);
    expect(resumePrompt(issue)).toBe(filled);
    expect(resumeCommand(issue)).toBe(`codex '${filled}'`);

    expect(readme).toContain(`codex '${filled}'`);
    expect(handingOff).toContain(template);
  });
});

describe("useStartCodexRun", () => {
  test("start resolves to the run and puts it in the cached lists", async () => {
    queryClient.setQueryData<CodexRun[]>(qk.codexRuns(ID), []);
    queryClient.setQueryData<CodexRun[]>(qk.codexRuns(), []);
    const { start } = capture(useStartCodexRun);

    const run = await start(ID, "next_step");
    expect(run).toMatchObject({ issue: ID, status: "running", task: "T-4" });
    expect(queryClient.getQueryData<CodexRun[]>(qk.codexRuns(ID))?.[0]?.id).toBe(run?.id);
    expect(queryClient.getQueryData<CodexRun[]>(qk.codexRuns())?.[0]?.id).toBe(run?.id);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  test("a run with nothing to do resolves to the run, with its reason, and no toast", async () => {
    const { start } = capture(useStartCodexRun);
    const run = await start("wf-7p4dn", "next_step");
    expect(run).toMatchObject({ status: "nothing_ready", reason: "The issue is done." });
    expect(toasts.error).not.toHaveBeenCalled();
  });

  test("an issue without a plan is planned by the run, not refused", async () => {
    const { start } = capture(useStartCodexRun);
    const run = await start("wf-ss0lo", "next_step");
    expect(run).toMatchObject({ status: "running", task: "T-1" });
    expect(run?.phases[0].label).toBe("Plan the issue, claim T-1");
    expect(toasts.error).not.toHaveBeenCalled();
  });

  test("a second run on the same issue is refused with a toast", async () => {
    const { start } = capture(useStartCodexRun);
    await start(ID, "next_step");
    expect(await start(ID, "next_step")).toBeUndefined();
    expect(toasts.error.mock.calls[0][0]).toBe(`Codex is already working on ${ID}.`);
  });

  test("an unknown issue is a toast, not a throw", async () => {
    const { start } = capture(useStartCodexRun);
    expect(await start("wf-00000", "next_step")).toBeUndefined();
    expect(toasts.error.mock.calls[0][0]).toBe("That issue or run no longer exists.");
  });

  test("cancel stops the run and replaces it in the cached list", async () => {
    queryClient.setQueryData<CodexRun[]>(qk.codexRuns(ID), []);
    const { start, cancel } = capture(useStartCodexRun);
    const run = await start(ID, "next_step");
    const stopped = await cancel(run?.id ?? "");
    expect(stopped).toMatchObject({ id: run?.id, status: "cancelled" });
    const cached = queryClient.getQueryData<CodexRun[]>(qk.codexRuns(ID));
    expect(cached).toHaveLength(1);
    expect(cached?.[0].status).toBe("cancelled");
    // Nothing runs on after the cancel.
    await sleep(1000);
    expect((await api.codexRuns(ID))[0].status).toBe("cancelled");
  });
});

describe("the live bridge", () => {
  test("a run moves through the cached lists, and the delivery data is read again", async () => {
    queryClient.setQueryData<CodexRun[]>(qk.codexRuns(ID), []);
    queryClient.setQueryData<Delivery>(qk.delivery(ID), await api.delivery(ID));
    const stop = connectCodexLive();
    // The bridge subscribes after the mock module loads.
    await sleep(20);
    try {
      const run = await api.startCodexRun(ID, "next_step");
      await sleep(1500);
      const cached = queryClient.getQueryData<CodexRun[]>(qk.codexRuns(ID));
      expect(cached?.map((r) => [r.id, r.status])).toEqual([[run.id, "done"]]);
      expect(queryClient.getQueryState(qk.delivery(ID))?.isInvalidated).toBe(true);
    } finally {
      stop?.();
    }
  });

  test("stopping the bridge stops the updates", async () => {
    queryClient.setQueryData<CodexRun[]>(qk.codexRuns(ID), []);
    const stop = connectCodexLive();
    await sleep(20);
    stop?.();
    await api.startCodexRun(ID, "next_step");
    await sleep(1500);
    expect(queryClient.getQueryData<CodexRun[]>(qk.codexRuns(ID))).toEqual([]);
  });
});

// ---------------------------------------------------------------- by which agent

describe("Do next step needs an agent (plan D12)", () => {
  test("with none connected it rejects with AgentNotConnectedError, and shows nothing", async () => {
    agentStore.disconnect();
    const { start } = capture(useStartCodexRun);
    const err = await start(ID, "next_step").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentNotConnectedError);
    expect(err).toMatchObject({ status: "none" });
    expect(toasts.error).not.toHaveBeenCalled();
    expect(toasts).not.toHaveBeenCalled();
    // Nothing started.
    expect(await api.codexRuns(ID)).toEqual([]);
  });

  test("a pairing that has not finished is no agent either, and says so", async () => {
    await agentControls.begin("codex");
    const { start } = capture(useStartCodexRun);
    await expect(start(ID, "next_step")).rejects.toMatchObject({
      name: "AgentNotConnectedError",
      status: "pairing",
    });
    agentControls.cancel();
    expect(await api.codexRuns(ID)).toEqual([]);
  });

  test("a simulated Claude Code run is by claude: the run, the claim and the entries", async () => {
    agentControls.simulate("claude");
    const { start } = capture(useStartCodexRun);
    const run = await start(ID, "next_step");
    expect(run).toMatchObject({
      agent: "claude",
      by: "claude",
      source: "simulated",
      status: "running",
    });
    const issue = await api.issue(ID);
    const t4 = issue.plan?.phases.flatMap((p) => p.tasks).find((t) => t.id === "T-4");
    expect(t4?.claimed_by).toBe("claude");
  });

  test("the run names the agent that was connected when it started", async () => {
    const { start } = capture(useStartCodexRun);
    const first = await start(ID, "next_step");
    expect(first?.agent).toBe("codex");
    // A second run on the same issue is refused in the active agent's name.
    agentControls.simulate("claude");
    expect(await start(ID, "next_step")).toBeUndefined();
    expect(toasts.error.mock.calls[0][0]).toBe(`Codex is already working on ${ID}.`);
  });
});

// ---------------------------------------------------------------- a run on a bridge

const TOKEN = "c".repeat(64);

const bridgeStatus: BridgeStatus = {
  agent: "codex",
  version: "0.46.0",
  host: "mudit-laptop",
  repo: { name: "workflow_management" },
  workspace: "web/mock/workspace",
  skills: { installed: [], missing: ["using-wf"] },
  runs: 0,
  active: 0,
};

const started = (over: Partial<BridgeRun> = {}): BridgeRun => ({
  id: "run-0a1b2c3d",
  issue: ID,
  agent: "codex",
  startedAt: "2026-10-30T10:00:00.000Z",
  status: "running",
  ...over,
});

/** Pair the shared agent store with a bridge whose calls the test scripts. */
async function connectBridge(agent: "codex" | "claude" = "codex") {
  agentStore.disconnect();
  vi.spyOn(bridge, "pollPair").mockResolvedValue(TOKEN);
  vi.spyOn(bridge, "status").mockResolvedValue({ ...bridgeStatus, agent });
  vi.spyOn(bridge, "unpair").mockResolvedValue();
  const listRuns = vi.spyOn(bridge, "listRuns").mockResolvedValue([]);
  await agentControls.begin(agent);
  await until(() => agentStore.get().status === "connected");
  await until(() => listRuns.mock.calls.length > 0);
  return { listRuns };
}

async function until(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("until: timed out");
    await sleep(5);
  }
}

const cached = (issue = ID) => queryClient.getQueryData<CodexRun[]>(qk.codexRuns(issue));

describe("a run on a bridge", () => {
  beforeEach(() => {
    queryClient.setQueryData<CodexRun[]>(qk.codexRuns(ID), []);
    queryClient.setQueryData<CodexRun[]>(qk.codexRuns(), []);
  });

  test("it starts on the bridge with only the issue and the kind, and not in the mock", async () => {
    await connectBridge();
    const startRun = vi
      .spyOn(bridge, "startRun")
      .mockResolvedValue(started({ id: "run-aaaa0001" }));
    vi.spyOn(bridge, "follow").mockReturnValue(new Promise(() => {}));
    const { start } = capture(useStartCodexRun);

    const run = await start(ID, "next_step");
    expect(startRun).toHaveBeenCalledWith(TOKEN, ID, "next_step");
    expect(run).toMatchObject({
      id: "run-aaaa0001",
      issue: ID,
      kind: "next_step",
      status: "running",
      by: "codex",
      agent: "codex",
      source: "bridge",
      phases: [],
      started_at: "2026-10-30T10:00:00.000Z",
    });
    expect(run?.phase).toBeUndefined();
    expect(cached()?.[0].id).toBe("run-aaaa0001");
    expect(cached(undefined)?.[0].id).toBe("run-aaaa0001");
    // The mock server never heard of it.
    expect(await api.codexRuns(ID)).toEqual([]);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  test("its output moves the last line, and the exit ends it by the exit code", async () => {
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockResolvedValue(started({ id: "run-aaaa0002" }));
    vi.spyOn(bridge, "follow").mockImplementation(async (_t, _id, handlers) => {
      handlers.onLine("claiming T-4");
      handlers.onLine("editing plan.md");
      await sleep(350);
      handlers.onLine("running the tests");
      handlers.onExit({ code: 0, signal: null, status: "done" });
    });
    const { start } = capture(useStartCodexRun);
    await start(ID, "next_step");

    // Lines come in a burst: the screen hears the last one of each 200 ms.
    await sleep(250);
    expect(cached()?.[0]).toMatchObject({ status: "running", lastLine: "editing plan.md" });
    await sleep(250);
    const done = cached()?.[0];
    expect(done).toMatchObject({
      id: "run-aaaa0002",
      status: "done",
      source: "bridge",
      lastLine: "running the tests",
    });
    expect(done?.finished_at).toBeDefined();
    expect(done?.reason).toBeUndefined();
  });

  test("a non-zero exit is a failed run that says the code", async () => {
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockResolvedValue(started({ id: "run-aaaa0003" }));
    vi.spyOn(bridge, "follow").mockImplementation(async (_t, _id, handlers) => {
      handlers.onExit({ code: 2, signal: null, status: "failed" });
    });
    const { start } = capture(useStartCodexRun);
    await start(ID, "next_step");
    await until(() => cached()?.[0].status === "failed");
    expect(cached()?.[0].reason).toBe("Codex exited with code 2.");
  });

  test("Claude Code on a bridge is named as such", async () => {
    await connectBridge("claude");
    vi.spyOn(bridge, "startRun").mockResolvedValue(
      started({ id: "run-aaaa0004", agent: "claude" }),
    );
    vi.spyOn(bridge, "follow").mockImplementation(async (_t, _id, handlers) => {
      handlers.onExit({ code: 1, signal: null, status: "failed" });
    });
    const { start } = capture(useStartCodexRun);
    const run = await start(ID, "next_step");
    expect(run).toMatchObject({ agent: "claude", by: "claude" });
    await until(() => cached()?.[0].status === "failed");
    expect(cached()?.[0].reason).toBe("Claude Code exited with code 1.");
  });

  test("the bridge's refusal is the toast, in its own words, and nothing starts", async () => {
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockRejectedValue(
      new BridgeError(409, "busy", `Codex is already working on ${ID}.`),
    );
    const { start } = capture(useStartCodexRun);
    expect(await start(ID, "next_step")).toBeUndefined();
    expect(toasts.error).toHaveBeenCalledWith(`Codex is already working on ${ID}.`);
    expect(agentStore.get().status).toBe("connected");
    expect(cached()).toEqual([]);
  });

  test("a bridge that does not answer makes the agent lost and rejects without a toast", async () => {
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockRejectedValue(new BridgeUnreachableError());
    const { start } = capture(useStartCodexRun);
    await expect(start(ID, "next_step")).rejects.toMatchObject({
      name: "AgentNotConnectedError",
      status: "lost",
    });
    expect(agentStore.get().status).toBe("lost");
    expect(toasts.error).not.toHaveBeenCalled();
    // The next try finds the agent lost before it asks the bridge.
    await expect(start(ID, "next_step")).rejects.toMatchObject({ status: "lost" });
  });

  test("a bridge that forgot the token is the same, and the token is dropped", async () => {
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockRejectedValue(
      new BridgeError(401, "unauthorized", "Pair first."),
    );
    const { start } = capture(useStartCodexRun);
    await expect(start(ID, "next_step")).rejects.toMatchObject({ status: "lost" });
    expect(agentStore.get()).toMatchObject({ status: "lost" });
    expect(agentStore.token()).toBeUndefined();
  });

  test("a stream that breaks fails the run and loses the agent", async () => {
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockResolvedValue(started({ id: "run-aaaa0005" }));
    vi.spyOn(bridge, "follow").mockRejectedValue(
      new BridgeUnreachableError("The bridge stopped sending."),
    );
    const { start } = capture(useStartCodexRun);
    await start(ID, "next_step");
    await until(() => cached()?.[0].status === "failed");
    expect(cached()?.[0].reason).toBe(
      "Lost the bridge. Codex may still be working on your computer.",
    );
    expect(agentStore.get().status).toBe("lost");
  });

  test("cancel asks the bridge, and the run ends cancelled with its last line", async () => {
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockResolvedValue(started({ id: "run-aaaa0006" }));
    vi.spyOn(bridge, "follow").mockImplementation(async (_t, _id, handlers, signal) => {
      handlers.onLine("working");
      await new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
      );
    });
    const cancelRun = vi
      .spyOn(bridge, "cancel")
      .mockResolvedValue(
        started({ id: "run-aaaa0006", status: "cancelled", code: null, signal: "SIGTERM" }),
      );
    const { start, cancel } = capture(useStartCodexRun);
    await start(ID, "next_step");
    await sleep(250);
    const stopped = await cancel("run-aaaa0006");
    expect(cancelRun).toHaveBeenCalledWith(TOKEN, "run-aaaa0006");
    expect(stopped).toMatchObject({
      status: "cancelled",
      reason: "Stopped before the task finished.",
      lastLine: "working",
      source: "bridge",
    });
    expect(cached()?.[0]).toMatchObject({ id: "run-aaaa0006", status: "cancelled" });
  });

  test("a simulated run is still cancelled in the mock, even while a bridge is connected", async () => {
    // A run the mock server started earlier, before the bridge connected.
    agentControls.simulate("codex");
    const { start, cancel } = capture(useStartCodexRun);
    const run = await start(ID, "next_step");
    await connectBridge();
    const cancelRun = vi.spyOn(bridge, "cancel");
    expect(await cancel(run?.id ?? "")).toMatchObject({ status: "cancelled", source: "simulated" });
    expect(cancelRun).not.toHaveBeenCalled();
  });

  test("on connect, the bridge's runs join the lists and a running one is followed", async () => {
    agentStore.disconnect();
    vi.spyOn(bridge, "pollPair").mockResolvedValue(TOKEN);
    vi.spyOn(bridge, "status").mockResolvedValue(bridgeStatus);
    vi.spyOn(bridge, "unpair").mockResolvedValue();
    // Newest first, as the bridge lists them.
    vi.spyOn(bridge, "listRuns").mockResolvedValue([
      started({ id: "run-bbbb0002", status: "running", startedAt: "2026-10-30T11:00:00.000Z" }),
      started({
        id: "run-bbbb0001",
        status: "done",
        code: 0,
        startedAt: "2026-10-30T10:00:00.000Z",
        finishedAt: "2026-10-30T10:05:00.000Z",
      }),
    ]);
    const follow = vi.spyOn(bridge, "follow").mockReturnValue(new Promise(() => {}));
    await agentControls.begin("codex");
    await until(() => (cached()?.length ?? 0) === 2);
    expect(cached()?.map((r) => [r.id, r.status])).toEqual([
      ["run-bbbb0002", "running"],
      ["run-bbbb0001", "done"],
    ]);
    expect(follow).toHaveBeenCalledTimes(1);
    expect(follow.mock.calls[0][1]).toBe("run-bbbb0002");
  });
});

describe("the lists of runs", () => {
  test("a bridge run sits among the server's, newest first", async () => {
    const simulated = await api.startCodexRun(ID, "next_step");
    // A bridge run started later than the mock one, and one earlier.
    await connectBridge();
    vi.spyOn(bridge, "startRun").mockResolvedValue(
      started({ id: "run-cccc0001", startedAt: new Date(Date.now() + 60_000).toISOString() }),
    );
    vi.spyOn(bridge, "follow").mockReturnValue(new Promise(() => {}));
    const { start } = capture(useStartCodexRun);
    await start(ID, "next_step");

    const merged = withBridgeRuns(await api.codexRuns(ID), ID);
    expect(merged.map((r) => r.id)).toEqual(["run-cccc0001", simulated.id]);
    // Another issue sees neither.
    expect(withBridgeRuns(await api.codexRuns("wf-ss0lo"), "wf-ss0lo")).toEqual([]);
    // With no issue, every run.
    expect(withBridgeRuns(await api.codexRuns()).map((r) => r.id)).toContain("run-cccc0001");
  });

  test("fromBridgeRun leaves out what the bridge did not say", () => {
    expect(fromBridgeRun(started())).toEqual({
      id: "run-0a1b2c3d",
      issue: ID,
      kind: "next_step",
      status: "running",
      by: "codex",
      agent: "codex",
      source: "bridge",
      phases: [],
      started_at: "2026-10-30T10:00:00.000Z",
    });
    expect(fromBridgeRun(started({ status: "failed", signal: "SIGKILL", code: null })).reason).toBe(
      "Codex was stopped by SIGKILL.",
    );
    expect(fromBridgeRun(started({ status: "failed", code: null })).reason).toBe(
      "Codex did not start.",
    );
  });
});
