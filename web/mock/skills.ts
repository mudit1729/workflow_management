// The repository's skills and plugins, read from its own files: `plugins/<plugin>/skills/<skill>/
// SKILL.md`, `plugins/<plugin>/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
// The bundler reads them (`import.meta.glob`, eager, raw), so the prototype shows exactly what is
// committed; a daemon would read the same files from disk. The glob reaches out of `web/`, which
// the dev server allows through `server.fs.allow` in vite.config.ts.
//
// In the dev server a saved SKILL.md replaces this module (it accepts its own update) and the new
// catalog goes into a holder that outlives the module, so the page does not reload.
import { skillRef } from "@/lib/api/flow";
import { firstSkillProblem } from "@/lib/api/skill-check";
import type {
  Skill,
  SkillPlugin,
  SkillShelf,
  SkillsCatalog,
  SkillsMarketplace,
} from "@/lib/api/skills";
import type { LibraryInfo } from "@/lib/api/types";
import { BUILTIN_FILES, BUILTIN_PATHS } from "./skill-files";

export { validateSkill } from "@/lib/api/skill-check";

const SKILL_FILES = import.meta.glob("../../plugins/*/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const PLUGIN_FILES = import.meta.glob("../../plugins/*/.claude-plugin/plugin.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const MARKETPLACE_FILES = import.meta.glob("../../.claude-plugin/marketplace.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** `../../plugins/workflow/skills/x/SKILL.md` → `plugins/workflow/skills/x/SKILL.md` */
const repoPath = (key: string) => key.replace(/^(\.\.\/)+/, "");

// ---------------------------------------------------------------- parsing

const unquote = (value: string): string => {
  const t = value.trim();
  const first = t[0];
  return t.length >= 2 && (first === '"' || first === "'") && t.endsWith(first)
    ? t.slice(1, -1)
    : t;
};

/** The `key: value` lines of a leading `---` block. A skill's frontmatter is flat. */
export function skillFrontmatter(text: string): Record<string, string> {
  const lines = text.replace(/^﻿/, "").split("\n");
  if (lines[0]?.trim() !== "---") return {};
  const out: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line.replace(/\r$/, ""));
    if (m?.[1]) out[m[1]] = unquote(m[2] ?? "");
  }
  return out;
}

/**
 * Splits a skill description into the sentence that says when to use it and the "Avoid for …"
 * clause. The first sentence ends at a full stop that a new sentence follows ("…on the board.
 * Orchestrator."), a stop inside a closing quote included.
 */
export function splitDescription(description: string): { use_when: string; avoid?: string } {
  const text = description.trim();
  const avoidAt = text.search(/(?:^|\s)Avoid\b/);
  const avoid = avoidAt >= 0 ? text.slice(avoidAt).trim() : undefined;
  const head = avoidAt >= 0 ? text.slice(0, avoidAt).trim() : text;
  const end = /\.(?=\s+[A-Z])/.exec(head);
  return { use_when: end ? head.slice(0, end.index + 1) : head, avoid };
}

/** `SKILL.md` first, then the rest of a folder's files in path order. */
const folderFiles = (files: string[]): string[] =>
  [...files].sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a < b ? -1 : 1));

function parseSkill(key: string, text: string, paths: readonly string[]): Skill | undefined {
  const path = repoPath(key);
  const parts = path.split("/"); // plugins / <plugin> / skills / <skill> / SKILL.md
  const plugin = parts[1];
  const folder = parts[3];
  if (!plugin || !folder) return undefined;
  const front = skillFrontmatter(text);
  const description = front.description ?? "";
  const { use_when, avoid } = splitDescription(description);
  const own = `plugins/${plugin}/skills/${folder}/`;
  const name = front.name || folder;
  return {
    name,
    plugin,
    path,
    description,
    use_when,
    ...(avoid ? { avoid } : {}),
    text,
    lines: text.replace(/\n$/, "").split("\n").length,
    source: "built-in",
    ref: name,
    files: folderFiles(
      paths
        .filter((p) => p.startsWith(own))
        .map((p) => p.slice(own.length))
        .concat("SKILL.md")
        .filter((p, i, all) => all.indexOf(p) === i),
    ),
  };
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const nameOf = (v: unknown): string | undefined =>
  str(v) ?? str((v as { name?: unknown } | null | undefined)?.name);

/** What the files say, as the API shape. Takes the raw files so a test can feed its own. */
export function buildCatalog(files: {
  skills: Record<string, string>;
  plugins: Record<string, string>;
  marketplaces: Record<string, string>;
  /** Repository-relative paths of every file of the skills (scripts, references). Default: none. */
  paths?: readonly string[];
}): SkillsCatalog {
  const marketFile = Object.entries(files.marketplaces)[0];
  const marketJson = marketFile ? parseJson(marketFile[1]) : undefined;
  const marketplace: SkillsMarketplace | undefined =
    marketFile && marketJson && str(marketJson.name)
      ? {
          name: str(marketJson.name) as string,
          owner: nameOf(marketJson.owner),
          description: str(marketJson.description),
          path: repoPath(marketFile[0]),
        }
      : undefined;
  const listed = Array.isArray(marketJson?.plugins)
    ? (marketJson.plugins as Record<string, unknown>[])
    : [];

  const skills = Object.entries(files.skills)
    .map(([key, text]) => parseSkill(key, text, files.paths ?? []))
    .filter((s): s is Skill => s !== undefined);

  const byFolder = new Map<string, Skill[]>();
  for (const skill of skills)
    byFolder.set(skill.plugin, [...(byFolder.get(skill.plugin) ?? []), skill]);

  const manifests = new Map<string, Record<string, unknown>>();
  for (const [key, text] of Object.entries(files.plugins)) {
    const json = parseJson(text);
    if (json) manifests.set(repoPath(key).split("/")[1] ?? "", json);
  }

  // Marketplace order first, then plugins only the folder tree knows.
  const folders = [
    ...listed
      .map((entry) => str(entry.source)?.replace(/^\.\//, "").replace(/\/$/, "").split("/")[1])
      .filter((f): f is string => Boolean(f)),
    ...byFolder.keys(),
  ].filter((f, i, all) => all.indexOf(f) === i);

  const plugins = folders.map((folder): SkillPlugin => {
    const manifest = manifests.get(folder);
    const entry = listed.find(
      (e) => str(e.source)?.replace(/^\.\//, "").replace(/\/$/, "") === `plugins/${folder}`,
    );
    return {
      name: str(manifest?.name) ?? str(entry?.name) ?? folder,
      version: str(manifest?.version),
      description: str(manifest?.description) ?? str(entry?.description) ?? "",
      path: `plugins/${folder}`,
      author: nameOf(manifest?.author),
      license: str(manifest?.license),
      category: str(entry?.category),
      tags: strings(entry?.tags),
      skills: [...(byFolder.get(folder) ?? [])].sort(compareSkills),
    };
  });
  return { marketplace, plugins, shelves: [] };
}

/** "Start here" skills first (the entry point of a plugin), then by name. */
function compareSkills(a: Skill, b: Skill): number {
  const start = (s: Skill) => (/start here/i.test(s.description) ? 0 : 1);
  return start(a) - start(b) || a.name.localeCompare(b.name);
}

// ---------------------------------------------------------------- the catalog, hot-swappable

const catalog = (): SkillsCatalog =>
  buildCatalog({
    skills: SKILL_FILES,
    plugins: PLUGIN_FILES,
    marketplaces: MARKETPLACE_FILES,
    paths: BUILTIN_PATHS,
  });

// The holder outlives this module: a re-run of it (a SKILL.md saved in dev) writes the new
// catalog into the same object, and the copy of `skillsCatalog` that importers still hold reads it.
const holder: { current: SkillsCatalog } = import.meta.hot?.data.holder ?? { current: catalog() };
holder.current = catalog();

if (import.meta.hot) {
  import.meta.hot.data.holder = holder;
  import.meta.hot.accept();
}

/** The plugins and skills as committed. */
export function skillsCatalog(): SkillsCatalog {
  return holder.current;
}

// ---------------------------------------------------------------- the other sources

/** A skill folder in the files of a workspace or a library: `skills/<name>/SKILL.md`. */
const SKILL_MD = /^skills\/([^/]+)\/SKILL\.md$/;

/**
 * The skills of one source from its text files (paths relative to the root of the workspace or
 * library): every `skills/<name>/SKILL.md`, with the files beside it. `prefix` is where the root
 * is in its repository (`docs/` for a library whose root is `docs`), so `path` is repo-relative.
 */
export function shelfSkills(args: {
  source: "workspace" | "library" | "me";
  alias?: string;
  /** The key the skills belong to: `ws`, the alias or `me`. */
  key: string;
  files: Record<string, string>;
  prefix?: string;
}): Skill[] {
  const { source, alias, key, files } = args;
  const skills: Skill[] = [];
  for (const [path, text] of Object.entries(files)) {
    const folder = SKILL_MD.exec(path)?.[1];
    if (!folder) continue;
    const own = `skills/${folder}/`;
    const mine = Object.keys(files)
      .filter((p) => p.startsWith(own))
      .map((p) => p.slice(own.length));
    const front = skillFrontmatter(text);
    const description = front.description ?? "";
    const { use_when, avoid } = splitDescription(description);
    // Relative paths in a skill: `../other/x.md` is a built-in or a sibling of the same shelf.
    const exists = (rel: string): boolean => {
      const sibling = /^\.\.\/([^/]+)\/(.+)$/.exec(rel);
      if (sibling)
        return (
          BUILTIN_FILES.has(`${sibling[1]}/${sibling[2]}`) ||
          `skills/${sibling[1]}/${sibling[2]}` in files
        );
      return `${own}${rel}` in files;
    };
    const problem = firstSkillProblem(text, folder, { exists });
    skills.push({
      name: front.name || folder,
      plugin: key,
      path: `${args.prefix ?? ""}${path}`,
      description,
      use_when,
      ...(avoid ? { avoid } : {}),
      text,
      lines: text.replace(/\n$/, "").split("\n").length,
      source,
      // The reference is the folder's name: it is what the install puts beside the built-ins.
      ref: skillRef(source, folder, alias),
      ...(alias ? { library: alias } : {}),
      files: folderFiles(mine),
      ...(problem ? { problem } : {}),
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** This workspace's `skills/` folder. `files` are the workspace's text files by path. */
export function workspaceShelf(files: Record<string, string>): SkillShelf {
  return {
    source: "workspace",
    key: "ws",
    name: "This workspace",
    path: "skills",
    editable: true,
    skills: shelfSkills({ source: "workspace", key: "ws", files }),
  };
}

/** A shelf for a loaded library: `files` are relative to its root, `info` is the library's listing. */
export function libraryShelf(info: LibraryInfo, files: Record<string, string>): SkillShelf {
  const personal = info.kind === "personal";
  const prefix = !personal && info.root ? `${info.root}/` : "";
  const key = personal ? "me" : info.alias;
  return {
    source: personal ? "me" : "library",
    key,
    name: personal ? "My library" : info.name,
    path: `${prefix}skills`,
    ...(info.url ? { url: info.url } : {}),
    editable: personal,
    skills: shelfSkills({
      source: personal ? "me" : "library",
      ...(personal ? {} : { alias: info.alias }),
      key,
      files,
      prefix,
    }),
  };
}

/** The built-in catalog with the shelves of the other sources after it. */
export function composeCatalog(base: SkillsCatalog, shelves: SkillShelf[]): SkillsCatalog {
  return { ...base, shelves };
}
