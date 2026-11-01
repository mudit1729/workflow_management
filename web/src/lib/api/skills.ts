// Skills and plugins of the repository (Workdatabase · Skills, plan D7): the plugins that ship the
// wf skills, each skill's SKILL.md, and the commands that install them for Claude Code and Codex.
// The data is read from the repository's own files (`plugins/**/SKILL.md`, `plugin.json`,
// `.claude-plugin/marketplace.json`), never kept in the workspace: `wf serve` would read the same
// files from disk, the prototype reads them at build time (`mock/skills.ts`).
import { useQuery } from "@tanstack/react-query";
import type { FlowStepId } from "@/gen/types";
import { api } from "./client";
import { BUILTIN_SKILLS, LIBRARY_SKILLS, type SkillSource } from "./flow";
import { qk } from "./keys";

export type { SkillSource } from "./flow";
// The rules of check-skills.mjs, for a skill the dashboard shows or edits.
export { type SkillProblem, validateSkill } from "./skill-check";

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
  /** Where it lives: the plugin (built-in), this workspace, a team library or the person's library. */
  source: SkillSource;
  /**
   * What a flow step names it by: `planning-issues` (bare for a built-in), `ws:<name>`,
   * `<alias>:<name>` or `me:<name>`. Unique in the catalog, so two skills of one name never
   * collide: key rows, links and palette values by `ref`, not by `name`.
   */
  ref: string;
  /** The alias of the team library it is in. */
  library?: string;
  /**
   * The files of its folder relative to it, `SKILL.md` first: `scripts/wf-env.sh`,
   * `references/format.md`. Only the text of `SKILL.md` is in the catalog; `api.skillFiles(ref)`
   * reads the rest.
   */
  files: string[];
  /**
   * The first problem when it fails the rules of `check-skills.mjs` ("description must start
   * with …"); a card says "Not a valid skill: …". Absent for a skill that passes.
   */
  problem?: string;
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

/**
 * The skills of one place that is not the plugin: this workspace's `skills/` folder, a team
 * library's, or the person's own (skills-flow-spec 2).
 */
export interface SkillShelf {
  source: Exclude<SkillSource, "built-in">;
  /** `ws`, the library alias, or `me`. */
  key: string;
  /** "This workspace", the library's name, "My library". */
  name: string;
  /** The folder, relative to the repository: `skills`, or `docs/skills` under a library root. */
  path: string;
  /** The GitHub repo of a library. */
  url?: string;
  /** The dashboard can write skills here: the workspace and the personal library. */
  editable: boolean;
  skills: Skill[];
}

export interface SkillsCatalog {
  /** Undefined when the repository has no `.claude-plugin/marketplace.json`. */
  marketplace?: SkillsMarketplace;
  /** The built-in skills, by plugin. */
  plugins: SkillPlugin[];
  /** The other sources, in the order the picker lists them: this workspace, team libraries, mine. */
  shelves: SkillShelf[];
}

/** Every skill of the catalog: the plugins' first, then each shelf's. */
export function allSkills(catalog: SkillsCatalog | undefined): Skill[] {
  return [
    ...(catalog?.plugins.flatMap((p) => p.skills) ?? []),
    ...(catalog?.shelves.flatMap((s) => s.skills) ?? []),
  ];
}

/** The skill a reference names, or undefined when the catalog has none. */
export function skillByRef(catalog: SkillsCatalog | undefined, ref: string): Skill | undefined {
  return allSkills(catalog).find((s) => s.ref === ref);
}

/** The shelf of a source (`ws`, an alias or `me`), or undefined. */
export function shelfOf(catalog: SkillsCatalog | undefined, key: string): SkillShelf | undefined {
  return catalog?.shelves.find((s) => s.key === key);
}

/**
 * Does a reference resolve? The test `resolveFlow` takes as `exists`. Undefined while the catalog
 * loads: the flow then takes every well-formed reference as found.
 */
export function skillExists(
  catalog: SkillsCatalog | undefined,
): ((ref: string) => boolean) | undefined {
  if (!catalog) return undefined;
  const refs = new Set(allSkills(catalog).map((s) => s.ref));
  return (ref) => refs.has(ref);
}

/** The skills of one source a step can pick from. */
export interface SkillChoiceGroup {
  /** `built-in`, `ws`, a library alias or `me`. */
  key: string;
  /** "Built-in", "This workspace", the library's name, "My library". */
  name: string;
  source: SkillSource;
  skills: Skill[];
}

/**
 * The skills a step's panel offers, grouped as the spec lists them: the built-in default of the
 * step (a built-in skill is offered only for its own step), this workspace's skills, each team
 * library's, mine. For a custom step (`"custom"`) the built-in group is the four library skills,
 * which are offered there only. Empty groups are left out; a skill that fails the rules is still
 * listed, with its `problem`, so a card can say "Not a valid skill".
 *
 * `exclude` are references that are not offered. A custom step passes the skill in effect for the
 * step it follows (`flow.steps[after].skill`): a custom step that runs it would run that step again
 * and again.
 */
export function skillChoices(
  catalog: SkillsCatalog | undefined,
  target: FlowStepId | "custom",
  opts: { exclude?: readonly string[] } = {},
): SkillChoiceGroup[] {
  if (!catalog) return [];
  const left = (skills: Skill[]) => skills.filter((s) => !opts.exclude?.includes(s.ref));
  const builtin = (target === "custom" ? [...LIBRARY_SKILLS] : [BUILTIN_SKILLS[target]])
    .map((ref) => skillByRef(catalog, ref))
    .filter((s): s is Skill => s !== undefined);
  return [
    { key: "built-in", name: "Built-in", source: "built-in" as const, skills: left(builtin) },
    ...catalog.shelves.map((s) => ({
      key: s.key,
      name: s.name,
      source: s.source,
      skills: left(s.skills),
    })),
  ].filter((g) => g.skills.length > 0);
}

/** Where the bridge keeps its clones (`wf-lib.sh dir <owner> <repo>`). */
const CLONES = "~/.wf/libraries";

/**
 * The folder of a shelf as `install-skills.sh --from` takes it, written so a shell runs it once
 * pasted. This workspace's is `"$WF_ROOT/skills"`: `WF_ROOT` is the variable `wf-env.sh` reads, and
 * `installFromNote` says to set it. A library's is its clone, which the bridge keeps under
 * `~/.wf/libraries`; one with no GitHub link is a folder to run the command from.
 */
export function shelfFolder(shelf: SkillShelf): string {
  if (shelf.source === "workspace") return '"$WF_ROOT/skills"';
  const m = /github\.com[:/]([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/.exec(shelf.url ?? "");
  return m ? `${CLONES}/${m[1]}/${m[2]}/${shelf.path}` : shelf.path;
}

/**
 * What installs the skills of a shelf beside the built-ins, so an agent finds them by name
 * (spec 7): `scripts/install-skills.sh --codex --from "$WF_ROOT/skills"`. A skill that is not
 * installed cannot run, whatever the flow names.
 */
export function installFromCommand(shelf: SkillShelf, tool: "codex" | "claude" = "codex"): string {
  return `scripts/install-skills.sh --${tool} --from ${shelfFolder(shelf)}`;
}

/**
 * The line to show beside `installFromCommand`, or undefined when the command needs no setup. Only
 * this workspace's command reads a variable.
 */
export function installFromNote(shelf: SkillShelf): string | undefined {
  return shelf.source === "workspace" ? "Run it with WF_ROOT set to this workspace." : undefined;
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

/**
 * The plugins and skills of the repository, this workspace's `skills/` folder, the loaded team
 * libraries and the person's library. Refetched when the workspace or a library changes.
 */
export function useSkills() {
  return useQuery({
    queryKey: qk.skills(),
    queryFn: () => api.skills(),
    staleTime: 5 * 60_000,
  });
}
