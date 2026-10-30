import { describe, expect, it } from "vitest";
import type { GroupNode } from "@/gen/types";
import {
  canContinue,
  clicksToAdd,
  createArgs,
  currentIssue,
  currentSplit,
  type Draft,
  draftIssue,
  emptyDraft,
  GROUP_CLICK_BUDGET,
  GROUP_TYPED_LINES,
  ISSUE_DRAFT_STEPS,
  isDirty,
  issueContext,
  issueSignature,
  keptRows,
  MAX_WHERE_BUTTONS,
  nameProblem,
  outcomeProblem,
  pickIssueSlot,
  pickWhere,
  priorityFor,
  rowsFrom,
  STATUSES,
  slugOf,
  splitSignature,
  startsWithVerb,
  stepsFor,
  suggestNames,
  titleProblem,
  typedLines,
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
  it("asks the group path in the planned order and ends with the split", () => {
    expect(stepsFor("group", false)).toEqual([
      "kind",
      "where",
      "outcome",
      "name",
      "size",
      "priority",
      "context",
      "split",
    ]);
  });

  it("has no separate review on the group path: the split screen adds the issues", () => {
    expect(stepsFor("group", false)).not.toContain("review");
    expect(stepsFor("group", false).at(-1)).toBe("split");
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

describe("the click budget", () => {
  it("adds a group in at most 8 clicks, the one that opens the dialog included, and one typed line", () => {
    expect(GROUP_CLICK_BUDGET).toBe(8);
    expect(GROUP_TYPED_LINES).toBe(1);
    expect(clicksToAdd("group", false)).toBeLessThanOrEqual(GROUP_CLICK_BUDGET);
    expect(typedLines("group", false)).toBe(GROUP_TYPED_LINES);
  });

  it("counts: open, what, where, name, size, priority, context, add", () => {
    // 8 screens, the outcome is typed (Enter), so 7 button screens and the click that opens it.
    expect(stepsFor("group", false)).toHaveLength(8);
    expect(clicksToAdd("group", false)).toBe(8);
  });

  it("is shorter when the caller already knows the kind", () => {
    expect(clicksToAdd("group", true)).toBe(7);
    expect(clicksToAdd("issue", true)).toBe(7);
  });

  it("keeps a lone issue within the budget too, with one typed line", () => {
    expect(clicksToAdd("issue", false)).toBeLessThanOrEqual(GROUP_CLICK_BUDGET);
    expect(typedLines("issue", false)).toBe(1);
  });
});

describe("suggestNames", () => {
  it("names the subject, not the verb", () => {
    expect(suggestNames("Push board updates over SSE so the board stays live")).toEqual([
      "Board updates",
      "SSE",
      "Board updates improvements",
    ]);
  });

  it("drops a lead-in and the opening verb", () => {
    expect(suggestNames("Let people sign in with single sign-on")[0]).toBe("Single sign-on");
  });

  it("always offers three names for a sentence with a noun, each at most 32 characters", () => {
    for (const outcome of [
      "Add keyboard shortcuts to every dialog of the whole web application",
      "Make onboarding smoother for new teams",
      "Support OAuth2 login",
    ]) {
      const names = suggestNames(outcome);
      expect(names).toHaveLength(3);
      expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
      for (const n of names) expect(n.length).toBeLessThanOrEqual(32);
    }
  });

  it("skips names a sibling group already uses", () => {
    const names = suggestNames("Push board updates over SSE", ["board updates"]);
    expect(names).not.toContain("Board updates");
    expect(names).toHaveLength(3);
  });

  it("turns a quality into its noun", () => {
    expect(suggestNames("Make onboarding smoother for new teams")[0]).toBe("Onboarding smoothness");
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

  it("stays buttons up to twelve places", () => {
    expect(MAX_WHERE_BUTTONS).toBe(12);
    expect(whereOptions(TREE, "group").length).toBeLessThanOrEqual(MAX_WHERE_BUTTONS);
  });

  it("leaves room to add groups: the sample's eight and the shipped workspace's seven places still ask with buttons after one more group", () => {
    // Adding work makes a group, so a workspace that sits at the limit would turn the next
    // "Where?" into a search box. The sample has 8 places (root + 7), the shipped workspace 7.
    expect(8 + 1).toBeLessThanOrEqual(MAX_WHERE_BUTTONS);
    expect(MAX_WHERE_BUTTONS).toBeGreaterThan(9);
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

  it("lets the split screen add once an issue is kept, and not before", () => {
    const wf = TREE.children[0];
    const base = emptyDraft({ kind: "group", where: "g-wf", name: "Sign-in" });
    const rows = rowsFrom(
      [
        { key: "p1", title: "Define it", size: "s", priority: "high", criterion: "A", why: "W" },
        { key: "p2", title: "Build it", size: "m", priority: "high", criterion: "B", why: "W" },
      ],
      "high",
    );
    const withRows = (keep: boolean[]) => ({
      ...base,
      split: {
        signature: splitSignature(base),
        rows: rows.map((r, i) => ({ ...r, keep: keep[i] })),
      },
    });
    expect(canContinue(withRows([true, true]), "split", wf)).toBe(true);
    expect(canContinue(withRows([false, true]), "split", wf)).toBe(true);
    expect(canContinue(withRows([false, false]), "split", wf)).toBe(false);
  });

  it("does not let the split screen add proposals made for other answers", () => {
    // Back to Size, a new answer, Enter through Priority and Context: the loader is on show, and
    // the old four proposals must not be what the button adds.
    const wf = TREE.children[0];
    const base = emptyDraft({
      kind: "group",
      where: "g-wf",
      name: "Sign-in",
      outcome: "Let people sign in",
    });
    const rows = rowsFrom(
      [{ key: "p1", title: "Define it", size: "s", priority: "high", criterion: "A", why: "W" }],
      base.priority,
    );
    const made = { ...base, split: { signature: splitSignature(base), rows } };
    expect(canContinue(made, "split", wf)).toBe(true);
    for (const change of [
      { size: "l" },
      { outcome: "Let people sign in with a link" },
      { name: "Login" },
    ] as Partial<Draft>[]) {
      const stale = { ...made, ...change };
      expect(currentSplit(stale)).toBeUndefined();
      expect(keptRows(stale)).toEqual([]);
      expect(canContinue(stale, "split", wf)).toBe(false);
      expect(createArgs(stale)).toBeNull();
    }
    // The answers on screens the split does not read leave the proposals alone.
    expect(canContinue({ ...made, status: "planned" }, "split", wf)).toBe(true);
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
    // The draft's priority and status do not change what Codex read.
    expect(splitSignature({ ...base, priority: "low", status: "planned" })).toBe(same);
  });
});

describe("where the issues start", () => {
  const rows = rowsFrom(
    [{ key: "p1", title: "Define it", size: "s", priority: "high", criterion: "A", why: "W" }],
    "high",
  );
  const answers = emptyDraft({
    kind: "group",
    where: "g-wf",
    outcome: "Let people sign in",
    name: "Sign-in",
  });
  const draft = (status?: "backlog" | "planned") => ({
    ...answers,
    split: { signature: splitSignature(answers), rows },
    ...(status ? { status } : {}),
  });

  it("offers Backlog first and Planned second, the keys 1 and 2", () => {
    expect(STATUSES.map((s) => s.value)).toEqual(["backlog", "planned"]);
  });

  it("starts in Backlog unless the person picks Planned on the split screen", () => {
    expect(createArgs(draft())?.issues[0].status).toBe("backlog");
    expect(createArgs(draft("planned"))?.issues[0].status).toBe("planned");
  });

  it("does not change what Codex read, so the proposals stay when the choice changes", () => {
    expect(splitSignature(draft("planned"))).toBe(splitSignature(draft("backlog")));
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
    const answers = emptyDraft({
      kind: "group",
      where: "g-wf",
      outcome: "Let people sign in",
      name: " Sign-in ",
      status: "planned",
    });
    const draft = { ...answers, split: { signature: splitSignature(answers), rows } };
    const args = createArgs(draft);
    // The outcome is the group's goal line (_group.md, adding-work step 5).
    expect(args?.group).toEqual({
      parent: "g-wf",
      title: "Sign-in",
      goal: "Let people sign in",
    });
    expect(args?.issues).toHaveLength(1);
    expect(args?.issues[0]).toMatchObject({
      title: "Define the sign-in contract",
      status: "planned",
      priority: "medium",
      size: "s",
      criteria: ["The contract shall list each call."],
    });
    // The outcome lives in _group.md; the issue's context is its own reason.
    expect(args?.issues[0].context).toBe("Settle the contract first.");
    expect(keptRows(draft)).toHaveLength(1);
  });

  describe("one issue", () => {
    const answers = emptyDraft({
      kind: "issue",
      where: "g-web",
      title: " Fix tab-title count ",
      priority: "high",
      size: "xs",
    });
    const drafted = {
      ...answers,
      issue: {
        signature: issueSignature(answers),
        criterion: "When the failing step runs, the tab-title count problem shall not occur.",
        why: "Less changed code means less new risk, so make the smallest change.",
      },
    };

    it("builds one issue in an existing group with Codex's criterion and a real context", () => {
      const args = createArgs(drafted, "wf / web");
      expect(args?.group).toBe("g-web");
      expect(args?.issues).toHaveLength(1);
      expect(args?.issues[0]).toMatchObject({
        title: "Fix tab-title count",
        priority: "high",
        size: "xs",
        status: "backlog",
        criteria: ["When the failing step runs, the tab-title count problem shall not occur."],
        context:
          "Less changed code means less new risk, so make the smallest change.\n\nIt belongs to wf / web.",
      });
      expect(args?.issues[0].links).toBeUndefined();
    });

    it("writes no placeholder: no skill that does not exist, no circular criterion", () => {
      const issue = createArgs(drafted)?.issues[0];
      expect(issue?.context).not.toMatch(/write-goal|skill|TODO|Write this section/i);
      expect(issue?.criteria[0]).not.toMatch(/as the context describes/);
    });

    it("waits for the draft, and refuses one made for another title", () => {
      expect(createArgs(answers)).toBeNull();
      expect(canContinue(answers, "review", undefined)).toBe(false);
      expect(canContinue(drafted, "review", undefined)).toBe(true);
      const renamed = { ...drafted, title: "Fix the watcher" };
      expect(currentIssue(renamed)).toBeUndefined();
      expect(createArgs(renamed)).toBeNull();
      expect(canContinue(renamed, "review", undefined)).toBe(false);
      // Size, priority and status are not read by the draft.
      expect(currentIssue({ ...drafted, size: "l", priority: "low", status: "planned" })).toBe(
        drafted.issue,
      );
    });

    it("refuses an empty criterion", () => {
      const emptied = { ...drafted, issue: { ...drafted.issue, criterion: "  " } };
      expect(canContinue(emptied, "review", undefined)).toBe(false);
      expect(createArgs(emptied)).toBeNull();
    });

    it("keeps the person's edit of the criterion, on one line", () => {
      const edited = {
        ...drafted,
        issue: { ...drafted.issue, criterion: "  The count shall   match the open issues.\n" },
      };
      expect(createArgs(edited)?.issues[0].criteria).toEqual([
        "The count shall match the open issues.",
      ]);
    });

    it("names no group at the top level", () => {
      expect(createArgs(drafted)?.issues[0].context).toBe(
        "Less changed code means less new risk, so make the smallest change.",
      );
    });
  });

  it("links the context to every issue", () => {
    const item = {
      kind: "library" as const,
      target: "lib-4tz7c",
      label: "Rescan subtrees",
      title: "Rescan subtrees",
    };
    const answers = emptyDraft({
      kind: "issue",
      where: "g-web",
      title: "Fix the watcher",
      context: [item],
    });
    const args = createArgs({
      ...answers,
      issue: { signature: issueSignature(answers), criterion: "A shall B.", why: "W." },
    });
    expect(args?.issues[0].links).toEqual([
      { kind: "library", target: "lib-4tz7c", label: "Rescan subtrees" },
    ]);
  });

  it("needs a place", () => {
    const answers = emptyDraft({ kind: "issue", title: "Fix it" });
    const issue = { signature: issueSignature(answers), criterion: "A shall B.", why: "W." };
    expect(createArgs({ ...answers, issue })).toBeNull();
  });
});

describe("a lone issue's draft", () => {
  const proposals = [
    {
      key: "p1",
      title: "Reproduce the tab-title count problem",
      size: "xs",
      priority: "high",
      criterion:
        "A test for the tab-title count problem shall fail before the fix and pass after it.",
      why: "Failures that no test pins come back, so reproduce this one first.",
    },
    {
      key: "p2",
      title: "Find the cause of the tab-title count problem",
      size: "s",
      priority: "high",
      criterion: "The change entry shall name the cause of the tab-title count problem.",
      why: "Fixes that skip the root cause hide the problem, so name the cause.",
    },
    {
      key: "p3",
      title: "Fix the tab-title count problem",
      size: "s",
      priority: "medium",
      criterion: "When the failing step runs, the tab-title count problem shall not occur.",
      why: "Less changed code means less new risk, so make the smallest change.",
    },
  ] as const;

  it("takes the slot that opens with the verb of the title", () => {
    expect(pickIssueSlot("Fix tab-title count", proposals)?.key).toBe("p3");
    expect(pickIssueSlot("  find the leak", proposals)?.key).toBe("p2");
  });

  it("takes the slot that carries the work when no slot shares the verb, never a blank", () => {
    expect(pickIssueSlot("Add weekly reports", proposals)?.key).toBe("p2");
    expect(pickIssueSlot("", proposals)?.key).toBe("p2");
    expect(pickIssueSlot("Add it", proposals.slice(0, 1))?.key).toBe("p1");
    expect(pickIssueSlot("Add it", [])).toBeUndefined();
  });

  it("keeps the slot's criterion and reason, stamped with what it was drafted from", () => {
    const answers = emptyDraft({ kind: "issue", title: "Fix tab-title count" });
    const issue = draftIssue(issueSignature(answers), answers.title, proposals);
    expect(issue).toEqual({
      signature: issueSignature(answers),
      criterion: "When the failing step runs, the tab-title count problem shall not occur.",
      why: "Less changed code means less new risk, so make the smallest change.",
    });
    expect(currentIssue({ ...answers, issue })).toBe(issue);
  });

  it("reads the title and the linked context, nothing else", () => {
    const base = emptyDraft({ kind: "issue", title: "Fix tab-title count" });
    const same = issueSignature(base);
    expect(issueSignature({ ...base, title: " Fix tab-title count " })).toBe(same);
    expect(issueSignature({ ...base, title: "Fix the count" })).not.toBe(same);
    expect(
      issueSignature({
        ...base,
        context: [{ kind: "library", target: "lib-1", label: "L", title: "L" }],
      }),
    ).not.toBe(same);
    expect(issueSignature({ ...base, priority: "low", size: "l", status: "planned" })).toBe(same);
  });

  it("writes a real context from Codex's reason and the group", () => {
    expect(issueContext("It is the cause.", "wf / web")).toBe(
      "It is the cause.\n\nIt belongs to wf / web.",
    );
    expect(issueContext("It is the cause.", undefined)).toBe("It is the cause.");
  });

  it("has a progress line for every step Codex goes through", () => {
    expect(ISSUE_DRAFT_STEPS).toHaveLength(3);
  });
});

describe("isDirty", () => {
  it("is clean until the person typed or picked something", () => {
    expect(isDirty(emptyDraft({ kind: "group", where: "g-wf" }))).toBe(false);
    // Backlog or Planned alone is not worth a "discard?": the proposals above it are.
    expect(isDirty(emptyDraft({ kind: "group", where: "g-wf", status: "planned" }))).toBe(false);
    expect(isDirty(emptyDraft({ kind: "group", outcome: "Let people sign in" }))).toBe(true);
    expect(isDirty(emptyDraft({ kind: "issue", title: "Fix it" }))).toBe(true);
    expect(isDirty(emptyDraft({ kind: "group", name: "Sign-in" }))).toBe(true);
  });

  it("asks before discarding Codex's proposals, even with nothing else typed", () => {
    const rows = rowsFrom(
      [{ key: "p1", title: "Define it", size: "s", priority: "high", criterion: "A", why: "W" }],
      "high",
    );
    expect(isDirty(emptyDraft({ kind: "group", split: { signature: "x", rows } }))).toBe(true);
  });
});
