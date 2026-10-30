// Codex from the browser: the command "Open in Codex" copies, starting and stopping a run through
// the hook, and the live bridge that puts a run's moves into the cached lists.
import { beforeEach, describe, expect, test, vi } from "vitest";
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

import { api } from "./client";
import { codexCommand, connectCodexLive, useStartCodexRun } from "./codex";
import { qk } from "./keys";
import { queryClient } from "./query-client";
import { capture } from "./test-support";
import type { CodexRun, Delivery } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ID = "wf-3k9x2";

beforeEach(async () => {
  vi.clearAllMocks();
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
    const run = await start("wf-ss0lo", "next_step");
    expect(run).toMatchObject({
      status: "nothing_ready",
      reason: "No ready task. Plan the issue first.",
    });
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
