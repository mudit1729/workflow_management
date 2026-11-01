// The resolver of the skills flow (flow.ts), pinned to the other implementation: `wf-env.sh flow`.
// Both read the same files, those of mock/flow-fixture (a workspace, a personal library, a team
// clone). `expected.json` holds the resolution as data: `scripts/wf-env-flow.test.ts` runs the
// script over the fixture and compares it to that file, this test runs the resolver and compares
// it to the same file, so the two cannot drift apart.
import { describe, expect, test } from "vitest";
import type { FlowConfig, FlowStepId } from "@/gen/types";
import { parseTeamEntries } from "../../../mock/libraries/libraries";
import { readPersonalFlow } from "../../../mock/libraries/personal-config";
import { flowOfText } from "../../../mock/md/parse-flow";
import {
  BUILTIN_FLOW,
  BUILTIN_SKILLS,
  customAfter,
  customStepId,
  FLOW_AFTER,
  FLOW_STEP_IDS,
  flowLine,
  flowOption,
  flowOptionsLine,
  flowOptionValue,
  flowSkillRefs,
  flowValueSummary,
  formatFlow,
  parseSkillRef,
  type ResolvedFlow,
  resolveFlow,
  skillName,
  skillWords,
} from "./flow";

// ---------------------------------------------------------------- the fixture

const files = import.meta.glob("../../../mock/flow-fixture/**/*.{md,toml,json}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const ROOT = "../../../mock/flow-fixture/";
const read = (rel: string): string => files[`${ROOT}${rel}`] as string;
/** The skill folders under a directory of the fixture. */
const skillFolders = (dir: string): string[] =>
  Object.keys(files)
    .filter((k) => k.startsWith(`${ROOT}${dir}/`) && k.endsWith("/SKILL.md"))
    .map((k) => k.slice(`${ROOT}${dir}/`.length).split("/")[0] as string);

const TEAM_TEXT = read("workspace/workflow.toml");
const ME_TEXT = read("libraries/shruti/wf-library/library.toml");
const ME_LIBRARIES = read("libraries/shruti/wf-library/libraries.toml");
const EXPECTED = JSON.parse(read("expected.json")) as {
  steps: Record<
    string,
    {
      skill: string;
      source: string;
      origin: string;
      options: Record<string, string | number>;
      unresolved?: { ref: string; origin: string };
    }
  >;
  custom: Record<
    string,
    { id: string; skill: string; required: boolean; label: string; origin: string }[]
  >;
};

/** The references that exist in the fixture: what the catalog would list. */
function fixtureRefs(opts: { personal: boolean }): Set<string> {
  const refs = new Set<string>(Object.values(BUILTIN_SKILLS));
  for (const n of skillFolders("workspace/skills")) refs.add(`ws:${n}`);
  if (opts.personal) {
    for (const n of skillFolders("libraries/shruti/wf-library/skills")) refs.add(`me:${n}`);
    // The personal libraries.toml names the team clones: platform → acme/platform-handbook, root docs.
    for (const t of parseTeamEntries(ME_LIBRARIES)) {
      const repo = t.url.replace("https://github.com/", "");
      for (const n of skillFolders(`libraries/${repo}/${t.root ?? ""}/skills`))
        refs.add(`${t.alias}:${n}`);
    }
  }
  return refs;
}

function fixtureFlow(opts: { personal: boolean }): ResolvedFlow {
  const refs = fixtureRefs(opts);
  return resolveFlow({
    team: flowOfText(TEAM_TEXT),
    me: opts.personal ? readPersonalFlow(ME_TEXT).flow : undefined,
    exists: (ref) => refs.has(ref),
  });
}

/** The flow in the shape of expected.json. */
function asExpected(flow: ResolvedFlow) {
  return {
    steps: Object.fromEntries(
      FLOW_STEP_IDS.map((id) => {
        const s = flow.steps[id];
        return [
          id,
          {
            skill: s.skill,
            source: s.source,
            origin: s.origin,
            options: Object.fromEntries(Object.values(s.options).map((o) => [o.key, o.value])),
            ...(s.unresolved
              ? { unresolved: { ref: s.unresolved.ref, origin: s.unresolved.origin } }
              : {}),
          },
        ];
      }),
    ),
    custom: Object.fromEntries(
      FLOW_AFTER.map((after) => [
        after,
        customAfter(flow, after, { all: true }).map((c) => ({
          id: c.id,
          skill: c.skill,
          required: c.required,
          label: c.label,
          origin: c.origin,
        })),
      ]),
    ),
  };
}

describe("the fixture of mock/flow-fixture", () => {
  test("resolves to expected.json: skills, sources, origins, options, labels", () => {
    expect(asExpected(fixtureFlow({ personal: true }))).toEqual(EXPECTED);
  });

  test("prints the flow in the lines wf-env.sh flow prints", () => {
    expect(formatFlow(fixtureFlow({ personal: true }))).toBe(
      [
        "add adding-work built-in built-in then=plan",
        "plan me:planning-small me me max_tasks=5",
        "do doing-next-step built-in built-in finish=review commit=task",
        "log logging-work built-in built-in",
        "handoff handing-off built-in built-in budget_tokens=4000 changes=5",
        "status checking-status built-in built-in issue_hours=12 task_hours=4",
        "style writing-readable-bulk-text built-in built-in",
        "after:do security-check platform:checking-security true team",
        "after:do changelog ws:writing-changelog false team",
        "after:do tidy-up me:tidying-up false me",
        "after:handoff notify-me me:notifying-me false me",
        "unresolved status ws:gone-status team",
      ].join("\n"),
    );
  });

  test("without a personal library only the team's flow applies, and the clone cannot be found", () => {
    const flow = fixtureFlow({ personal: false });
    // No libraries.toml, so platform:checking-security does not resolve either.
    expect(flow.custom.find((c) => c.id === "security-check")?.unresolved).toBe(true);
    expect(flow.steps.plan.skill).toBe("ws:acme-planning");
    expect(flow.steps.do.options.finish?.value).toBe("verify");
    expect(formatFlow(flow)).toContain(
      "unresolved after:do security-check platform:checking-security team",
    );
  });

  test("team alone: the team default of Settings' Team default view", () => {
    const refs = fixtureRefs({ personal: true });
    const team = resolveFlow({ team: flowOfText(TEAM_TEXT), exists: (r) => refs.has(r) });
    expect(team.steps.plan).toMatchObject({ skill: "ws:acme-planning", origin: "team" });
    expect(team.steps.do.options.finish).toMatchObject({ value: "verify", origin: "built-in" });
    // A person's step is not in the team's flow.
    expect(team.custom.map((c) => c.id)).toEqual(["security-check", "changelog"]);
  });
});

// ---------------------------------------------------------------- the rule

const cfg = (c: Partial<FlowConfig> = {}): FlowConfig => ({ steps: {}, custom: {}, ...c });

describe("resolveFlow", () => {
  test("nothing set is the built-in flow", () => {
    expect(BUILTIN_FLOW.differs).toBe(false);
    expect(BUILTIN_FLOW.problems).toEqual([]);
    for (const id of FLOW_STEP_IDS) {
      expect(BUILTIN_FLOW.steps[id]).toMatchObject({
        skill: BUILTIN_SKILLS[id],
        origin: "built-in",
        source: "built-in",
      });
    }
    expect(flowOptionValue(BUILTIN_FLOW, "plan", "max_tasks")).toBe(8);
    expect(flowOptionValue(BUILTIN_FLOW, "do", "finish")).toBe("verify");
    expect(flowOptionValue(BUILTIN_FLOW, "handoff", "budget_tokens")).toBe(6000);
    expect(flowLine(BUILTIN_FLOW)).toBeUndefined();
  });

  test("my value wins over the team's, key by key, and each value has its own origin", () => {
    const flow = resolveFlow({
      team: cfg({
        steps: { plan: { skill: "ws:team-plan", max_tasks: 5 }, do: { finish: "review" } },
      }),
      me: cfg({ steps: { plan: { skill: "me:my-plan" }, do: { commit: "none" } } }),
    });
    expect(flow.steps.plan).toMatchObject({
      skill: "me:my-plan",
      origin: "me",
      teamSkill: "ws:team-plan",
    });
    // max_tasks: only the team set it.
    expect(flow.steps.plan.options.max_tasks).toMatchObject({
      value: 5,
      origin: "team",
      isDefault: false,
    });
    expect(flow.steps.do.options.finish).toMatchObject({ value: "review", origin: "team" });
    expect(flow.steps.do.options.commit).toMatchObject({ value: "none", origin: "me" });
    expect(flow.differs).toBe(true);
  });

  test("a team-only option is read from the team's limits and never from a person", () => {
    const flow = resolveFlow({
      team: cfg({ limits: { budget_tokens: 4000, issue_hours: 12 } }),
      // Not even a hand-written value in a personal file counts.
      me: cfg({ steps: { handoff: { skill: "handing-off" } }, limits: { budget_tokens: 10000 } }),
    });
    expect(flow.steps.handoff.options.budget_tokens).toMatchObject({ value: 4000, origin: "team" });
    expect(flow.steps.handoff.options.changes).toMatchObject({ value: 5, origin: "built-in" });
    expect(flow.steps.status.options.issue_hours).toMatchObject({ value: 12, origin: "team" });
  });

  test("a reference that does not resolve falls back to the built-in skill and is reported", () => {
    const flow = resolveFlow({
      team: cfg({ steps: { plan: { skill: "ws:acme-planning" } } }),
      me: cfg({ steps: { plan: { skill: "me:gone" } } }),
      exists: (r) => r === "ws:acme-planning",
    });
    // Mine wins even though it is missing: the built-in runs, not the team's.
    expect(flow.steps.plan).toMatchObject({
      skill: "planning-issues",
      origin: "built-in",
      teamSkill: "ws:acme-planning",
    });
    expect(flow.steps.plan.unresolved).toMatchObject({ ref: "me:gone", origin: "me" });
    expect(flow.problems).toHaveLength(1);
    expect(flow.problems[0]?.message).toContain("me:gone is not in your library");
    expect(flow.problems[0]?.message).toContain("Using planning-issues");
    expect(flow.differs).toBe(false);
  });

  test("a well-formed reference is taken as found until the catalog says otherwise", () => {
    const flow = resolveFlow({ team: cfg({ steps: { plan: { skill: "platform:small" } } }) });
    expect(flow.steps.plan).toMatchObject({
      skill: "platform:small",
      source: "library",
      alias: "platform",
    });
    // A built-in name that does not exist never resolves.
    const bad = resolveFlow({ team: cfg({ steps: { plan: { skill: "no-such-skill" } } }) });
    expect(bad.steps.plan.unresolved?.ref).toBe("no-such-skill");
    // A string that is not a reference is unresolved as well.
    const worse = resolveFlow({ team: cfg({ steps: { plan: { skill: "Not A Ref" } } }) });
    expect(worse.steps.plan.skill).toBe("planning-issues");
    expect(worse.problems[0]?.message).toContain("not a skill reference");
  });

  test("custom steps run after their step: the team's by order then id, then mine", () => {
    const flow = resolveFlow({
      team: cfg({
        custom: {
          b: { after: "do", skill: "ws:b", order: 2 },
          a: { after: "do", skill: "ws:a", order: 2 },
          first: { after: "do", skill: "ws:first", order: 1, required: true, label: "First one" },
          plan: { after: "plan", skill: "ws:plan-check" },
        },
      }),
      me: cfg({ custom: { mine: { after: "do", skill: "me:mine", order: 1 } } }),
    });
    expect(flow.custom.map((c) => `${c.after}:${c.id}:${c.origin}`)).toEqual([
      "plan:plan:team",
      "do:first:team",
      "do:a:team",
      "do:b:team",
      "do:mine:me",
    ]);
    expect(flow.custom.find((c) => c.id === "first")).toMatchObject({
      required: true,
      label: "First one",
    });
    expect(flow.custom.find((c) => c.id === "a")).toMatchObject({ required: false, label: "A" });
    expect(customAfter(flow, "handoff")).toEqual([]);
  });

  test("a person cannot take the id of a team step; the team's stays", () => {
    const flow = resolveFlow({
      team: cfg({ custom: { check: { after: "do", skill: "ws:check" } } }),
      me: cfg({ custom: { check: { after: "handoff", skill: "me:other" } } }),
    });
    expect(flow.custom.map((c) => [c.id, c.origin])).toEqual([["check", "team"]]);
    expect(flow.problems.map((p) => p.kind)).toEqual(["ignored"]);
  });

  test("a custom step that does not resolve stays in the list, flagged, and does not run", () => {
    const flow = resolveFlow({
      team: cfg({
        custom: {
          gone: { after: "do", skill: "ws:gone" },
          here: { after: "do", skill: "ws:here" },
        },
      }),
      exists: (r) => r === "ws:here",
    });
    expect(customAfter(flow, "do").map((c) => c.id)).toEqual(["here"]);
    expect(customAfter(flow, "do", { all: true }).map((c) => c.id)).toEqual(["gone", "here"]);
    expect(flow.problems[0]).toMatchObject({ kind: "unresolved", at: "after:do", id: "gone" });
    // Only the step that runs makes the flow differ.
    expect(
      resolveFlow({
        team: cfg({ custom: { gone: { after: "do", skill: "ws:gone" } } }),
        exists: () => false,
      }).differs,
    ).toBe(false);
  });

  test("the context bundle line names what differs, in running order", () => {
    const flow = resolveFlow({
      team: cfg({
        steps: { plan: { skill: "ws:acme-planning" }, do: { finish: "review" } },
        custom: {
          "security-check": {
            after: "do",
            skill: "platform:checking-security",
            label: "Security check",
            required: true,
          },
        },
      }),
      me: cfg({
        custom: { "notify-me": { after: "handoff", skill: "me:notifying-me", label: "Tell me" } },
      }),
    });
    expect(flowLine(flow)).toBe(
      "Plan: ws:acme-planning (team) · Do next step: tasks finish in review (team) · After Do next step: Security check (platform:checking-security, must pass) · After Hand off: Tell me (me:notifying-me, personal)",
    );
  });
});

describe("what a card and the Agent tab read", () => {
  test("the options of a step in one line", () => {
    expect(flowOptionsLine(BUILTIN_FLOW.steps.plan)).toBe("Up to 8 tasks a phase");
    expect(flowOptionsLine(BUILTIN_FLOW.steps.do)).toBe(
      "Tasks finish when verified · Commits each task",
    );
    expect(flowOptionsLine(BUILTIN_FLOW.steps.log)).toBe("");
    const flow = fixtureFlow({ personal: true });
    expect(flowOptionsLine(flow.steps.do)).toBe("Tasks finish in review · Commits each task");
    expect(flowOptionsLine(flow.steps.handoff)).toBe("Bundle up to 4,000 tokens · Last 5 changes");
    expect(flowOptionsLine(flow.steps.status)).toBe(
      "Issues go stale after 12 h · Tasks go stale after 4 h",
    );
  });

  test("no max_tasks button allows a phase that trips Q014 (more than 10 tasks)", () => {
    const def = flowOption("plan", "max_tasks");
    expect(def?.values.map((v) => v.value)).toEqual([8, 5, 10]);
    for (const v of def?.values ?? []) expect(Number(v.value)).toBeLessThanOrEqual(10);
  });

  test("a number the buttons do not offer still reads as a phrase", () => {
    expect(flowValueSummary("plan", "max_tasks", 17)).toBe("Up to 17 tasks a phase");
    expect(flowValueSummary("handoff", "budget_tokens", 9000)).toBe("Bundle up to 9,000 tokens");
    expect(flowValueSummary("handoff", "changes", 7)).toBe("Last 7 changes");
    expect(flowValueSummary("status", "issue_hours", 36)).toBe("Issues go stale after 36 h");
    expect(flowValueSummary("status", "task_hours", 6)).toBe("Tasks go stale after 6 h");
    // A button keeps its own words.
    expect(flowValueSummary("plan", "max_tasks", 5)).toBe("Up to 5 tasks a phase");
  });

  test("every skill the flow runs, once, in running order", () => {
    const flow = fixtureFlow({ personal: true });
    expect(flowSkillRefs(flow, { builtin: false })).toEqual([
      "me:planning-small",
      "platform:checking-security",
      "ws:writing-changelog",
      "me:tidying-up",
      "me:notifying-me",
    ]);
    expect(flowSkillRefs(flow)).toEqual([
      "adding-work",
      "me:planning-small",
      "doing-next-step",
      "platform:checking-security",
      "ws:writing-changelog",
      "me:tidying-up",
      "logging-work",
      "handing-off",
      "me:notifying-me",
      "checking-status",
      "writing-readable-bulk-text",
    ]);
    expect(flowSkillRefs(BUILTIN_FLOW, { builtin: false })).toEqual([]);
  });
});

describe("skill references", () => {
  test("take apart the four forms", () => {
    expect(parseSkillRef("planning-issues")).toEqual({
      ref: "planning-issues",
      source: "built-in",
      name: "planning-issues",
    });
    expect(parseSkillRef("ws:acme-planning")).toMatchObject({
      source: "workspace",
      name: "acme-planning",
    });
    expect(parseSkillRef("me:planning-small")).toMatchObject({
      source: "me",
      name: "planning-small",
    });
    expect(parseSkillRef("platform:checking-security")).toEqual({
      ref: "platform:checking-security",
      source: "library",
      name: "checking-security",
      alias: "platform",
    });
    for (const bad of ["", "Plan", "ws:", "ws:Bad", ":x", "a:b:c", "x y"])
      expect(parseSkillRef(bad), bad).toBeUndefined();
  });

  test("names and labels", () => {
    expect(skillName("platform:checking-security")).toBe("checking-security");
    expect(skillName("planning-issues")).toBe("planning-issues");
    expect(skillWords("me:tidying-up")).toBe("Tidying up");
    expect(customStepId("Security check")).toBe("security-check");
    expect(customStepId("platform:checking-security", ["checking-security"])).toBe(
      "checking-security-2",
    );
  });

  test("step ids are the ones the shell knows", () => {
    const ids: FlowStepId[] = ["add", "plan", "do", "log", "handoff", "status", "style"];
    expect([...FLOW_STEP_IDS]).toEqual(ids);
  });
});
