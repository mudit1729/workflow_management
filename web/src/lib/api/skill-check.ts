// The house rules for a SKILL.md: a port of `plugins/workflow/scripts/check-skills.mjs`, rule for
// rule and message for message, so the editor of a skill copy shows the problems the script
// would print. `skill-check.test.ts` runs both over the same skills and compares the answers.
//
// Frontmatter holds only `name` and `description`; `name` matches the folder and is kebab-case (at
// most 64 characters); `description` is one line of at most 1024 characters, starts with "Use
// when" and names what to avoid; the YAML stays valid (no `: ` or ` #` in a plain scalar); the
// description is in the third person; the body has fewer than 300 lines; every relative path to a
// file in a skill exists.
//
// One rule of the script is about the folder, not the skill: `using-wf` must be beside the others.
// A skill of the workspace or a library is installed beside the built-ins, so it holds there.

/** One thing wrong with a skill. */
export interface SkillProblem {
  /** The script's message: `description must start with "Use when "`. */
  message: string;
  /** The 0-based line of the text to point at, when the rule has one. */
  line?: number;
}

export interface SkillCheckOptions {
  /**
   * Does a file exist, by its path relative to the skill's folder (`../using-wf/scripts/wf-env.sh`,
   * `scripts/run.sh`)? Without it the relative paths are not checked.
   */
  exists?: (relative: string) => boolean;
}

/** The text of a skill, taken apart by the script's frontmatter pattern. */
export interface SkillParts {
  /** The frontmatter lines, without the `---` fences. */
  front: string;
  body: string;
  /** 0-based line of the first body line. */
  bodyLine: number;
}

/** Split a SKILL.md at its frontmatter, or undefined when it has none (LF line endings only). */
export function splitSkill(text: string): SkillParts | undefined {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return undefined;
  const front = m[1] as string;
  return { front, body: m[2] as string, bodyLine: front.split("\n").length + 2 };
}

/**
 * Apply the rules of `check-skills.mjs` to the text of `<name>/SKILL.md`. Returns the problems in
 * the script's order; none means the skill passes.
 */
export function validateSkill(
  text: string,
  name: string,
  options: SkillCheckOptions = {},
): SkillProblem[] {
  const problems: SkillProblem[] = [];
  const say = (message: string, line?: number) =>
    problems.push(line === undefined ? { message } : { message, line });
  const parts = splitSkill(text);
  if (!parts) {
    say("no frontmatter", 0);
    return problems;
  }
  const front: Record<string, string> = {};
  const at: Record<string, number> = {};
  parts.front.split("\n").forEach((line, i) => {
    const kv = /^([a-z][a-z-]*):\s?(.*)$/.exec(line);
    if (!kv) say(`frontmatter line is not "key: value": ${line.slice(0, 40)}`, i + 1);
    else {
      front[kv[1] as string] = kv[2] as string;
      at[kv[1] as string] = i + 1;
    }
  });
  const keys = Object.keys(front).sort().join(",");
  if (keys !== "description,name")
    say(`frontmatter keys must be name and description, found ${keys}`, 0);
  if (front.name !== name) say(`name "${front.name}" does not match the folder`, at.name ?? 0);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64)
    say("name is not kebab-case or is too long", at.name ?? 0);
  const d = front.description ?? "";
  const dl = at.description ?? 0;
  if (d.length === 0 || d.length > 1024)
    say(`description is ${d.length} characters (1 to 1024)`, dl);
  if (!/^Use when /.test(d)) say('description must start with "Use when "', dl);
  if (!/\bAvoid\b/.test(d)) say('description must say what to avoid ("Avoid ...")', dl);
  if (/^["'>|[{&*!%@`]/.test(d)) say("description starts with a YAML indicator", dl);
  if (/: /.test(d) || / #/.test(d))
    say('description holds ": " or " #", which breaks a plain YAML scalar', dl);
  if (/(?<![-\w])(I|my|you|your)(?![-\w])/.test(d.replace(/"[^"]*"/g, "")))
    say("description is not in the third person", dl);
  const lines = parts.body.split("\n").length;
  if (lines >= 300) say(`body has ${lines} lines (limit 299)`, parts.bodyLine);

  // Relative paths that point at files: scripts/x.sh, references/x.md, ../skill/x.
  const exists = options.exists;
  if (exists) {
    const seen = new Set<string>();
    for (const p of parts.body.matchAll(
      /`((?:\.\.\/[a-z0-9-]+\/|scripts\/|references\/)[A-Za-z0-9_./-]*\.(?:sh|md|mjs))`/g,
    ))
      seen.add(p[1] as string);
    for (const rel of seen) {
      if (exists(rel)) continue;
      const row = parts.body.split("\n").findIndex((l) => l.includes(`\`${rel}\``));
      say(`path does not exist: ${rel}`, row < 0 ? undefined : parts.bodyLine + row);
    }
  }
  return problems;
}

/** The first problem as one line for a card ("Not a valid skill: …"), or undefined when it passes. */
export function firstSkillProblem(
  text: string,
  name: string,
  options?: SkillCheckOptions,
): string | undefined {
  return validateSkill(text, name, options)[0]?.message;
}

/**
 * A skill's text under a new name: the `name:` line of the frontmatter is rewritten, everything
 * else stays. A copy must carry its own folder's name, or `validateSkill` refuses it.
 */
export function renameSkillText(text: string, name: string): string {
  const parts = splitSkill(text);
  if (!parts) return text;
  const front = parts.front
    .split("\n")
    .map((l) => (/^name:/.test(l) ? `name: ${name}` : l))
    .join("\n");
  return `---\n${front}\n---\n${parts.body}`;
}
