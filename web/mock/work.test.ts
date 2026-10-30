// Add work (plan D6): the split is deterministic and readable, and `create_work` writes the group
// and the issues as markdown in one commit that lints clean.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ServerEvent } from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import { suggestGroupNames } from "@/lib/api/names";
import { SPLIT_STEPS, type SplitInput, type WorkIssueInput } from "@/lib/api/types";
import { classifyEars } from "./ears";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";
import { proposeIssues, SPLIT_STEP_MS, split, subjectOf } from "./work";

// ---------------------------------------------------------------- the split

const INPUTS: Record<string, SplitInput> = {
  generic: {
    title: "Add weekly reports",
    outcome: "Managers see progress each Monday.",
    size: "m",
    context: [],
  },
  ui: {
    title: "Redesign the board filters",
    outcome: "Filters fit one row.",
    size: "l",
    context: [],
  },
  bug: {
    title: "Fix tab-title count",
    outcome: "The count matches the inbox.",
    size: "xs",
    context: [],
  },
  research: {
    title: "Compare queue engines",
    outcome: "One engine is chosen.",
    size: "s",
    context: [],
  },
  migration: {
    title: "Migrate the index to SQLite",
    outcome: "No file scan at start.",
    size: "l",
    context: [],
  },
  docs: {
    title: "Write the user guide",
    outcome: "A new reader finishes setup.",
    size: "m",
    context: [],
  },
  service: {
    title: "Add SSO login",
    outcome: "Teammates sign in with company SSO.",
    size: "m",
    context: [],
  },
  empty: { title: "Ship it", outcome: "", context: [] },
};

describe("split", () => {
  test.each(Object.entries(INPUTS))("%s: 3 to 5 proposals, the same every time", (_, input) => {
    const first = proposeIssues(input);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(5);
    expect(proposeIssues({ ...input, context: [...input.context] })).toEqual(first);
    expect(new Set(first.map((p) => p.key)).size).toBe(first.length);
  });

  test("the size of the group sets how many issues it splits into", () => {
    const count = (size: SplitInput["size"]) => proposeIssues({ ...INPUTS.generic, size }).length;
    expect([count("xs"), count("s"), count("m"), count("l")]).toEqual([3, 3, 4, 5]);
    expect(proposeIssues({ title: "Add weekly reports", outcome: "", context: [] })).toHaveLength(
      4,
    );
  });

  test.each(Object.entries(INPUTS))(
    "%s: titles start with a different imperative verb",
    (_, input) => {
      const proposals = proposeIssues(input);
      const verbs = proposals.map((p) => p.title.split(" ")[0]);
      for (const verb of verbs) expect(verb, verb).toMatch(/^[A-Z][a-z]+$/);
      // No two lines open with the same two words (writing-readable-bulk-text, scan test).
      const opening = proposals.map((p) => p.title.split(" ").slice(0, 2).join(" "));
      expect(new Set(opening).size).toBe(opening.length);
      expect(new Set(verbs).size).toBe(verbs.length);
      for (const p of proposals) {
        expect(p.title.length, p.title).toBeLessThanOrEqual(70);
        expect(p.title, "no trailing period").not.toMatch(/[.!?]$/);
      }
    },
  );

  test.each(Object.entries(INPUTS))(
    "%s: a criterion is an EARS sentence, a why is one line that gives the reason",
    (_, input) => {
      for (const p of proposeIssues(input)) {
        // `verify: manual` is what `create_work` writes under the criterion, so it is measurable.
        const ears = classifyEars(p.criterion, true);
        expect(ears.pattern, p.criterion).not.toBe("freeform");
        expect(p.criterion, "one sentence").toMatch(/^[^.]+\.$/);
        expect(p.criterion.split(/\s+/).length, p.criterion).toBeLessThanOrEqual(25);
        expect(p.why, p.why).toMatch(/^[A-Z][a-z]+ .+[.]$/);
        expect(p.why, "one line").not.toContain("\n");
        expect(["urgent", "high", "medium", "low", "none"]).toContain(p.priority);
        expect(["xs", "s", "m", "l"]).toContain(p.size);
      }
    },
  );

  test("no proposal uses a hedge word, a contraction or a word the glossary avoids", () => {
    const avoid =
      /\b(may|might|maybe|probably|likely|ticket|card|story|epic|publish|upstream|subtask)\b/i;
    for (const input of Object.values(INPUTS))
      for (const p of proposeIssues(input))
        for (const text of [p.title, p.criterion, p.why]) {
          expect(text, text).not.toMatch(avoid);
          expect(text, text).not.toMatch(/n['’]t\b/);
        }
  });

  test("the kind of work picks the template", () => {
    const first = (key: string) => proposeIssues(INPUTS[key])[0].title;
    expect(first("bug")).toBe("Reproduce the tab-title count problem");
    expect(first("research")).toBe("Frame the question for queue engines");
    expect(first("migration")).toBe("Inventory what the migration touches");
    expect(first("service")).toBe("Define the contract for SSO login");
    expect(first("generic")).toBe("Define the behavior of weekly reports");
    // The title decides: an outcome that mentions an error does not make a screen a bug.
    const screen = proposeIssues({ ...INPUTS.ui, outcome: "Show an error when a filter fails." });
    expect(screen[0].title).toBe("Sketch the states for board filters");
  });

  test("the subject loses its opening verb, its comma and its length", () => {
    expect(subjectOf("Add SSO login")).toBe("SSO login");
    expect(subjectOf("Compare queue engines")).toBe("queue engines");
    expect(subjectOf("Redesign the board filters")).toBe("board filters");
    expect(subjectOf("Fix tab-title count")).toBe("tab-title count");
    expect(subjectOf("Board, but faster")).toBe("board but faster");
    expect(
      subjectOf("Rebuild the whole importer pipeline for every workspace").length,
    ).toBeLessThanOrEqual(32);
    expect(subjectOf("Add")).toBe("this work");
  });

  test("a particle that belongs to the verb leaves with it, and a cut never ends on a small word", () => {
    expect(subjectOf("Speed up search")).toBe("search");
    expect(subjectOf("Decide on the billing provider")).toBe("billing provider");
    expect(subjectOf("Add keyboard shortcuts to the palette")).toBe("keyboard shortcuts");
    // A title without an opening verb keeps every word.
    expect(subjectOf("Up next")).toBe("up next");
    for (const title of [
      "Add keyboard shortcuts to the palette",
      "Build a dashboard for the weekly review of every team",
    ])
      expect(subjectOf(title), title).not.toMatch(
        /\b(a|an|and|at|by|for|from|in|into|of|on|or|the|to|with)$/i,
      );
  });

  test("an error in a title that builds something is not a bug group", () => {
    const first = (title: string) => proposeIssues({ title, outcome: "", context: [] })[0].title;
    expect(first("Add error handling to the API")).toBe("Define the contract for error handling");
    expect(first("Improve error messages")).toBe("Define the behavior of error messages");
    // A title that names the defect stays a bug group.
    expect(first("Fix error banner flicker")).toBe("Reproduce the error banner flicker problem");
    expect(first("Login error on Safari")).toBe("Reproduce the login error on Safari problem");
  });

  test("the bug criterion does not repeat a word of the subject", () => {
    const [first] = proposeIssues({ title: "Fix flaky login test", outcome: "", context: [] });
    expect(first.criterion).toBe(
      "A test for the flaky login test problem shall fail before the fix and pass after it.",
    );
    expect(classifyEars(first.criterion, true).pattern).not.toBe("freeform");
  });

  test("the first issue reads the context the person linked", () => {
    const names: Record<string, string> = {
      "lib-4tz7c": "Rescan subtrees on every event",
      workspace: "workspace",
    };
    const out = proposeIssues(
      { ...INPUTS.generic, context: ["lib-4tz7c", "workspace", "lib-zzzzz"] },
      (id) => names[id],
    );
    expect(out[0].why).toBe(
      "The behavior rests on Rescan subtrees on every event and workspace, so settle it first.",
    );
    expect(out[1].why).toBe(proposeIssues(INPUTS.generic)[1].why);
  });

  test("a long library title is named in full, never cut mid-word", () => {
    const long = "Rescan subtrees instead of trusting notify on macOS";
    const out = proposeIssues({ ...INPUTS.generic, context: ["lib-long"] }, (id) =>
      id === "lib-long" ? long : undefined,
    );
    expect(out[0].why).toBe(`The behavior rests on ${long}, so settle it first.`);
    expect(out[0].why).not.toContain("…");
  });

  test("two long titles name the first and count the rest", () => {
    const titles: Record<string, string> = {
      a: "Rescan subtrees instead of trusting notify on macOS",
      b: "Splice one value span; never re-serialize frontmatter",
      c: "Review promoted items before agents read them",
    };
    const out = proposeIssues({ ...INPUTS.generic, context: ["a", "b", "c"] }, (id) => titles[id]);
    expect(out[0].why).toBe(`The behavior rests on ${titles.a} and 2 more, so settle it first.`);
  });

  // Ordinary sentences, the way a person types an outcome. The group name is a noun phrase and
  // every title reads as a sentence around it (the Name step and the split share names.ts).
  const SENTENCES: { outcome: string; name: string; titles: string[] }[] = [
    {
      outcome: "Make the board feel instant when a lot of agents write at once",
      name: "Board speed",
      titles: [
        "Sketch the states for board speed",
        "Build the view for board speed",
        "Wire board speed to the data layer",
        "Reach board speed by keyboard",
      ],
    },
    {
      outcome:
        "Agents can resume any issue from the handoff bundle without reading the whole folder",
      name: "Handoff bundle",
      titles: [
        "Define the behavior of handoff bundle",
        "Build the core of handoff bundle",
        "Connect handoff bundle to the existing flow",
        "Handle failures in handoff bundle",
      ],
    },
    {
      outcome: "Teams install the workflow skills with one command",
      name: "Workflow skills",
      titles: [
        "Define the behavior of workflow skills",
        "Build the core of workflow skills",
        "Connect workflow skills to the existing flow",
        "Handle failures in workflow skills",
      ],
    },
    {
      outcome: "Let people sign in with single sign-on",
      name: "Single sign-on",
      titles: [
        "Define the behavior of single sign-on",
        "Build the core of single sign-on",
        "Connect single sign-on to the existing flow",
        "Handle failures in single sign-on",
      ],
    },
    {
      outcome: "Make onboarding smoother for a new teammate",
      name: "Onboarding smoothness",
      titles: [
        "Sketch the states for onboarding smoothness",
        "Build the view for onboarding smoothness",
        "Wire onboarding smoothness to the data layer",
        "Reach onboarding smoothness by keyboard",
      ],
    },
  ];

  test.each(SENTENCES)(
    "the outcome %# gives a noun name and titles that read as sentences",
    (c) => {
      const names = suggestGroupNames(c.outcome);
      expect(names).toHaveLength(3);
      expect(names[0]).toBe(c.name);
      const titles = proposeIssues({
        title: names[0],
        outcome: c.outcome,
        size: "m",
        context: [],
      }).map((p) => p.title);
      expect(titles).toEqual(c.titles);
      for (const t of titles) expect(t, t).not.toMatch(/\b(feel|can|install|write|resume)\b/);
    },
  );

  test("a name cut from the sentence is read again for its noun", () => {
    // The names the Name step used to offer for the first sentence were fragments.
    const outcome = SENTENCES[0].outcome;
    for (const title of ["Board feel instant", "Instant"]) {
      const titles = proposeIssues({ title, outcome, size: "m", context: [] }).map((p) => p.title);
      expect(titles, title).toEqual(SENTENCES[0].titles);
    }
    // A name the person wrote keeps their words.
    expect(
      proposeIssues({ title: "Faster boards", outcome, size: "m", context: [] })[1].title,
    ).toBe("Build the view for faster boards");
  });

  test("a why is a reason, not an instruction", () => {
    for (const input of Object.values(INPUTS))
      for (const p of proposeIssues(input))
        expect(p.why, p.why).not.toMatch(
          /^(Settle|Deliver|Wire|Show|Cover|Pin|Name|Change|Keep|Confirm|Put|Write|Read|Run|Follow|List|Prove|Delete|Draw|Refuse|Agree|Fix|Test|Compare|Give|Ship|Watch|Finish)\b/,
        );
  });

  test("an urgent outcome raises the first two priorities", () => {
    const out = proposeIssues({ ...INPUTS.generic, outcome: "Fix it today, this is a blocker." });
    expect(out.map((p) => p.priority)).toEqual(["urgent", "urgent", "medium", "medium"]);
  });

  test("a proposal is never larger than the group", () => {
    const order = ["xs", "s", "m", "l"];
    for (const size of ["xs", "s", "m", "l"] as const)
      for (const p of proposeIssues({ ...INPUTS.generic, size }))
        expect(order.indexOf(p.size)).toBeLessThanOrEqual(order.indexOf(size));
  });
});

describe("split takes about 2 s and reports three steps", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("the steps arrive in order, 650 ms apart, and the result comes after the third", async () => {
    const steps: number[] = [];
    let result: unknown;
    void split(INPUTS.generic, { onStep: (s) => steps.push(s) }).then((r) => {
      result = r;
    });
    expect(steps).toEqual([0]);
    await vi.advanceTimersByTimeAsync(SPLIT_STEP_MS);
    expect(steps).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(SPLIT_STEP_MS);
    expect(steps).toEqual([0, 1, 2]);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(SPLIT_STEP_MS);
    expect(result).toEqual({ issues: proposeIssues(INPUTS.generic) });
    expect(SPLIT_STEPS).toEqual([
      "Reading the group",
      "Reading linked context",
      "Splitting into issues",
    ]);
    expect(SPLIT_STEPS.length * SPLIT_STEP_MS).toBeGreaterThan(1800);
    expect(SPLIT_STEPS.length * SPLIT_STEP_MS).toBeLessThan(2200);
  });

  test("a group without a title is a 422", async () => {
    await expect(split({ ...INPUTS.generic, title: "  " })).rejects.toBeInstanceOf(ApiError);
  });

  test("the server resolves library ids, glossary terms and files for the first issue", async () => {
    const server = createMockServer({ latency: 0, disk: SAMPLE });
    const done = server.splitWork({
      ...INPUTS.generic,
      context: ["lib-4tz7c", "workflow.toml"],
    });
    await vi.advanceTimersByTimeAsync(3 * SPLIT_STEP_MS);
    const { issues } = await done;
    expect(issues[0].why).toMatch(
      /^The behavior rests on .+ and workflow\.toml, so settle it first\.$/,
    );
    expect(issues[0].why).not.toContain("lib-4tz7c");
  });
});

// ---------------------------------------------------------------- create_work

let server: MockServer;

beforeEach(() => {
  server = createMockServer({ latency: 0, disk: SAMPLE });
});

const issueFrom = (
  p: ReturnType<typeof proposeIssues>[number],
  extra: Partial<WorkIssueInput> = {},
): WorkIssueInput => ({
  title: p.title,
  priority: p.priority,
  size: p.size,
  status: "backlog",
  criteria: [p.criterion],
  ...extra,
});

async function rev() {
  return (await server.snapshot()).rev;
}

async function groupId(title: string) {
  const snap = await server.snapshot();
  const find = (n: typeof snap.groups): string | undefined =>
    n.title === title ? n.id : n.children.map(find).find(Boolean);
  const id = find(snap.groups);
  if (!id) throw new Error(`no group ${title}`);
  return id;
}

/** Every finding in the files `create_work` wrote, as `rule path`. */
async function findings(paths: string[]) {
  const out: string[] = [];
  for (const path of paths)
    for (const d of (await server.file(path)).diagnostics)
      out.push(`${d.rule} ${path}: ${d.message}`);
  return out;
}

describe("create_work", () => {
  const proposals = proposeIssues(INPUTS.generic);

  test("the issue ids ascend in the order the issues were given, so the board keeps the proposed order", async () => {
    const parent = await groupId("web");
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group: { parent, title: "Order check" },
      issues: proposals.map((p) => issueFrom(p)),
    })) as { work?: { issueIds: string[] } };
    const ids = res.work?.issueIds ?? [];
    expect(ids).toHaveLength(proposals.length);
    expect([...ids].sort()).toEqual(ids);
  });

  test("a new group and its issues are written as files in one commit with one activity entry", async () => {
    const parent = await groupId("web");
    const events: ServerEvent[] = [];
    server.subscribe((e) => events.push(e));
    const before = new Set(server.store.paths());
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group: { parent, title: "Single sign-on" },
      issues: proposals.map((p) => issueFrom(p)),
    })) as { created?: string; work?: { groupId: string; issueIds: string[] } };

    expect(res.work?.issueIds).toHaveLength(4);
    expect(res.created).toBe(res.work?.groupId);

    // ONE commit: one delta and one activity entry, however many files.
    expect(events.filter((e) => e.event === "delta")).toHaveLength(1);
    const activity = events.flatMap((e) => (e.event === "activity" ? [e.data] : []));
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      kind: "status",
      author: "shruti",
      title: "Added 4 issues to Single sign-on",
    });
    expect(activity[0].issue_id).toBe(res.work?.issueIds[0]);

    // `_group.md` and one `goal.md` per issue, nothing else. A folder name has at most 5 words
    // and leaves the small ones out (format.md section 1).
    const added = server.store.paths().filter((p) => !before.has(p));
    const groupDir = "issues/wf/web/single-sign-on";
    expect(added.sort()).toEqual(
      [
        `${groupDir}/_group.md`,
        `${groupDir}/define-behavior-weekly-reports/goal.md`,
        `${groupDir}/build-core-weekly-reports/goal.md`,
        `${groupDir}/connect-weekly-reports-existing-flow/goal.md`,
        `${groupDir}/handle-failures-weekly-reports/goal.md`,
      ].sort(),
    );
    expect(server.store.text(`${groupDir}/_group.md`)).toMatch(
      /^---\nid: g-[0-9a-hjkmnp-tv-z]{5}\ntitle: Single sign-on\n/,
    );

    // The board sees them: four backlog issues in the new group, owned by the acting author.
    const snap = await server.snapshot();
    // In the order they were sent.
    const made = (res.work?.issueIds ?? []).map((id) => snap.issues.find((i) => i.id === id));
    expect(made).toHaveLength(4);
    for (const [i, issue] of made.entries()) {
      expect(issue).toMatchObject({
        title: proposals[i].title,
        status: "backlog",
        size: proposals[i].size,
        priority: proposals[i].priority,
        owner: "shruti",
        group: res.work?.groupId,
      });
    }
    expect(made[0]?.group_path).toEqual(["wf", "web", "Single sign-on"]);
  });

  test("the result lints clean: no finding in any file it wrote", async () => {
    const parent = await groupId("web");
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group: { parent, title: "Single sign-on" },
      issues: proposals.map((p, i) => issueFrom(p, { status: i === 0 ? "planned" : "backlog" })),
    })) as { work?: { issueIds: string[] } };
    const snap = await server.snapshot();
    const paths = snap.issues
      .filter((i) => res.work?.issueIds.includes(i.id))
      .map((i) => `${i.path}/goal.md`);
    expect(paths).toHaveLength(4);
    expect(await findings([...paths, "issues/wf/web/single-sign-on/_group.md"])).toEqual([]);
    for (const id of res.work?.issueIds ?? []) {
      const d = await server.issue(id);
      expect(d.diagnostics, id).toEqual([]);
      // Each criterion is EARS and measurable (`verify: manual`).
      expect(d.criteria.map((c) => [c.ears.pattern === "freeform", c.ears.measurable])).toEqual([
        [false, true],
      ]);
    }
    expect((await server.issue(res.work?.issueIds[0] ?? "")).summary.status).toBe("planned");
  });

  test("an existing group takes the issues and no new group file", async () => {
    const group = await groupId("core");
    const before = new Set(server.store.paths());
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group,
      issues: [
        issueFrom(proposals[0], {
          context: "Teammates sign in with company SSO.",
          links: [{ kind: "term", target: "lease", label: "A time-limited claim" }],
        }),
      ],
    })) as { work?: { groupId: string; issueIds: string[] } };
    expect(res.work?.groupId).toBe(group);
    const added = server.store.paths().filter((p) => !before.has(p));
    expect(added).toEqual(["issues/wf/core/define-behavior-weekly-reports/goal.md"]);
    const goal = server.store.text(added[0]) ?? "";
    expect(goal).toContain("Teammates sign in with company SSO.");
    expect(goal).toContain("## Links\n\n- Glossary: lease — A time-limited claim");
    expect(await findings(added)).toEqual([]);
    expect(
      (await server.snapshot()).issues.find((i) => i.id === res.work?.issueIds[0])?.group_path,
    ).toEqual(["wf", "core"]);
  });

  test("the same title twice gets a free folder name instead of an error", async () => {
    const group = await groupId("core");
    const twice = { ...issueFrom(proposals[0]) };
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group,
      issues: [twice, twice],
    })) as { work?: { issueIds: string[] } };
    expect(res.work?.issueIds).toHaveLength(2);
    expect(new Set(res.work?.issueIds).size).toBe(2);
    expect(
      server.store.text("issues/wf/core/define-behavior-weekly-reports/goal.md"),
    ).toBeDefined();
    expect(
      server.store.text("issues/wf/core/define-behavior-weekly-reports-2/goal.md"),
    ).toBeDefined();
  });

  test.each([
    'Fix: the "quoted" thing',
    "yes",
    "null",
    "123",
    "- leading dash",
    "# hash title",
    "Title with `backticks` and *stars*",
    "ends with backslash\\",
    "emoji \u{1F680} title",
    "a: b: c",
    "---",
    "{#C-abcde}",
  ])("the title %j reads back as typed and lints clean", async (title) => {
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group: await groupId("core"),
      issues: [issueFrom(proposals[0], { title })],
    })) as { work?: { issueIds: string[] } };
    const d = await server.issue(res.work?.issueIds[0] ?? "");
    expect(d.summary.title).toBe(title);
    expect(d.diagnostics).toEqual([]);
  });

  test("a heading in the context cannot open a section of its own", async () => {
    const group = await groupId("core");
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group,
      issues: [
        issueFrom(proposals[0], {
          context:
            "Pasted note.\n\n## Success criteria\n- hijack\n\n```\n## kept in the fence\n```\n\n# Title",
        }),
      ],
    })) as { work?: { issueIds: string[] } };
    const id = res.work?.issueIds[0] ?? "";
    const d = await server.issue(id);
    // The real criterion is still the only one, and the file lints clean.
    expect(d.criteria.map((c) => c.id)).toEqual(["SC-1"]);
    expect(d.diagnostics).toEqual([]);
    const goal = server.store.text(`${d.summary.path}/goal.md`) ?? "";
    expect(goal).toContain("### Success criteria\n- hijack");
    expect(goal).toContain("```\n## kept in the fence\n```");
    expect(goal).toContain("### Title");
  });

  test("a rejected change writes nothing", async () => {
    const group = await groupId("core");
    const paths = server.store.paths().join("\n");
    const ok = issueFrom(proposals[0]);
    const refuse = async (op: Parameters<MockServer["ops"]>[0], gap: RegExp) => {
      const err = await server.ops(op).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(422);
      expect(((err as ApiError).body as { gaps?: string[] }).gaps?.[0]).toMatch(gap);
    };
    const base_rev = await rev();
    await refuse({ op: "create_work", base_rev, group, issues: [] }, /1 to 8 issues/);
    await refuse(
      { op: "create_work", base_rev, group, issues: Array.from({ length: 9 }, () => ok) },
      /1 to 8 issues/,
    );
    await refuse({ op: "create_work", base_rev, group: "g-nope0", issues: [ok] }, /does not exist/);
    await refuse(
      { op: "create_work", base_rev, group: { parent: "g-nope0", title: "X" }, issues: [ok] },
      /does not exist/,
    );
    await refuse(
      { op: "create_work", base_rev, group: { parent: group, title: "  " }, issues: [ok] },
      /group a title/,
    );
    await refuse(
      { op: "create_work", base_rev, group: { parent: group, title: "???" }, issues: [ok] },
      /letters or digits/,
    );
    await refuse(
      {
        op: "create_work",
        base_rev,
        group: { parent: await groupId("wf"), title: "Web" },
        issues: [ok],
      },
      /already exists/,
    );
    await refuse({ op: "create_work", base_rev, group, issues: [{ ...ok, title: " " }] }, /title/);
    await refuse(
      { op: "create_work", base_rev, group, issues: [{ ...ok, criteria: [" "] }] },
      /at least one criterion/,
    );
    await refuse(
      { op: "create_work", base_rev, group, issues: [{ ...ok, status: "done" as never }] },
      /backlog or planned/,
    );
    await refuse(
      { op: "create_work", base_rev, group, issues: [{ ...ok, priority: "huge" as never }] },
      /priority/,
    );
    await refuse(
      { op: "create_work", base_rev, group, issues: [{ ...ok, size: "xl" as never }] },
      /size/,
    );
    await refuse(
      {
        op: "create_work",
        base_rev,
        group,
        issues: [{ ...ok, links: [{ kind: "library", target: "lib-nope0", label: "x" }] }],
      },
      /does not exist/,
    );
    expect(server.store.paths().join("\n")).toBe(paths);
  });

  test("the outcome becomes the goal line of _group.md, in one line", async () => {
    const parent = await groupId("web");
    await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group: {
        parent,
        title: "Single sign-on",
        goal: "  Let people sign in\nwith single sign-on.  ",
      },
      issues: [issueFrom(proposals[0])],
    });
    const file = server.store.text("issues/wf/web/single-sign-on/_group.md") ?? "";
    expect(file).toMatch(
      /\ntitle: Single sign-on\ngoal: Let people sign in with single sign-on\.\nowner: "@shruti"\n/,
    );
    // The board reads it: the group node carries the goal for its tooltip.
    const find = (n: Awaited<ReturnType<typeof server.snapshot>>["groups"]): string | undefined =>
      n.title === "Single sign-on" ? n.goal : n.children.map(find).find(Boolean);
    expect(find((await server.snapshot()).groups)).toBe("Let people sign in with single sign-on.");
    expect(await findings(["issues/wf/web/single-sign-on/_group.md"])).toEqual([]);

    // No goal given: no `goal:` line.
    await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group: { parent, title: "Quiet group", goal: "   " },
      issues: [issueFrom(proposals[0])],
    });
    expect(server.store.text("issues/wf/web/quiet-group/_group.md")).not.toContain("goal:");
  });

  test("a new group takes the lowest color no sibling uses", async () => {
    const colors = async (parent: string) => {
      const snap = await server.snapshot();
      const find = (n: typeof snap.groups): typeof snap.groups | undefined =>
        n.id === parent ? n : n.children.map(find).find(Boolean);
      return (find(snap.groups)?.children ?? []).map((c) => c.color);
    };
    const parent = await groupId("wf");
    const made: number[] = [];
    for (const title of ["Alpha group", "Beta group", "Gamma group"]) {
      const used = await colors(parent);
      await server.ops({
        op: "create_work",
        base_rev: await rev(),
        group: { parent, title },
        issues: [issueFrom(proposals[0])],
      });
      const next = (await colors(parent)).filter(
        (c, i, all) => all.indexOf(c) === i && !used.includes(c),
      );
      const lowest = [1, 2, 3, 4, 5, 6, 7, 8].find((c) => !used.includes(c));
      // Every sibling keeps its color, and the new one is the lowest free number.
      expect(next).toEqual(lowest === undefined ? [] : [lowest]);
      made.push(lowest ?? 0);
    }
    expect(new Set(made).size).toBe(3);
    // new_group follows the same rule.
    const used = await colors(parent);
    await server.ops({
      op: "new_group",
      base_rev: await rev(),
      parent,
      title: "Delta",
      slug: "delta",
    });
    const after = await colors(parent);
    expect(used).not.toContain(after.at(-1));
  });

  test("a folder name has at most 5 words and leaves the small ones out", async () => {
    const group = await groupId("core");
    const res = (await server.ops({
      op: "create_work",
      base_rev: await rev(),
      group,
      issues: [
        issueFrom(proposals[0], { title: "Connect the single sign-on to the existing flow" }),
        issueFrom(proposals[1], {
          title: "Handle every one of the odd failures in the login flow today",
        }),
        issueFrom(proposals[2], { title: "The to of" }),
      ],
    })) as { work?: { issueIds: string[] } };
    const dirs = (await server.snapshot()).issues
      .filter((i) => res.work?.issueIds.includes(i.id))
      .map((i) => i.path.split("/").at(-1));
    expect(dirs).toEqual([
      "connect-single-sign-on-existing-flow",
      "handle-every-one-odd-failures",
      "the-to-of",
    ]);
    for (const d of dirs) expect((d ?? "").split("-").length).toBeLessThanOrEqual(6);
  });

  test("a simulated conflict names the group file", async () => {
    server.controls.conflictNextWrite();
    const group = await groupId("core");
    await expect(
      server.ops({
        op: "create_work",
        base_rev: await rev(),
        group,
        issues: [issueFrom(proposals[0])],
      }),
    ).rejects.toMatchObject({ status: 409, body: { file: "issues/wf/core/_group.md" } });
  });
});
