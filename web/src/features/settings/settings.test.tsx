// The Settings pieces as markup (the test environment has no DOM): what each card, the flow, the
// choices, the options and the checks say for the made-up flow of `fixtures.ts`.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui";
import {
  BUILTIN_FLOW,
  flowOptionsLine,
  flowSkillRefs,
  flowStep,
  skillChoices,
  validateSkill,
} from "@/lib/api";
import { FlowMap } from "./FlowMap";
import { layoutFor } from "./FlowTab";
import { FIXTURE_CATALOG, FIXTURE_FLOW, FIXTURE_TEAM_FLOW } from "./fixtures";
import { hasOverride, sourceLabel, sourceTone } from "./labels";
import { OptionRows } from "./OptionRows";
import { MoreSkills } from "./panel";
import { SavedLineView } from "./SavedLine";
import { checksSummary, SkillChecks } from "./SkillChecks";
import { SkillChoices } from "./SkillChoices";
import { pathExists } from "./SkillEditor";
import { AddStepButton, CustomCard, StepCard } from "./StepCard";
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

describe("a step card", () => {
  const card = (flow: typeof FIXTURE_FLOW, id: keyof typeof FIXTURE_FLOW.steps, selected = false) =>
    html(
      <StepCard
        step={flow.steps[id]}
        catalog={FIXTURE_CATALOG}
        selected={selected}
        onSelect={noop}
      />,
    );

  it("says the name, the skill, where it lives and what its options say", () => {
    const out = card(BUILTIN_FLOW, "plan");
    expect(out).toContain('data-wf="StepCard"');
    expect(out).toContain('data-step="plan"');
    expect(out).toContain("Plan");
    expect(out).toContain("planning-issues");
    expect(out).toContain("Built-in");
    expect(out).toContain(flowOptionsLine(BUILTIN_FLOW.steps.plan));
    expect(out).toContain("Up to 8 tasks");
    expect(out).not.toContain("Your override");
  });

  it("marks the team's skill and mine, and my override", () => {
    expect(card(FIXTURE_TEAM_FLOW, "plan")).toContain("This workspace");
    const mine = card(FIXTURE_FLOW, "plan");
    expect(mine).toContain("me:planning-small");
    expect(mine).toContain("Yours");
    expect(mine).toContain("Your override");
    // The skill is the team's, an option is mine.
    const options = card(FIXTURE_FLOW, "do");
    expect(options).toContain("Built-in");
    expect(options).toContain("Your override");
  });

  it("warns when the reference does not resolve", () => {
    const out = card(FIXTURE_FLOW, "status");
    expect(out).toContain('data-wf="Warning"');
    expect(out).toContain("ws:gone-status is not in this workspace&#x27;s skills folder");
    expect(card(FIXTURE_FLOW, "plan")).not.toContain('data-wf="Warning"');
  });

  it("marks the open one as the current item", () => {
    expect(card(BUILTIN_FLOW, "do", true)).toContain('aria-current="true"');
    expect(card(BUILTIN_FLOW, "do")).not.toContain("aria-current");
  });

  it("leaves the team view without override marks", () => {
    const out = html(
      <StepCard
        step={FIXTURE_FLOW.steps.plan}
        catalog={FIXTURE_CATALOG}
        overrides={false}
        onSelect={noop}
      />,
    );
    expect(out).not.toContain("Your override");
  });
});

describe("a custom card", () => {
  const custom = (id: string) => FIXTURE_FLOW.custom.find((c) => c.id === id);
  const show = (id: string, over: Partial<NonNullable<ReturnType<typeof custom>>> = {}) => {
    const c = custom(id);
    if (!c) throw new Error(id);
    return html(
      <CustomCard custom={{ ...c, ...over }} catalog={FIXTURE_CATALOG} onSelect={noop} />,
    );
  };

  it("is dashed, with its label first, and says when it must pass", () => {
    const out = show("security-check");
    expect(out).toContain('data-wf="CustomCard"');
    expect(out).toContain("border-dashed");
    expect(out).toContain("Security check");
    expect(out).toContain("platform:checking-security");
    expect(out).toContain("Platform handbook");
    expect(out).toContain("Must pass");
    expect(show("changelog")).not.toContain("Must pass");
  });

  it("says a step is only mine", () => {
    expect(show("notify-me")).toContain("Just you");
    expect(show("security-check")).not.toContain("Just you");
  });

  it("warns when it does not run", () => {
    expect(show("changelog", { unresolved: true })).toContain('data-wf="Warning"');
  });
});

describe("the flow", () => {
  const map = (flow: typeof FIXTURE_FLOW, layout: "row" | "list", extra = {}) =>
    html(
      <FlowMap
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

  it("draws every step once, in reading order, and Anywhere after the four", () => {
    for (const layout of ["row", "list"] as const) {
      const out = map(BUILTIN_FLOW, layout);
      const at = ["add", "plan", "do", "log", "handoff", "status", "style"].map((id) =>
        out.indexOf(`data-step="${id}"`),
      );
      expect(at.every((i) => i >= 0)).toBe(true);
      expect(at).toEqual([...at].sort((a, b) => a - b));
      expect(out).toContain('data-wf="FlowAnywhere"');
      expect(out).toContain(`data-layout="${layout}"`);
    }
  });

  it("puts a + after each of the four steps, and none after Status or Writing style", () => {
    const out = map(BUILTIN_FLOW, "row");
    expect([...out.matchAll(/data-after="(\w+)"/g)].map((m) => m[1])).toEqual([
      "add",
      "plan",
      "do",
      "handoff",
    ]);
    expect(out).toContain('aria-label="Add a step after Do next step"');
  });

  it("puts a custom step in the gap it runs in, before the next +", () => {
    const out = map(FIXTURE_FLOW, "row");
    const gap = (id: string) => out.indexOf(`data-custom="${id}"`);
    expect(gap("security-check")).toBeGreaterThan(out.indexOf('data-step="do"'));
    expect(gap("security-check")).toBeLessThan(out.indexOf('data-after="do"'));
    expect(out.indexOf('data-after="do"')).toBeLessThan(out.indexOf('data-step="handoff"'));
    // After Hand off: the team's step, then mine, then the +.
    expect(gap("changelog")).toBeLessThan(gap("notify-me"));
    expect(gap("notify-me")).toBeLessThan(out.indexOf('data-after="handoff"'));
  });

  it("is one tab stop, and shows the + of the open form as pressed", () => {
    const out = map(BUILTIN_FLOW, "row", { adding: "plan" });
    expect(out).toContain('data-flow-nav="plan"');
    expect(out).toContain('data-flow-nav="new:plan"');
    expect(out).toMatch(
      /aria-pressed="true"[^>]*data-after="plan"|data-after="plan"[^>]*aria-pressed="true"/,
    );
  });

  it("shows a custom step that does not resolve, flagged", () => {
    const flow = FIXTURE_FLOW;
    const out = map(flow, "list");
    expect(out).toContain("Security check");
  });
});

describe("the layout of the flow", () => {
  it("is a row when four cards fit, and a list when they do not", () => {
    expect(layoutFor(1160, BUILTIN_FLOW)).toBe("row");
    expect(layoutFor(720, BUILTIN_FLOW)).toBe("row");
    expect(layoutFor(560, BUILTIN_FLOW)).toBe("list");
    expect(layoutFor(390 - 48, BUILTIN_FLOW)).toBe("list");
  });

  it("asks for room for every custom step", () => {
    expect(layoutFor(720, FIXTURE_FLOW)).toBe("list");
    expect(layoutFor(1160, FIXTURE_TEAM_FLOW)).toBe("row");
    expect(layoutFor(1160, FIXTURE_FLOW)).toBe("row");
    expect(layoutFor(900, FIXTURE_FLOW)).toBe("list");
  });
});

describe("the + button", () => {
  it("says which step it follows, in its name", () => {
    const out = html(<AddStepButton after="plan" afterName="Plan" onAdd={noop} />);
    expect(out).toContain('aria-label="Add a step after Plan"');
    expect(out).toContain('data-flow-nav="new:plan"');
    expect(out).toContain('aria-pressed="false"');
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
    expect(out).toContain("Most tasks in a plan");
    expect(out).toContain('aria-label="Most tasks in a plan"');
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
    expect(out).toContain("disabled");
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
