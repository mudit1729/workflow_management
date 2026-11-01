// A small made-up flow for the Kit and the tests: a workspace skill the team uses for Plan, a team
// library's security check as a required step, skills of mine, a skill that fails the rules and
// a reference that does not resolve. Nothing here reads a file.
import type { FlowConfig } from "@/gen/types";
import {
  BUILTIN_SKILL_NAMES,
  type ResolvedFlow,
  resolveFlow,
  type Skill,
  type SkillShelf,
  type SkillSource,
  type SkillsCatalog,
  skillExists,
  skillRef,
} from "@/lib/api";

interface FixtureSkill {
  source: SkillSource;
  name: string;
  /** The alias of the team library. */
  alias?: string;
  use_when?: string;
  problem?: string;
}

/** One skill as the catalog lists it, with a SKILL.md that passes the rules unless `problem` is set. */
export function fixtureSkill({ source, name, alias, use_when, problem }: FixtureSkill): Skill {
  const when = use_when ?? `Use when a wf issue needs ${name.replace(/-/g, " ")}.`;
  const description = `${when} Avoid for anything else.`;
  const text = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nOne step.\n`;
  const folder = source === "built-in" ? `plugins/workflow/skills/${name}` : `skills/${name}`;
  return {
    name,
    plugin: source === "built-in" ? "workflow" : source === "library" ? (alias ?? "") : source,
    path: `${source === "library" ? "docs/" : ""}${folder}/SKILL.md`,
    description,
    use_when: when,
    text,
    lines: text.split("\n").length - 1,
    source,
    ref: skillRef(source, name, alias),
    ...(alias ? { library: alias } : {}),
    files: ["SKILL.md"],
    ...(problem ? { problem } : {}),
  };
}

const shelf = (
  s: Pick<SkillShelf, "source" | "key" | "name" | "path" | "editable"> & { url?: string },
  skills: Skill[],
): SkillShelf => ({ ...s, skills });

/** The places that hold skills of their own. */
export const FIXTURE_SHELVES: SkillShelf[] = [
  shelf(
    { source: "workspace", key: "ws", name: "This workspace", path: "skills", editable: true },
    [
      fixtureSkill({
        source: "workspace",
        name: "acme-planning",
        use_when: "Use when an issue has no plan and the team wants Acme's three-lane plan.",
      }),
      fixtureSkill({ source: "workspace", name: "writing-changelog" }),
    ],
  ),
  shelf(
    {
      source: "library",
      key: "platform",
      name: "Platform handbook",
      path: "docs/skills",
      url: "https://github.com/acme/platform-handbook",
      editable: false,
    },
    [
      fixtureSkill({
        source: "library",
        alias: "platform",
        name: "checking-security",
        use_when: "Use when a task changed code and its diff must be reviewed.",
      }),
    ],
  ),
  shelf({ source: "me", key: "me", name: "My library", path: "skills", editable: true }, [
    fixtureSkill({
      source: "me",
      name: "planning-small",
      use_when: "Use when an issue is one step.",
    }),
    fixtureSkill({ source: "me", name: "notifying-me" }),
    fixtureSkill({
      source: "me",
      name: "tidying-up",
      problem: 'description must start with "Use when "',
    }),
  ]),
];

/** The built-in skills and the shelves above: what a flow's references are checked against. */
export const FIXTURE_CATALOG: SkillsCatalog = {
  plugins: [
    {
      name: "workflow",
      description: "The wf skills.",
      path: "plugins/workflow",
      tags: [],
      skills: BUILTIN_SKILL_NAMES.map((name) => fixtureSkill({ source: "built-in", name })),
    },
  ],
  shelves: FIXTURE_SHELVES,
};

/** What the team chose: Acme's planning skill, a required security check, one reference that is gone. */
export const FIXTURE_TEAM: FlowConfig = {
  steps: {
    plan: { skill: "ws:acme-planning", max_tasks: 8 },
    do: { finish: "review" },
    status: { skill: "ws:gone-status" },
  },
  custom: {
    "security-check": {
      after: "do",
      skill: "platform:checking-security",
      label: "Security check",
      required: true,
      order: 1,
    },
    changelog: { after: "handoff", skill: "ws:writing-changelog", order: 1 },
  },
};

/** What I chose over it: my own Plan skill, no commits, a step after Hand off. */
export const FIXTURE_ME: FlowConfig = {
  steps: { plan: { skill: "me:planning-small" }, do: { commit: "none" } },
  custom: { "notify-me": { after: "handoff", skill: "me:notifying-me", order: 1 } },
};

const exists = skillExists(FIXTURE_CATALOG);

/** In effect for me. */
export const FIXTURE_FLOW: ResolvedFlow = resolveFlow({
  team: FIXTURE_TEAM,
  me: FIXTURE_ME,
  exists,
});
/** The team default alone. */
export const FIXTURE_TEAM_FLOW: ResolvedFlow = resolveFlow({ team: FIXTURE_TEAM, exists });
