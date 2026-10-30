// Add work from the browser: the hooks over the mock server. Split reports its three steps and
// returns proposals; create writes the group and the issues in one commit and says what it made.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
import { qk } from "./keys";
import { queryClient } from "./query-client";
import { capture } from "./test-support";
import { SPLIT_STEPS, type WorkIssueInput } from "./types";
import { useCreateWork, useSplitWork } from "./work";

beforeEach(async () => {
  vi.clearAllMocks();
  (await loadMock()).mockControls.loadSample();
  queryClient.clear();
});

afterEach(() => vi.useRealTimers());

const issue = (title: string): WorkIssueInput => ({
  title,
  priority: "high",
  size: "s",
  status: "backlog",
  criteria: ["When a person signs in, the system shall open the board."],
});

describe("useSplitWork", () => {
  test("idle: the three steps, none in progress", () => {
    const work = capture(useSplitWork);
    expect(work.steps).toEqual(SPLIT_STEPS);
    expect(work.steps).toEqual([
      "Reading the group",
      "Reading linked context",
      "Splitting into issues",
    ]);
    expect(work.step).toBe(-1);
    expect(work.pending).toBe(false);
  });

  test("split takes about 2 s and resolves to 3 to 5 proposals", async () => {
    vi.useFakeTimers();
    const { split } = capture(useSplitWork);
    let result: Awaited<ReturnType<typeof split>>;
    void split({
      title: "Add weekly reports",
      outcome: "Managers see progress each Monday.",
      size: "m",
      context: [],
    }).then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1100);
    expect(result?.issues.length).toBeGreaterThanOrEqual(3);
    expect(result?.issues.length).toBeLessThanOrEqual(5);
    expect(result?.issues[0].title).toBe("Define the behavior of weekly reports");
  });

  test("offline, two overlapping splits report one failure, not two", async () => {
    const mock = await loadMock();
    mock.mockControls.setConnection("offline");
    // The mock reads split offline as a failed request: the same error a dead server gives.
    const spy = vi
      .spyOn(api, "splitWork")
      .mockRejectedValue(new Error("No connection to wf serve"));
    try {
      const { split } = capture(useSplitWork);
      const input = { title: "Add weekly reports", outcome: "", size: "m" as const, context: [] };
      // StrictMode runs the start effect twice: two calls, one after the other.
      const [first, second] = await Promise.all([split(input), split(input)]);
      expect(first).toBeUndefined();
      expect(second).toBeUndefined();
      expect(toasts.error).toHaveBeenCalledTimes(1);
      // The toast has a stable id, so a repeat from elsewhere replaces it instead of stacking.
      expect(toasts.error.mock.calls[0]).toEqual([
        "Could not draft with Codex",
        { id: "work:draft with Codex", description: "No connection to wf serve" },
      ]);
    } finally {
      spy.mockRestore();
      mock.mockControls.setConnection("live");
    }
  });

  test("a group without a title is a toast and no result", async () => {
    const { split } = capture(useSplitWork);
    expect(await split({ title: " ", outcome: "", context: [] })).toBeUndefined();
    expect(toasts.error.mock.calls[0][0]).toBe("Give the group a title.");
  });
});

describe("useCreateWork", () => {
  const web = async () => {
    const snap = await api.snapshot();
    const find = (n: typeof snap.groups): string | undefined =>
      n.title === "web" ? n.id : n.children.map(find).find(Boolean);
    return find(snap.groups) as string;
  };

  test("a new group and its issues come back as ids, in the order sent", async () => {
    const create = capture(useCreateWork);
    const res = await create({
      group: { parent: await web(), title: "Weekly reports" },
      issues: [issue("Define the reports"), issue("Build the reports")],
    });
    expect(res?.issueIds).toHaveLength(2);
    expect(res?.groupId).toMatch(/^g-/);
    const snap = await api.snapshot();
    expect(res?.issueIds.map((id) => snap.issues.find((i) => i.id === id)?.title)).toEqual([
      "Define the reports",
      "Build the reports",
    ]);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  test("an existing group takes the issues", async () => {
    const create = capture(useCreateWork);
    const group = await web();
    const res = await create({ group, issues: [issue("Define the reports")] });
    expect(res?.groupId).toBe(group);
    expect(res?.issueIds).toHaveLength(1);
  });

  test("it asks for the snapshot again so the board shows the issues", async () => {
    queryClient.setQueryData(qk.snapshot(), await api.snapshot());
    const create = capture(useCreateWork);
    await create({ group: await web(), issues: [issue("Define the reports")] });
    expect(queryClient.getQueryState(qk.snapshot())?.isInvalidated).toBe(true);
  });

  test("a refused change is a toast with the first gap, and no result", async () => {
    const create = capture(useCreateWork);
    expect(await create({ group: await web(), issues: [] })).toBeUndefined();
    expect(toasts.error.mock.calls[0][0]).toBe("Add 1 to 8 issues at a time.");
    const none = await create({ group: "g-nope0", issues: [issue("x")] });
    expect(none).toBeUndefined();
    expect(toasts.error.mock.calls.at(-1)?.[0]).toBe("Group g-nope0 does not exist.");
  });

  test("a conflict is a warning, and nothing was added", async () => {
    const mock = await loadMock();
    mock.mockControls.conflictNextWrite();
    const before = (await api.snapshot()).issues.length;
    const create = capture(useCreateWork);
    expect(
      await create({ group: await web(), issues: [issue("Define the reports")] }),
    ).toBeUndefined();
    expect(toasts.warning).toHaveBeenCalled();
    expect((await api.snapshot()).issues).toHaveLength(before);
  });
});
