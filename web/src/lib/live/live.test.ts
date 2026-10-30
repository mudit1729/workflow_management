// Live updates against the mock server: deltas reach the cache once, changed issues flash,
// activity is kept, and only notable events toast.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WorkspaceSnapshot } from "@/gen/types";

const toasts = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
);
vi.mock("sonner", () => ({ toast: toasts }));

import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { loadMock } from "@/lib/api/mock-bridge";
import { queryClient } from "@/lib/api/query-client";
import { applyServerEvent, setLiveNavigator, startLive } from "./index";
import { isRecentlyChanged, useLiveStore } from "./store";

let stop: () => void;
let controls: Awaited<ReturnType<typeof loadMock>>["mockControls"];

const cached = () => queryClient.getQueryData<WorkspaceSnapshot>(qk.snapshot());

beforeEach(async () => {
  vi.clearAllMocks();
  const mock = await loadMock();
  controls = mock.mockControls;
  // The tests name sample issues (wf-3k9x2 and so on): the shipped workspace has none.
  controls.loadSample();
  controls.setConnection("live");
  queryClient.clear();
  useLiveStore.setState({ activity: [], state: "live", rev: "" });
  queryClient.setQueryData(qk.snapshot(), await api.snapshot());
  stop = startLive(queryClient);
  await Promise.resolve();
  await Promise.resolve();
});

afterEach(() => {
  stop();
  setLiveNavigator(undefined);
});

describe("deltas", () => {
  test("an event updates the snapshot, flags the issue and records activity", async () => {
    const before = cached();
    controls.playNextEvent(); // codex appends a change to wf-3k9x2 T-3
    const after = cached();
    expect(after?.rev).not.toBe(before?.rev);
    expect(useLiveStore.getState().rev).toBe(after?.rev);
    expect(isRecentlyChanged("wf-3k9x2")).toBe(true);
    expect(isRecentlyChanged("wf-ss0lo")).toBe(false);
    const [latest] = useLiveStore.getState().activity;
    expect(latest).toMatchObject({ issue_id: "wf-3k9x2", kind: "change", author: "codex" });
    expect(toasts.info).not.toHaveBeenCalled();
    expect(toasts.warning).not.toHaveBeenCalled();
    expect(toasts.error).not.toHaveBeenCalled();
  });

  test("the cache matches a fresh snapshot after a run of events", async () => {
    for (let i = 0; i < 8; i++) controls.playNextEvent();
    const live = cached();
    const fresh = await api.snapshot();
    expect(live?.rev).toBe(fresh.rev);
    expect(live?.issues.map((i) => [i.id, i.status, i.signals.needs_you])).toEqual(
      fresh.issues.map((i) => [i.id, i.status, i.signals.needs_you]),
    );
    expect(live?.inbox).toEqual(fresh.inbox);
    expect(live?.diagnostics_count).toEqual(fresh.diagnostics_count);
  });

  test("a delta that was already applied is ignored", async () => {
    controls.playNextEvent();
    const once = cached();
    const mock = await loadMock();
    const delta = mock.server.store.events().find((e) => e.event === "delta");
    expect(delta).toBeDefined();
    const spy = vi.spyOn(queryClient, "setQueryData");
    if (delta) applyServerEvent(queryClient, delta);
    expect(spy).not.toHaveBeenCalled();
    expect(cached()).toBe(once);
  });
});

describe("notable activity", () => {
  const playAll = () => {
    for (let i = 0; i < 8; i++) controls.playNextEvent();
  };

  test("needs-you, expired lease and blocked each toast once", () => {
    playAll();
    expect(toasts.info).toHaveBeenCalledTimes(1);
    expect(toasts.warning).toHaveBeenCalledTimes(1);
    expect(toasts.error).toHaveBeenCalledTimes(1);
    const [headline, options] = toasts.info.mock.calls[0];
    expect(headline).toBe("@claude-sonnet needs you");
    expect(options.description).toMatch(/Promote learnings to the library/);
  });

  test("the Open action goes through the navigator and is absent without one", () => {
    playAll();
    expect(toasts.info.mock.calls[0][1].action).toBeUndefined();

    toasts.info.mockClear();
    controls.loadSample();
    const open = vi.fn();
    setLiveNavigator(open);
    playAll();
    const action = toasts.info.mock.calls[0][1].action;
    expect(action.label).toBe("Open");
    action.onClick();
    expect(open).toHaveBeenCalledWith("wf-x5hd3");
  });
});

describe("connection", () => {
  test("the status follows the server and held events replay on reconnect", () => {
    controls.setConnection("reconnecting");
    expect(useLiveStore.getState().state).toBe("reconnecting");
    const before = cached()?.rev;
    controls.playNextEvent();
    expect(cached()?.rev).toBe(before);

    controls.setConnection("live");
    expect(useLiveStore.getState().state).toBe("live");
    expect(cached()?.rev).not.toBe(before);
    expect(useLiveStore.getState().activity).toHaveLength(1);
  });
});

describe("workspace files", () => {
  const GOAL = "issues/wf/web/live-board-updates/goal.md";

  test("a written file reaches the board and marks the file queries stale", async () => {
    const file = await api.file(GOAL);
    queryClient.setQueryData(qk.files(), await api.files());
    queryClient.setQueryData(qk.file(GOAL), file);
    await api.writeFile({
      path: GOAL,
      text: (file.text as string).replace("\nstatus: in_progress\n", "\nstatus: review\n"),
      base_rev: file.rev,
    });
    expect(cached()?.issues.find((i) => i.id === "wf-3k9x2")?.status).toBe("review");
    expect(isRecentlyChanged("wf-3k9x2")).toBe(true);
    expect(queryClient.getQueryState(qk.files())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.file(GOAL))?.isInvalidated).toBe(true);
    expect((await api.file(GOAL)).text).toContain("\nstatus: review\n");
  });

  test("a stale save toasts the conflict and resolves to undefined; a delete throws", async () => {
    const { writeWorkspaceFile, deleteWorkspaceFile } = await import("@/lib/api/files");
    const file = await api.file(GOAL);
    await api.writeFile({ path: GOAL, text: `${file.text}\n` });
    const res = await writeWorkspaceFile({ path: GOAL, text: "x", base_rev: file.rev });
    expect(res).toBeUndefined();
    expect(toasts.warning).toHaveBeenCalledTimes(1);
    expect(String(toasts.warning.mock.calls[0][0])).toMatch(/goal\.md changed/);
    await expect(deleteWorkspaceFile({ path: GOAL, base_rev: file.rev })).rejects.toThrow(
      /goal\.md changed/,
    );
  });

  test("a new file reaches the snapshot as a card", async () => {
    await api.writeFile({
      path: "issues/wf/web/new-card/goal.md",
      text: "---\nid: wf-7ab3c\ntitle: New card\nstatus: planned\npriority: low\nsize: s\ncreated: 2026-10-22T16:30+05:30\n---\n\n## Context\n\nx\n\n## Success criteria\n\n- [ ] SC-1: When a user opens the card, the page shall show it within 1 s.\n",
    });
    expect(cached()?.issues.some((i) => i.id === "wf-7ab3c")).toBe(true);
    expect(isRecentlyChanged("wf-7ab3c")).toBe(true);
  });
});
