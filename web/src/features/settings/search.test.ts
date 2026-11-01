import { describe, expect, it } from "vitest";
import {
  panelKey,
  settingsFlowHref,
  validateSettingsEditSearch,
  validateSettingsFlowSearch,
} from "./search";

describe("the panel of the flow page", () => {
  it("is a step, a custom step or the form, and nothing else", () => {
    for (const ok of ["add", "plan", "do", "log", "handoff", "status", "style", "new"])
      expect(panelKey(ok)).toBe(ok);
    expect(panelKey("custom:security-check")).toBe("custom:security-check");
    for (const bad of [
      "",
      "  ",
      "Plan",
      "custom:",
      "custom:Security Check",
      "custom:-x",
      "ws:plan",
      3,
    ])
      expect(panelKey(bad)).toBeUndefined();
  });

  it("keeps the step the + was pressed for only with the form", () => {
    expect(validateSettingsFlowSearch({ step: "new", after: "do" })).toEqual({
      step: "new",
      after: "do",
      view: undefined,
    });
    expect(validateSettingsFlowSearch({ step: "plan", after: "do" }).after).toBeUndefined();
    // Status and Writing style run anywhere: no custom step follows them.
    expect(validateSettingsFlowSearch({ step: "new", after: "status" }).after).toBeUndefined();
    expect(validateSettingsFlowSearch({ step: "new", after: "log" }).after).toBeUndefined();
  });

  it("keeps the team view, and only that value of view", () => {
    expect(validateSettingsFlowSearch({ view: "team" }).view).toBe("team");
    expect(validateSettingsFlowSearch({ view: "me" }).view).toBeUndefined();
    expect(validateSettingsFlowSearch({}).step).toBeUndefined();
  });

  it("writes an address that reads back", () => {
    const search = { step: "new", after: "do", view: "team" } as const;
    const href = settingsFlowHref(search);
    expect(href).toBe("/settings/flow?step=new&after=do&view=team");
    expect(
      validateSettingsFlowSearch(Object.fromEntries(new URL(href, "http://x").searchParams)),
    ).toEqual(search);
    expect(settingsFlowHref()).toBe("/settings/flow");
    expect(settingsFlowHref({ step: "custom:security-check" })).toBe(
      "/settings/flow?step=custom%3Asecurity-check",
    );
  });
});

describe("the editor of a skill", () => {
  it("takes a reference, and a copy needs both its place and its name", () => {
    expect(validateSettingsEditSearch({ skill: "planning-issues" })).toEqual({
      skill: "planning-issues",
      to: undefined,
      name: undefined,
      for: undefined,
    });
    expect(
      validateSettingsEditSearch({
        skill: "planning-issues",
        to: "ws",
        name: "wf-planning-issues",
        for: "plan",
      }),
    ).toEqual({ skill: "planning-issues", to: "ws", name: "wf-planning-issues", for: "plan" });
    expect(validateSettingsEditSearch({ skill: "x-y", to: "ws" }).to).toBeUndefined();
    expect(validateSettingsEditSearch({ skill: "x-y", name: "z" }).name).toBeUndefined();
  });

  it("refuses what is not a skill reference, a place or a folder name", () => {
    expect(validateSettingsEditSearch({ skill: "Not A Skill" }).skill).toBeUndefined();
    expect(
      validateSettingsEditSearch({ skill: "ws:ok-name", to: "team", name: "a" }).to,
    ).toBeUndefined();
    expect(
      validateSettingsEditSearch({ skill: "ws:ok-name", to: "me", name: "Bad Name" }).name,
    ).toBeUndefined();
    expect(
      validateSettingsEditSearch({ skill: "ws:ok-name", for: "nonsense" }).for,
    ).toBeUndefined();
  });
});
