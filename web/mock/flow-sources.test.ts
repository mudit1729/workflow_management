// Where skills come from (skills-flow-spec 2): the plugin's built-ins, this workspace's `skills/`
// folder, the loaded team libraries and the person's library, each skill keyed by its reference;
// and the personal `library.toml` as configuration, read and written on the libraries layer.
import { beforeEach, describe, expect, test } from "vitest";
import { ApiError, NotFoundError } from "@/lib/api/error";
import {
  installFromCommand,
  installFromNote,
  shelfOf,
  skillByRef,
  skillChoices,
  skillExists,
} from "@/lib/api/skills";
import type { LibrarySource } from "@/lib/api/types";
import { SAMPLE } from "./sample-files";
import { createMockServer, type MockServer } from "./server";

const teamSkills = import.meta.glob("./teams/acme-platform-handbook/docs/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SECURITY = Object.values(teamSkills)[0] as string;

const skill = (name: string, extra = "") =>
  `---\nname: ${name}\ndescription: Use when ${name} is needed. Avoid for anything else.\n---\n\n# ${name}\n${extra}`;

const handbook = (files: Record<string, string> = {}): LibrarySource => ({
  alias: "platform",
  kind: "team",
  name: "Platform handbook",
  url: "https://github.com/acme/platform-handbook",
  ref: "main",
  commit: "a1b2c3d",
  root: "docs",
  files: { "docs/README.md": "# Handbook\n", ...files },
  media: {},
});

let server: MockServer;
beforeEach(() => {
  server = createMockServer({ latency: 0, disk: SAMPLE });
});

describe("the catalog's sources", () => {
  test("starts with the built-in plugin and an empty shelf for this workspace and for me", async () => {
    const catalog = await server.skills();
    expect(catalog.plugins[0]?.skills).toHaveLength(12);
    expect(catalog.shelves.map((s) => [s.key, s.source, s.name, s.skills.length])).toEqual([
      ["ws", "workspace", "This workspace", 0],
      ["me", "me", "My library", 0],
    ]);
    // A built-in is keyed by its bare name and knows its files.
    const using = skillByRef(catalog, "using-wf");
    expect(using).toMatchObject({ source: "built-in", ref: "using-wf", plugin: "workflow" });
    expect(using?.files).toEqual(["SKILL.md", "references/format.md", "scripts/wf-env.sh"]);
    expect(using?.problem).toBeUndefined();
  });

  test("lists the skills of this workspace's skills/ folder", async () => {
    await server.writeFile({ path: "skills/acme-planning/SKILL.md", text: skill("acme-planning") });
    await server.writeFile({ path: "skills/acme-planning/references/rules.md", text: "# Rules\n" });
    await server.writeFile({ path: "skills/notes.md", text: "# Not a skill\n" });
    const ws = shelfOf(await server.skills(), "ws");
    expect(ws).toMatchObject({ source: "workspace", path: "skills", editable: true });
    expect(ws?.skills).toHaveLength(1);
    expect(ws?.skills[0]).toMatchObject({
      name: "acme-planning",
      ref: "ws:acme-planning",
      source: "workspace",
      plugin: "ws",
      path: "skills/acme-planning/SKILL.md",
      use_when: "Use when acme-planning is needed.",
      files: ["SKILL.md", "references/rules.md"],
    });
    expect(ws?.skills[0]?.problem).toBeUndefined();
  });

  test("a skill that fails the rules says why", async () => {
    await server.writeFile({ path: "skills/broken/SKILL.md", text: skill("other") });
    const found = skillByRef(await server.skills(), "ws:broken");
    expect(found?.problem).toBe('name "other" does not match the folder');
  });

  test("lists the skills of a loaded team library under its root, by its alias", async () => {
    server.libraryRegistry.registerLibrary(
      handbook({
        "docs/skills/checking-security/SKILL.md": SECURITY,
        "other/skills/x/SKILL.md": skill("x"),
      }),
    );
    const shelf = shelfOf(await server.skills(), "platform");
    expect(shelf).toMatchObject({
      source: "library",
      name: "Platform handbook",
      path: "docs/skills",
      editable: false,
      url: "https://github.com/acme/platform-handbook",
    });
    expect(shelf?.skills.map((s) => s.ref)).toEqual(["platform:checking-security"]);
    expect(shelf?.skills[0]).toMatchObject({
      library: "platform",
      path: "docs/skills/checking-security/SKILL.md",
      source: "library",
    });
    expect(shelf?.skills[0]?.problem).toBeUndefined();
  });

  test("lists the skills of my library, whose pages they are", async () => {
    await server.savePage({
      alias: "me",
      path: "skills/planning-small/SKILL.md",
      text: skill("planning-small"),
    });
    const me = shelfOf(await server.skills(), "me");
    expect(me?.skills.map((s) => s.ref)).toEqual(["me:planning-small"]);
    expect(me?.editable).toBe(true);
    // And they are ordinary pages of the library.
    expect((await server.libraryPage("me", "skills/planning-small/SKILL.md")).path).toBe(
      "skills/planning-small/SKILL.md",
    );
  });

  test("two skills of one name in different sources do not collide", async () => {
    await server.writeFile({ path: "skills/shared/SKILL.md", text: skill("shared") });
    await server.savePage({ alias: "me", path: "skills/shared/SKILL.md", text: skill("shared") });
    server.libraryRegistry.registerLibrary(
      handbook({ "docs/skills/shared/SKILL.md": skill("shared") }),
    );
    const catalog = await server.skills();
    const refs = (key: string) => shelfOf(catalog, key)?.skills.map((s) => s.ref);
    expect(refs("ws")).toEqual(["ws:shared"]);
    expect(refs("me")).toEqual(["me:shared"]);
    expect(refs("platform")).toEqual(["platform:shared"]);
    expect(skillByRef(catalog, "shared")).toBeUndefined();
    const exists = skillExists(catalog);
    expect(exists?.("ws:shared")).toBe(true);
    expect(exists?.("planning-issues")).toBe(true);
    expect(exists?.("other:shared")).toBe(false);
    expect(skillExists(undefined)).toBeUndefined();
  });

  test("the catalog follows an edit of the workspace", async () => {
    await server.writeFile({ path: "skills/acme-planning/SKILL.md", text: skill("acme-planning") });
    expect(skillByRef(await server.skills(), "ws:acme-planning")).toBeDefined();
    await server.deleteFile({ path: "skills/acme-planning/SKILL.md" });
    expect(skillByRef(await server.skills(), "ws:acme-planning")).toBeUndefined();
  });

  test("the install command for a shelf is install-skills.sh --from its folder", async () => {
    server.libraryRegistry.registerLibrary(
      handbook({ "docs/skills/checking-security/SKILL.md": SECURITY }),
    );
    const catalog = await server.skills();
    expect(installFromCommand(shelfOf(catalog, "ws") as never)).toBe(
      'scripts/install-skills.sh --codex --from "$WF_ROOT/skills"',
    );
    expect(installFromCommand(shelfOf(catalog, "platform") as never, "claude")).toBe(
      "scripts/install-skills.sh --claude --from ~/.wf/libraries/acme/platform-handbook/docs/skills",
    );
    expect(installFromCommand(shelfOf(catalog, "me") as never)).toBe(
      "scripts/install-skills.sh --codex --from ~/.wf/libraries/shruti/wf-library/skills",
    );
  });

  test("none of the commands holds a character a shell reads as a redirect", async () => {
    server.libraryRegistry.registerLibrary(
      handbook({ "docs/skills/checking-security/SKILL.md": SECURITY }),
    );
    const catalog = await server.skills();
    for (const shelf of catalog.shelves)
      for (const tool of ["codex", "claude"] as const)
        expect(installFromCommand(shelf, tool)).not.toMatch(/[<>]/);
    // A library with no GitHub link is a folder to run the command from.
    expect(
      installFromCommand({ source: "library", key: "x", name: "X", path: "docs/skills" } as never),
    ).toBe("scripts/install-skills.sh --codex --from docs/skills");
  });

  test("only the workspace's command needs a note: WF_ROOT must be set", async () => {
    server.libraryRegistry.registerLibrary(
      handbook({ "docs/skills/checking-security/SKILL.md": SECURITY }),
    );
    const catalog = await server.skills();
    expect(installFromNote(shelfOf(catalog, "ws") as never)).toBe(
      "Run it with WF_ROOT set to this workspace.",
    );
    expect(installFromNote(shelfOf(catalog, "platform") as never)).toBeUndefined();
    expect(installFromNote(shelfOf(catalog, "me") as never)).toBeUndefined();
  });
});

describe("skillChoices", () => {
  test("a step offers its own built-in skill first, then each source that has skills", async () => {
    await server.writeFile({ path: "skills/acme-planning/SKILL.md", text: skill("acme-planning") });
    await server.savePage({
      alias: "me",
      path: "skills/planning-small/SKILL.md",
      text: skill("planning-small"),
    });
    server.libraryRegistry.registerLibrary(
      handbook({ "docs/skills/checking-security/SKILL.md": SECURITY }),
    );
    const catalog = await server.skills();
    const plan = skillChoices(catalog, "plan");
    expect(plan.map((g) => [g.key, g.skills.map((s) => s.ref)])).toEqual([
      ["built-in", ["planning-issues"]],
      ["ws", ["ws:acme-planning"]],
      ["platform", ["platform:checking-security"]],
      ["me", ["me:planning-small"]],
    ]);
    expect(plan.map((g) => g.name)).toEqual([
      "Built-in",
      "This workspace",
      "Platform handbook",
      "My library",
    ]);
  });

  test("a custom step is offered the library skills as the built-ins, and the groups that are empty are left out", async () => {
    const catalog = await server.skills();
    expect(skillChoices(catalog, "custom").map((g) => [g.key, g.skills.map((s) => s.ref)])).toEqual(
      [
        [
          "built-in",
          ["summarizing-work", "summarizing-codebase", "keeping-a-library", "querying-library"],
        ],
      ],
    );
    expect(skillChoices(undefined, "plan")).toEqual([]);
  });

  test("a custom step is not offered the skill that runs the step it follows", async () => {
    await server.writeFile({ path: "skills/my-do/SKILL.md", text: skill("my-do") });
    await server.writeFile({ path: "skills/my-check/SKILL.md", text: skill("my-check") });
    const catalog = await server.skills();
    const refs = (exclude: string[]) =>
      skillChoices(catalog, "custom", { exclude }).flatMap((g) => g.skills.map((s) => s.ref));
    expect(refs([])).toContain("ws:my-do");
    expect(refs(["ws:my-do"])).toEqual([
      "summarizing-work",
      "summarizing-codebase",
      "keeping-a-library",
      "querying-library",
      "ws:my-check",
    ]);
    // A group that is left empty goes with it.
    expect(
      skillChoices(catalog, "custom", { exclude: ["ws:my-do", "ws:my-check"] }).map((g) => g.key),
    ).toEqual(["built-in"]);
    // A step's own panel is not touched when nothing is excluded.
    expect(skillChoices(catalog, "do").map((g) => g.key)).toEqual(["built-in", "ws"]);
  });

  test("a skill that fails the rules is listed, with its problem", async () => {
    await server.writeFile({ path: "skills/odd/SKILL.md", text: skill("other") });
    const ws = skillChoices(await server.skills(), "do").find((g) => g.key === "ws");
    expect(ws?.skills[0]?.problem).toContain("does not match the folder");
  });
});

describe("skillFiles", () => {
  test("a built-in: SKILL.md first, then its scripts and references as text", async () => {
    const files = await server.skillFiles("using-wf");
    expect(files.map((f) => f.path)).toEqual([
      "SKILL.md",
      "references/format.md",
      "scripts/wf-env.sh",
    ]);
    expect(files[2]?.text).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  test("a skill of the workspace, of a library and of mine", async () => {
    await server.writeFile({ path: "skills/a/SKILL.md", text: skill("a") });
    await server.writeFile({ path: "skills/a/scripts/run.sh", text: "#!/bin/sh\n" });
    await server.savePage({ alias: "me", path: "skills/b/SKILL.md", text: skill("b") });
    server.libraryRegistry.registerLibrary(handbook({ "docs/skills/c/SKILL.md": skill("c") }));
    expect((await server.skillFiles("ws:a")).map((f) => f.path)).toEqual([
      "SKILL.md",
      "scripts/run.sh",
    ]);
    expect((await server.skillFiles("me:b")).map((f) => f.path)).toEqual(["SKILL.md"]);
    expect((await server.skillFiles("platform:c")).map((f) => f.path)).toEqual(["SKILL.md"]);
  });

  test("a reference that names nothing is a 404", async () => {
    for (const ref of ["ws:none", "me:none", "nope:x", "no-such-skill", "Bad Ref"])
      await expect(server.skillFiles(ref), ref).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the personal library.toml", () => {
  test("reads its text, its revision and the flow override", async () => {
    const config = await server.personalConfig();
    expect(config.text).toContain('kind = "personal"');
    expect(config.rev).toMatch(/\S/);
    expect(config.flow).toEqual({ steps: {}, custom: {} });
    expect(config.problems).toEqual([]);
  });

  test("saves new text, and the flow reads from it", async () => {
    const before = await server.personalConfig();
    const text = `${before.text}\n[flow.plan]\nskill = "me:planning-small"\n\n[flow.custom.notify-me]\nafter = "handoff"\nskill = "me:notifying-me"\n`;
    const saved = await server.savePersonalConfig({ text, base_rev: before.rev });
    const after = await server.personalConfig();
    expect(after.rev).toBe(saved.rev);
    expect(saved.commit).toBe(saved.rev.slice(0, 7));
    expect(after.flow).toEqual({
      steps: { plan: { skill: "me:planning-small" } },
      custom: { "notify-me": { after: "handoff", skill: "me:notifying-me" } },
    });
    // The manifest is still read: the name did not move.
    expect((await server.libraries()).find((l) => l.alias === "me")?.name).toBe("Personal library");
  });

  test("a stale base_rev is a 409, not an overwrite", async () => {
    const before = await server.personalConfig();
    await server.savePersonalConfig({ text: `${before.text}# one\n`, base_rev: before.rev });
    const err = await server
      .savePersonalConfig({ text: `${before.text}# two\n`, base_rev: before.rev })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect((await server.personalConfig()).text).toContain("# one");
  });

  test("text that is not TOML is a 422 and changes nothing", async () => {
    const before = await server.personalConfig();
    const err = await server.savePersonalConfig({ text: "name = [oops" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect((await server.personalConfig()).text).toBe(before.text);
  });

  test("a value the flow does not take is reported, and left out", async () => {
    const before = await server.personalConfig();
    await server.savePersonalConfig({
      text: `${before.text}\n[flow.do]\nfinish = "later"\n\n[flow.handoff]\nbudget_tokens = 10000\n`,
    });
    const config = await server.personalConfig();
    expect(config.flow.steps).toEqual({});
    expect(config.problems).toHaveLength(2);
    expect(config.problems[1]).toContain("`budget_tokens` is read from [context]");
  });

  test("library.toml is still no page, and the save never reaches the page write", async () => {
    await expect(server.libraryPage("me", "library.toml")).rejects.toBeInstanceOf(NotFoundError);
    const err = await server
      .savePage({ alias: "me", path: "library.toml", text: "x" })
      .catch((e) => e);
    expect(err.status).toBe(422);
  });

  test("a page write takes the scripts and references of a skill, and no other file but markdown", async () => {
    await server.savePage({ alias: "me", path: "skills/x/scripts/run.sh", text: "#!/bin/sh\n" });
    await server.savePage({ alias: "me", path: "skills/x/references/a.md", text: "# A\n" });
    for (const path of ["notes/run.sh", "skills/x/deep/scripts/run.sh", "skills/run.sh"]) {
      const err = await server.savePage({ alias: "me", path, text: "x" }).catch((e) => e);
      expect(err.status, path).toBe(422);
    }
  });

  test("a reset gives back the shipped file", async () => {
    const before = await server.personalConfig();
    await server.savePersonalConfig({ text: `${before.text}# edited\n` });
    server.controls.reset();
    expect((await server.personalConfig()).text).toBe(before.text);
  });
});
