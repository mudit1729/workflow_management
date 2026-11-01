// The `[flow]` tables of `workflow.toml` and of the personal `library.toml` (skills-flow-spec 3):
// `[flow.<step>]` holds a skill reference and the step's options, `[flow.custom.<id>]` a custom
// step. Scalars only, so `wf-env.sh config flow.plan.skill` reads them too.
//
// `parseFlow` keeps what is valid and says what is not. The lint rules of the file:
//   F018 warn  an unknown step table or key under `[flow]`; wf keeps it and ignores it
//   F019 warn  a value the flow cannot use: a bad option value, a bad custom `after`, an id that
//              is not kebab-case, a custom step without a skill, a skill that is not a reference, a
//              step that names the built-in skill of another step, a custom step that runs the
//              skill of the step it follows (it would run that step again and again) or the
//              built-in skill of any step
//   F020 warn  a reference to a workspace or built-in skill that does not exist (`checkFlowRefs`)
//   F021 warn  a skill of the workspace's `skills/` folder that breaks the skill rules
// A reference into a team library or the person's library is not checked here: those files are
// not in the workspace. The dashboard and `wf-env.sh flow` report them.
import { parse as parseToml } from "smol-toml";
import type {
  FlowAfter,
  FlowConfig,
  FlowCustomConfig,
  FlowLimitKey,
  FlowStepConfig,
  FlowStepId,
} from "@/gen/types";
import {
  BOOTSTRAP_SKILL,
  BUILTIN_SKILL_NAMES,
  CUSTOM_ID,
  FLOW_AFTER,
  FLOW_STEP_IDS,
  FLOW_STEPS,
  isFlowAfter,
  isFlowOptionValue,
  isFlowStep,
  LIBRARY_SKILLS,
  parseSkillRef,
} from "@/lib/api/flow";
import { validateSkill } from "@/lib/api/skill-check";
import { locateToml } from "./toml-edit";
import type { FileCtx } from "./types";

type Table = Record<string, unknown>;
const asTable = (v: unknown): Table | undefined =>
  v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
    ? (v as Table)
    : undefined;

/** Where a finding sits: a table (`flow.plan`) and, when it is about one key, the key. */
export interface FlowSpot {
  table: string;
  key?: string;
}

/** Hears a finding of `parseFlow`. */
export type FlowReport = (
  rule: "F018" | "F019",
  at: FlowSpot,
  message: string,
  fix?: string,
) => void;

/** The empty flow: every step on its built-in skill. */
export const emptyFlow = (): FlowConfig => ({ steps: {}, custom: {} });

const LIMITS: { key: FlowLimitKey; table: "context" | "staleness" }[] = [
  { key: "budget_tokens", table: "context" },
  { key: "changes", table: "context" },
  { key: "issue_hours", table: "staleness" },
  { key: "task_hours", table: "staleness" },
];

const CUSTOM_KEYS = ["after", "skill", "label", "required", "order"] as const;

const list = (items: readonly string[]) => items.map((i) => `\`${i}\``).join(", ");

/**
 * The flow of a parsed TOML file. `flow` is its `[flow]` table (anything else is reported and
 * ignored). `tables` is the file's whole parse, for the team-only options of `workflow.toml`
 * (`[context]`, `[staleness]`); leave it out for a personal file, which cannot set them.
 */
export function parseFlow(flow: unknown, report?: FlowReport, tables?: Table): FlowConfig {
  const out = emptyFlow();
  const say: FlowReport = report ?? (() => undefined);

  if (flow !== undefined) {
    const root = asTable(flow);
    if (!root) {
      say(
        "F019",
        { table: "flow" },
        "`flow` must be a table of steps.",
        "Write [flow.plan] and so on.",
      );
    } else {
      for (const [name, value] of Object.entries(root)) {
        if (name === "custom") parseCustom(value, out, say);
        else if (isFlowStep(name)) parseStep(name, value, out, say);
        else
          say(
            "F018",
            { table: `flow.${name}` },
            `Unknown flow step \`${name}\`. wf keeps it and ignores it.`,
            `The steps are ${list(FLOW_STEP_IDS)}, and \`custom\`.`,
          );
      }
      // After the steps are read: a custom step is compared with the skill of the step it follows.
      for (const [id, c] of Object.entries(out.custom)) checkCustomSkill(id, c, out, say);
    }
  }

  if (tables) {
    const limits: Partial<Record<FlowLimitKey, number>> = {};
    for (const { key, table } of LIMITS) {
      const v = asTable(tables[table])?.[key];
      if (typeof v === "number" && Number.isInteger(v) && v > 0) limits[key] = v;
    }
    if (Object.keys(limits).length > 0) out.limits = limits;
  }
  return out;
}

/** Whose skill a built-in one is: the skill of a step, or a library skill (custom steps only). */
function builtinOwner(name: string): string {
  if (name === BOOTSTRAP_SKILL) return "the bootstrap skill, which no step swaps";
  const owner = FLOW_STEPS.find((d) => d.builtin === name);
  return owner ? `the skill of ${owner.name}` : "a library skill, which runs as a custom step";
}

/**
 * F019 for a custom step whose skill is the skill of the step it follows, or the built-in skill of
 * any step: the first runs that step again and again (Do next step would run Do next step after
 * each task), the second hands a step's contract to a custom step. wf keeps the step. `out.steps`
 * holds this file's skills only, so a skill the other file sets for the step is not seen here.
 */
function checkCustomSkill(id: string, c: FlowCustomConfig, out: FlowConfig, say: FlowReport): void {
  const ref = parseSkillRef(c.skill);
  const follows = FLOW_STEPS.find((d) => d.id === c.after);
  if (!ref || !follows) return;
  const at = { table: `flow.custom.${id}`, key: "skill" };
  if (c.skill === (out.steps[c.after]?.skill ?? follows.builtin)) {
    say(
      "F019",
      at,
      `\`${c.skill}\` is the skill of ${follows.name}. A custom step after ${follows.name} would run it again and again. wf keeps it.`,
      "Pick another skill for the step.",
    );
  } else if (
    ref.source === "built-in" &&
    (BUILTIN_SKILL_NAMES as readonly string[]).includes(ref.name) &&
    !(LIBRARY_SKILLS as readonly string[]).includes(ref.name)
  ) {
    say(
      "F019",
      at,
      `\`${c.skill}\` is ${builtinOwner(ref.name)}, not a skill for a custom step. wf keeps it.`,
      "Pick a ws:, me: or library skill.",
    );
  }
}

function parseStep(id: FlowStepId, value: unknown, out: FlowConfig, say: FlowReport): void {
  const table = asTable(value);
  const where = `flow.${id}`;
  if (!table) {
    say("F019", { table: where }, `\`${where}\` must be a table.`);
    return;
  }
  const def = FLOW_STEPS.find((s) => s.id === id);
  const cfg: FlowStepConfig = {};
  for (const [key, v] of Object.entries(table)) {
    if (key === "skill") {
      if (typeof v === "string" && v.trim() !== "") {
        cfg.skill = v;
        const ref = parseSkillRef(v);
        if (!ref)
          say(
            "F019",
            { table: where, key },
            `\`${v}\` is not a skill reference.`,
            "Use a name, ws:name, me:name or alias:name.",
          );
        else if (
          ref.source === "built-in" &&
          ref.name !== def?.builtin &&
          (BUILTIN_SKILL_NAMES as readonly string[]).includes(ref.name)
        )
          // wf-env.sh resolves any sibling of using-wf, so the flow keeps it; the contract is not its own.
          say(
            "F019",
            { table: where, key },
            `\`${v}\` is ${builtinOwner(ref.name)}, not a skill of ${def?.name ?? id}. wf keeps it.`,
            `Use \`${def?.builtin ?? id}\`, or a ws:, me: or library skill.`,
          );
      } else
        say(
          "F019",
          { table: where, key },
          `\`${where}.skill\` must be a skill reference in quotes.`,
        );
      continue;
    }
    const option = def?.options.find((o) => o.key === key);
    if (!option) {
      say(
        "F018",
        { table: where, key },
        `Unknown key \`${where}.${key}\`. wf keeps it and ignores it.`,
        def && def.options.length > 0
          ? `${def.name} takes ${list(["skill", ...def.options.map((o) => o.key)])}.`
          : `${def?.name ?? id} takes \`skill\` only.`,
      );
    } else if (option.teamOnly) {
      say(
        "F019",
        { table: where, key },
        `\`${key}\` is read from [${option.table}] ${key}, not from [${where}].`,
        `Move it to [${option.table}].`,
      );
    } else if (isFlowOptionValue(option, v)) {
      (cfg as Record<string, unknown>)[key] = v;
    } else {
      say(
        "F019",
        { table: where, key },
        `\`${where}.${key}\` is ${JSON.stringify(v)}, which the option does not take.`,
        option.numeric
          ? "Use a whole number above 0."
          : `Use ${list(option.values.map((x) => String(x.value)))}.`,
      );
    }
  }
  if (Object.keys(cfg).length > 0) out.steps[id] = cfg;
}

function parseCustom(value: unknown, out: FlowConfig, say: FlowReport): void {
  const all = asTable(value);
  if (!all) {
    say("F019", { table: "flow.custom" }, "`flow.custom` must hold one table per custom step.");
    return;
  }
  for (const [id, raw] of Object.entries(all)) {
    const where = `flow.custom.${id}`;
    const t = asTable(raw);
    if (!t) {
      say("F019", { table: where }, `\`${where}\` must be a table.`);
      continue;
    }
    let ok = true;
    if (!CUSTOM_ID.test(id)) {
      say(
        "F019",
        { table: where },
        `\`${id}\` is not a custom step id.`,
        "Use kebab-case: security-check.",
      );
      ok = false;
    }
    for (const key of Object.keys(t))
      if (!(CUSTOM_KEYS as readonly string[]).includes(key))
        say(
          "F018",
          { table: where, key },
          `Unknown key \`${where}.${key}\`. wf keeps it and ignores it.`,
          `A custom step takes ${list(CUSTOM_KEYS)}.`,
        );
    if (!isFlowAfter(t.after)) {
      say(
        "F019",
        { table: where, key: "after" },
        `\`${where}.after\` must be one of ${list(FLOW_AFTER)}.`,
      );
      ok = false;
    }
    if (typeof t.skill !== "string" || t.skill.trim() === "") {
      say(
        "F019",
        { table: where, key: "skill" },
        `\`${where}.skill\` must be a skill reference in quotes.`,
      );
      ok = false;
    } else if (!parseSkillRef(t.skill)) {
      say(
        "F019",
        { table: where, key: "skill" },
        `\`${t.skill}\` is not a skill reference.`,
        "Use a name, ws:name, me:name or alias:name.",
      );
    }
    if (!ok) continue;
    const step: FlowCustomConfig = { after: t.after as FlowAfter, skill: t.skill as string };
    if (t.label !== undefined) {
      if (typeof t.label === "string" && t.label.trim() !== "") step.label = t.label;
      else
        say("F019", { table: where, key: "label" }, `\`${where}.label\` must be text in quotes.`);
    }
    if (t.required !== undefined) {
      if (typeof t.required === "boolean") step.required = t.required;
      else
        say(
          "F019",
          { table: where, key: "required" },
          `\`${where}.required\` must be true or false.`,
        );
    }
    if (t.order !== undefined) {
      if (typeof t.order === "number" && Number.isInteger(t.order) && t.order >= 0)
        step.order = t.order;
      else
        say("F019", { table: where, key: "order" }, `\`${where}.order\` must be a whole number.`);
    }
    out.custom[id] = step;
  }
}

// ---------------------------------------------------------------- the lint of a file

/** `parseFlow` reporting into the lint context of `workflow.toml`, each finding on its own line. */
export function flowReporter(ctx: FileCtx): FlowReport {
  return (rule, at, message, fix) => {
    const keyLine = at.key !== undefined ? locateToml(ctx.L.lines, at.table, at.key) : -1;
    const line = keyLine >= 0 ? keyLine : locateToml(ctx.L.lines, at.table);
    ctx.report(rule, "warn", Math.max(line, 0), message, fix);
  };
}

/** The flow of a `workflow.toml` text (what the lint context does not need): for tests and tools. */
export function flowOfText(text: string): FlowConfig {
  const data = asTable(parseToml(text)) ?? {};
  return parseFlow(data.flow, undefined, data);
}

/**
 * F020: a reference to a built-in or workspace skill that does not exist. `workspaceSkills` are
 * the folder names under the workspace's `skills/`. A reference into a library is left to the
 * dashboard and `wf-env.sh flow`.
 */
export function checkFlowRefs(
  ctx: FileCtx,
  flow: FlowConfig,
  workspaceSkills: ReadonlySet<string>,
): void {
  const check = (ref: string | undefined, table: string): void => {
    const parts = ref ? parseSkillRef(ref) : undefined;
    if (!ref || !parts) return;
    const missing =
      parts.source === "built-in"
        ? !(BUILTIN_SKILL_NAMES as readonly string[]).includes(parts.name)
        : parts.source === "workspace"
          ? !workspaceSkills.has(parts.name)
          : false;
    if (!missing) return;
    const line = locateToml(ctx.L.lines, table, "skill");
    ctx.report(
      "F020",
      "warn",
      Math.max(line, locateToml(ctx.L.lines, table), 0),
      parts.source === "built-in"
        ? `\`${ref}\` is not a built-in skill.`
        : `\`${ref}\` is not in this workspace's skills folder.`,
      parts.source === "built-in"
        ? "wf uses the built-in skill of the step until you pick one that exists."
        : `Add skills/${parts.name}/SKILL.md, or pick another skill.`,
    );
  };
  for (const id of FLOW_STEP_IDS) check(flow.steps[id]?.skill, `flow.${id}`);
  for (const [id, c] of Object.entries(flow.custom)) check(c.skill, `flow.custom.${id}`);
}

/** The paths of the workspace's skills, `skills/<name>/SKILL.md`, sorted. `files` are its text files by path. */
export function workspaceSkillFiles(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((p) => /^skills\/[^/]+\/SKILL\.md$/.test(p))
    .sort();
}

/** The folder name of a `skills/<name>/SKILL.md` path. */
export const skillFolderOf = (path: string): string => path.split("/")[1] as string;

/**
 * F021: a skill of the workspace follows the rules of the built-in ones (`check-skills.mjs`). Each
 * problem is reported at the line it names, or the first line. `exists` says whether a relative
 * path of the skill is a file.
 */
export function lintWorkspaceSkill(ctx: FileCtx, exists: (relative: string) => boolean): void {
  const name = skillFolderOf(ctx.path);
  for (const problem of validateSkill(ctx.L.text, name, { exists }))
    ctx.report("F021", "warn", problem.line ?? 0, `Not a valid skill: ${problem.message}`);
}
