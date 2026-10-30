import { describe, expect, it } from "vitest";
import type { IssueSummary, NeedsYouItem } from "@/gen/types";
import {
  applyFilter,
  filterFromSearch,
  hasActiveFilter,
  needsYou,
  openRequestsFor,
  summarize,
} from "./filter";

function issue(id: string, over: Partial<IssueSummary> = {}): IssueSummary {
  return {
    id,
    title: `Issue ${id}`,
    status: "planned",
    priority: "medium",
    size: "m",
    labels: [],
    group: "g-1",
    group_path: [],
    path: `issues/${id}`,
    lease_holders: [],
    blocked_by: [],
    created: "2026-10-01T09:00+00:00",
    has_plan: false,
    progress: {} as IssueSummary["progress"],
    signals: {
      done_unmet: false,
      in_progress_no_plan: false,
      stale: false,
      lease_expired: false,
      state_behind_changes: false,
      needs_you: 0,
      needs_you_blocking: 0,
    },
    lint: { error: 0, warn: 0, info: 0 },
    status_ref: {} as IssueSummary["status_ref"],
    ...over,
  };
}

function request(issueId: string, to: string, over: Partial<NeedsYouItem> = {}): NeedsYouItem {
  return {
    issue: issueId,
    issue_title: `Issue ${issueId}`,
    id: `Q-${issueId}${to}`,
    question: "Approve?",
    from: "codex",
    to,
    kind: "approval",
    urgency: "blocking",
    asked: "2026-10-01T09:00+00:00",
    options: [],
    answered: false,
    edit: {} as NeedsYouItem["edit"],
    ...over,
  } as NeedsYouItem;
}

describe("the Needs you filter", () => {
  const issues = [issue("a"), issue("b"), issue("c")];

  it("reads ?needs=me from the board search", () => {
    expect(filterFromSearch({ needs: "me" }).needsMe).toBe(true);
    expect(filterFromSearch({}).needsMe).toBe(false);
  });

  it("counts as an active filter, so the summary reads 'N of M'", () => {
    expect(hasActiveFilter(filterFromSearch({ needs: "me" }))).toBe(true);
    expect(hasActiveFilter(filterFromSearch({}))).toBe(false);
  });

  it("keeps only the issues with an open request for the person", () => {
    const f = filterFromSearch({ needs: "me" });
    const shown = applyFilter(issues, f, new Set(["b"]));
    expect(shown.map((i) => i.id)).toEqual(["b"]);
  });

  it("shows nothing when the person has no open request", () => {
    expect(applyFilter(issues, filterFromSearch({ needs: "me" }), new Set())).toEqual([]);
    expect(applyFilter(issues, filterFromSearch({ needs: "me" }))).toEqual([]);
  });

  it("changes nothing without the flag", () => {
    expect(applyFilter(issues, filterFromSearch({}), new Set(["b"]))).toHaveLength(3);
  });

  it("combines with the text and the author filters", () => {
    const f = filterFromSearch({ needs: "me", q: "Issue a" });
    expect(applyFilter(issues, f, new Set(["a", "b"])).map((i) => i.id)).toEqual(["a"]);
    const byAuthor = [issue("a", { owner: "mudit" }), issue("b", { owner: "shruti" })];
    const g = filterFromSearch({ needs: "me", author: "shruti" });
    expect(applyFilter(byAuthor, g, new Set(["a", "b"])).map((i) => i.id)).toEqual(["b"]);
  });

  it("still hides cancelled issues unless asked", () => {
    const list = [issue("a"), issue("b", { status: "cancelled" })];
    const needs = new Set(["a", "b"]);
    expect(applyFilter(list, filterFromSearch({ needs: "me" }), needs).map((i) => i.id)).toEqual([
      "a",
    ]);
    expect(
      applyFilter(list, filterFromSearch({ needs: "me", show: "cancelled" }), needs),
    ).toHaveLength(2);
  });
});

describe("open requests for the person", () => {
  const inbox = [
    request("a", "shruti"),
    request("a", "shruti", { id: "Q-a2" }),
    request("b", "mudit"),
    request("c", "shruti", { answered: true }),
    request("d", "shruti", { urgency: "fyi" }),
  ];

  it("lists the unanswered requests addressed to them", () => {
    expect(openRequestsFor(inbox, "shruti").map((r) => r.id)).toEqual([
      "Q-ashruti",
      "Q-a2",
      "Q-dshruti",
    ]);
  });

  it("counts requests and the issues they sit in", () => {
    const n = needsYou(inbox, "shruti");
    expect(n.requests).toBe(3);
    expect([...n.issues].sort()).toEqual(["a", "d"]);
    expect(n.byIssue.get("a")).toBe(2);
    expect(n.byIssue.get("d")).toBe(1);
    expect(n.byIssue.get("b")).toBeUndefined();
  });

  it("is empty for someone nothing waits on", () => {
    const n = needsYou(inbox, "codex");
    expect(n.requests).toBe(0);
    expect(n.issues.size).toBe(0);
  });
});

describe("summarize", () => {
  // Issue a holds two open requests for shruti and one for mudit; b holds one for mudit only.
  const signals = (needs_you: number, needs_you_blocking = 0) => ({
    ...issue("x").signals,
    needs_you,
    needs_you_blocking,
  });
  const list = [
    issue("a", { signals: signals(3, 1) }),
    issue("b", { signals: signals(1) }),
    issue("c"),
  ];
  const inbox = [
    request("a", "shruti"),
    request("a", "shruti", { id: "Q-a2" }),
    request("a", "mudit", { id: "Q-a3" }),
    request("b", "mudit"),
  ];

  it("counts the open requests of everyone when it does not know who is acting", () => {
    expect(summarize(list)).toMatchObject({ total: 3, needsYou: 4, blocking: 1 });
  });

  it("counts what the Needs you toggle counts: the open requests for the acting person", () => {
    const mine = needsYou(inbox, "shruti");
    const line = summarize(list, mine);
    // The toggle says 2 (across the workspace); the line over the same issues says the same.
    expect(line.needsYou).toBe(mine.requests);
    expect(line.needsYou).toBe(2);
    expect(summarize(list, needsYou(inbox, "mudit")).needsYou).toBe(
      needsYou(inbox, "mudit").requests,
    );
  });

  it("counts only the issues in view, so a scope or a filter narrows it", () => {
    const mine = needsYou(inbox, "shruti");
    expect(summarize([list[1], list[2]], mine).needsYou).toBe(0);
    expect(summarize([list[0]], mine).needsYou).toBe(2);
  });

  it("counts the same requests with the Needs you filter on", () => {
    const mine = needsYou(inbox, "shruti");
    const shown = applyFilter(list, filterFromSearch({ needs: "me" }), mine.issues);
    expect(shown.map((i) => i.id)).toEqual(["a"]);
    expect(summarize(shown, mine).needsYou).toBe(mine.requests);
  });
});
