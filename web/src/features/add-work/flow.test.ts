import { describe, expect, it } from "vitest";
import type { GroupNode } from "@/gen/types";
import {
  canContinue,
  createArgs,
  emptyDraft,
  isDirty,
  keptRows,
  MAX_WHERE_BUTTONS,
  nameProblem,
  outcomeProblem,
  pickWhere,
  priorityFor,
  rowsFrom,
  slugOf,
  splitSignature,
  startsWithVerb,
  stepsFor,
  subjectPhrase,
  suggestNames,
  titleProblem,
  whereOptions,
} from "./flow";

function group(id: string, title: string, children: GroupNode[] = [], order = 0): GroupNode {
  return {
    id,
    title,
    slug: slugOf(title),
    path: `issues/${slugOf(title)}`,
    color: 1,
    order,
    implicit: false,
    definition_of_done: [],
    rollup: {
      issues: 3,
      by_status: {} as GroupNode["rollup"]["by_status"],
      percent: 0,
      needs_you: 0,
      stale: 0,
      blocked: 0,
    },
    children,
    issue_ids: [],
  };
}

const TREE = group("g-root", "Issues", [
  group("g-wf", "wf", [group("g-core", "core", [], 0), group("g-web", "web", [], 1)], 0),
  group("g-plat", "platform", [group("g-auth", "auth")], 1),
]);

describe("stepsFor", () => {
  it("asks the group path in the planned order", () => {
    expect(stepsFor("group", false)).toEqual([
      "kind",
      "where",
      "outcome",
      "name",
      "size",
      "priority",
      "context",
      "split",
      "review",
    ]);
  });

  it("asks the issue path without a split and with its own status question", () => {
    const steps = stepsFor("issue", false);
    expect(steps).not.toContain("split");
    expect(steps).toEqual([
      "kind",
      "where",
      "title",
      "priority",
      "size",
      "status",
      "context",
      "review",
    ]);
  });

  it("drops the first question when the caller already knows the kind", () => {
    expect(stepsFor("group", true)[0]).toBe("where");
    expect(stepsFor("issue", true)[0]).toBe("where");
  });

  it("starts on the group path until the person picks one", () => {
    expect(stepsFor(undefined, false)).toEqual(stepsFor("group", false));
  });
});

describe("suggestNames", () => {
  it("names the subject, not the verb", () => {
    expect(suggestNames("Push board updates over SSE so the board stays live")).toEqual([
      "Board updates",
      "Board updates over SSE",
      "SSE",
    ]);
  });

  it("drops a lead-in and the opening verb", () => {
    expect(subjectPhrase("Let people sign in with single sign-on")).toEqual(["single", "sign-on"]);
    expect(suggestNames("Let people sign in with single sign-on")[0]).toBe("Single sign-on");
  });

  it("returns names of at most 32 characters, three at most, without duplicates", () => {
    const names = suggestNames(
      "Add keyboard shortcuts to every dialog of the whole web application",
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(32);
  });

  it("skips names a sibling group already uses", () => {
    const names = suggestNames("Push board updates over SSE", ["board updates"]);
    expect(names).not.toContain("Board updates");
    expect(names[0]).toBe("Board updates over SSE");
  });

  it("cuts a trailing comparative", () => {
    expect(suggestNames("Make onboarding smoother for new teams")[0]).toBe("Onboarding");
  });

  it("keeps acronyms and digits as typed", () => {
    expect(suggestNames("Migrate the index to SQLite")[0]).toBe("Index");
    expect(suggestNames("Support OAuth2 login")[0]).toBe("OAuth2 login");
  });

  it("returns nothing for an outcome with no words", () => {
    expect(suggestNames("   ")).toEqual([]);
  });
});

describe("startsWithVerb", () => {
  it("recognises a verb-first title", () => {
    expect(startsWithVerb("Fix tab-title count")).toBe(true);
    expect(startsWithVerb("  add SSO login")).toBe(true);
  });

  it("flags a noun-first title", () => {
    expect(startsWithVerb("Tab-title count")).toBe(false);
    expect(startsWithVerb("")).toBe(false);
  });
});

describe("whereOptions", () => {
  it("lists the top level first, then every group in tree order", () => {
    const options = whereOptions(TREE, "group");
    expect(options.map((o) => o.id)).toEqual([
      "g-root",
      "g-wf",
      "g-core",
      "g-web",
      "g-plat",
      "g-auth",
    ]);
    expect(options[0].label).toBe("Top level");
    expect(options[0].sub).toBe("Beside wf, platform");
    expect(options[2].label).toBe("Inside wf / core");
  });

  it("names the group itself on the issue path", () => {
    const options = whereOptions(TREE, "issue");
    expect(options[2].label).toBe("wf / core");
    expect(options[0].sub).toBe("Not in a group");
  });

  it("stays buttons up to eight places", () => {
    expect(MAX_WHERE_BUTTONS).toBe(8);
    expect(whereOptions(TREE, "group").length).toBeLessThanOrEqual(MAX_WHERE_BUTTONS);
  });

  it("picks the first candidate that is a real place", () => {
    const options = whereOptions(TREE, "group");
    expect(pickWhere(options, [undefined, "g-gone", "g-web", "g-wf"])).toBe("g-web");
    expect(pickWhere(options, [undefined, "g-gone"])).toBeUndefined();
  });
});

describe("priorityFor", () => {
  it("gives the first half the group's priority and the rest one step less", () => {
    expect([0, 1, 2, 3].map((i) => priorityFor("high", i, 4))).toEqual([
      "high",
      "high",
      "medium",
      "medium",
    ]);
    expect([0, 1, 2].map((i) => priorityFor("urgent", i, 3))).toEqual(["urgent", "urgent", "high"]);
  });

  it("never goes below none", () => {
    expect(priorityFor("none", 3, 4)).toBe("none");
    expect(priorityFor("low", 3, 4)).toBe("none");
  });
});

describe("validation", () => {
  it("wants a typed outcome and title", () => {
    expect(outcomeProblem("")).toBeDefined();
    expect(outcomeProblem("Let people sign in")).toBeUndefined();
    expect(titleProblem("ab")).toBeDefined();
    expect(titleProblem("Fix tab-title count")).toBeUndefined();
  });

  it("refuses a name a sibling group already uses", () => {
    const wf = TREE.children[0];
    expect(nameProblem("Web", wf)).toMatch(/already has a group/);
    expect(nameProblem("Billing", wf)).toBeUndefined();
    expect(nameProblem("   ", wf)).toBeDefined();
    expect(nameProblem("???", wf)).toBeDefined();
  });

  it("gates each screen on what it needs", () => {
    const wf = TREE.children[0];
    const draft = emptyDraft({ kind: "group", where: "g-wf", outcome: "Let people sign in" });
    expect(canContinue(draft, "kind", wf)).toBe(true);
    expect(canContinue(emptyDraft(), "kind", wf)).toBe(false);
    expect(canContinue(emptyDraft(), "where", wf)).toBe(false);
    expect(canContinue(draft, "outcome", wf)).toBe(true);
    expect(canContinue(draft, "name", wf)).toBe(false);
    expect(canContinue({ ...draft, name: "Sign-in" }, "name", wf)).toBe(true);
    expect(canContinue(draft, "split", wf)).toBe(false);
  });
});

describe("the split", () => {
  const proposals = [
    {
      key: "p1",
      title: "Define the sign-in contract",
      size: "s",
      priority: "high",
      criterion: "A",
      why: "W1",
    },
    {
      key: "p2",
      title: "Build the sign-in route",
      size: "m",
      priority: "high",
      criterion: "B",
      why: "W2",
    },
    {
      key: "p3",
      title: "Test the sign-in route",
      size: "s",
      priority: "low",
      criterion: "C",
      why: "W3",
    },
  ] as const;

  it("starts every row kept, with the group's priority spread over them", () => {
    const rows = rowsFrom([...proposals], "high");
    expect(rows.map((r) => r.keep)).toEqual([true, true, true]);
    expect(rows.map((r) => r.priority)).toEqual(["high", "high", "medium"]);
    expect(rows[1].size).toBe("m");
  });

  it("changes signature when the outcome, the name, the size or the context changes", () => {
    const base = emptyDraft({ kind: "group", name: "Sign-in", outcome: "Let people sign in" });
    const same = splitSignature({ ...base });
    expect(splitSignature({ ...base, outcome: "Let people sign in again" })).not.toBe(same);
    expect(splitSignature({ ...base, name: "Login" })).not.toBe(same);
    expect(splitSignature({ ...base, size: "l" })).not.toBe(same);
    // The draft's priority and status do not change what Codex reads.
    expect(splitSignature({ ...base, priority: "low", status: "planned" })).toBe(same);
  });
});

describe("createArgs", () => {
  it("builds a new group with the kept issues only", () => {
    const rows = rowsFrom(
      [
        {
          key: "p1",
          title: "Define the sign-in contract",
          size: "s",
          priority: "high",
          criterion: "The contract shall list each call.",
          why: "Settle the contract first.",
        },
        {
          key: "p2",
          title: "Build the sign-in route",
          size: "m",
          priority: "high",
          criterion: "The route shall answer.",
          why: "Deliver the main path.",
        },
      ],
      "medium",
    );
    rows[1].keep = false;
    const draft = emptyDraft({
      kind: "group",
      where: "g-wf",
      outcome: "Let people sign in",
      name: " Sign-in ",
      status: "planned",
      split: { signature: "x", rows },
    });
    const args = createArgs(draft);
    expect(args?.group).toEqual({ parent: "g-wf", title: "Sign-in" });
    expect(args?.issues).toHaveLength(1);
    expect(args?.issues[0]).toMatchObject({
      title: "Define the sign-in contract",
      status: "planned",
      priority: "medium",
      size: "s",
      criteria: ["The contract shall list each call."],
    });
    expect(args?.issues[0].context).toBe(
      "Settle the contract first.\n\nGroup outcome: Let people sign in",
    );
    expect(keptRows(draft)).toHaveLength(1);
  });

  it("builds one issue in an existing group", () => {
    const args = createArgs(
      emptyDraft({
        kind: "issue",
        where: "g-web",
        title: " Fix tab-title count ",
        priority: "high",
        size: "xs",
      }),
    );
    expect(args?.group).toBe("g-web");
    expect(args?.issues).toHaveLength(1);
    expect(args?.issues[0]).toMatchObject({
      title: "Fix tab-title count",
      priority: "high",
      size: "xs",
      status: "backlog",
    });
    expect(args?.issues[0].criteria).toHaveLength(1);
    expect(args?.issues[0].links).toBeUndefined();
  });

  it("links the context to every issue", () => {
    const item = {
      kind: "library" as const,
      target: "lib-4tz7c",
      label: "Rescan subtrees",
      title: "Rescan subtrees",
    };
    const args = createArgs(
      emptyDraft({ kind: "issue", where: "g-web", title: "Fix the watcher", context: [item] }),
    );
    expect(args?.issues[0].links).toEqual([
      { kind: "library", target: "lib-4tz7c", label: "Rescan subtrees" },
    ]);
  });

  it("needs a place", () => {
    expect(createArgs(emptyDraft({ kind: "issue", title: "Fix it" }))).toBeNull();
  });
});

describe("isDirty", () => {
  it("is clean until the person typed or picked something", () => {
    expect(isDirty(emptyDraft({ kind: "group", where: "g-wf" }))).toBe(false);
    expect(isDirty(emptyDraft({ kind: "group", outcome: "Let people sign in" }))).toBe(true);
    expect(isDirty(emptyDraft({ kind: "issue", title: "Fix it" }))).toBe(true);
    expect(isDirty(emptyDraft({ kind: "group", name: "Sign-in" }))).toBe(true);
  });
});
