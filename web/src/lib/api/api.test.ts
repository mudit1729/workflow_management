// The client side of the data layer against the mock server: the move flow and its gate,
// optimistic writes with rollback, the 409 "Reapply" toast, and live deltas into the cache.
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DeltaEvent, IssueSummary, WorkspaceSnapshot } from "@/gen/types";
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
import { applyDelta } from "./delta";
import { requestMove, useMoveGate } from "./gate";
import { qk } from "./keys";
import { queryClient } from "./query-client";

const cachedIssue = (id: string): IssueSummary => {
  const found = queryClient
    .getQueryData<WorkspaceSnapshot>(qk.snapshot())
    ?.issues.find((i) => i.id === id);
  if (!found) throw new Error(`no ${id} in the cache`);
  return found;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

beforeEach(async () => {
  vi.clearAllMocks();
  (await loadMock()).mockControls.reset();
  queryClient.clear();
  useMoveGate.getState().cancel();
  queryClient.setQueryData(qk.snapshot(), await api.snapshot());
});

describe("applyDelta", () => {
  test("upserts, removes and replaces, and keeps the lint total in step", async () => {
    const snap = await api.snapshot();
    const [a, b] = snap.issues;
    const delta: DeltaEvent = {
      rev: "r2",
      issues_upserted: [
        { ...a, title: "Renamed", lint: { error: a.lint.error + 1, warn: 0, info: 0 } },
      ],
      issues_removed: [b.id],
      library_upserted: [],
      library_removed: [],
      details_changed: [a.id],
    };
    const next = applyDelta(snap, delta);
    expect(next.rev).toBe("r2");
    expect(next.issues).toHaveLength(snap.issues.length - 1);
    expect(next.issues.find((i) => i.id === a.id)?.title).toBe("Renamed");
    expect(next.issues.some((i) => i.id === b.id)).toBe(false);
    expect(next.groups).toBe(snap.groups);
    expect(next.inbox).toBe(snap.inbox);
    const lint = (s: WorkspaceSnapshot) => s.issues.reduce((n, i) => n + i.lint.error, 0);
    expect(next.diagnostics_count.error - snap.diagnostics_count.error).toBe(
      lint(next) - lint(snap),
    );
  });
});

describe("the move flow", () => {
  test("a legal move shows at once and is confirmed by the server", async () => {
    const issue = cachedIssue("wf-3k9x2");
    requestMove(issue, "review");
    await Promise.resolve();
    await Promise.resolve();
    expect(useMoveGate.getState().open).toBe(false);
    await settle();
    expect(cachedIssue("wf-3k9x2").status).toBe("review");
    expect((await api.issue("wf-3k9x2")).summary.status).toBe("review");
  });

  test("a move that worked toasts, and Undo writes the old status back", async () => {
    requestMove(cachedIssue("wf-3k9x2"), "review");
    await settle();
    expect(toasts).toHaveBeenCalledTimes(1);
    const [message, options] = toasts.mock.calls[0];
    expect(message).toBe("Moved wf-3k9x2 to Review");
    expect(options.description).toBe(cachedIssue("wf-3k9x2").title);
    expect(options.action.label).toBe("Undo");
    expect(cachedIssue("wf-3k9x2").status).toBe("review");

    options.action.onClick();
    await settle();
    await settle();
    expect(cachedIssue("wf-3k9x2").status).toBe("in_progress");
    expect((await api.issue("wf-3k9x2")).summary.status).toBe("in_progress");
    expect(toasts.mock.calls[1][0]).toBe("Moved wf-3k9x2 back to In progress");
  });

  test("an illegal move opens the gate; confirming forces it", async () => {
    const issue = cachedIssue("wf-ss0lo");
    requestMove(issue, "done");
    const gate = useMoveGate.getState();
    expect(gate).toMatchObject({ open: true, kind: "illegal", to: "done" });
    expect(gate.reason).toMatch(/not an allowed move/);
    expect(cachedIssue("wf-ss0lo").status).toBe("backlog");

    gate.confirm();
    expect(useMoveGate.getState().open).toBe(false);
    await settle();
    expect(cachedIssue("wf-ss0lo").status).toBe("done");
  });

  test("a move to done with open gaps opens the done gate", async () => {
    requestMove(cachedIssue("wf-3k9x2"), "done");
    const gate = useMoveGate.getState();
    expect(gate).toMatchObject({ open: true, kind: "done_gate" });
    expect(gate.gaps.join(" ")).toMatch(/criteria not verified/);
    gate.cancel();
    await settle();
    expect(cachedIssue("wf-3k9x2").status).toBe("in_progress");
  });

  test("a 409 rolls back, toasts, and Reapply writes the move", async () => {
    (await loadMock()).mockControls.conflictNextWrite();
    requestMove(cachedIssue("wf-3k9x2"), "review");
    await settle();

    expect(cachedIssue("wf-3k9x2").status).toBe("in_progress");
    expect(toasts.warning).toHaveBeenCalledTimes(1);
    const [message, options] = toasts.warning.mock.calls[0];
    expect(message).toBe("goal.md changed by @codex — reapply?");
    expect(options.action.label).toBe("Reapply");

    options.action.onClick();
    await settle();
    await settle();
    expect(cachedIssue("wf-3k9x2").status).toBe("review");
  });
});
