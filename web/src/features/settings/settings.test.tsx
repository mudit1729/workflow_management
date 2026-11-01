// The Settings pieces as markup (the test environment has no DOM): what each card, the flow, the
// choices, the options and the checks say for the made-up flow of `fixtures.ts`.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui";
import { BUILTIN_FLOW, flowSkillRefs, flowStep, skillChoices, validateSkill } from "@/lib/api";
import { AddStepButton, ArrowLabel, CustomChip, StatePill } from "./ArrowLabel";
import { FlowLine } from "./FlowLine";
import { FIXTURE_CATALOG, FIXTURE_FLOW, FIXTURE_TEAM_FLOW } from "./fixtures";
import { Helpers } from "./Helpers";
import { hasOverride, sourceLabel, sourceTone, usedIn } from "./labels";
import { OptionRows } from "./OptionRows";
import { MoreSkills } from "./panel";
import { SavedLineView } from "./SavedLine";
import { checksSummary, SkillChecks } from "./SkillChecks";
import { SkillChoices } from "./SkillChoices";
import { pathExists } from "./SkillEditor";
import { disabledRules } from "./WorkspaceTab";

const noop = () => {};
const html = (node: React.ReactElement) =>
  renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

describe("the made-up flow", () => {
  it("resolves what the Kit says it does", () => {
    // The person's skill wins over the team's; the team's option stays beside mine.
    expect(FIXTURE_FLOW.steps.plan).toMatchObject({ skill: "me:planning-small", origin: "me" });
    expect(FIXTURE_TEAM_FLOW.steps.plan).toMatchObject({
      skill: "ws:acme-planning",
      origin: "team",
    });
    expect(FIXTURE_FLOW.steps.do.options.finish).toMatchObject({ value: "review", origin: "team" });
    expect(FIXTURE_FLOW.steps.do.options.commit).toMatchObject({ value: "none", origin: "me" });
    // A reference that is gone runs the built-in skill and says so.
    expect(FIXTURE_FLOW.steps.status.skill).toBe("checking-status");
    expect(FIXTURE_FLOW.steps.status.unresolved?.ref).toBe("ws:gone-status");
    expect(FIXTURE_FLOW.custom.map((c) => c.id)).toEqual([
      "security-check",
      "changelog",
      "notify-me",
    ]);
    expect(FIXTURE_TEAM_FLOW.custom.map((c) => c.id)).toEqual(["security-check", "changelog"]);
  });

  it("lists the skills an agent needs installed, built-ins left out", () => {
    expect(flowSkillRefs(FIXTURE_FLOW, { builtin: false })).toEqual([
      "me:planning-small",
      "platform:checking-security",
      "ws:writing-changelog",
      "me:notifying-me",
    ]);
  });
});

describe("the words of a source", () => {
  it("names the place a skill lives in, and gives only mine the accent", () => {
    expect(sourceLabel("built-in", undefined, FIXTURE_CATALOG)).toBe("Built-in");
    expect(sourceLabel("workspace", undefined, FIXTURE_CATALOG)).toBe("This workspace");
    expect(sourceLabel("library", "platform", FIXTURE_CATALOG)).toBe("Platform handbook");
    expect(sourceLabel("library", "unknown", FIXTURE_CATALOG)).toBe("unknown");
    expect(sourceLabel("me", undefined, FIXTURE_CATALOG)).toBe("Yours");
    expect(sourceTone("me")).toBe("accent");
    expect(sourceTone("built-in")).toBe("neutral");
    expect(sourceTone("workspace")).toBe("outline");
  });

  it("calls a step an override when any value of it is mine", () => {
    expect(hasOverride(FIXTURE_FLOW.steps.plan)).toBe(true);
    expect(hasOverride(FIXTURE_FLOW.steps.do)).toBe(true);
    expect(hasOverride(FIXTURE_FLOW.steps.add)).toBe(false);
    expect(hasOverride(FIXTURE_TEAM_FLOW.steps.plan)).toBe(false);
  });
});

describe("an arrow label", () => {
  const label = (
    flow: typeof FIXTURE_FLOW,
    id: keyof typeof FIXTURE_FLOW.steps,
    extra: { selected?: boolean; overrides?: boolean; variant?: "arrow" | "inline" | "loop" } = {},
  ) =>
    html(<ArrowLabel step={flow.steps[id]} catalog={FIXTURE_CATALOG} onSelect={noop} {...extra} />);

  it("says the step and the skill in mono, and no chip for a built-in skill", () => {
    const out = label(BUILTIN_FLOW, "plan");
    expect(out).toContain('data-wf="ArrowLabel"');
    expect(out).toContain('data-step="plan"');
    expect(out).toContain("Plan");
    expect(out).toContain("planning-issues");
    expect(out).not.toContain("Built-in");
    expect(out).not.toContain("Your override");
  });

  it("names the source of a skill that is not built in, and marks my override", () => {
    expect(label(FIXTURE_TEAM_FLOW, "plan")).toContain("This workspace");
    const mine = label(FIXTURE_FLOW, "plan");
    expect(mine).toContain("me:planning-small");
    expect(mine).toContain("Yours");
    expect(mine).toContain("Your override");
    // The skill is the team's, an option is mine.
    expect(label(FIXTURE_FLOW, "do")).toContain("Your override");
    expect(label(FIXTURE_FLOW, "do", { overrides: false })).not.toContain("Your override");
  });

  it("flags a reference that does not resolve with a dot, and the sentence on hover", () => {
    const out = label(FIXTURE_FLOW, "status");
    expect(out).toContain("bg-stale");
    expect(out).toContain("ws:gone-status is not in this workspace&#x27;s skills folder");
    expect(label(FIXTURE_FLOW, "plan")).not.toContain("bg-stale");
  });

  it("marks the open one as the current item", () => {
    expect(label(BUILTIN_FLOW, "do", { selected: true })).toContain('aria-current="true"');
    expect(label(BUILTIN_FLOW, "do")).not.toContain("aria-current");
  });

  it("draws the loop with its arrow and no skill", () => {
    const out = label(BUILTIN_FLOW, "do", { variant: "loop" });
    expect(out).toContain("↺ Do next step");
    expect(out).not.toContain("doing-next-step");
  });
});

describe("a custom step on its arrow", () => {
  const custom = (id: string) => FIXTURE_FLOW.custom.find((c) => c.id === id);
  const show = (id: string, over: Partial<NonNullable<ReturnType<typeof custom>>> = {}) => {
    const c = custom(id);
    if (!c) throw new Error(id);
    return html(<CustomChip custom={{ ...c, ...over }} onSelect={noop} />);
  };

  it("is dashed, with + and its label, and says when it must pass", () => {
    const out = show("security-check");
    expect(out).toContain('data-wf="CustomChip"');
    expect(out).toContain("border-dashed");
    expect(out).toContain("+ Security check");
    expect(out).toContain("Must pass");
    expect(show("changelog")).not.toContain("Must pass");
  });

  it("says a step is only mine", () => {
    expect(show("notify-me")).toContain("Just you");
    expect(show("security-check")).not.toContain("Just you");
  });

  it("flags a step that does not run", () => {
    expect(show("changelog", { unresolved: true })).toContain("bg-stale");
    expect(show("changelog")).not.toContain("bg-stale");
  });
});

describe("the flow", () => {
  const line = (flow: typeof FIXTURE_FLOW, layout: "line" | "stack", extra = {}) =>
    html(
      <FlowLine
        flow={flow}
        catalog={FIXTURE_CATALOG}
        mine
        selected={undefined}
        layout={layout}
        onSelect={noop}
        onAdd={noop}
        {...extra}
      />,
    );

  it("draws the five states in order, in both layouts", () => {
    for (const layout of ["line", "stack"] as const) {
      const out = line(BUILTIN_FLOW, layout);
      expect([...out.matchAll(/data-status="(\w+)"/g)].map((m) => m[1])).toEqual([
        "backlog",
        "planned",
        "in_progress",
        "review",
        "done",
      ]);
      expect(out).toContain(`data-layout="${layout}"`);
    }
  });

  it("puts the step on each arrow, Do next step three times, and 'you approve' on the last", () => {
    for (const layout of ["line", "stack"] as const) {
      const out = line(BUILTIN_FLOW, layout);
      expect(
        [...out.matchAll(/data-wf="ArrowLabel" data-step="(\w+)" data-variant="(\w+)"/g)]
          .map((m) => `${m[1]}:${m[2]}`)
          .filter((x) => !x.startsWith("handoff")),
      ).toEqual(
        layout === "line"
          ? ["add:arrow", "plan:arrow", "do:arrow", "do:loop", "do:arrow"]
          : ["add:inline", "plan:inline", "do:inline", "do:loop", "do:inline"],
      );
      expect(out).toContain('data-wf="ApproveLabel"');
      expect(out).toContain("you approve");
      // The approval is no button.
      expect(out).not.toMatch(/<button[^>]*>you approve/);
    }
  });

  it("does not draw Log, Writing style or Status", () => {
    const out = line(BUILTIN_FLOW, "line");
    for (const id of ["log", "style", "status"]) expect(out).not.toContain(`data-step="${id}"`);
  });

  it("puts Hand off and the side states below the line", () => {
    const out = line(BUILTIN_FLOW, "line");
    expect(out.indexOf('data-wf="FlowBelow"')).toBeGreaterThan(out.indexOf('data-status="done"'));
    expect(out.indexOf('data-step="handoff"')).toBeGreaterThan(out.indexOf('data-wf="FlowBelow"'));
    expect(out).toContain("Any state:");
    expect(out).toContain("Side states: Blocked, Cancelled");
  });

  it("has a + on the arrows of Add work, Plan and Do next step, and after Hand off", () => {
    const out = line(BUILTIN_FLOW, "line");
    expect([...out.matchAll(/data-after="(\w+)"/g)].map((m) => m[1])).toEqual([
      "add",
      "plan",
      "do",
      "handoff",
    ]);
    expect(out).toContain('aria-label="Add a step after Do next step"');
  });

  it("shows a custom step on its arrow, before that arrow's +", () => {
    const out = line(FIXTURE_FLOW, "line");
    const at = (id: string) => out.indexOf(`data-custom="${id}"`);
    // Security check runs after each task: under In progress, with the loop.
    expect(at("security-check")).toBeGreaterThan(out.indexOf('data-variant="loop"'));
    expect(at("security-check")).toBeLessThan(out.indexOf('data-after="do"'));
    // After Hand off: the team's step, then mine, then the +.
    expect(at("changelog")).toBeLessThan(at("notify-me"));
    expect(at("notify-me")).toBeLessThan(out.indexOf('data-after="handoff"'));
    expect(out).toContain("+ Security check");
  });

  it("is one tab stop, and shows the + of the open form as pressed", () => {
    const out = line(BUILTIN_FLOW, "line", { adding: "plan" });
    expect(out).toContain('data-flow-nav="plan"');
    expect(out).toContain('data-flow-nav="new:plan"');
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
    expect(out).toMatch(
      /aria-pressed="true"[^>]*data-after="plan"|data-after="plan"[^>]*aria-pressed="true"/,
    );
  });

  it("marks every arrow of the step that is open", () => {
    const out = line(BUILTIN_FLOW, "line", { selected: "do" });
    expect(out.match(/aria-current="true"/g)).toHaveLength(3);
  });
});

describe("the helpers of a step", () => {
  it("lists the helpers of the arrow, each with its skill, and the way to add a step", () => {
    const out = html(<Helpers step="do" flow={BUILTIN_FLOW} />);
    expect(out).toContain("Helpers in this step");
    expect([...out.matchAll(/data-helper="(\w+)"/g)].map((m) => m[1])).toEqual([
      "plan",
      "log",
      "status",
    ]);
    expect(out).toContain("logging-work");
    expect(out).toContain("+ Add a step here");
  });

  it("lists the custom steps on the arrow", () => {
    const out = html(<Helpers step="do" flow={FIXTURE_FLOW} />);
    expect(out).toContain('data-custom="security-check"');
    expect(out).not.toContain('data-custom="changelog"');
  });

  it("says where a helper runs, since the line does not draw it", () => {
    const out = html(<Helpers step="log" flow={BUILTIN_FLOW} />);
    expect(out).toContain("Runs inside Plan, Do next step, Hand off.");
    expect(out).not.toContain("+ Add a step here");
  });

  it("has no custom steps to add on Review to Done", () => {
    expect(usedIn("style")).toEqual(["add", "plan"]);
  });
});

describe("the + button", () => {
  it("says which step it follows, in its name", () => {
    const out = html(<AddStepButton after="plan" afterName="Plan" onAdd={noop} />);
    expect(out).toContain('aria-label="Add a step after Plan"');
    expect(out).toContain('data-flow-nav="new:plan"');
    expect(out).toContain('aria-pressed="false"');
  });

  it("is quiet until the line is hovered or focused, and always drawn when asked", () => {
    expect(html(<AddStepButton after="plan" afterName="Plan" onAdd={noop} />)).toContain(
      "opacity-0",
    );
    expect(html(<AddStepButton after="plan" afterName="Plan" shown onAdd={noop} />)).not.toContain(
      "opacity-0",
    );
  });
});

describe("a state pill", () => {
  it("shows the status icon and the name in the status color", () => {
    const out = html(<StatePill status="in_progress" />);
    expect(out).toContain("In progress");
    expect(out).toContain("var(--wf-status-in_progress)");
  });
});

describe("the skill choices", () => {
  const groups = skillChoices(FIXTURE_CATALOG, "plan");
  const out = html(
    <SkillChoices groups={groups} value="ws:acme-planning" onPick={noop} label="Skill for Plan" />,
  );

  it("groups the cards by where they live, the built-in default first", () => {
    expect(groups.map((g) => g.name)).toEqual([
      "Built-in",
      "This workspace",
      "Platform handbook",
      "My library",
    ]);
    const heads = ["Built-in", "This workspace", "Platform handbook", "My library"].map((n) =>
      out.indexOf(`>${n}</h4>`),
    );
    expect(heads.every((i) => i >= 0)).toBe(true);
    expect(heads).toEqual([...heads].sort((a, b) => a - b));
  });

  it("numbers the cards across the groups and marks the one in effect", () => {
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('aria-label="Skill for Plan"');
    const numbers = [...out.matchAll(/data-wf="KeyCap"[^>]*>(\d+)</g)].map((m) => Number(m[1]));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out).toMatch(/data-skill="ws:acme-planning"[^>]*>/);
  });

  it("says a skill that breaks the rules does, instead of when to use it", () => {
    expect(out).toContain("Not a valid skill: description must start with");
    expect(out.match(/Not a valid skill/g)).toHaveLength(1);
  });

  it("offers the four library skills for a custom step, and no step's own built-in", () => {
    const custom = skillChoices(FIXTURE_CATALOG, "custom");
    expect(custom[0]?.skills.map((s) => s.name)).toEqual([
      "summarizing-work",
      "summarizing-codebase",
      "keeping-a-library",
      "querying-library",
    ]);
  });

  it("is a single tab stop", () => {
    expect([...out.matchAll(/tabindex="(-?\d)"/g)].filter((m) => m[1] === "0")).toHaveLength(1);
  });
});

describe("where more skills come from", () => {
  const none = { ...FIXTURE_CATALOG, shelves: [] };

  it("offers to add a team library when none is added, and says what a first copy is for", () => {
    const out = html(<MoreSkills catalog={none} groups={skillChoices(none, "plan")} copy />);
    expect(out).toContain('data-wf="MoreSkills"');
    expect(out).toContain("Edit a copy of a skill to make the first one.");
    expect(out).toContain("Add team library");
    // A custom step has no Edit a copy: only the library is offered.
    const custom = html(<MoreSkills catalog={none} groups={skillChoices(none, "custom")} />);
    expect(custom).toContain("Skills of a team library appear here once you add it.");
    expect(custom).not.toContain("Edit a copy");
  });

  it("says nothing once a team library is added and the cards are more than the built-in ones", () => {
    const out = html(
      <MoreSkills catalog={FIXTURE_CATALOG} groups={skillChoices(FIXTURE_CATALOG, "plan")} copy />,
    );
    expect(out).toBe("");
  });
});

describe("the options", () => {
  it("is a row of buttons per option, the value in effect pressed", () => {
    const out = html(
      <OptionRows
        step={flowStep("plan")}
        values={FIXTURE_FLOW.steps.plan.options}
        mine={false}
        onPick={noop}
      />,
    );
    expect(out).toContain("Most tasks in a phase");
    expect(out).toContain('aria-label="Most tasks in a phase"');
    expect(out.match(/data-state="on"/g)).toHaveLength(1);
    expect(out).not.toContain("A team setting");
  });

  it("turns the team's settings off for Just me and says so", () => {
    const out = html(
      <OptionRows
        step={flowStep("handoff")}
        values={FIXTURE_FLOW.steps.handoff.options}
        mine
        onPick={noop}
      />,
    );
    expect(out.match(/A team setting/g)).toHaveLength(2);
    // The team's value is read as text, not as a dimmed row of buttons.
    expect(out.match(/set by the team/g)).toHaveLength(2);
    expect(out).not.toContain("<button");
  });

  it("marks an option that is mine", () => {
    const out = html(
      <OptionRows
        step={flowStep("do")}
        values={FIXTURE_FLOW.steps.do.options}
        mine
        onPick={noop}
      />,
    );
    expect(out.match(/Your override/g)).toHaveLength(1);
  });

  it("shows a number the file holds that is not one of the buttons", () => {
    const values = {
      max_tasks: { key: "max_tasks", value: 10, origin: "team" as const, isDefault: false },
    };
    const out = html(
      <OptionRows step={flowStep("plan")} values={values} mine={false} onPick={noop} />,
    );
    expect(out).toContain(">10<");
  });

  it("says a step has no options when it has none", () => {
    expect(
      html(<OptionRows step={flowStep("log")} values={{}} mine={false} onPick={noop} />),
    ).toContain("This step has no options.");
  });
});

describe("the checks of a skill under edit", () => {
  it("sums the list up in a line", () => {
    expect(checksSummary([])).toBe("Passes the skill rules");
    expect(checksSummary([{ message: "a" }])).toBe("1 problem");
    expect(checksSummary([{ message: "a" }, { message: "b" }])).toBe("2 problems");
  });

  it("lists each problem with its line, 1-based", () => {
    const problems = validateSkill("---\nname: x\n---\n", "x");
    const out = html(<SkillChecks problems={problems} />);
    expect(out).toContain("Line ");
    expect(out).toContain("description");
    expect(out).toContain("The same rules as check-skills.mjs.");
  });

  it("says a skill passes", () => {
    const skill = FIXTURE_CATALOG.shelves[0]?.skills[0];
    if (!skill) throw new Error("fixture");
    expect(validateSkill(skill.text, skill.name)).toEqual([]);
    expect(html(<SkillChecks problems={[]} />)).toContain("Passes the skill rules");
  });

  it("finds a path in a skill's folder or beside the built-ins", () => {
    const skill = FIXTURE_CATALOG.plugins[0]?.skills.find((s) => s.name === "planning-issues");
    if (!skill) throw new Error("fixture");
    const exists = pathExists(FIXTURE_CATALOG, {
      ...skill,
      files: ["SKILL.md", "references/x.md"],
    });
    expect(exists("references/x.md")).toBe(true);
    expect(exists("references/y.md")).toBe(false);
    // A sibling: the fixture's built-ins list only SKILL.md.
    expect(exists("../using-wf/SKILL.md")).toBe(true);
    expect(exists("../using-wf/scripts/wf-env.sh")).toBe(false);
    expect(exists("../not-a-skill/SKILL.md")).toBe(false);
  });
});

describe("the saved line", () => {
  it("says what was saved, with Undo", () => {
    const out = html(<SavedLineView text="Saved to workflow.toml" onUndo={noop} />);
    expect(out).toContain('role="status"');
    expect(out).toContain("Saved to workflow.toml");
    expect(out).toContain("Undo");
  });

  it("says Undone and offers nothing after an undo", () => {
    const out = html(<SavedLineView text="Saved to workflow.toml" undone onUndo={noop} />);
    expect(out).toContain("Undone");
    expect(out).not.toContain("Undo<");
    expect(out).not.toContain("Saved to");
  });

  it("has no button when there is nothing to take back", () => {
    expect(html(<SavedLineView text="Saved" />)).not.toContain("<button");
  });
});

describe("the lint rules the Workspace tab lists", () => {
  it("reads the codes from [lint] disable, and nothing from a file it cannot read", () => {
    expect(disabledRules('[lint]\ndisable = ["S09", "Q001"]\nseverity = {}\n')).toEqual([
      "S09",
      "Q001",
    ]);
    expect(disabledRules("[workspace]\nname = 'wf'\n")).toEqual([]);
    expect(disabledRules("[lint\nbroken")).toEqual([]);
    expect(disabledRules(null)).toEqual([]);
    expect(disabledRules('[lint]\ndisable = [1, "S09"]\n')).toEqual(["S09"]);
  });
});
