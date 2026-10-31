// The skills catalog: read from the repository's own plugins/ folder and marketplace.json.
import { describe, expect, test } from "vitest";
import {
  allSkills,
  CODEX_AGENTS_COMMAND,
  CODEX_INSTALL_COMMAND,
  claudeInstallCommands,
  claudeInstallGroups,
  claudeTeamCommands,
  codexInstallCommands,
  SKILLS_REPO,
} from "@/lib/api/skills";
import { createMockServer } from "./server";
import { buildCatalog, skillFrontmatter, skillsCatalog, splitDescription } from "./skills";

describe("splitDescription", () => {
  test("keeps the first sentence as the Use when line and the Avoid clause apart", () => {
    const d =
      'Use when someone wants to add work, such as "new issue" or the "+ Add work" button, and the result must be backlog issues. Orchestrator. Splits an outcome. Avoid for planning (use planning-issues), and for logging.';
    expect(splitDescription(d)).toEqual({
      use_when:
        'Use when someone wants to add work, such as "new issue" or the "+ Add work" button, and the result must be backlog issues.',
      avoid: "Avoid for planning (use planning-issues), and for logging.",
    });
  });

  test("ends the sentence after a closing quote, and copes with no Avoid clause", () => {
    const d = 'Use when asked "has wf-3k9x2 got a PR". Prints a report.';
    expect(splitDescription(d)).toEqual({
      use_when: 'Use when asked "has wf-3k9x2 got a PR".',
      avoid: undefined,
    });
    expect(splitDescription("Use when one thing")).toEqual({
      use_when: "Use when one thing",
      avoid: undefined,
    });
  });
});

describe("skillFrontmatter", () => {
  test("reads flat keys and drops quotes", () => {
    expect(skillFrontmatter('---\nname: a-b\ndescription: "Use when x."\n---\n# A')).toEqual({
      name: "a-b",
      description: "Use when x.",
    });
    expect(skillFrontmatter("# no frontmatter")).toEqual({});
  });
});

describe("buildCatalog", () => {
  const skill = (name: string, description: string) =>
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;

  test("joins skills, manifests and the marketplace entry by plugin folder", () => {
    const catalog = buildCatalog({
      skills: {
        "../../plugins/p/skills/b-skill/SKILL.md": skill("b-skill", "Use when b."),
        "../../plugins/p/skills/a-skill/SKILL.md": skill("a-skill", "Use when a. Avoid for b."),
        "../../plugins/p/skills/entry/SKILL.md": skill("entry", "Use when starting. Start here."),
      },
      plugins: {
        "../../plugins/p/.claude-plugin/plugin.json": JSON.stringify({
          name: "pee",
          version: "1.2.3",
          description: "The p plugin.",
          author: { name: "team" },
          license: "MIT",
        }),
      },
      marketplaces: {
        "../../.claude-plugin/marketplace.json": JSON.stringify({
          name: "the-market",
          owner: { name: "wf team" },
          plugins: [{ name: "pee", source: "./plugins/p", category: "productivity", tags: ["x"] }],
        }),
      },
    });
    expect(catalog.marketplace).toMatchObject({
      name: "the-market",
      owner: "wf team",
      path: ".claude-plugin/marketplace.json",
    });
    expect(catalog.plugins).toHaveLength(1);
    expect(catalog.plugins[0]).toMatchObject({
      name: "pee",
      version: "1.2.3",
      path: "plugins/p",
      author: "team",
      license: "MIT",
      category: "productivity",
      tags: ["x"],
    });
    // "Start here" first, then by name.
    expect(catalog.plugins[0]?.skills.map((s) => s.name)).toEqual(["entry", "a-skill", "b-skill"]);
    expect(catalog.plugins[0]?.skills[1]).toMatchObject({
      plugin: "p",
      path: "plugins/p/skills/a-skill/SKILL.md",
      use_when: "Use when a.",
      avoid: "Avoid for b.",
      lines: 5,
    });
  });

  test("survives a missing marketplace and a broken manifest", () => {
    const catalog = buildCatalog({
      skills: { "../../plugins/q/skills/s/SKILL.md": skill("s", "Use when s.") },
      plugins: { "../../plugins/q/.claude-plugin/plugin.json": "{ nope" },
      marketplaces: {},
    });
    expect(catalog.marketplace).toBeUndefined();
    expect(catalog.plugins.map((p) => p.name)).toEqual(["q"]);
    expect(claudeInstallCommands(catalog)).toEqual([]);
  });
});

describe("the repository's own catalog", () => {
  const catalog = skillsCatalog();

  test("lists the workflow plugin under the marketplace of marketplace.json", () => {
    expect(catalog.marketplace?.name).toBe("workflow-marketplace");
    const workflow = catalog.plugins.find((p) => p.name === "workflow");
    expect(workflow?.path).toBe("plugins/workflow");
    expect(workflow?.version).toBeTruthy();
    expect(workflow?.skills.length).toBeGreaterThanOrEqual(8);
  });

  test("gives every skill its file, a Use when sentence and a line count", () => {
    const skills = allSkills(catalog);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(skill.path).toMatch(/^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/);
      expect(skill.path.split("/")[3]).toBe(skill.name);
      expect(skill.use_when.startsWith("Use when")).toBe(true);
      expect(skill.text.startsWith("---\n")).toBe(true);
      expect(skill.lines).toBeGreaterThan(5);
    }
    // The entry point comes first.
    expect(catalog.plugins[0]?.skills[0]?.name).toBe("using-wf");
  });

  test("is what the mock server answers", async () => {
    const server = createMockServer({ latency: 0 });
    expect(await server.skills()).toEqual(catalog);
    server.dispose();
  });
});

describe("install commands", () => {
  test("Claude: add the repository's marketplace, then install each plugin from it", () => {
    const commands = claudeInstallCommands(skillsCatalog()).map((c) => c.command);
    expect(commands[0]).toBe(`/plugin marketplace add ${SKILLS_REPO}`);
    expect(commands[1]).toBe("/plugin install workflow@workflow-marketplace");
  });

  test("Claude, for the whole team: the same two steps with --scope project, which commits them", () => {
    const commands = claudeTeamCommands(skillsCatalog()).map((c) => c.command);
    expect(commands).toEqual([
      `claude plugin marketplace add ${SKILLS_REPO} --scope project`,
      "claude plugin install workflow@workflow-marketplace --scope project",
    ]);
  });

  test("Claude: two groups, just me and everyone on the repository, and none without a marketplace", () => {
    const groups = claudeInstallGroups(skillsCatalog());
    expect(groups.map((g) => g.title)).toEqual(["Just me", "Everyone on the repository"]);
    expect(groups[1].hint).toContain(".claude/settings.json");
    expect(claudeInstallGroups({ plugins: [] })).toEqual([]);
    expect(claudeTeamCommands(undefined)).toEqual([]);
  });

  test("Codex: copy the skills, then tell Codex to use them", () => {
    expect(codexInstallCommands().map((c) => c.command)).toEqual([
      CODEX_INSTALL_COMMAND,
      CODEX_AGENTS_COMMAND,
    ]);
    expect(CODEX_INSTALL_COMMAND).toBe("scripts/install-skills.sh --codex");
    expect(CODEX_AGENTS_COMMAND).toBe("scripts/install-skills.sh --print-agents-md >> AGENTS.md");
  });

  test("every script the panel names is a flag install-skills.sh has", () => {
    const script = Object.values(
      import.meta.glob("../../scripts/install-skills.sh", {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>,
    )[0];
    expect(script).toContain("install-skills");
    for (const c of codexInstallCommands()) {
      const flag = /--[a-z-]+/.exec(c.command)?.[0] ?? "";
      expect(script).toContain(`${flag})`);
    }
  });
});

describe("author handles", () => {
  const raw = (files: Record<string, string>) => Object.values(files)[0] ?? "";

  test("using-wf names @claude for a Claude Code run under the bridge, and both authors.md carry it", () => {
    const skill = allSkills(skillsCatalog()).find((s) => s.name === "using-wf");
    const format = raw(
      import.meta.glob("../../plugins/workflow/skills/using-wf/references/format.md", {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>,
    );
    for (const text of [skill?.text ?? "", format]) {
      expect(text).toContain("Claude Code is `@claude` when the bridge starts it");
      expect(text).toContain("`@claude-opus` or `@claude-sonnet` by model");
    }
    const authors = Object.values(
      import.meta.glob(["./sample/authors.md", "./workspace/authors.md"], {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>,
    );
    expect(authors).toHaveLength(2);
    for (const text of authors) expect(text).toMatch(/^## @claude$/m);
  });
});
