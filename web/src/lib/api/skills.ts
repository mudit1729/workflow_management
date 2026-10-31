// Skills and plugins of the repository (Workdatabase · Skills, plan D7): the plugins that ship the
// wf skills, each skill's SKILL.md, and the commands that install them for Claude Code and Codex.
// The data is read from the repository's own files (`plugins/**/SKILL.md`, `plugin.json`,
// `.claude-plugin/marketplace.json`), never kept in the workspace: `wf serve` would read the same
// files from disk, the prototype reads them at build time (`mock/skills.ts`).
import { useQuery } from "@tanstack/react-query";
import { qk } from "./keys";
import { isRealApi, loadMock } from "./mock-bridge";

/**
 * The team's repository: what `/plugin marketplace add` points at, and what the install panel
 * names. It is the `repository` of `plugins/workflow/.claude-plugin/plugin.json`, which
 * `scripts/install-skills.sh --claude-plugin` reads too; `web/scripts/install-skills.test.ts`
 * keeps the two equal.
 */
export const SKILLS_REPO = "mudit1729/workflow_management";

/** Copies the skills for Codex into `.agents/skills`. */
export const CODEX_INSTALL_COMMAND = "scripts/install-skills.sh --codex";

/** Prints the AGENTS.md snippet that tells Codex to use the skills; appended to the file. */
export const CODEX_AGENTS_COMMAND = "scripts/install-skills.sh --print-agents-md >> AGENTS.md";

export interface Skill {
  /** The skill's name: its folder, and the `name` of its frontmatter. */
  name: string;
  /** The plugin that ships it. */
  plugin: string;
  /** Repository-relative path of its SKILL.md. */
  path: string;
  /** The frontmatter description, whole. */
  description: string;
  /** The "Use when …" sentence of the description. */
  use_when: string;
  /** The "Avoid for …" part of the description, when it has one. */
  avoid?: string;
  /** The text of SKILL.md, frontmatter included. */
  text: string;
  /** Lines of SKILL.md. */
  lines: number;
}

export interface SkillPlugin {
  /** The name `/plugin install` takes (`name` in plugin.json). */
  name: string;
  version?: string;
  description: string;
  /** Repository-relative folder of the plugin. */
  path: string;
  author?: string;
  license?: string;
  /** The category the marketplace lists it under. */
  category?: string;
  tags: string[];
  skills: Skill[];
}

export interface SkillsMarketplace {
  /** The name after the `@` of `/plugin install <plugin>@<name>`. */
  name: string;
  owner?: string;
  description?: string;
  /** Repository-relative path of marketplace.json. */
  path: string;
}

export interface SkillsCatalog {
  /** Undefined when the repository has no `.claude-plugin/marketplace.json`. */
  marketplace?: SkillsMarketplace;
  plugins: SkillPlugin[];
}

/** Every skill of the catalog, in plugin order. */
export function allSkills(catalog: SkillsCatalog | undefined): Skill[] {
  return catalog?.plugins.flatMap((p) => p.skills) ?? [];
}

/** One install command, with what it does. */
export interface InstallCommand {
  /** What the command does, in a few words. */
  label: string;
  command: string;
}

/** The commands for one audience of one tool, in the order to run them. */
export interface InstallGroup {
  /** Who it is for: "Just me", "Everyone on the repository". */
  title: string;
  /** Where to run it, and what to commit. */
  hint: string;
  commands: InstallCommand[];
}

/** What to run in Claude Code, for one person: add the marketplace once, then install each plugin. */
export function claudeInstallCommands(catalog: SkillsCatalog | undefined): InstallCommand[] {
  const marketplace = catalog?.marketplace?.name;
  if (!catalog || !marketplace) return [];
  return [
    { label: "Add the marketplace", command: `/plugin marketplace add ${SKILLS_REPO}` },
    ...catalog.plugins.map((p) => ({
      label: `Install ${p.name}`,
      command: `/plugin install ${p.name}@${marketplace}`,
    })),
  ];
}

/**
 * The same two steps for everyone who opens the repository: `--scope project` writes them to
 * `.claude/settings.json`, which is committed, so Claude Code offers the plugin to each person.
 */
export function claudeTeamCommands(catalog: SkillsCatalog | undefined): InstallCommand[] {
  const marketplace = catalog?.marketplace?.name;
  if (!catalog || !marketplace) return [];
  return [
    {
      label: "Add the marketplace to the repository",
      command: `claude plugin marketplace add ${SKILLS_REPO} --scope project`,
    },
    ...catalog.plugins.map((p) => ({
      label: `Install ${p.name} for the repository`,
      command: `claude plugin install ${p.name}@${marketplace} --scope project`,
    })),
  ];
}

/** Claude Code's two audiences: you, then the whole team. Empty without a marketplace. */
export function claudeInstallGroups(catalog: SkillsCatalog | undefined): InstallGroup[] {
  const mine = claudeInstallCommands(catalog);
  const team = claudeTeamCommands(catalog);
  if (mine.length === 0) return [];
  return [
    { title: "Just me", hint: "Run in a Claude Code session", commands: mine },
    {
      title: "Everyone on the repository",
      hint: "Run in a shell, then commit .claude/settings.json",
      commands: team,
    },
  ];
}

/**
 * What to run for Codex, from a clone of the repository: copy the skills, then tell Codex to use
 * them. Commit `.agents/skills` and `AGENTS.md` and the whole team has both.
 */
export function codexInstallCommands(): InstallCommand[] {
  return [
    { label: "Copy the skills to .agents/skills", command: CODEX_INSTALL_COMMAND },
    { label: "Tell Codex to use them", command: CODEX_AGENTS_COMMAND },
  ];
}

async function fetchSkills(): Promise<SkillsCatalog> {
  if (isRealApi) {
    // A placeholder path: no daemon answers it yet.
    const res = await fetch("/api/skills");
    if (!res.ok) throw new Error(`wf serve answered ${res.status} ${res.statusText}.`);
    return (await res.json()) as SkillsCatalog;
  }
  return (await loadMock()).skills();
}

/** The plugins and skills of the repository. Static while the app runs. */
export function useSkills() {
  return useQuery({
    queryKey: qk.skills(),
    queryFn: fetchSkills,
    staleTime: 5 * 60_000,
  });
}
