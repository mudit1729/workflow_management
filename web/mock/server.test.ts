// The mock server end to end: moves and gates, conflicts, ticks, requests, promote,
// creation, the live loop, reconnect replay and the archify switch.
import { beforeEach, describe, expect, test } from "vitest";
import type {
  Conflict,
  OpResult,
  ServerEvent,
  Unprocessable,
  WorkspaceSnapshot,
} from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import type { WfOp } from "@/lib/api/types";
import { EVENT_TARGETS } from "./data";
import { SCRIPT } from "./events";
import { createMockServer, type MockServer } from "./server";
import { toDate } from "./time";

let server: MockServer;

beforeEach(() => {
  server = createMockServer({ latency: 0 });
});

const issueOf = (s: WorkspaceSnapshot, id: string) => {
  const found = s.issues.find((i) => i.id === id);
  if (!found) throw new Error(`seed has no ${id}`);
  return found;
};

/** Run an op that must fail and hand back the ApiError. */
async function failure(op: WfOp): Promise<ApiError> {
  try {
    await server.ops(op);
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error("expected the op to be rejected");
}

async function move(id: string, status: string, force?: boolean): Promise<OpResult> {
  const snap = await server.snapshot();
  return server.ops({
    op: "set_status",
    base_rev: issueOf(snap, id).status_ref.rev,
    issue: id,
    status: status as never,
    force,
  });
}

async function moveFails(id: string, status: string, force?: boolean) {
  const snap = await server.snapshot();
  return failure({
    op: "set_status",
    base_rev: issueOf(snap, id).status_ref.rev,
    issue: id,
    status: status as never,
    force,
  });
}

function record(): { events: ServerEvent[]; stop: () => void } {
  const events: ServerEvent[] = [];
  return { events, stop: server.subscribe((e) => events.push(e)) };
}

describe("status moves", () => {
  test("a legal move writes, bumps the rev and emits a delta and an activity event", async () => {
    const before = await server.snapshot();
    const { events, stop } = record();
    const result = await move("wf-3k9x2", "review");
    stop();

    expect(result.rev).not.toBe(before.rev);
    expect(result.file_rev).not.toBe(issueOf(before, "wf-3k9x2").status_ref.rev);
    expect(result.issue?.status).toBe("review");
    const after = await server.snapshot();
    expect(after.rev).toBe(result.rev);
    expect(issueOf(after, "wf-3k9x2").status).toBe("review");
    expect(after.groups.rollup.by_status.review).toBe(before.groups.rollup.by_status.review + 1);

    const delta = events.find((e) => e.event === "delta");
    expect(delta?.event === "delta" && delta.data.issues_upserted.map((i) => i.id)).toContain(
      "wf-3k9x2",
    );
    expect(delta?.event === "delta" && delta.data.details_changed).toContain("wf-3k9x2");
    const activity = events.find((e) => e.event === "activity");
    expect(activity?.event === "activity" && activity.data.kind).toBe("status");
  });

  test("an illegal move is a 422 with steering text; force moves anyway", async () => {
    const err = await moveFails("wf-ss0lo", "done");
    expect(err.status).toBe(422);
    const body = err.body as Unprocessable;
    expect(body.gaps?.[0]).toMatch(/Backlog → Done is not an allowed move/);

    const forced = await move("wf-ss0lo", "done", true);
    expect(forced.issue?.status).toBe("done");
  });

  test("moving to done with open gaps is a 422 that lists them; force confirms", async () => {
    const err = await moveFails("wf-3k9x2", "done");
    expect(err.status).toBe(422);
    const gaps = (err.body as Unprocessable).gaps ?? [];
    expect(gaps.join(" ")).toMatch(/criteria not verified/);
    expect(gaps.join(" ")).toMatch(/tasks not done/);

    const forced = await move("wf-3k9x2", "done", true);
    expect(forced.issue?.status).toBe("done");
    expect(forced.issue?.signals.done_unmet).toBe(true);
  });

  test("moving to the same status changes nothing", async () => {
    const before = await server.snapshot();
    const result = await move("wf-3k9x2", "in_progress");
    expect(result.rev).toBe(before.rev);
  });

  test("an unknown issue is a 422", async () => {
    const err = await failure({
      op: "set_status",
      base_rev: "x",
      issue: "wf-zzzzz",
      status: "done",
    });
    expect(err.status).toBe(422);
  });
});

describe("conflicts", () => {
  test("conflictNextWrite rejects exactly the next op with the codex conflict", async () => {
    server.controls.conflictNextWrite();
    const err = await moveFails("wf-3k9x2", "review");
    expect(err.status).toBe(409);
    const body = err.body as Conflict;
    expect(body.reason).toBe("goal.md changed by @codex");
    expect(body.by).toBe("codex");
    expect(body.file).toMatch(/live-board-updates\/goal\.md$/);

    const ok = await move("wf-3k9x2", "review");
    expect(ok.issue?.status).toBe("review");
  });

  test("a stale base_rev on the same anchor is a 409; another anchor is re-found", async () => {
    const detail = await server.issue("wf-3k9x2");
    const sc4 = detail.criteria.find((c) => c.id === "SC-4");
    const sc5 = detail.criteria.find((c) => c.id === "SC-5");
    const base = sc4?.edit.rev ?? "";
    expect(sc5?.edit.rev).toBe(base);

    await server.ops({
      op: "toggle_criterion",
      base_rev: base,
      issue: "wf-3k9x2",
      id: "SC-4",
      checked: true,
    });

    const stale = await failure({
      op: "toggle_criterion",
      base_rev: base,
      issue: "wf-3k9x2",
      id: "SC-4",
      checked: false,
    });
    expect(stale.status).toBe(409);
    expect((stale.body as Conflict).reason).toMatch(/goal\.md changed/);

    const other = await server.ops({
      op: "toggle_criterion",
      base_rev: base,
      issue: "wf-3k9x2",
      id: "SC-5",
      checked: true,
    });
    expect(other.issue?.progress.criteria.claimed).toBe(3);
  });

  test("a rev the file never had is a 409", async () => {
    const err = await failure({
      op: "toggle_criterion",
      base_rev: "deadbeef",
      issue: "wf-3k9x2",
      id: "SC-4",
      checked: true,
    });
    expect(err.status).toBe(409);
  });

  test("a change by an agent makes an older rev stale for that anchor", async () => {
    const detail = await server.issue("wf-3k9x2");
    const t3 = detail.plan?.phases.flatMap((p) => p.tasks).find((t) => t.id === "T-3");
    expect(t3).toBeDefined();
    server.playNext(); // codex ticks step 2 of T-3
    const err = await failure({
      op: "toggle_step",
      base_rev: t3?.steps[1].edit.rev ?? "",
      issue: "wf-3k9x2",
      task: "T-3",
      index: 2,
      checked: false,
    });
    expect(err.status).toBe(409);
    expect((err.body as Conflict).by).toBe("codex");
  });
});

describe("criteria, steps and tasks", () => {
  test("ticking a criterion makes it claimed; unticking opens it again", async () => {
    const detail = await server.issue("wf-3k9x2");
    const sc4 = detail.criteria.find((c) => c.id === "SC-4");
    expect(sc4?.state).toBe("open");

    const ticked = await server.ops({
      op: "toggle_criterion",
      base_rev: sc4?.edit.rev ?? "",
      issue: "wf-3k9x2",
      id: "SC-4",
      checked: true,
    });
    expect(ticked.issue?.progress.criteria.claimed).toBe(
      detail.summary.progress.criteria.claimed + 1,
    );
    const after = await server.issue("wf-3k9x2");
    const claimed = after.criteria.find((c) => c.id === "SC-4");
    expect(claimed?.state).toBe("claimed");
    expect(claimed?.checked).toBe(true);
    expect(claimed?.evidence).toBeUndefined();

    await server.ops({
      op: "toggle_criterion",
      base_rev: claimed?.edit.rev ?? "",
      issue: "wf-3k9x2",
      id: "SC-4",
      checked: false,
    });
    expect((await server.issue("wf-3k9x2")).criteria.find((c) => c.id === "SC-4")?.state).toBe(
      "open",
    );
  });

  test("unticking a verified criterion drops its evidence", async () => {
    const detail = await server.issue("wf-3k9x2");
    const sc1 = detail.criteria.find((c) => c.id === "SC-1");
    expect(sc1?.state).toBe("verified");
    await server.ops({
      op: "toggle_criterion",
      base_rev: sc1?.edit.rev ?? "",
      issue: "wf-3k9x2",
      id: "SC-1",
      checked: false,
    });
    const after = (await server.issue("wf-3k9x2")).criteria.find((c) => c.id === "SC-1");
    expect(after?.state).toBe("open");
    expect(after?.evidence).toBeUndefined();
  });

  test("a step and a task status write to plan.md", async () => {
    const detail = await server.issue("wf-3k9x2");
    const t4 = detail.plan?.phases.flatMap((p) => p.tasks).find((t) => t.id === "T-4");
    expect(t4?.ready).toBe(true);

    await server.ops({
      op: "toggle_step",
      base_rev: t4?.steps[0].edit.rev ?? "",
      issue: "wf-3k9x2",
      task: "T-4",
      index: 1,
      checked: true,
    });
    await server.ops({
      op: "set_task_status",
      base_rev: t4?.edit.rev ?? "",
      issue: "wf-3k9x2",
      task: "T-4",
      status: "in_progress",
    });
    const after = (await server.issue("wf-3k9x2")).plan?.phases
      .flatMap((p) => p.tasks)
      .find((t) => t.id === "T-4");
    expect(after?.status).toBe("in_progress");
    expect(after?.steps[0].checked).toBe(true);
    expect(after?.claimed_by).toBe("shruti");
    expect(after?.lease).toBe("live");
    expect(after?.ready).toBe(false);
  });
});

describe("requests", () => {
  test("answer_request records the answer, who and when", async () => {
    const before = await server.snapshot();
    const item = before.inbox.find((i) => i.id === "Q-4m2pz");
    expect(item?.answered).toBe(false);

    const result = await server.ops({
      op: "answer_request",
      base_rev: item?.edit.rev ?? "",
      issue: "wf-3k9x2",
      id: "Q-4m2pz",
      answer: "approve",
    });
    expect(result.issue?.signals.needs_you).toBe(0);

    const detail = await server.issue("wf-3k9x2");
    const answered = detail.state?.needs_you.find((r) => r.id === "Q-4m2pz");
    expect(answered).toMatchObject({ answered: true, answer: "approve", answered_by: "shruti" });
    expect(answered?.answered_at).toMatch(/\+05:30$/);
    const inbox = (await server.snapshot()).inbox.find((i) => i.id === "Q-4m2pz");
    expect(inbox?.answered).toBe(true);
  });

  test("an empty answer is a 422 and an answered request is a 409", async () => {
    const item = (await server.snapshot()).inbox.find((i) => i.id === "Q-4m2pz");
    const base = item?.edit.rev ?? "";
    const empty = await failure({
      op: "answer_request",
      base_rev: base,
      issue: "wf-3k9x2",
      id: "Q-4m2pz",
      answer: "  ",
    });
    expect(empty.status).toBe(422);

    await server.ops({
      op: "answer_request",
      base_rev: base,
      issue: "wf-3k9x2",
      id: "Q-4m2pz",
      answer: "reject",
    });
    const again = await failure({
      op: "answer_request",
      base_rev: base,
      issue: "wf-3k9x2",
      id: "Q-4m2pz",
      answer: "approve",
    });
    expect(again.status).toBe(409);
  });
});

describe("library", () => {
  test("promote makes a draft with a source backlink and asks the group owner to review", async () => {
    const before = await server.issue("wf-3k9x2");
    const learning = before.learnings.find((l) => l.promote === "candidate" && !l.promoted_to);
    expect(learning).toBeDefined();
    const libraryBefore = (await server.snapshot()).library.length;

    const result = await server.ops({
      op: "promote",
      base_rev: learning?.edit.rev ?? "",
      issue: "wf-3k9x2",
      entry: learning?.id ?? "",
      kind: "pattern",
    });
    const id = result.created ?? "";
    expect(id).toMatch(/^lib-[0-9a-hjkmnp-tv-z]{5}$/);

    const snap = await server.snapshot();
    expect(snap.library).toHaveLength(libraryBefore + 1);
    const item = await server.libraryItem(id);
    expect(item.summary.status).toBe("draft");
    expect(item.summary.description).toMatch(/^Use when/);
    expect(item.source.map((r) => r.target)).toContain(`wf-3k9x2#${learning?.id}`);
    expect(item.sections.map((s) => s.heading)).toEqual([
      "Rule",
      "When to use",
      "Example",
      "Evidence",
    ]);

    const detail = await server.issue("wf-3k9x2");
    expect(detail.learnings.find((l) => l.id === learning?.id)?.promoted_to).toBe(id);
    const request = detail.state?.needs_you.find((r) => r.ref === `[[${id}]]`);
    expect(request).toMatchObject({
      from: "shruti",
      to: "shruti",
      urgency: "fyi",
      answered: false,
    });

    const again = await failure({
      op: "promote",
      base_rev: "x",
      issue: "wf-3k9x2",
      entry: learning?.id ?? "",
      kind: "pattern",
    });
    expect(again.status).toBe(422);
  });

  test("approve_library reviews a draft and closes its review request", async () => {
    const draft = (await server.snapshot()).library.find((l) => l.status === "draft");
    expect(draft).toBeDefined();
    const item = await server.libraryItem(draft?.id ?? "");
    const result = await server.ops({
      op: "approve_library",
      base_rev: item.edit.rev,
      id: item.summary.id,
    });
    expect(result.rev).toBeTruthy();

    const after = await server.libraryItem(item.summary.id);
    expect(after.summary.status).toBe("reviewed");
    expect(after.reviewed_by).toBe("shruti");
    expect(after.summary.last_reviewed).toBe(toDate(Date.now()));
  });
});

describe("creation", () => {
  test("new_issue scaffolds a backlog issue with only goal.md", async () => {
    const before = await server.snapshot();
    const web = before.groups.children[0].children.find((g) => g.slug === "web");
    expect(web).toBeDefined();
    const result = await server.ops({
      op: "new_issue",
      base_rev: before.rev,
      group: web?.id ?? "",
      slug: "keyboard-cheat-sheet",
      title: "Keyboard cheat sheet",
      template: "default",
    });
    const id = result.created ?? "";
    expect(id).toMatch(/^wf-[0-9a-hjkmnp-tv-z]{5}$/);

    const detail = await server.issue(id);
    expect(detail.summary).toMatchObject({
      status: "backlog",
      title: "Keyboard cheat sheet",
      has_plan: false,
      path: `${web?.path}/keyboard-cheat-sheet`,
    });
    expect(detail.plan).toBeNull();
    expect(detail.state).toBeNull();
    expect(detail.changes).toHaveLength(0);
    expect(Object.keys(detail.files_rev)).toEqual(["goal.md"]);
    expect(detail.criteria).toHaveLength(1);

    const after = await server.snapshot();
    expect(after.issues.some((i) => i.id === id)).toBe(true);
    expect(after.groups.children[0].children.find((g) => g.slug === "web")?.issue_ids).toContain(
      id,
    );
  });

  test("new_issue rejects a slug that is already a folder", async () => {
    const snap = await server.snapshot();
    const err = await failure({
      op: "new_issue",
      base_rev: snap.rev,
      group: issueOf(snap, "wf-3k9x2").group,
      slug: "live-board-updates",
      title: "Duplicate",
      template: "bug",
    });
    expect(err.status).toBe(422);
  });

  test("new_group adds a nested group", async () => {
    const snap = await server.snapshot();
    const result = await server.ops({
      op: "new_group",
      base_rev: snap.rev,
      parent: snap.groups.children[0].id,
      slug: "ops",
      title: "ops",
      color: 6,
    });
    const after = await server.snapshot();
    const created = after.groups.children[0].children.find((g) => g.id === result.created);
    expect(created).toMatchObject({ title: "ops", color: 6, implicit: false });
  });
});

describe("the live loop", () => {
  test("the eight events apply in order, twice, and keep the world valid", async () => {
    const start = await server.snapshot();
    const played: string[] = [];
    for (let i = 0; i < 8; i++) {
      const name = server.playNext();
      expect(name, `event ${i + 1} should apply on a fresh world`).toBe(SCRIPT[i].name);
      played.push(name as string);
    }
    expect(new Set(played).size).toBe(8);

    const mid = await server.snapshot();
    expect(mid.rev).not.toBe(start.rev);
    const t = EVENT_TARGETS;
    expect(issueOf(mid, t.moveToReview).status).toBe("review");
    expect(issueOf(mid, t.markBlocked.issue)).toMatchObject({
      status: "blocked",
      blocked_by: [t.markBlocked.by],
    });
    expect(issueOf(mid, t.newBlockingQuestion).signals.needs_you_blocking).toBe(1);
    expect(issueOf(mid, t.leaseExpires.issue).signals.lease_expired).toBe(true);
    expect(mid.inbox.find((i) => i.id === t.answerFyi.request)?.answered).toBe(true);
    const state = (await server.issue(t.rewriteState)).state;
    expect(state?.updated_by).toBe("claude-opus");
    expect(state?.needs_you.some((r) => r.id === "Q-4m2pz")).toBe(true);

    // Second pass: events whose target moved on are skipped; the rest apply again.
    for (let i = 0; i < 8; i++) server.playNext();
    const end = await server.snapshot();
    expect(end.issues).toHaveLength(start.issues.length);

    for (const id of end.issues.map((i) => i.id)) {
      const detail = await server.issue(id);
      const ids = [
        ...detail.changes.map((c) => c.id),
        ...detail.decisions.map((d) => d.id),
        ...detail.learnings.map((l) => l.id),
      ];
      expect(new Set(ids).size, `entry ids of ${id}`).toBe(ids.length);
      expect(detail.diagnostics.filter((d) => d.rule === "F009")).toHaveLength(0);
    }
  });

  test("an event whose target already moved is skipped", async () => {
    await move(EVENT_TARGETS.moveToReview, "review");
    const names = Array.from({ length: 8 }, () => server.playNext());
    expect(names).not.toContain("claude-sonnet moves an issue to review");
    expect(names.filter(Boolean).length).toBeGreaterThanOrEqual(6);
  });

  test("the loop stays valid after reset()", async () => {
    for (let i = 0; i < 8; i++) server.playNext();
    server.controls.reset();
    const fresh = await server.snapshot();
    expect(issueOf(fresh, EVENT_TARGETS.moveToReview).status).toBe("in_progress");
    for (let i = 0; i < 8; i++) expect(server.playNext()).toBe(SCRIPT[i].name);
  });

  test("notable activity: needs you, expired lease, blocked", async () => {
    const { events, stop } = record();
    for (let i = 0; i < 8; i++) server.playNext();
    stop();
    const notable = events.flatMap((e) =>
      e.event === "activity" && e.data.notable ? [e.data.notable] : [],
    );
    expect(notable.sort()).toEqual(["blocked", "lease_expired", "needs_you"]);
  });
});

describe("connection", () => {
  test("events pause while reconnecting and replay in order when live again", async () => {
    const { events, stop } = record();
    server.controls.setConnection("reconnecting");
    server.playNext();
    server.playNext();
    expect(events).toHaveLength(0);
    expect(server.connection()).toBe("reconnecting");

    server.controls.setConnection("live");
    stop();
    const deltas = events.filter((e) => e.event === "delta");
    expect(deltas).toHaveLength(2);
    expect(events.map((e) => e.event)).toEqual(["delta", "activity", "delta", "activity"]);
  });

  test("a gap beyond the ring buffer asks for a resync", async () => {
    server = createMockServer({ latency: 0, ringSize: 4 });
    const { events, stop } = record();
    server.controls.setConnection("offline");
    for (let i = 0; i < 6; i++) server.store.setArchify(i % 2 === 0);
    server.controls.setConnection("live");
    stop();
    expect(events.map((e) => e.event)).toEqual(["resync"]);
  });
});

describe("archify", () => {
  test("available turns stand-in diagrams ready; invalid stays invalid; off reverts", async () => {
    const statuses = async () => {
      const out: Record<string, string> = {};
      for (const id of ["wf-3k9x2", "wf-skf01", "wf-g5rx8"])
        for (const d of (await server.issue(id)).diagrams) out[d.id] = d.status;
      return out;
    };
    const before = await statuses();
    expect(before).toMatchObject({
      "live-board-architecture": "unavailable",
      "sse-delivery-flow": "unavailable",
      "skills-flow": "unavailable",
      "broken-release-flow": "invalid",
    });
    expect((await server.snapshot()).config.archify).toBe("unavailable");

    const { events, stop } = record();
    server.controls.setArchifyAvailable(true);
    stop();
    expect(await statuses()).toMatchObject({
      "live-board-architecture": "ready",
      "sse-delivery-flow": "ready",
      "skills-flow": "ready",
      "broken-release-flow": "invalid",
    });
    expect((await server.snapshot()).config.archify).toBe("available");
    const delta = events.find((e) => e.event === "delta");
    expect(delta?.event === "delta" && delta.data.details_changed).toEqual(
      expect.arrayContaining(["wf-3k9x2", "wf-skf01"]),
    );
    expect(events.filter((e) => e.event === "diagram")).toHaveLength(3);

    server.controls.setArchifyAvailable(false);
    expect(await statuses()).toEqual(before);
  });
});

describe("search and context", () => {
  test("search scores titles, ids and bodies and returns snippets", async () => {
    const hits = await server.search("sse delivery");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
    expect(hits.every((h) => h.snippet.length > 0)).toBe(true);

    const byId = await server.search("wf-3k9x2", "issues");
    expect(byId[0]).toMatchObject({ kind: "issue", id: "wf-3k9x2" });

    const lib = await server.search("notify", "library");
    expect(lib.length).toBeGreaterThan(0);
    expect(lib.every((h) => h.kind === "library")).toBe(true);
    expect(await server.search("zzzzqqqq")).toEqual([]);
  });

  test("context is a markdown bundle with stubs and reference data", async () => {
    const md = await server.context("wf-3k9x2", 6000);
    expect(md).toMatch(/^# wf-3k9x2 · Live board updates/);
    expect(md).toContain("status: in_progress");
    expect(md).toContain("## Goal");
    expect(md).toContain("- [x] SC-1 (verified)");
    expect(md).toContain("- [ ] SC-4 (open)");
    expect(md).toContain("## Current state");
    expect(md).toContain("## Ready tasks");
    expect(md).toMatch(/\[diagram architecture "[^"]+" · \d+ nodes · goal\.md:\d+\]/);
    expect(md).toMatch(/\[diagram workflow "[^"]+" · \d+ nodes · plan\.md:\d+\]/);
    expect(md).not.toContain("wf-diagram");
    expect(md).toContain("<reference-data");
    expect(md).toContain("Push board updates over SSE");

    const small = await server.context("wf-3k9x2", 600);
    expect(small.length).toBeLessThan(md.length);
    expect(small).toMatch(/left out:/);
  });
});
