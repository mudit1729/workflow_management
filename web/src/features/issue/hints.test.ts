// The hints of the issue views name only real things: the skills of `plugins/workflow/skills`, and
// buttons. There is no `wf` binary and the plugin has no `write-plan` skill, so neither may appear
// as something to run. These tests read the skill folders and the source of the views.
import { describe, expect, test } from "vitest";
import { skillHref } from "@/features/skills/search";
import { resolveFlow } from "@/lib/api/flow";
import { ASK, addThen, codexAsk, WF_SKILLS } from "./skill-hint";

const skillFiles = import.meta.glob("../../../../plugins/workflow/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sources = import.meta.glob(["./**/*.{ts,tsx}", "../kit/**/*.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("the skill names", () => {
  test("WF_SKILLS is the list of skill folders of the workflow plugin", () => {
    const folders = Object.keys(skillFiles)
      .map((path) => path.split("/").at(-2))
      .sort();
    expect(folders.length).toBe(12);
    expect([...WF_SKILLS].sort()).toEqual(folders);
  });

  test("every prompt names a real skill, and only real ones", () => {
    const prompts = [
      ASK.addWork(),
      ASK.addWork("Platform"),
      ASK.plan("wf-3k9x2"),
      ASK.moreTasks("wf-3k9x2"),
      ASK.state("wf-3k9x2"),
      ASK.change("wf-3k9x2"),
      ASK.decision("wf-3k9x2"),
      ASK.learning("wf-3k9x2"),
      ASK.goal("wf-3k9x2"),
      ASK.criterion("wf-3k9x2"),
      ASK.verify("wf-3k9x2", "SC-3"),
      ASK.decide("wf-3k9x2", "D-7f3k2", "Accept"),
    ];
    for (const prompt of prompts) {
      const named = [...prompt.matchAll(/\b([a-z]+(?:-[a-z]+)+)\b(?= skill)/g)].map((m) => m[1]);
      expect(named.length, prompt).toBeGreaterThan(0);
      for (const name of named) expect(WF_SKILLS, prompt).toContain(name);
    }
  });
});

describe("the prompts follow the flow", () => {
  test("named after the built-in skill of their step, as before", () => {
    expect(ASK.plan("wf-3k9x2")).toBe("Plan wf-3k9x2 with the planning-issues skill.");
    expect(ASK.addWork()).toBe("Add work with the adding-work skill. Ask me for the outcome.");
    expect(ASK.addWork("Platform")).toBe(
      "Add work to Platform with the adding-work skill. Ask me for the outcome.",
    );
    expect(ASK.state("wf-3k9x2")).toBe(
      "Write current_state.md for wf-3k9x2 with the handing-off skill.",
    );
    expect(ASK.verify("wf-3k9x2", "SC-3")).toContain("with the doing-next-step skill.");
    expect(ASK.decision("wf-3k9x2")).toBe(
      "Log the decision on wf-3k9x2 with the logging-work skill.",
    );
  });

  test("name the skill in effect when the caller gives one", () => {
    expect(ASK.plan("wf-3k9x2", "ws:acme-planning")).toBe(
      "Plan wf-3k9x2 with the ws:acme-planning skill.",
    );
    expect(ASK.moreTasks("wf-3k9x2", "me:planning-small")).toBe(
      "Add the missing tasks to the plan of wf-3k9x2 with the me:planning-small skill.",
    );
    expect(ASK.verify("wf-3k9x2", "SC-3", "platform:verifying")).toContain(
      "with the platform:verifying skill.",
    );
    expect(ASK.change("wf-3k9x2", "ws:our-logging")).toContain("with the ws:our-logging skill.");
    // The formats are the bootstrap skill's: nothing swaps it.
    expect(ASK.goal("wf-3k9x2")).toContain("the using-wf skill");
  });

  test("Add work says what happens after adding when the flow changes it", () => {
    const asked = (then: "offer" | "plan" | "stop") =>
      ASK.addWork(
        "Platform",
        "adding-work",
        addThen(resolveFlow({ team: { steps: { add: { then } }, custom: {} } })),
      );
    expect(asked("offer")).toBe(ASK.addWork("Platform"));
    expect(asked("plan")).toBe(
      "Add work to Platform with the adding-work skill. Ask me for the outcome. Then plan every new issue.",
    );
    expect(asked("stop")).toContain("Do not offer to plan them.");
  });

  test("a link goes by the reference, so two skills of one name never collide", () => {
    expect(skillHref("ws:acme-planning")).not.toBe(skillHref("me:acme-planning"));
    expect(skillHref("ws:acme-planning")).toContain("ws");
    expect(skillHref("planning-issues")).toBe("/skills?skill=planning-issues");
  });
});

describe("codexAsk", () => {
  test("is codex with the prompt as one quoted argument", () => {
    expect(codexAsk("Plan wf-3k9x2 with the planning-issues skill.")).toBe(
      "codex 'Plan wf-3k9x2 with the planning-issues skill.'",
    );
  });

  test("a single quote in the prompt cannot end the argument", () => {
    expect(codexAsk("Plan Mudit's issue")).toBe("codex 'Plan Mudit'\\''s issue'");
  });

  test("follows the agent: claude for Claude Code", () => {
    expect(codexAsk("Plan wf-3k9x2 with the planning-issues skill.", "claude")).toBe(
      "claude 'Plan wf-3k9x2 with the planning-issues skill.'",
    );
  });
});

describe("no invented names in the views", () => {
  // IssueHeader.tsx belongs to the header's owner (its hints are listed in docs/plan/HANDOFF.md).
  const mine = Object.entries(sources).filter(
    ([path]) => !path.endsWith("hints.test.ts") && !path.endsWith("/IssueHeader.tsx"),
  );

  test("the scan reads the views", () => {
    expect(mine.length).toBeGreaterThan(40);
  });

  test("no skill the plugin does not have", () => {
    const invented = /\b(write-(plan|goal|current-state)|log-(change|decision|learning))\b/;
    for (const [path, text] of mine) expect(text, path).not.toMatch(invented);
  });

  test("no wf command shown as something to run", () => {
    const cli =
      /\bwf (state|append|plan|verify|heartbeat|claim|decide|check|resolve|new|doctor|lint|library|move|task|next)\b/;
    for (const [path, text] of mine) expect(text, path).not.toMatch(cli);
  });
});
