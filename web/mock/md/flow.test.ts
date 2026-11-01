// The `[flow]` tables of workflow.toml in the markdown layer: parsed into the workspace config,
// reported by wf:lint (F018 to F021), kept by the writer, and the workspace's `skills/` folder
// read as skills, not as issues.
import { describe, expect, test } from "vitest";
import type { FlowConfig } from "@/gen/types";
import { loadWorkspace } from "./index";
import { flowOfText } from "./parse-flow";
import { renderWorkflowToml } from "./render";
import { shippedFiles } from "./test-support";
import { setTomlKey } from "./toml-edit";

const FLOW = `
[flow.add]
then = "plan"

[flow.plan]
skill = "ws:acme-planning"
max_tasks = 5

[flow.do]
finish = "review"
commit = "none"

[flow.custom.security-check]
after = "do"
skill = "platform:checking-security"
label = "Security check"
required = true
order = 1
`;

const SKILL = (name: string) =>
  `---\nname: ${name}\ndescription: Use when the team plans in its own way. Avoid for anything else.\n---\n\n# ${name}\n`;

/** The shipped workspace with `extra` added to workflow.toml and some more files. */
function load(extra = "", files: Record<string, string> = {}) {
  const base = shippedFiles();
  return loadWorkspace({ ...base, "workflow.toml": `${base["workflow.toml"]}${extra}`, ...files });
}

const findings = (loaded: ReturnType<typeof load>, rule?: string) =>
  (loaded.diagnostics["workflow.toml"] ?? []).filter((d) => !rule || d.rule === rule);

describe("config.flow", () => {
  test("is empty for a workflow.toml without [flow]", () => {
    expect(load().world.config.flow).toEqual({
      steps: {},
      custom: {},
      limits: { budget_tokens: 6000, changes: 5, issue_hours: 24, task_hours: 4 },
    });
  });

  test("holds the steps, their options and the custom steps as written", () => {
    const flow = load(FLOW, { "skills/acme-planning/SKILL.md": SKILL("acme-planning") }).world
      .config.flow;
    expect(flow.steps).toEqual({
      // biome-ignore lint/suspicious/noThenProperty: `then` is the name of the Add work option
      add: { then: "plan" },
      plan: { skill: "ws:acme-planning", max_tasks: 5 },
      do: { finish: "review", commit: "none" },
    });
    expect(flow.custom).toEqual({
      "security-check": {
        after: "do",
        skill: "platform:checking-security",
        label: "Security check",
        required: true,
        order: 1,
      },
    });
  });

  test("reads the team-only options from [context] and [staleness]", () => {
    const text = `[context]\nbudget_tokens = 4000\n\n[staleness]\nissue_hours = 12\n`;
    expect(flowOfText(text).limits).toEqual({ budget_tokens: 4000, issue_hours: 12 });
  });

  test("a header with a trailing comment is still a table", () => {
    const flow = flowOfText('[flow.plan] # why\nskill = "me:x"\n');
    expect(flow.steps.plan?.skill).toBe("me:x");
  });

  test("flow is a known key: no F006, and nothing at all for a good file", () => {
    const loaded = load(FLOW, { "skills/acme-planning/SKILL.md": SKILL("acme-planning") });
    expect(findings(loaded, "F006")).toEqual([]);
    expect(findings(loaded)).toEqual([]);
  });
});

describe("renderWorkflowToml", () => {
  test("never drops a [flow] table: render and read give the same flow", () => {
    const flow = flowOfText(FLOW);
    const config = { ...load().world.config, flow };
    const text = renderWorkflowToml(config);
    expect(text).toContain("[flow.plan]");
    expect(text).toContain("[flow.custom.security-check]");
    const back = flowOfText(text);
    expect(back.steps).toEqual(flow.steps);
    expect(back.custom).toEqual(flow.custom);
  });

  test("writes the hand-off budget the config carries", () => {
    const config = {
      ...load().world.config,
      flow: { steps: {}, custom: {}, limits: { budget_tokens: 4000 } },
    };
    expect(renderWorkflowToml(config)).toContain("budget_tokens = 4000");
  });

  test("an empty flow writes no [flow] line", () => {
    expect(renderWorkflowToml(load().world.config)).not.toContain("[flow");
  });
});

describe("wf:lint of [flow]", () => {
  test("F018: an unknown step or key is kept and ignored, at its own line", () => {
    const text =
      '\n[flow.deploy]\nskill = "x"\n\n[flow.plan]\nspeed = 3\nskill = "planning-issues"\n';
    const loaded = load(text);
    const list = findings(loaded, "F018");
    expect(list.map((d) => d.message)).toEqual([
      expect.stringContaining("Unknown flow step `deploy`"),
      expect.stringContaining("Unknown key `flow.plan.speed`"),
    ]);
    expect(list.every((d) => d.severity === "warn")).toBe(true);
    // Each points at its table or key, not at line 1.
    const lines = `${shippedFiles()["workflow.toml"]}${text}`.split("\n");
    expect(lines[(list[0]?.line ?? 1) - 1]).toBe("[flow.deploy]");
    expect(lines[(list[1]?.line ?? 1) - 1]).toBe("speed = 3");
    expect(loaded.world.config.flow.steps.plan).toEqual({ skill: "planning-issues" });
  });

  test("F019: a value the flow cannot use is reported and left out", () => {
    const text = `
[flow.do]
finish = "later"
commit = 3

[flow.plan]
max_tasks = 0

[flow.handoff]
budget_tokens = 5000

[flow.custom.Bad_Id]
after = "do"
skill = "ws:x"

[flow.custom.late]
after = "never"
skill = "ws:x"

[flow.custom.nothing]
after = "do"

[flow.custom.fine]
after = "do"
skill = "ws:fine"
required = "yes"
order = -1
`;
    const loaded = load(text, { "skills/fine/SKILL.md": SKILL("fine") });
    const messages = findings(loaded, "F019").map((d) => d.message);
    expect(messages).toEqual([
      expect.stringContaining('`flow.do.finish` is "later"'),
      expect.stringContaining("`flow.do.commit` is 3"),
      expect.stringContaining("`flow.plan.max_tasks` is 0"),
      expect.stringContaining("`budget_tokens` is read from [context] budget_tokens"),
      expect.stringContaining("`Bad_Id` is not a custom step id"),
      expect.stringContaining("`flow.custom.late.after` must be one of"),
      expect.stringContaining("`flow.custom.nothing.skill` must be a skill reference"),
      expect.stringContaining("`flow.custom.fine.required` must be true or false"),
      expect.stringContaining("`flow.custom.fine.order` must be a whole number"),
    ]);
    const flow = loaded.world.config.flow;
    expect(flow.steps).toEqual({});
    // A custom step with a bad id, `after` or no skill is dropped; one with a bad optional key stays.
    expect(Object.keys(flow.custom)).toEqual(["fine"]);
    expect(flow.custom.fine).toEqual({ after: "do", skill: "ws:fine" });
  });

  test("F019: a step that names the built-in skill of another step is kept and reported", () => {
    const text = `
[flow.plan]
skill = "handing-off"

[flow.log]
skill = "summarizing-work"

[flow.do]
skill = "doing-next-step"
`;
    const loaded = load(text);
    expect(findings(loaded, "F019").map((d) => d.message)).toEqual([
      "`handing-off` is the skill of Hand off, not a skill of Plan. wf keeps it.",
      "`summarizing-work` is a library skill, which runs as a custom step, not a skill of Log. wf keeps it.",
    ]);
    expect(loaded.world.config.flow.steps.plan).toEqual({ skill: "handing-off" });
  });

  test("F019: a custom step that runs the skill of the step it follows, or a step's built-in skill", () => {
    const text = `
[flow.do]
skill = "ws:my-do"

[flow.custom.again]
after = "do"
skill = "ws:my-do"

[flow.custom.again-built-in]
after = "plan"
skill = "planning-issues"

[flow.custom.hand]
after = "do"
skill = "handing-off"

[flow.custom.bootstrap]
after = "add"
skill = "using-wf"

[flow.custom.summary]
after = "do"
skill = "summarizing-work"

[flow.custom.fine]
after = "handoff"
skill = "ws:my-do"
`;
    const loaded = load(text, {
      "skills/my-do/SKILL.md": SKILL("my-do"),
    });
    const list = findings(loaded, "F019");
    expect(list.map((d) => d.message)).toEqual([
      "`ws:my-do` is the skill of Do next step. A custom step after Do next step would run it again and again. wf keeps it.",
      "`planning-issues` is the skill of Plan. A custom step after Plan would run it again and again. wf keeps it.",
      "`handing-off` is the skill of Hand off, not a skill for a custom step. wf keeps it.",
      "`using-wf` is the bootstrap skill, which no step swaps, not a skill for a custom step. wf keeps it.",
    ]);
    expect(list.every((d) => d.severity === "warn")).toBe(true);
    // Each points at the skill line of its own step.
    const lines = `${shippedFiles()["workflow.toml"]}${text}`.split("\n");
    expect(lines[(list[0]?.line ?? 1) - 1]).toBe('skill = "ws:my-do"');
    expect(lines[(list[0]?.line ?? 1) - 2]).toBe('after = "do"');
    // wf keeps every step, the library skill and the step after Hand off included.
    expect(Object.keys(loaded.world.config.flow.custom)).toEqual([
      "again",
      "again-built-in",
      "hand",
      "bootstrap",
      "summary",
      "fine",
    ]);
  });

  test("F020: a built-in or workspace skill that does not exist", () => {
    const text = `
[flow.plan]
skill = "ws:gone"

[flow.do]
skill = "no-such-skill"

[flow.log]
skill = "me:mine"

[flow.custom.check]
after = "do"
skill = "ws:also-gone"
`;
    const list = findings(load(text), "F020");
    expect(list.map((d) => d.message)).toEqual([
      "`ws:gone` is not in this workspace's skills folder.",
      "`no-such-skill` is not a built-in skill.",
      "`ws:also-gone` is not in this workspace's skills folder.",
    ]);
    // A skill of the person's library is not in the workspace: left to the dashboard.
    expect(findings(load(text), "F020").some((d) => d.message.includes("me:mine"))).toBe(false);
    // Add the folder and the finding goes.
    const fixed = load(text, { "skills/gone/SKILL.md": SKILL("gone") });
    expect(findings(fixed, "F020").map((d) => d.message)).not.toContain(
      "`ws:gone` is not in this workspace's skills folder.",
    );
  });

  test("F021: the workspace's skills follow the skill rules", () => {
    const loaded = load("", {
      "skills/good/SKILL.md": SKILL("good"),
      "skills/bad-name/SKILL.md": SKILL("something-else"),
      "skills/plain/SKILL.md": "# not a skill\n",
    });
    expect(loaded.diagnostics["skills/good/SKILL.md"] ?? []).toEqual([]);
    expect(loaded.diagnostics["skills/bad-name/SKILL.md"]?.map((d) => d.message)).toEqual([
      'Not a valid skill: name "something-else" does not match the folder',
    ]);
    expect(loaded.diagnostics["skills/plain/SKILL.md"]?.[0]).toMatchObject({
      rule: "F021",
      severity: "warn",
      message: "Not a valid skill: no frontmatter",
    });
    // They are not issues, groups or library items.
    expect(loaded.world.issues).toEqual(load().world.issues);
    expect(loaded.world.groups).toEqual(load().world.groups);
    expect(loaded.recognised).toContain("skills/good/SKILL.md");
  });

  test("F021 checks the relative paths of a skill against the built-ins and its own folder", () => {
    const withPaths = (body: string) =>
      `---\nname: pathy\ndescription: Use when a path is cited. Avoid for anything else.\n---\n\n${body}\n`;
    const ok = load("", {
      "skills/pathy/SKILL.md": withPaths(
        "Read `../using-wf/references/format.md`, run `scripts/run.sh` and read `references/notes.md`.",
      ),
      "skills/pathy/references/notes.md": "# Notes\n",
    });
    expect(ok.diagnostics["skills/pathy/SKILL.md"] ?? []).toEqual([]);
    const missing = load("", {
      "skills/pathy/SKILL.md": withPaths(
        "Read `../nobody/references/x.md` and `references/gone.md`.",
      ),
    });
    expect(missing.diagnostics["skills/pathy/SKILL.md"]?.map((d) => d.message)).toEqual([
      "Not a valid skill: path does not exist: ../nobody/references/x.md",
      "Not a valid skill: path does not exist: references/gone.md",
    ]);
  });

  test("a skills folder is not read as issues even when issues_dir is its parent", () => {
    const loaded = load("", { "skills/odd/goal.md": "---\nid: wf-odd01\ntitle: Odd\n---\n" });
    expect(loaded.world.issues.map((i) => i.goal.id)).not.toContain("wf-odd01");
  });
});

describe("the editor and the reader agree", () => {
  test("a flow written by setTomlKey reads back as the edit says", () => {
    let text = shippedFiles()["workflow.toml"] as string;
    text = setTomlKey(text, "flow.plan", "skill", "ws:acme-planning");
    text = setTomlKey(text, "flow.do", "finish", "review");
    const expected: FlowConfig = {
      steps: { plan: { skill: "ws:acme-planning" }, do: { finish: "review" } },
      custom: {},
      limits: { budget_tokens: 6000, changes: 5, issue_hours: 24, task_hours: 4 },
    };
    expect(flowOfText(text)).toEqual(expected);
  });
});
