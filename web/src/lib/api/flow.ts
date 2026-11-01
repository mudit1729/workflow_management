// The skills flow (docs/plan/proposals/skills-flow-spec.md): which skill runs each step of the
// work, and the options of each step. This file is the vocabulary (steps, options, skill
// references) and the one resolution rule of spec section 4 as a pure function. The hooks that
// read the files are in `flow-hooks.ts`, the writes in `flow-writes.ts`.
//
// The rule is implemented twice, here and in `plugins/workflow/skills/using-wf/scripts/wf-env.sh
// flow`, and `flow.test.ts` pins both to the cases of `mock/flow-fixture`: for a step and a key
// (`skill` or an option) the person's value wins, then the team's, then the built-in default.
//
// Skill references (spec 2):
//   planning-issues      a built-in skill (a folder of plugins/workflow/skills)
//   ws:acme-planning     a skill of this workspace: <workspace>/skills/<name>/SKILL.md
//   platform:checking-x  a skill of a team library, by its alias: <library root>/skills/<name>/SKILL.md
//   me:planning-small    a skill of the person's own library: skills/<name>/SKILL.md
import type {
  FlowAfter,
  FlowConfig,
  FlowCustomConfig,
  FlowLimitKey,
  FlowStepId,
} from "@/gen/types";

// ---------------------------------------------------------------- the steps

/** The steps in the order of the spec's table: the order of `wf-env.sh flow`. */
export const FLOW_STEP_IDS = [
  "add",
  "plan",
  "do",
  "log",
  "handoff",
  "status",
  "style",
] as const satisfies readonly FlowStepId[];

/** The steps a custom step can follow, in the order they run. */
export const FLOW_AFTER = ["add", "plan", "do", "handoff"] as const satisfies readonly FlowAfter[];

/** One value an option takes. */
export interface FlowOptionValue {
  value: string | number;
  /** The button: short. */
  label: string;
  /** The same as a phrase for the step card ("Up to 8 tasks a phase") and the context bundle. */
  summary: string;
}

/** One option of a step (spec 3.3). */
export interface FlowOptionDef {
  /** The key in `[flow.<step>]` (and in `wf-env.sh flow <step> <key>`). */
  key: string;
  /** The title above the buttons. */
  label: string;
  /** What it changes, one line. */
  hint: string;
  /** The values offered as buttons, the default first. */
  values: readonly FlowOptionValue[];
  /** The default: `values[0].value`. */
  default: string | number;
  /**
   * Any positive integer is a valid value, not only the buttons. The text options take exactly
   * their listed values.
   */
  numeric: boolean;
  /** A numeric option's phrase for a value that is not a button: `(7) => "Up to 7 tasks a phase"`. */
  phrase?: (value: number) => string;
  /** Only the team sets it. It lives in another table of `workflow.toml` and a personal file cannot set it. */
  teamOnly: boolean;
  /** Where a team-only option lives: `[context]` or `[staleness]`. */
  table?: "context" | "staleness";
}

/** One step of the flow. */
export interface FlowStepDef {
  id: FlowStepId;
  /** "Add work". */
  name: string;
  /** The skill that runs it when nothing else is chosen. */
  builtin: string;
  /** What the step does, one line. */
  about: string;
  /** What a replacement skill must do (the panel's "Contract"). */
  contract: string;
  /** Status and Writing style: they run anywhere, not at a point of the flow. */
  anywhere: boolean;
  /** The options, in the order the panel lists them. Empty: "This step has no options." */
  options: readonly FlowOptionDef[];
}

const opt = (
  key: string,
  label: string,
  hint: string,
  values: readonly FlowOptionValue[],
  rest: {
    numeric?: boolean;
    phrase?: (value: number) => string;
    teamOnly?: boolean;
    table?: "context" | "staleness";
  } = {},
): FlowOptionDef => ({
  key,
  label,
  hint,
  values,
  default: (values[0] as FlowOptionValue).value,
  numeric: rest.numeric ?? false,
  ...(rest.phrase ? { phrase: rest.phrase } : {}),
  teamOnly: rest.teamOnly ?? false,
  ...(rest.table ? { table: rest.table } : {}),
});

const n = (value: number, label: string, summary: string): FlowOptionValue => ({
  value,
  label,
  summary,
});

export const FLOW_STEPS: readonly FlowStepDef[] = [
  {
    id: "add",
    name: "Add work",
    builtin: "adding-work",
    about: "Turns an outcome into issues and groups.",
    contract:
      "Write goal.md for each new issue (status backlog), _group.md for a new group, and report the new ids.",
    anywhere: false,
    options: [
      opt("then", "After adding", "What happens once the issues are written.", [
        { value: "offer", label: "Offer Plan", summary: "Offers Plan for the first issue" },
        { value: "plan", label: "Plan all", summary: "Plans every new issue" },
        { value: "stop", label: "Stop", summary: "Stops after adding" },
      ]),
    ],
  },
  {
    id: "plan",
    name: "Plan",
    builtin: "planning-issues",
    about: "Turns an issue into a plan with phases and tasks.",
    contract:
      "Write plan.md with phases and tasks in the format of format.md, set the issue to planned, and log a kind: docs change.",
    anywhere: false,
    options: [
      opt(
        "max_tasks",
        "Most tasks in a phase",
        "More than this starts a new phase.",
        [
          n(8, "8", "Up to 8 tasks a phase"),
          n(5, "5", "Up to 5 tasks a phase"),
          n(10, "10", "Up to 10 tasks a phase"),
        ],
        { numeric: true, phrase: (v) => `Up to ${v} tasks a phase` },
      ),
    ],
  },
  {
    id: "do",
    name: "Do next step",
    builtin: "doing-next-step",
    about: "Does one ready task of an issue: claim, work, verify, log, hand over.",
    contract:
      "Claim one ready task with a lease, do it, verify it, log it, refresh current_state.md and release the lease. Plans first when there is no plan, with the Plan step's skill.",
    anywhere: false,
    options: [
      opt("finish", "When a task is done", "Where a task goes after its work.", [
        { value: "verify", label: "When it verifies", summary: "Tasks finish when verified" },
        { value: "review", label: "In review", summary: "Tasks finish in review" },
      ]),
      opt("commit", "Commits", "Commit after each task, or leave the changes for a person.", [
        { value: "task", label: "Each task", summary: "Commits each task" },
        { value: "none", label: "None", summary: "Leaves the commit to a person" },
      ]),
    ],
  },
  {
    id: "log",
    name: "Log",
    builtin: "logging-work",
    about: "Records a change, a decision or a learning. Runs inside Plan and Do next step.",
    contract: "Append C-, D- and L- entries with {#id} anchors in the format of format.md.",
    anywhere: false,
    options: [],
  },
  {
    id: "handoff",
    name: "Hand off",
    builtin: "handing-off",
    about: "Gives a person or an agent the full context of an issue.",
    contract: "Refresh current_state.md and print the context bundle, ending with the resume line.",
    anywhere: false,
    options: [
      opt(
        "budget_tokens",
        "Bundle size",
        "The most tokens the context bundle may use.",
        [
          n(6000, "6,000", "Bundle up to 6,000 tokens"),
          n(4000, "4,000", "Bundle up to 4,000 tokens"),
          n(10000, "10,000", "Bundle up to 10,000 tokens"),
        ],
        {
          numeric: true,
          phrase: (v) => `Bundle up to ${v.toLocaleString("en-US")} tokens`,
          teamOnly: true,
          table: "context",
        },
      ),
      opt(
        "changes",
        "Changes in the bundle",
        "How many recent changes the bundle lists.",
        [n(5, "5", "Last 5 changes"), n(3, "3", "Last 3 changes"), n(10, "10", "Last 10 changes")],
        { numeric: true, phrase: (v) => `Last ${v} changes`, teamOnly: true, table: "context" },
      ),
    ],
  },
  {
    id: "status",
    name: "Status",
    builtin: "checking-status",
    about: "Shows what is going on: requests, stale leases, ready tasks.",
    contract: "Keep the output of wf-status.sh: other skills call it by path.",
    anywhere: true,
    options: [
      opt(
        "issue_hours",
        "Stale issue",
        "An issue with no change for this long is stale.",
        [
          n(24, "24 h", "Issues go stale after 24 h"),
          n(12, "12 h", "Issues go stale after 12 h"),
          n(48, "48 h", "Issues go stale after 48 h"),
        ],
        {
          numeric: true,
          phrase: (v) => `Issues go stale after ${v} h`,
          teamOnly: true,
          table: "staleness",
        },
      ),
      opt(
        "task_hours",
        "Stale task",
        "A claimed task with no change for this long is stale.",
        [
          n(4, "4 h", "Tasks go stale after 4 h"),
          n(2, "2 h", "Tasks go stale after 2 h"),
          n(8, "8 h", "Tasks go stale after 8 h"),
        ],
        {
          numeric: true,
          phrase: (v) => `Tasks go stale after ${v} h`,
          teamOnly: true,
          table: "staleness",
        },
      ),
    ],
  },
  {
    id: "style",
    name: "Writing style",
    builtin: "writing-readable-bulk-text",
    about: "Shapes titles and one-line entries so lists read well.",
    contract: "Shape titles and one-line entries for lists.",
    anywhere: true,
    options: [],
  },
];

const STEP_BY_ID = new Map(FLOW_STEPS.map((s) => [s.id, s]));

/** One step of the flow. */
export function flowStep(id: FlowStepId): FlowStepDef {
  return STEP_BY_ID.get(id) as FlowStepDef;
}

/** The option of a step by key, or undefined. */
export function flowOption(step: FlowStepId, key: string): FlowOptionDef | undefined {
  return flowStep(step).options.find((o) => o.key === key);
}

/** The label of a value of an option ("In review"), or the value itself when it is not a button. */
export function flowValueLabel(step: FlowStepId, key: string, value: string | number): string {
  const v = flowOption(step, key)?.values.find((x) => x.value === value);
  return v?.label ?? String(value);
}

/** The phrase for a value ("Tasks finish in review"); a number that is not a button gets the option's own phrase. */
export function flowValueSummary(step: FlowStepId, key: string, value: string | number): string {
  const def = flowOption(step, key);
  const v = def?.values.find((x) => x.value === value);
  if (v) return v.summary;
  return typeof value === "number" && def?.phrase
    ? def.phrase(value)
    : `${def?.label ?? key}: ${value}`;
}

/** Is `value` valid for the option? Text options take their listed values, numeric ones any positive integer. */
export function isFlowOptionValue(def: FlowOptionDef, value: unknown): value is string | number {
  if (def.numeric) return typeof value === "number" && Number.isInteger(value) && value > 0;
  return typeof value === "string" && def.values.some((v) => v.value === value);
}

/** Is `s` a step id? */
export const isFlowStep = (s: unknown): s is FlowStepId =>
  typeof s === "string" && STEP_BY_ID.has(s as FlowStepId);

/** Is `s` a step a custom step can follow? */
export const isFlowAfter = (s: unknown): s is FlowAfter =>
  typeof s === "string" && (FLOW_AFTER as readonly string[]).includes(s);

/** The built-in skill of each step. */
export const BUILTIN_SKILLS: Record<FlowStepId, string> = Object.fromEntries(
  FLOW_STEPS.map((s) => [s.id, s.builtin]),
) as Record<FlowStepId, string>;

/** The bootstrap skill: every agent reads it first. It is not a step. */
export const BOOTSTRAP_SKILL = "using-wf";

/**
 * The four skills that keep a library. They are offered as custom steps only, never for a step of
 * the flow.
 */
export const LIBRARY_SKILLS = [
  "summarizing-work",
  "summarizing-codebase",
  "keeping-a-library",
  "querying-library",
] as const;

/** Every built-in skill: the folders of `plugins/workflow/skills`. */
export const BUILTIN_SKILL_NAMES = [
  BOOTSTRAP_SKILL,
  "adding-work",
  "planning-issues",
  "doing-next-step",
  "logging-work",
  "handing-off",
  "checking-status",
  "writing-readable-bulk-text",
  "keeping-a-library",
  "summarizing-codebase",
  "summarizing-work",
  "querying-library",
] as const;

// ---------------------------------------------------------------- skill references

/** Where a skill lives (spec 2), in the words `wf-env.sh flow` prints. */
export type SkillSource = "built-in" | "workspace" | "library" | "me";

/** A skill reference taken apart. */
export interface SkillRefParts {
  /** The reference as written. */
  ref: string;
  source: SkillSource;
  /** The skill's folder name: `acme-planning` for `ws:acme-planning`. */
  name: string;
  /** The alias of the team library, for `library`. */
  alias?: string;
}

/** A skill folder name: kebab-case. */
export const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A library alias as a link writes it. */
const ALIAS = /^[a-z0-9][a-z0-9_-]*$/;
/** A custom step id: kebab-case. */
export const CUSTOM_ID = SKILL_NAME;

/** The reference of a skill: `ref("workspace", "acme-planning")` is `ws:acme-planning`. */
export function skillRef(source: SkillSource, name: string, alias?: string): string {
  switch (source) {
    case "built-in":
      return name;
    case "workspace":
      return `ws:${name}`;
    case "me":
      return `me:${name}`;
    case "library":
      return `${alias ?? ""}:${name}`;
  }
}

/** A reference taken apart, or undefined when it is not one (not a name, `ws:name`, `me:name` or `alias:name`). */
export function parseSkillRef(ref: string): SkillRefParts | undefined {
  const at = ref.indexOf(":");
  if (at < 0) return SKILL_NAME.test(ref) ? { ref, source: "built-in", name: ref } : undefined;
  const scope = ref.slice(0, at);
  const name = ref.slice(at + 1);
  if (!SKILL_NAME.test(name)) return undefined;
  if (scope === "ws") return { ref, source: "workspace", name };
  if (scope === "me") return { ref, source: "me", name };
  return ALIAS.test(scope) ? { ref, source: "library", name, alias: scope } : undefined;
}

/** The name of the skill a reference points at: what an agent calls it once installed. */
export function skillName(ref: string): string {
  const at = ref.indexOf(":");
  return at < 0 ? ref : ref.slice(at + 1);
}

/** A skill name in words: `checking-security` → `Checking security`. */
export function skillWords(name: string): string {
  const words = skillName(name).replace(/-/g, " ");
  return words ? (words[0] as string).toUpperCase() + words.slice(1) : words;
}

// ---------------------------------------------------------------- resolving

/** Where a value comes from: nothing set (the default), the team's `workflow.toml` or the person's `library.toml`. */
export type FlowOrigin = "built-in" | "team" | "me";

/** What `resolveFlow` reads. */
export interface FlowInputs {
  /** `config.flow` of the workspace snapshot. Missing: no `[flow]` in `workflow.toml`. */
  team?: FlowConfig;
  /** The `[flow]` of the person's `library.toml`. Missing: no personal library or no override. */
  me?: FlowConfig;
  /**
   * Does a skill reference resolve to a skill? Called for a well-formed reference only. Missing:
   * a built-in name resolves when it is one of `BUILTIN_SKILL_NAMES` and every other reference
   * is taken as found (useful while the catalog loads).
   */
  exists?: (ref: string) => boolean;
}

/** The value of an option in effect. */
export interface ResolvedOption {
  key: string;
  value: string | number;
  origin: FlowOrigin;
  /** The value is the option's default (whoever set it). */
  isDefault: boolean;
}

/** A reference a file names that does not resolve. */
export interface FlowProblem {
  kind: "unresolved" | "ignored";
  /** The step (`plan`) or `after:<step>` for a custom step. */
  at: string;
  /** The custom step's id. */
  id?: string;
  ref?: string;
  /** Whose file names it. */
  origin: "team" | "me";
  /** A sentence for the card: "ws:gone is not in this workspace's skills folder. Using checking-status." */
  message: string;
}

/** One step with the skill and the options in effect. */
export interface ResolvedStep {
  id: FlowStepId;
  /** The skill in effect, as a reference. The built-in skill when the one that was named does not resolve. */
  skill: string;
  /** Whose value `skill` is. */
  origin: FlowOrigin;
  source: SkillSource;
  /** The alias of the team library the skill is in. */
  alias?: string;
  /** The skill's folder name. */
  name: string;
  /** The team default, whatever the person set: the value "The team uses …" shows. */
  teamSkill: string;
  /** The reference that was named but does not resolve; the built-in runs meanwhile. */
  unresolved?: { ref: string; origin: "team" | "me"; message: string };
  /** The step's options in effect, by key, in the order of `flowStep(id).options`. */
  options: Record<string, ResolvedOption>;
}

/** A custom step in effect. */
export interface ResolvedCustom {
  id: string;
  after: FlowAfter;
  /** The skill reference as written. */
  skill: string;
  source: SkillSource;
  alias?: string;
  name: string;
  /** The label, or the skill's name in words. */
  label: string;
  /** A failing step stops the run. */
  required: boolean;
  order: number;
  /** Whose step it is. A team step cannot be changed by a person. */
  origin: "team" | "me";
  /** The reference does not resolve: the step is not run, and the card warns. */
  unresolved: boolean;
}

/** The flow in effect. */
export interface ResolvedFlow {
  /** Every step, in the order of `FLOW_STEP_IDS`. */
  steps: Record<FlowStepId, ResolvedStep>;
  /** The custom steps in running order: by the step they follow, then the team's, then the person's. */
  custom: ResolvedCustom[];
  /** What the files name that did not resolve, and what was ignored. */
  problems: FlowProblem[];
  /** Anything differs from the built-in flow: a skill, an option, a custom step that runs. */
  differs: boolean;
}

const BUILTIN_SET: ReadonlySet<string> = new Set(BUILTIN_SKILL_NAMES);

/** Why a reference does not resolve, as a sentence. */
function whyMissing(parts: SkillRefParts | undefined, ref: string): string {
  switch (parts?.source) {
    case "built-in":
      return `${ref} is not a built-in skill.`;
    case "workspace":
      return `${ref} is not in this workspace's skills folder.`;
    case "me":
      return `${ref} is not in your library's skills folder.`;
    case "library":
      return `${ref} is not in the team library ${parts.alias}. Add the library, or pick another skill.`;
    default:
      return `${ref} is not a skill reference.`;
  }
}

const byOrder = (a: ResolvedCustom, b: ResolvedCustom) =>
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The flow in effect: per step and key the person's value, else the team's, else the default
 * (spec 4). The four team-only options read the team's `limits` and nothing else. A reference that
 * does not resolve gives the built-in skill and a problem; a custom step that does not resolve
 * stays in the list, flagged, and does not run. Custom steps run team first (by `order`, then
 * `id`), then the person's; a person cannot take the id of a team step.
 */
export function resolveFlow(inputs: FlowInputs = {}): ResolvedFlow {
  const team = inputs.team;
  const me = inputs.me;
  const resolves = (ref: string): boolean => {
    const parts = parseSkillRef(ref);
    if (!parts) return false;
    if (inputs.exists) return inputs.exists(ref);
    return parts.source === "built-in" ? BUILTIN_SET.has(parts.name) : true;
  };
  const problems: FlowProblem[] = [];

  const steps = {} as Record<FlowStepId, ResolvedStep>;
  for (const def of FLOW_STEPS) {
    const mine = me?.steps[def.id]?.skill;
    const theirs = team?.steps[def.id]?.skill;
    const named = mine ?? theirs;
    const namedOrigin: "team" | "me" = mine ? "me" : "team";
    let skill = def.builtin;
    let origin: FlowOrigin = "built-in";
    let unresolved: ResolvedStep["unresolved"];
    if (named) {
      if (resolves(named)) {
        skill = named;
        origin = namedOrigin;
      } else {
        const message = `${whyMissing(parseSkillRef(named), named)} Using ${def.builtin}.`;
        unresolved = { ref: named, origin: namedOrigin, message };
        problems.push({ kind: "unresolved", at: def.id, ref: named, origin: namedOrigin, message });
      }
    }
    // The team's value for this step, for "The team uses …" under Just me. A team value that does
    // not resolve is the built-in as well.
    const teamSkill = theirs && resolves(theirs) ? theirs : def.builtin;

    const options: Record<string, ResolvedOption> = {};
    for (const o of def.options) {
      let value: string | number = o.default;
      let from: FlowOrigin = "built-in";
      if (o.teamOnly) {
        const set = team?.limits?.[o.key as FlowLimitKey];
        if (set !== undefined) {
          value = set;
          from = "team";
        }
      } else {
        const mineV = me?.steps[def.id]?.[o.key as "then"];
        const teamV = team?.steps[def.id]?.[o.key as "then"];
        if (mineV !== undefined) {
          value = mineV;
          from = "me";
        } else if (teamV !== undefined) {
          value = teamV;
          from = "team";
        }
      }
      options[o.key] = { key: o.key, value, origin: from, isDefault: value === o.default };
    }
    const parts = parseSkillRef(skill) as SkillRefParts;
    steps[def.id] = {
      id: def.id,
      skill,
      origin,
      source: parts.source,
      ...(parts.alias ? { alias: parts.alias } : {}),
      name: parts.name,
      teamSkill,
      ...(unresolved ? { unresolved } : {}),
      options,
    };
  }

  // Custom steps: the team's, then the person's.
  const customOf = (cfg: FlowConfig | undefined, origin: "team" | "me"): ResolvedCustom[] =>
    Object.entries(cfg?.custom ?? {}).map(([id, c]: [string, FlowCustomConfig]) => {
      // A reference that is not well formed does not resolve either: the card shows it as written.
      const parts: SkillRefParts = parseSkillRef(c.skill) ?? {
        ref: c.skill,
        source: "built-in",
        name: c.skill,
      };
      return {
        id,
        after: c.after,
        skill: c.skill,
        source: parts.source,
        ...(parts.alias ? { alias: parts.alias } : {}),
        name: parts.name,
        label: c.label ?? skillWords(parts.name),
        required: c.required === true,
        order: c.order ?? 1,
        origin,
        unresolved: !resolves(c.skill),
      };
    });
  const teamCustom = customOf(team, "team");
  const taken = new Set(teamCustom.map((c) => c.id));
  const meCustom = customOf(me, "me").filter((c) => {
    if (!taken.has(c.id)) return true;
    problems.push({
      kind: "ignored",
      at: `after:${c.after}`,
      id: c.id,
      ref: c.skill,
      origin: "me",
      message: `${c.id} is a team step. A personal step cannot take its id.`,
    });
    return false;
  });
  const custom: ResolvedCustom[] = [];
  for (const after of FLOW_AFTER) {
    for (const list of [teamCustom, meCustom])
      custom.push(...list.filter((c) => c.after === after).sort(byOrder));
  }
  for (const c of custom) {
    if (!c.unresolved) continue;
    problems.push({
      kind: "unresolved",
      at: `after:${c.after}`,
      id: c.id,
      ref: c.skill,
      origin: c.origin,
      message: `${whyMissing(parseSkillRef(c.skill), c.skill)} The step does not run.`,
    });
  }

  const differs =
    FLOW_STEP_IDS.some((id) => {
      const s = steps[id];
      return s.skill !== BUILTIN_SKILLS[id] || Object.values(s.options).some((o) => !o.isDefault);
    }) || custom.some((c) => !c.unresolved);

  return { steps, custom, problems, differs };
}

/** A `[flow]` with nothing in it. Shared: never change it. */
export const NO_FLOW_CONFIG: FlowConfig = { steps: {}, custom: {} };

/** The flow with nothing set: the built-in skills, the default options. */
export const BUILTIN_FLOW: ResolvedFlow = resolveFlow();

/** The custom steps that run after a step, in running order. `all` keeps the ones that do not resolve. */
export function customAfter(
  flow: ResolvedFlow,
  step: FlowAfter,
  opts: { all?: boolean } = {},
): ResolvedCustom[] {
  return flow.custom.filter((c) => c.after === step && (opts.all || !c.unresolved));
}

/** The value of an option in effect. */
export function flowOptionValue(
  flow: ResolvedFlow,
  step: FlowStepId,
  key: string,
): string | number | undefined {
  return flow.steps[step].options[key]?.value;
}

// ---------------------------------------------------------------- text

/**
 * The flow as `wf-env.sh flow` prints it, so a test can hold the two implementations to the same
 * text: one line per step (`<step> <skill> <source> <origin> [option=value …]`), one per custom
 * step (`after:<step> <id> <skill> <required> <origin>`), then the references that did not resolve
 * (`unresolved <step> <ref> <origin>`, `unresolved after:<step> <id> <ref> <origin>`).
 */
export function formatFlow(flow: ResolvedFlow): string {
  const lines: string[] = [];
  for (const id of FLOW_STEP_IDS) {
    const s = flow.steps[id];
    const opts = Object.values(s.options).map((o) => `${o.key}=${o.value}`);
    lines.push([s.id, s.skill, s.source, s.origin, ...opts].join(" "));
  }
  for (const c of flow.custom)
    lines.push(`after:${c.after} ${c.id} ${c.skill} ${c.required} ${c.origin}`);
  for (const id of FLOW_STEP_IDS) {
    const u = flow.steps[id].unresolved;
    if (u) lines.push(`unresolved ${id} ${u.ref} ${u.origin}`);
  }
  for (const c of flow.custom)
    if (c.unresolved) lines.push(`unresolved after:${c.after} ${c.id} ${c.skill} ${c.origin}`);
  return lines.join("\n");
}

const WHOSE: Record<"team" | "me", string> = { team: "team", me: "personal" };

/**
 * The "Skills flow" line of the context bundle (spec 4.3): what differs from the built-in flow,
 * in running order, or `undefined` when nothing does.
 *
 *   Plan: ws:acme-planning (team) · After Do next step: Security check (platform:checking-security, must pass)
 */
export function flowLine(flow: ResolvedFlow): string | undefined {
  if (!flow.differs) return undefined;
  const parts: string[] = [];
  for (const def of FLOW_STEPS) {
    const s = flow.steps[def.id];
    if (s.skill !== def.builtin && s.origin !== "built-in")
      parts.push(`${def.name}: ${s.skill} (${WHOSE[s.origin]})`);
    for (const o of Object.values(s.options)) {
      if (o.isDefault) continue;
      const whose = o.origin === "built-in" ? "" : ` (${WHOSE[o.origin]})`;
      parts.push(`${def.name}: ${flowValueSummary(def.id, o.key, o.value).toLowerCase()}${whose}`);
    }
    if (isFlowAfter(def.id))
      for (const c of customAfter(flow, def.id)) {
        const notes = [
          c.skill,
          ...(c.required ? ["must pass"] : []),
          ...(c.origin === "me" ? ["personal"] : []),
        ];
        parts.push(`After ${def.name}: ${c.label} (${notes.join(", ")})`);
      }
  }
  return parts.join(" · ");
}

/**
 * The options of a step in one line for its card: "Up to 8 tasks a phase", "Tasks finish in review ·
 * Commits each task". Empty for a step without options.
 */
export function flowOptionsLine(step: ResolvedStep): string {
  return Object.values(step.options)
    .map((o) => flowValueSummary(step.id, o.key, o.value))
    .join(" · ");
}

/**
 * Every skill the flow runs, as references, each once, in running order: the skill of each step,
 * and each custom step that runs. What an agent needs installed (Settings · Agent, spec 7);
 * `builtin: false` leaves out the built-in ones (what `install-skills.sh --from` brings).
 */
export function flowSkillRefs(flow: ResolvedFlow, opts: { builtin?: boolean } = {}): string[] {
  const refs: string[] = [];
  for (const id of FLOW_STEP_IDS) {
    refs.push(flow.steps[id].skill);
    if (isFlowAfter(id)) refs.push(...customAfter(flow, id).map((c) => c.skill));
  }
  return refs.filter(
    (ref, i) =>
      refs.indexOf(ref) === i &&
      (opts.builtin !== false || parseSkillRef(ref)?.source !== "built-in"),
  );
}

/** The id a custom step gets from a label or a skill name: kebab-case, free among `taken`. */
export function customStepId(from: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base =
    skillName(from)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "step";
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  return id;
}
