// `validateSkill` is a port of plugins/workflow/scripts/check-skills.mjs. The expected messages
// below are what the script printed for the same skills (run once over these texts), so the editor
// of a skill copy shows the problems the script would.
import { describe, expect, test } from "vitest";
import { firstSkillProblem, renameSkillText, splitSkill, validateSkill } from "./skill-check";

const skills = import.meta.glob("../../../../plugins/workflow/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const OK = "Use when x. Avoid y.";
const doc = (name: string, description: string, body = "body\n", extra = "") =>
  `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${body}`;

/** [name of the skill, its text, the problems check-skills.mjs prints for it]. */
const CASES: [string, string, string[]][] = [
  ["nofront", "# hello\n", ["no frontmatter"]],
  [
    "crlf",
    "---\r\nname: crlf\r\ndescription: Use when x. Avoid y.\r\n---\r\nbody\r\n",
    ["no frontmatter"],
  ],
  ["noclose", "---\nname: noclose\ndescription: Use when x. Avoid y.\nbody\n", ["no frontmatter"]],
  ["nofinalnl", "---\nname: nofinalnl\ndescription: Use when x. Avoid y.\n---", ["no frontmatter"]],
  [
    "extrakey",
    doc("extrakey", OK, "body\n", "metadata: z\n"),
    ["frontmatter keys must be name and description, found description,metadata,name"],
  ],
  [
    "badline",
    "---\nname: badline\n  description: Use when x. Avoid y.\n---\nbody\n",
    [
      'frontmatter line is not "key: value":   description: Use when x. Avoid y.',
      "frontmatter keys must be name and description, found name",
      "description is 0 characters (1 to 1024)",
      'description must start with "Use when "',
      'description must say what to avoid ("Avoid ...")',
    ],
  ],
  [
    "upperkey",
    "---\nName: upperkey\ndescription: Use when x. Avoid y.\n---\nbody\n",
    [
      'frontmatter line is not "key: value": Name: upperkey',
      "frontmatter keys must be name and description, found description",
      'name "undefined" does not match the folder',
    ],
  ],
  [
    "wrongname",
    doc("other", OK).replace("other", "other"),
    ['name "other" does not match the folder'],
  ],
  ["nouse", doc("nouse", "When x. Avoid y."), ['description must start with "Use when "']],
  ["noavoid", doc("noavoid", "Use when x."), ['description must say what to avoid ("Avoid ...")']],
  [
    "yamlind",
    doc("yamlind", '"Use when x. Avoid y."'),
    ['description must start with "Use when "', "description starts with a YAML indicator"],
  ],
  [
    "colon",
    doc("colon", "Use when x: y. Avoid z."),
    ['description holds ": " or " #", which breaks a plain YAML scalar'],
  ],
  [
    "hash",
    doc("hash", "Use when x #y. Avoid z."),
    ['description holds ": " or " #", which breaks a plain YAML scalar'],
  ],
  [
    "person",
    doc("person", "Use when you want x. Avoid my y."),
    ["description is not in the third person"],
  ],
  ["personq", doc("personq", 'Use when "you" want x. Avoid I-beam.'), []],
  ["long", doc("long", OK, "line\n".repeat(305)), ["body has 306 lines (limit 299)"]],
  ["edge", doc("edge", OK, "line\n".repeat(298)), []],
  [
    "long2",
    doc("long2", `Use when ${"x".repeat(1100)}. Avoid y.`),
    ["description is 1119 characters (1 to 1024)"],
  ],
  [
    "empty",
    "---\nname: empty\ndescription:\n---\nbody\n",
    [
      "description is 0 characters (1 to 1024)",
      'description must start with "Use when "',
      'description must say what to avoid ("Avoid ...")',
    ],
  ],
];

describe("validateSkill", () => {
  test.each(CASES)("%s", (name, text, expected) => {
    expect(validateSkill(text, name).map((p) => p.message)).toEqual(expected);
  });

  test("the folder name rules apply to the folder, not to the text", () => {
    const text = doc("Bad_Name", OK);
    expect(validateSkill(text, "Bad_Name").map((p) => p.message)).toEqual([
      "name is not kebab-case or is too long",
    ]);
    const long = "a".repeat(65);
    expect(validateSkill(doc(long, OK), long).map((p) => p.message)).toEqual([
      "name is not kebab-case or is too long",
    ]);
  });

  test("relative paths are checked only when the caller can say what exists", () => {
    const text = doc(
      "paths",
      OK,
      "See `scripts/none.sh`, `../using-wf/references/format.md`, `../nobody/x.md` and `references/a.md`.\n",
    );
    expect(validateSkill(text, "paths")).toEqual([]);
    const exists = (rel: string) => rel.startsWith("../using-wf/") || rel === "references/a.md";
    expect(validateSkill(text, "paths", { exists }).map((p) => p.message)).toEqual([
      "path does not exist: scripts/none.sh",
      "path does not exist: ../nobody/x.md",
    ]);
  });

  test("a problem points at its line when the rule has one", () => {
    const problems = validateSkill(doc("x", "Use when a. Avoid b, you."), "x");
    expect(problems).toEqual([{ message: "description is not in the third person", line: 2 }]);
    const body = validateSkill(doc("long", OK, "line\n".repeat(305)), "long");
    expect(body[0]?.line).toBe(4);
  });

  test("every built-in skill passes, with the paths it cites checked against its siblings", () => {
    const names = Object.keys(skills).map((p) => p.split("/").at(-2) as string);
    expect(names.length).toBe(12);
    for (const [path, text] of Object.entries(skills)) {
      const name = path.split("/").at(-2) as string;
      expect(validateSkill(text, name), name).toEqual([]);
    }
  });
});

describe("helpers", () => {
  test("firstSkillProblem is the first message, or undefined", () => {
    expect(firstSkillProblem("# nope\n", "x")).toBe("no frontmatter");
    expect(firstSkillProblem(doc("x", OK), "x")).toBeUndefined();
  });

  test("renameSkillText changes the name line and nothing else", () => {
    const text = doc("planning-issues", OK, "# Body\n\nname: stays\n");
    const out = renameSkillText(text, "wf-planning-issues");
    expect(out).toBe(doc("wf-planning-issues", OK, "# Body\n\nname: stays\n"));
    expect(validateSkill(out, "wf-planning-issues")).toEqual([]);
    expect(renameSkillText("no frontmatter", "x")).toBe("no frontmatter");
  });

  test("splitSkill takes the frontmatter apart", () => {
    expect(splitSkill(doc("x", OK, "a\nb\n"))).toEqual({
      front: `name: x\ndescription: ${OK}`,
      body: "a\nb\n",
      bodyLine: 4,
    });
    expect(splitSkill("x")).toBeUndefined();
  });
});
