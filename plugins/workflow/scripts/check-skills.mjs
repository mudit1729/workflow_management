#!/usr/bin/env node
// check-skills.mjs: house rules for the SKILL.md files of this plugin (docs/plan/research/bp-skill-packs.md
// section 2 and the portable subset that Codex and Claude Code both read).
//
//   node plugins/workflow/scripts/check-skills.mjs [skills dir]
//
// Rules: frontmatter holds only `name` and `description`; `name` matches the folder and is
// kebab-case (at most 64 characters); `description` is one line of at most 1024 characters, starts
// with "Use when" and names what to avoid (except for the pre-existing writing skill, which says
// "Avoid" too); the YAML stays valid (no `: ` or ` #` in a plain scalar); the body has fewer than
// 300 lines; every relative path to a file in a skill exists. Exit 1 on any finding.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2] ?? join(HERE, "..", "skills"));
const problems = [];
const skills = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());

for (const name of skills) {
  const file = join(dir, name, "SKILL.md");
  const say = (msg) => problems.push(`${name}/SKILL.md: ${msg}`);
  if (!existsSync(file)) {
    say("missing");
    continue;
  }
  const text = readFileSync(file, "utf8");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) {
    say("no frontmatter");
    continue;
  }
  const front = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z][a-z-]*):\s?(.*)$/.exec(line);
    if (!kv) say(`frontmatter line is not "key: value": ${line.slice(0, 40)}`);
    else front[kv[1]] = kv[2];
  }
  const keys = Object.keys(front).sort().join(",");
  if (keys !== "description,name")
    say(`frontmatter keys must be name and description, found ${keys}`);
  if (front.name !== name) say(`name "${front.name}" does not match the folder`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64)
    say("name is not kebab-case or is too long");
  const d = front.description ?? "";
  if (d.length === 0 || d.length > 1024) say(`description is ${d.length} characters (1 to 1024)`);
  if (!/^Use when /.test(d)) say('description must start with "Use when "');
  if (!/\bAvoid\b/.test(d)) say('description must say what to avoid ("Avoid ...")');
  if (/^["'>|[{&*!%@`]/.test(d)) say("description starts with a YAML indicator");
  if (/: /.test(d) || / #/.test(d))
    say('description holds ": " or " #", which breaks a plain YAML scalar');
  if (/(?<![-\w])(I|my|you|your)(?![-\w])/.test(d.replace(/"[^"]*"/g, "")))
    say("description is not in the third person");
  const lines = m[2].split("\n").length;
  if (lines >= 300) say(`body has ${lines} lines (limit 299)`);

  // relative paths that point at files: scripts/x.sh, references/x.md, ../skill/x
  const body = m[2];
  const paths = new Set();
  for (const p of body.matchAll(
    /`((?:\.\.\/[a-z0-9-]+\/|scripts\/|references\/)[A-Za-z0-9_./-]*\.(?:sh|md|mjs))`/g,
  ))
    paths.add(p[1]);
  for (const rel of paths) {
    if (!existsSync(join(dir, name, rel))) say(`path does not exist: ${rel}`);
  }
}
if (!skills.includes("using-wf")) problems.push("using-wf (the bootstrap skill) is missing");

if (problems.length) {
  for (const p of problems) process.stderr.write(`${p}\n`);
  process.exit(1);
}
process.stdout.write(`${skills.length} skills ok (${skills.join(", ")})\n`);
