// The files of the built-in skills, read from the repository's own folders like the catalog
// (`mock/skills.ts`): every file under `plugins/*/skills/<skill>/`. A path check needs only the
// names (`../using-wf/scripts/wf-env.sh` exists), so the scripts and references are globbed lazily
// and asked for their keys; `copySkill` loads the text of the ones of the skill it copies. The
// SKILL.md files are the catalog's own (the same eager glob, so one module each).
//
// Kept apart from `skills.ts` so the markdown layer (`md/index.ts`, which `wf:lint` loads in
// node) can check the workspace's skills without the catalog's hot-reload holder.

const SKILL_MD = import.meta.glob("../../plugins/*/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SUPPORT = import.meta.glob("../../plugins/*/skills/*/{scripts,references}/**/*", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

/** `../../plugins/workflow/skills/using-wf/SKILL.md` → `using-wf/SKILL.md`. */
const relative = (key: string) => key.replace(/^(\.\.\/)+plugins\/[^/]+\/skills\//, "");

/** Repository-relative paths of every file of every built-in skill: `plugins/workflow/skills/using-wf/SKILL.md`. */
export const BUILTIN_PATHS: readonly string[] = [...Object.keys(SKILL_MD), ...Object.keys(SUPPORT)]
  .map((key) => key.replace(/^(\.\.\/)+/, ""))
  .sort();

/** Every file of every built-in skill, as `<skill>/<path>`: `using-wf/references/format.md`. */
export const BUILTIN_FILES: ReadonlySet<string> = new Set(
  [...Object.keys(SKILL_MD), ...Object.keys(SUPPORT)].map(relative),
);

/**
 * The text files of one built-in skill, as paths relative to its folder (`SKILL.md`,
 * `references/format.md`, `scripts/wf-env.sh`). Empty when there is no such skill.
 */
export async function builtinSkillFiles(name: string): Promise<{ path: string; text: string }[]> {
  const prefix = `${name}/`;
  const found: { path: string; load: () => Promise<string> }[] = [
    ...Object.entries(SKILL_MD).map(([key, text]) => ({
      path: relative(key),
      load: () => Promise.resolve(text),
    })),
    ...Object.entries(SUPPORT).map(([key, load]) => ({ path: relative(key), load })),
  ]
    .filter((f) => f.path.startsWith(prefix))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  return Promise.all(
    found.map(async (f) => ({ path: f.path.slice(prefix.length), text: await f.load() })),
  );
}
