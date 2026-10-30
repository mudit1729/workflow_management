// Skills and plugins of the repository (Workdatabase · Skills, plan D7): the plugins that ship the
// wf skills, each skill's SKILL.md, and the commands that install them for Claude Code and Codex.
// The data is read from the repository's own files (`plugins/**/SKILL.md`, `plugin.json`,
// `.claude-plugin/marketplace.json`), never kept in the workspace: `wf serve` would read the same
// files from disk, the prototype reads them at build time (`mock/skills.ts`).
import { useQuery } from "@tanstack/react-query";
import { qk } from "./keys";
import { isRealApi, loadMock } from "./mock-bridge";

/** The repository `/plugin marketplace add` points at. One place to change it. */
export const SKILLS_REPO = "mudit1729/workflow_management";

/** Copies the skills for Codex into `.agents/skills`. */
export const CODEX_INSTALL_COMMAND = "scripts/install-skills.sh --codex";

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

/** What to run in Claude Code: add the marketplace once, then install each plugin. */
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

/** What to run for Codex, from a clone of the repository. */
export function codexInstallCommands(): InstallCommand[] {
  return [{ label: "Copy the skills to .agents/skills", command: CODEX_INSTALL_COMMAND }];
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
