// Changing the flow from the browser: each write is a minimal edit of workflow.toml (the team) or
// of the personal library.toml (me), with an undo token that puts the text back exactly. The
// calls go through the client to the mock server, like the Settings page will.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { lineDiff } from "../../../mock/md/test-support";
import { loadMock } from "./mock-bridge";

const toasts = vi.hoisted(() =>
  Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() }),
);
vi.mock("sonner", () => ({ toast: toasts }));

import { api } from "./client";
import { BUILTIN_SKILLS } from "./flow";
import { flowState } from "./flow-hooks";
import {
  addCustomStep,
  copyNameProblem,
  copySkill,
  FlowWriteError,
  removeCustomStep,
  resetFlowValue,
  setFlowValue,
  suggestCopyName,
  undoFlowChange,
  updateCustomStep,
} from "./flow-writes";
import { queryClient } from "./query-client";

const team = async () => (await api.file("workflow.toml")).text as string;
const mine = async () => (await api.personalConfig()).text;

vi.setConfig({ testTimeout: 20_000 });

let original: string;
let originalMine: string;

beforeEach(async () => {
  vi.clearAllMocks();
  (await loadMock()).mockControls.reset();
  queryClient.clear();
  original = await team();
  originalMine = await mine();
});

describe("setFlowValue for the team", () => {
  test("adds a table at the end after a blank line, with a comment, and nothing else changes", async () => {
    const saved = await setFlowValue({
      scope: "team",
      step: "plan",
      key: "skill",
      value: "ws:acme-planning",
    });
    expect(saved?.file).toBe("workflow.toml");
    const after = await team();
    expect(after).toBe(
      `${original}\n# The skills flow (Settings → Skills flow). A step that is left out uses its built-in skill.\n[flow.plan]\nskill = "ws:acme-planning"\n`,
    );
    expect(lineDiff(original, after).removed).toEqual([]);
  });

  test("the workspace follows: config.flow has the value", async () => {
    await setFlowValue({ scope: "team", step: "do", key: "finish", value: "review" });
    const snapshot = await api.snapshot();
    expect(snapshot.config.flow.steps.do).toEqual({ finish: "review" });
  });

  test("a second key joins its table, and the comment is written once", async () => {
    await setFlowValue({ scope: "team", step: "plan", key: "skill", value: "ws:acme-planning" });
    await setFlowValue({ scope: "team", step: "plan", key: "max_tasks", value: 5 });
    await setFlowValue({ scope: "team", step: "do", key: "finish", value: "review" });
    const after = await team();
    expect(after.match(/The skills flow \(Settings/g)).toHaveLength(1);
    expect(
      after.endsWith(
        '[flow.plan]\nskill = "ws:acme-planning"\nmax_tasks = 5\n\n[flow.do]\nfinish = "review"\n',
      ),
    ).toBe(true);
  });

  test("a team-only option goes to its own table", async () => {
    await setFlowValue({ scope: "team", step: "handoff", key: "budget_tokens", value: 4000 });
    await setFlowValue({ scope: "team", step: "status", key: "issue_hours", value: 12 });
    const after = await team();
    const diff = lineDiff(original, after);
    expect(diff.removed.sort()).toEqual(["budget_tokens = 6000", "issue_hours = 24"]);
    expect(diff.added.sort()).toEqual(["budget_tokens = 4000", "issue_hours = 12"]);
    expect((await api.snapshot()).config.flow.limits).toMatchObject({
      budget_tokens: 4000,
      issue_hours: 12,
    });
  });

  test("undo gives the previous text back exactly", async () => {
    const one = await setFlowValue({ scope: "team", step: "plan", key: "skill", value: "ws:a" });
    const afterOne = await team();
    const two = await setFlowValue({ scope: "team", step: "plan", key: "max_tasks", value: 12 });
    expect(await team()).not.toBe(afterOne);
    expect(await undoFlowChange(two?.undo as never)).toBe(true);
    expect(await team()).toBe(afterOne);
    expect(await undoFlowChange(one?.undo as never)).toBe(true);
    expect(await team()).toBe(original);
  });

  test("a value that is already there writes nothing and still gives a token", async () => {
    await setFlowValue({ scope: "team", step: "do", key: "commit", value: "none" });
    const again = await setFlowValue({ scope: "team", step: "do", key: "commit", value: "none" });
    expect(again?.undo.writes).toEqual([]);
    expect(await undoFlowChange(again?.undo as never)).toBe(true);
    expect(await team()).toContain('commit = "none"');
  });

  test("refuses what the flow does not know", async () => {
    const refusal = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(FlowWriteError);
    await refusal(setFlowValue({ scope: "team", step: "log", key: "anything", value: 1 }));
    await refusal(setFlowValue({ scope: "team", step: "do", key: "finish", value: "later" }));
    await refusal(setFlowValue({ scope: "team", step: "plan", key: "max_tasks", value: 0 }));
    await refusal(setFlowValue({ scope: "team", step: "plan", key: "skill", value: "Not A Ref" }));
    await refusal(setFlowValue({ scope: "team", step: "nope" as never, key: "skill", value: "x" }));
    expect(await team()).toBe(original);
  });

  test("a file that defines the table in a form the editor cannot edit is refused, untouched", async () => {
    const forms = [
      // Dotted keys: appending [flow.plan] would redefine the table.
      `${original}\n[flow]\nplan.skill = "ws:x"\n`,
      // An inline table: the same.
      `flow = { plan = { skill = "ws:x" } }\n${original}`,
    ];
    for (const text of forms) {
      await api.writeFile({ path: "workflow.toml", text });
      await expect(
        setFlowValue({ scope: "team", step: "plan", key: "max_tasks", value: 5 }),
      ).rejects.toThrow(
        "workflow.toml defines flow.plan in a form the Settings page cannot edit. Edit it in Files.",
      );
      expect(await team()).toBe(text);
    }
    // A form it can edit goes on working.
    await api.writeFile({ path: "workflow.toml", text: original });
    await setFlowValue({ scope: "team", step: "plan", key: "max_tasks", value: 5 });
    expect(await team()).toContain("max_tasks = 5");
  });

  test("a stale file is not overwritten by an undo", async () => {
    const saved = await setFlowValue({ scope: "team", step: "plan", key: "skill", value: "ws:a" });
    // Someone edits the file by hand after the change.
    await api.writeFile({ path: "workflow.toml", text: `${await team()}# edited\n` });
    expect(await undoFlowChange(saved?.undo as never)).toBe(false);
    expect(toasts.warning).toHaveBeenCalled();
    expect(await team()).toContain("# edited");
  });
});

describe("setFlowValue for me", () => {
  test("edits library.toml and keeps what the manifest holds", async () => {
    const saved = await setFlowValue({ scope: "me", step: "do", key: "finish", value: "review" });
    expect(saved?.file).toBe("library.toml");
    const after = await mine();
    expect(lineDiff(originalMine, after).removed).toEqual([]);
    expect(after).toContain('[flow.do]\nfinish = "review"');
    expect(after).toContain('kind = "personal"');
    // The workspace's file is untouched.
    expect(await team()).toBe(original);
    const config = await api.personalConfig();
    expect(config.flow.steps.do).toEqual({ finish: "review" });
    expect(config.problems).toEqual([]);
  });

  test("a library.toml that defines the table in a form the editor cannot edit is refused", async () => {
    const text = `${originalMine}\n[flow]\nplan.skill = "me:x"\n`;
    await api.savePersonalConfig({ text });
    await expect(
      setFlowValue({ scope: "me", step: "plan", key: "max_tasks", value: 5 }),
    ).rejects.toThrow(
      "library.toml defines flow.plan in a form the Settings page cannot edit. Edit it by hand.",
    );
    expect(await mine()).toBe(text);
  });

  test("the four team-only options are a team setting", async () => {
    await expect(
      setFlowValue({ scope: "me", step: "handoff", key: "budget_tokens", value: 4000 }),
    ).rejects.toThrow("A team setting");
    await expect(
      setFlowValue({ scope: "me", step: "status", key: "task_hours", value: 2 }),
    ).rejects.toBeInstanceOf(FlowWriteError);
  });

  test("my value wins in the flow in effect, the team's alone shows the team's", async () => {
    await setFlowValue({ scope: "team", step: "do", key: "finish", value: "verify" });
    await setFlowValue({ scope: "me", step: "do", key: "finish", value: "review" });
    const state = flowState({
      team: (await api.snapshot()).config.flow,
      personal: await api.personalConfig(),
      catalog: await api.skills(),
    });
    expect(state.flow.steps.do.options.finish).toMatchObject({ value: "review", origin: "me" });
    expect(state.team.steps.do.options.finish).toMatchObject({ value: "verify", origin: "team" });
  });

  test("undo puts library.toml back", async () => {
    const saved = await setFlowValue({ scope: "me", step: "plan", key: "skill", value: "me:x" });
    expect(await undoFlowChange(saved?.undo as never)).toBe(true);
    expect(await mine()).toBe(originalMine);
  });
});

describe("resetFlowValue", () => {
  test("removes the key and the table it leaves empty, comment and all", async () => {
    await setFlowValue({ scope: "team", step: "plan", key: "skill", value: "ws:a" });
    const saved = await resetFlowValue({ scope: "team", step: "plan", key: "skill" });
    expect(saved?.file).toBe("workflow.toml");
    expect(await team()).toBe(original);
  });

  test("keeps the other keys of the table", async () => {
    await setFlowValue({ scope: "team", step: "plan", key: "skill", value: "ws:a" });
    await setFlowValue({ scope: "team", step: "plan", key: "max_tasks", value: 5 });
    await resetFlowValue({ scope: "team", step: "plan", key: "skill" });
    expect((await team()).endsWith("[flow.plan]\nmax_tasks = 5\n")).toBe(true);
  });

  test("resetting a team-only option removes its key from the old table", async () => {
    await resetFlowValue({ scope: "team", step: "handoff", key: "budget_tokens" });
    const after = await team();
    expect(after).not.toContain("budget_tokens");
    expect(after).toContain("[context]");
    expect((await api.snapshot()).config.flow.limits?.budget_tokens).toBeUndefined();
  });

  test("the last key of [staleness] takes its table, and undo puts it back", async () => {
    await resetFlowValue({ scope: "team", step: "status", key: "issue_hours" });
    const one = await team();
    expect(one).toContain("[staleness]\ntask_hours = 4\n");
    const last = await resetFlowValue({ scope: "team", step: "status", key: "task_hours" });
    const after = await team();
    expect(after).not.toContain("[staleness]");
    expect(after).toContain("[leases]\nminutes = 60\n\n[context]");
    expect((await api.snapshot()).config.flow.limits?.issue_hours).toBeUndefined();
    expect(await undoFlowChange(last?.undo as never)).toBe(true);
    expect(await team()).toBe(one);
  });

  test("a key of [context] that is not the last leaves the table", async () => {
    await resetFlowValue({ scope: "team", step: "handoff", key: "changes" });
    expect(await team()).toContain("[context]\nbudget_tokens = 6000\nlibrary = 3\n");
  });

  test("a key that is not there changes nothing", async () => {
    const saved = await resetFlowValue({ scope: "me", step: "plan", key: "skill" });
    expect(saved?.undo.writes).toEqual([]);
    expect(await mine()).toBe(originalMine);
  });
});

describe("custom steps", () => {
  const security = {
    scope: "team" as const,
    after: "do" as const,
    skill: "platform:checking-security",
    label: "Security check",
    required: true,
  };

  test("addCustomStep writes the table and gives back the id", async () => {
    const saved = await addCustomStep(security);
    expect(saved?.id).toBe("security-check");
    expect(await team()).toBe(
      `${original}\n# The skills flow (Settings → Skills flow). A step that is left out uses its built-in skill.\n# Custom steps run after the step named in \`after\`, in \`order\`.\n[flow.custom.security-check]\nafter = "do"\nskill = "platform:checking-security"\nlabel = "Security check"\nrequired = true\norder = 1\n`,
    );
    expect((await api.snapshot()).config.flow.custom["security-check"]).toEqual({
      after: "do",
      skill: "platform:checking-security",
      label: "Security check",
      required: true,
      order: 1,
    });
  });

  test("the next step after the same step gets the next order, and an id nobody uses", async () => {
    await addCustomStep(security);
    const second = await addCustomStep({
      ...security,
      skill: "ws:writing-changelog",
      label: undefined,
      required: false,
    });
    expect(second?.id).toBe("writing-changelog");
    const third = await addCustomStep({ ...security, skill: "ws:other", label: "Security check" });
    expect(third?.id).toBe("security-check-2");
    const custom = (await api.snapshot()).config.flow.custom;
    expect(custom["writing-changelog"]).toEqual({
      after: "do",
      skill: "ws:writing-changelog",
      order: 2,
    });
    expect(custom["security-check-2"]?.order).toBe(3);
  });

  test("a step of mine does not take the id of a team step, and goes to library.toml", async () => {
    await addCustomStep(security);
    const mineSaved = await addCustomStep({ ...security, scope: "me", after: "handoff" });
    expect(mineSaved).toMatchObject({ file: "library.toml", id: "security-check-2" });
    expect((await api.personalConfig()).flow.custom["security-check-2"]).toMatchObject({
      after: "handoff",
      order: 1,
    });
  });

  test("updateCustomStep changes the keys it is given, in place", async () => {
    await addCustomStep(security);
    await updateCustomStep({
      scope: "team",
      id: "security-check",
      required: false,
      after: "handoff",
    });
    await updateCustomStep({ scope: "team", id: "security-check", label: "Security" });
    expect((await api.snapshot()).config.flow.custom["security-check"]).toEqual({
      after: "handoff",
      skill: "platform:checking-security",
      label: "Security",
      required: false,
      order: 1,
    });
    await updateCustomStep({ scope: "team", id: "security-check", label: "" });
    expect((await api.snapshot()).config.flow.custom["security-check"]?.label).toBeUndefined();
  });

  test("a person cannot change or remove a team step", async () => {
    await addCustomStep(security);
    await expect(
      updateCustomStep({ scope: "me", id: "security-check", required: false }),
    ).rejects.toThrow("not one of your steps");
    await expect(removeCustomStep({ scope: "me", id: "security-check" })).rejects.toBeInstanceOf(
      FlowWriteError,
    );
  });

  test("removeCustomStep takes the table away, and undo brings it back", async () => {
    const added = await addCustomStep(security);
    const afterAdd = await team();
    const removed = await removeCustomStep({ scope: "team", id: "security-check" });
    expect(await team()).toBe(original);
    expect(await undoFlowChange(removed?.undo as never)).toBe(true);
    expect(await team()).toBe(afterAdd);
    expect(await undoFlowChange(added?.undo as never)).toBe(true);
    expect(await team()).toBe(original);
  });

  test("refuses a bad step or skill", async () => {
    await expect(addCustomStep({ ...security, after: "log" as never })).rejects.toBeInstanceOf(
      FlowWriteError,
    );
    await expect(addCustomStep({ ...security, skill: "Not A Ref" })).rejects.toBeInstanceOf(
      FlowWriteError,
    );
  });
});

describe("copySkill", () => {
  test("a built-in to this workspace: its folder, its name, and the step points at it", async () => {
    const saved = await copySkill({
      ref: "using-wf",
      to: "ws",
      name: "wf-using",
      step: "plan",
    });
    expect(saved?.file).toBe("workflow.toml");
    const files = (await api.skillFiles("ws:wf-using")).map((f) => f.path);
    expect(files).toEqual(["SKILL.md", "references/format.md", "scripts/wf-env.sh"]);
    const text = (await api.file("skills/wf-using/SKILL.md")).text as string;
    expect(text).toMatch(/^---\nname: wf-using\n/);
    // The copy keeps the original's references and scripts, text for text.
    const original = (await api.skillFiles("using-wf")).find((f) => f.path === "scripts/wf-env.sh");
    expect((await api.file("skills/wf-using/scripts/wf-env.sh")).text).toBe(original?.text);
    expect((await api.snapshot()).config.flow.steps.plan).toEqual({ skill: "ws:wf-using" });
    // It is a skill of the catalog now, and it passes the rules.
    const catalog = await api.skills();
    const skill = catalog.shelves
      .find((s) => s.key === "ws")
      ?.skills.find((s) => s.name === "wf-using");
    expect(skill).toMatchObject({ ref: "ws:wf-using", source: "workspace" });
    expect(skill?.problem).toBeUndefined();
  });

  test("the edited text is what is saved", async () => {
    const text = (await api.skillFiles("planning-issues"))[0]?.text.replace(
      "# Planning issues",
      "# Our planning",
    ) as string;
    await copySkill({ ref: "planning-issues", to: "ws", name: "wf-planning", step: "plan", text });
    expect((await api.file("skills/wf-planning/SKILL.md")).text).toBe(text);
  });

  test("undo takes the pointer and the new files away", async () => {
    const saved = await copySkill({ ref: "using-wf", to: "ws", name: "wf-using", step: "plan" });
    expect(await undoFlowChange(saved?.undo as never)).toBe(true);
    expect(await team()).toBe(original);
    await expect(api.file("skills/wf-using/SKILL.md")).rejects.toThrow();
    expect((await api.skills()).shelves.find((s) => s.key === "ws")?.skills).toEqual([]);
  });

  test("a copy in my library is a page of it, points my override at it and keeps the scripts", async () => {
    const saved = await copySkill({
      ref: "using-wf",
      to: "me",
      name: "shruti-using",
      step: "plan",
    });
    expect(saved?.file).toBe("library.toml");
    expect((await api.personalConfig()).flow.steps.plan).toEqual({ skill: "me:shruti-using" });
    expect(await team()).toBe(original);
    const page = await api.libraryPage("me", "skills/shruti-using/SKILL.md");
    expect(page.path).toBe("skills/shruti-using/SKILL.md");
    expect((await api.skillFiles("me:shruti-using")).map((f) => f.path)).toEqual([
      "SKILL.md",
      "references/format.md",
      "scripts/wf-env.sh",
    ]);
    expect(await undoFlowChange(saved?.undo as never)).toBe(true);
    expect(await mine()).toBe(originalMine);
    expect((await api.skills()).shelves.find((s) => s.key === "me")?.skills).toEqual([]);
  });

  test("a copy can point a custom step at itself", async () => {
    await addCustomStep({ scope: "team", after: "do", skill: "checking-status", label: "Check" });
    await copySkill({
      ref: "checking-status",
      to: "ws",
      name: "wf-checking",
      step: "custom:check",
    });
    expect((await api.snapshot()).config.flow.custom.check?.skill).toBe("ws:wf-checking");
  });

  test("without a step only the folder is written", async () => {
    const saved = await copySkill({
      ref: "writing-readable-bulk-text",
      to: "ws",
      name: "wf-style",
    });
    expect(saved?.file).toBe("skills/wf-style/");
    expect(await team()).toBe(original);
  });

  test("refuses a name that is taken, a built-in's, or not a name", async () => {
    await copySkill({ ref: "using-wf", to: "ws", name: "wf-using" });
    const catalog = await api.skills();
    expect(copyNameProblem("wf-using", "ws", catalog)).toContain(
      "already has a skill called wf-using",
    );
    expect(copyNameProblem("wf-using", "me", catalog)).toBeUndefined();
    expect(copyNameProblem("planning-issues", "ws", catalog)).toContain("is a built-in skill");
    expect(copyNameProblem("Bad Name", "ws", catalog)).toContain("lowercase words");
    await expect(copySkill({ ref: "using-wf", to: "ws", name: "wf-using" })).rejects.toBeInstanceOf(
      FlowWriteError,
    );
    await expect(copySkill({ ref: "using-wf", to: "ws", name: "using-wf" })).rejects.toBeInstanceOf(
      FlowWriteError,
    );
  });

  test("names a copy after the workspace prefix and avoids a taken name", () => {
    expect(suggestCopyName("planning-issues", "wf")).toBe("wf-planning-issues");
    expect(suggestCopyName("ws:acme-planning", "Shruti", ["shruti-acme-planning"])).toBe(
      "shruti-acme-planning-2",
    );
    expect(BUILTIN_SKILLS.plan).toBe("planning-issues");
  });
});
