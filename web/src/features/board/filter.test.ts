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
  });

  it("is empty for someone nothing waits on", () => {
    const n = needsYou(inbox, "codex");
    expect(n.requests).toBe(0);
    expect(n.issues.size).toBe(0);
  });
});

describe("summarize", () => {
  it("counts issues that need someone, as before", () => {
    const list = [
      issue("a", {
        signals: { ...issue("a").signals, needs_you: 2, needs_you_blocking: 1 },
      }),
      issue("b"),
    ];
    expect(summarize(list)).toMatchObject({ total: 2, needsYou: 1, blocking: 1 });
  });
});
