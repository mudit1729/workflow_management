// Changing the skills flow (docs/plan/proposals/skills-flow-spec.md, F6): each call is one click
// and one saved file, a minimal edit that keeps every other key and comment (the TOML line editor
// of `mock/md/toml-edit.ts`). The team default is written to `workflow.toml` with `base_rev`; a
// personal override to the person's `library.toml` through the libraries layer. The workspace and
// the flow follow live, so nothing here updates a view.
//
// Every function resolves to a `FlowSaved`: the file it wrote (for "Saved to workflow.toml · Undo")
// and an undo token. `undoFlowChange(token)` puts the previous text back exactly. A call whose
// edit changes nothing (the value was already there) writes nothing and still returns a token.
//
// Two kinds of failure, so a panel can say each where it belongs:
//  - a refusal the caller can explain beside the control (an unknown step, an option value that is
//    not one, a team-only option under "Just me", a copy name that is taken) rejects with
//    `FlowWriteError`;
//  - a server failure (409 after a retry, 422, no connection) shows a toast and resolves to
//    `undefined`, like `writeWorkspaceFile`.
//
// A 409 is retried once on the fresh text: the edit is a few lines, and it applies to any text.
import {
  listTomlKeys,
  listTomlTables,
  readTomlTable,
  removeTomlKey,
  removeTomlTable,
  setTomlKey,
  type TomlScalar,
} from "@mock/md/toml-edit";
import { parse as parseToml } from "smol-toml";
import { toast } from "sonner";
import type { FlowAfter, FlowStepId } from "@/gen/types";
import { api } from "./client";
import { firstProblem, isConflictError, isUnprocessableError, NotFoundError } from "./error";
import { refreshAfterWrite } from "./files";
import {
  BUILTIN_SKILL_NAMES,
  customStepId,
  flowOption,
  flowStep,
  isFlowAfter,
  isFlowOptionValue,
  isFlowStep,
  parseSkillRef,
  SKILL_NAME,
  skillName,
} from "./flow";
import { refreshLibraries } from "./library";
import { renameSkillText } from "./skill-check";
import type { SkillsCatalog } from "./skills";

// ---------------------------------------------------------------- the vocabulary

/** Whose file a change goes to: the workspace's `workflow.toml` or my `library.toml`. */
export type FlowScope = "team" | "me";

/** A value in a flow table. */
export type FlowValue = string | number | boolean;

/** A refusal to explain beside the control that asked. */
export class FlowWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowWriteError";
  }
}

/** One file as it was before a change, so `undoFlowChange` can put it back. */
interface FlowWrite {
  where: "workspace" | "personal-config" | "personal-file";
  /** Workspace path, or the path in the personal library. `library.toml` for the config. */
  path: string;
  /** The text before: null when the change created the file. */
  before: string | null;
  /** The revision the change left, the `base_rev` of the undo. */
  rev: string;
}

/**
 * What undoes a change. Opaque: keep it and pass it to `undoFlowChange`. It holds the files the
 * change wrote with their previous text.
 */
export interface FlowUndo {
  readonly writes: readonly FlowWrite[];
}

/** What every write resolves to. */
export interface FlowSaved {
  undo: FlowUndo;
  /** What was saved, for the confirmation: `workflow.toml`, `library.toml`, or a skill's folder. */
  file: string;
  /** `addCustomStep`: the id the new step got. */
  id?: string;
}

const TEAM_FILE = "workflow.toml";
const PERSONAL_FILE = "library.toml";
const fileOf = (scope: FlowScope) => (scope === "team" ? TEAM_FILE : PERSONAL_FILE);

const INTRO: Record<FlowScope, string> = {
  team: "The skills flow (Settings → Skills flow). A step that is left out uses its built-in skill.",
  me: "My skills flow (Settings → Skills flow). It wins over the team's, key by key.",
};
const CUSTOM_NOTE = "Custom steps run after the step named in `after`, in `order`.";

// ---------------------------------------------------------------- reading and writing a file

interface Slot {
  where: FlowWrite["where"];
  path: string;
}

const slotOf = (scope: FlowScope): Slot =>
  scope === "team"
    ? { where: "workspace", path: TEAM_FILE }
    : { where: "personal-config", path: PERSONAL_FILE };

/** The text of a slot and its revision. `text` is null for a file that does not exist. */
async function readSlot(slot: Slot): Promise<{ text: string | null; rev: string | undefined }> {
  if (slot.where === "personal-config") {
    const c = await api.personalConfig();
    return { text: c.text, rev: c.rev };
  }
  try {
    const f = await api.file(slot.path);
    return { text: f.text, rev: f.rev };
  } catch (err) {
    if (err instanceof NotFoundError) return { text: null, rev: undefined };
    throw err;
  }
}

/** Save `text` and return the new revision. */
async function putText(slot: Slot, text: string, base_rev?: string): Promise<string> {
  switch (slot.where) {
    case "workspace":
      return (await api.writeFile({ path: slot.path, text, base_rev })).rev;
    case "personal-config":
      return (await api.savePersonalConfig({ text, base_rev })).rev;
    case "personal-file":
      return (await api.savePage({ alias: "me", path: slot.path, text, base_rev })).rev;
  }
}

const refresh = (slot: Slot) =>
  slot.where === "workspace" ? refreshAfterWrite() : refreshLibraries();

/** A file that does not exist yet starts from what the file always begins with. */
const seed = (slot: Slot, text: string | null): string => {
  if (text !== null && text !== "") return text;
  if (slot.where === "personal-config") return 'kind = "personal"\n';
  if (slot.where === "workspace" && slot.path === TEAM_FILE) return "wf_format = 1\n";
  return text ?? "";
};

const parses = (text: string): boolean => {
  try {
    parseToml(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * Apply an edit to the text of a file and save it. "same" when the edit changes nothing. Retries
 * once when the file changed between the read and the write. The editor works on lines, so it
 * cannot know every way a file may define a table (dotted keys, an inline table): an edit that
 * turns a file that was valid TOML into one that is not is refused, naming `table`, and the file
 * is not touched.
 */
async function editSlot(
  slot: Slot,
  edit: (text: string) => string,
  table: string,
): Promise<FlowWrite | "same"> {
  for (let attempt = 0; ; attempt++) {
    const cur = await readSlot(slot);
    const before = seed(slot, cur.text);
    const next = edit(before);
    if (next === (cur.text ?? "")) return "same";
    if (next !== before && parses(before) && !parses(next))
      throw new FlowWriteError(
        `${slot.path} defines ${table} in a form the Settings page cannot edit. ${
          slot.where === "workspace" ? "Edit it in Files." : "Edit it by hand."
        }`,
      );
    try {
      const rev = await putText(slot, next, cur.rev);
      refresh(slot);
      return { where: slot.where, path: slot.path, before: cur.text, rev };
    } catch (err) {
      if (isConflictError(err) && attempt === 0) continue;
      refresh(slot);
      throw err;
    }
  }
}

/** Run a write; a server failure becomes a toast and `undefined`, a refusal passes through. */
async function guarded<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof FlowWriteError) throw err;
    if (isConflictError(err)) {
      toast.warning(`${err.body.reason}. Your change was refused.`, { duration: 10_000 });
    } else if (isUnprocessableError(err)) {
      toast.error(firstProblem(err).message);
    } else {
      toast.error(`Could not save ${what}`, {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    }
    return undefined;
  }
}

const saved = (
  scope: FlowScope,
  w: FlowWrite | "same",
  extra: { id?: string } = {},
): FlowSaved => ({
  undo: { writes: w === "same" ? [] : [w] },
  file: fileOf(scope),
  ...extra,
});

// ---------------------------------------------------------------- undo

/** Put one file back as it was. */
async function restore(w: FlowWrite): Promise<void> {
  const slot: Slot = { where: w.where, path: w.path };
  if (w.before === null) {
    if (w.where === "workspace") await api.deleteFile({ path: w.path, base_rev: w.rev });
    else await api.deletePage({ alias: "me", path: w.path });
  } else await putText(slot, w.before, w.rev);
  refresh(slot);
}

/**
 * Undo a change: the files it wrote get their previous text back, exactly, last write first. A
 * file that someone changed since (its revision moved) is not overwritten: a toast says so and the
 * rest stays. Resolves to true when everything was put back.
 */
export async function undoFlowChange(token: FlowUndo): Promise<boolean> {
  for (const w of [...token.writes].reverse()) {
    try {
      await restore(w);
    } catch (err) {
      if (isConflictError(err))
        toast.warning(`${err.body.reason}. Undo was refused.`, { duration: 10_000 });
      else
        toast.error("Could not undo the change", {
          description: err instanceof Error ? err.message : "Try again in a moment.",
        });
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- one value of a step

/** A change to a step's skill or option. */
export interface FlowChange {
  scope: FlowScope;
  step: FlowStepId;
  /** `skill`, or an option of the step (`flowStep(step).options`). */
  key: string;
  value: FlowValue;
}

/** The table a key of a step lives in: `flow.<step>`, or `[context]`/`[staleness]` for a team-only option. */
function tableFor(step: FlowStepId, key: string): string {
  if (!isFlowStep(step)) throw new FlowWriteError(`${step} is not a step of the flow.`);
  if (key === "skill") return `flow.${step}`;
  const option = flowOption(step, key);
  if (!option) {
    const def = flowStep(step);
    throw new FlowWriteError(
      def.options.length === 0
        ? `${def.name} has no options.`
        : `${def.name} has no option ${key}.`,
    );
  }
  return option.teamOnly ? (option.table as string) : `flow.${step}`;
}

/** Comment lines for a table this call adds: the intro above the first `[flow.…]`, the note above the first custom step. */
function introFor(scope: FlowScope, text: string, table: string): string[] {
  if (!table.startsWith("flow.")) return [];
  const tables = listTomlTables(text);
  if (tables.includes(table)) return [];
  const out: string[] = [];
  if (!tables.some((t) => t.startsWith("flow."))) out.push(INTRO[scope]);
  if (table.startsWith("flow.custom.") && !tables.some((t) => t.startsWith("flow.custom.")))
    out.push(CUSTOM_NOTE);
  return out;
}

/**
 * Set the skill of a step, or one of its options, for the team (`workflow.toml`) or for me
 * (`library.toml`). Writes the value as given, even when it equals the default: to go back to the
 * default use `resetFlowValue`. The team-only options (Hand off and Status) cannot be set for me.
 */
export async function setFlowValue(change: FlowChange): Promise<FlowSaved | undefined> {
  const { scope, step, key, value } = change;
  const table = tableFor(step, key);
  if (key === "skill") {
    if (typeof value !== "string" || !parseSkillRef(value))
      throw new FlowWriteError(`${String(value)} is not a skill reference.`);
  } else {
    const option = flowOption(step, key) as NonNullable<ReturnType<typeof flowOption>>;
    if (option.teamOnly && scope === "me")
      throw new FlowWriteError("A team setting: only the team can change it.");
    if (!isFlowOptionValue(option, value))
      throw new FlowWriteError(`${String(value)} is not a value of ${option.label}.`);
  }
  return guarded(fileOf(scope), async () =>
    saved(
      scope,
      await editSlot(
        slotOf(scope),
        (text) => setTomlKey(text, table, key, value, { comment: introFor(scope, text, table) }),
        table,
      ),
    ),
  );
}

/**
 * Take a value back: remove the key, so the layer below applies (for me, the team's value; for the
 * team, the built-in default). A table this call leaves empty goes with it: `[flow.<step>]`, and
 * `[context]` or `[staleness]` for a team-only option.
 */
export async function resetFlowValue(
  change: Omit<FlowChange, "value">,
): Promise<FlowSaved | undefined> {
  const { scope, step, key } = change;
  const table = tableFor(step, key);
  return guarded(fileOf(scope), async () =>
    saved(
      scope,
      await editSlot(
        slotOf(scope),
        (text) => {
          const without = removeTomlKey(text, table, key);
          return without !== text &&
            listTomlTables(without).includes(table) &&
            listTomlKeys(without, table).length === 0
            ? removeTomlTable(without, table)
            : without;
        },
        table,
      ),
    ),
  );
}

// ---------------------------------------------------------------- custom steps

/** A custom step to add. */
export interface NewCustomStep {
  /** Where it lives: the team's step is policy, mine is only mine. */
  scope: FlowScope;
  after: FlowAfter;
  /** The skill reference. */
  skill: string;
  /** Shown on the card; left out, the skill's name in words. */
  label?: string;
  /** A failing step stops the run. Default false. */
  required?: boolean;
}

const customTable = (id: string) => `flow.custom.${id}`;

/** The custom steps a file holds: id, `after` and `order`. */
function customIn(text: string): { id: string; after?: string; order: number }[] {
  return listTomlTables(text)
    .filter((t) => t.startsWith("flow.custom."))
    .map((t) => {
      const v = readTomlTable(text, t) ?? {};
      return {
        id: t.slice("flow.custom.".length),
        after: typeof v.after === "string" ? v.after : undefined,
        order: typeof v.order === "number" ? v.order : 1,
      };
    });
}

/**
 * Add a custom step after Add work, Plan, Do next step or Hand off. It gets an id from its label
 * (or skill) that no step of either file uses, and the next `order` among the steps after the same
 * step in its file. Resolves with the id.
 */
export async function addCustomStep(step: NewCustomStep): Promise<FlowSaved | undefined> {
  const { scope, after, skill } = step;
  if (!isFlowAfter(after))
    throw new FlowWriteError("A custom step runs after Add work, Plan, Do next step or Hand off.");
  if (!parseSkillRef(skill)) throw new FlowWriteError(`${skill} is not a skill reference.`);
  return guarded(fileOf(scope), async () => {
    // Both files, so the id is free in both: a person's step must not shadow a team step.
    const mine = slotOf(scope);
    const other = slotOf(scope === "team" ? "me" : "team");
    const taken = [
      ...customIn((await readSlot(other)).text ?? ""),
      ...customIn((await readSlot(mine)).text ?? ""),
    ].map((c) => c.id);
    const id = customStepId(step.label ?? skillName(skill), taken);
    const table = customTable(id);
    const w = await editSlot(
      mine,
      (text) => {
        const order =
          Math.max(
            0,
            ...customIn(text)
              .filter((c) => c.after === after)
              .map((c) => c.order),
          ) + 1;
        let out = setTomlKey(text, table, "after", after, {
          comment: introFor(scope, text, table),
        });
        out = setTomlKey(out, table, "skill", skill);
        if (step.label) out = setTomlKey(out, table, "label", step.label);
        if (step.required) out = setTomlKey(out, table, "required", true);
        return setTomlKey(out, table, "order", order);
      },
      table,
    );
    return saved(scope, w, { id });
  });
}

/** What `updateCustomStep` can change. A key that is not here stays. */
export interface CustomStepPatch {
  label?: string;
  after?: FlowAfter;
  skill?: string;
  required?: boolean;
  order?: number;
}

/**
 * Change a custom step in the file that holds it (`scope` is the step's own: a team step is changed
 * by the team only). An empty `label` removes the label, so the skill's name in words shows again.
 */
export async function updateCustomStep(
  args: { scope: FlowScope; id: string } & CustomStepPatch,
): Promise<FlowSaved | undefined> {
  const { scope, id } = args;
  if (args.after !== undefined && !isFlowAfter(args.after))
    throw new FlowWriteError("A custom step runs after Add work, Plan, Do next step or Hand off.");
  if (args.skill !== undefined && !parseSkillRef(args.skill))
    throw new FlowWriteError(`${args.skill} is not a skill reference.`);
  if (args.order !== undefined && !(Number.isInteger(args.order) && args.order >= 0))
    throw new FlowWriteError("The order is a whole number.");
  const table = customTable(id);
  return guarded(fileOf(scope), async () => {
    const w = await editSlot(
      slotOf(scope),
      (text) => {
        if (!listTomlTables(text).includes(table))
          throw new FlowWriteError(
            scope === "me"
              ? `${id} is not one of your steps. A team step can be changed by the team only.`
              : `There is no custom step ${id} in ${TEAM_FILE}.`,
          );
        let out = text;
        const set = (key: string, value: TomlScalar) => {
          out = setTomlKey(out, table, key, value);
        };
        if (args.after !== undefined) set("after", args.after);
        if (args.skill !== undefined) set("skill", args.skill);
        if (args.label !== undefined) {
          if (args.label.trim() === "") out = removeTomlKey(out, table, "label");
          else set("label", args.label);
        }
        if (args.required !== undefined) set("required", args.required);
        if (args.order !== undefined) set("order", args.order);
        return out;
      },
      table,
    );
    return saved(scope, w);
  });
}

/** Remove a custom step: its table, and the comment lines directly above it. */
export async function removeCustomStep(args: {
  scope: FlowScope;
  id: string;
}): Promise<FlowSaved | undefined> {
  const { scope, id } = args;
  const table = customTable(id);
  return guarded(fileOf(scope), async () => {
    const w = await editSlot(
      slotOf(scope),
      (text) => {
        if (!listTomlTables(text).includes(table))
          throw new FlowWriteError(
            scope === "me"
              ? `${id} is not one of your steps. A team step can be removed by the team only.`
              : `There is no custom step ${id} in ${TEAM_FILE}.`,
          );
        return removeTomlTable(text, table);
      },
      table,
    );
    return saved(scope, w);
  });
}

// ---------------------------------------------------------------- copying a skill

/** Where a copy of a skill goes: this workspace's `skills/` folder, or my library's. */
export type CopyTarget = "ws" | "me";

/**
 * A name for a copy, `<prefix>-<name>` (the workspace's id prefix, or my handle), with `-2`, `-3`
 * added while it is taken. `taken` are the names already in the target.
 */
export function suggestCopyName(
  name: string,
  prefix: string,
  taken: Iterable<string> = [],
): string {
  const used = new Set(taken);
  const base = `${prefix}-${skillName(name)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let candidate = base;
  for (let i = 2; used.has(candidate); i++) candidate = `${base}-${i}`;
  return candidate;
}

/** Why a copy may not have this name, or undefined when it may. `catalog` says what is taken. */
export function copyNameProblem(
  name: string,
  to: CopyTarget,
  catalog: SkillsCatalog | undefined,
): string | undefined {
  if (!SKILL_NAME.test(name) || name.length > 64)
    return "Use lowercase words joined by dashes, 64 characters at most.";
  if ((BUILTIN_SKILL_NAMES as readonly string[]).includes(name))
    return `${name} is a built-in skill. Pick another name.`;
  const shelf = catalog?.shelves.find((s) => s.key === (to === "ws" ? "ws" : "me"));
  if (shelf?.skills.some((s) => s.name === name))
    return `${shelf.name} already has a skill called ${name}.`;
  return undefined;
}

/** A copy of a skill. */
export interface SkillCopy {
  /** The skill to copy: a built-in, a workspace skill, a library skill or mine. */
  ref: string;
  /** Where the copy lives. */
  to: CopyTarget;
  /** The folder name of the copy; it must pass `copyNameProblem`. */
  name: string;
  /**
   * The step to point at the copy: a step id, or `custom:<id>` for a custom step. For a workspace
   * copy the team's value is set, for a copy in my library mine. Without it the folder is written
   * and the flow stays.
   */
  step?: FlowStepId | `custom:${string}`;
  /** The text of SKILL.md as edited. Default: the original's, with its `name:` set to `name`. */
  text?: string;
}

/**
 * Copy a skill to this workspace or to my library, then point a step at the copy. Writes the
 * folder (every text file of the original: `scripts/`, `references/`, then `SKILL.md` last, so the
 * skill appears whole), then the step's `skill` in `workflow.toml` or `library.toml`. One undo token
 * takes all of it back: the pointer and the new files.
 */
export async function copySkill(copy: SkillCopy): Promise<FlowSaved | undefined> {
  const { ref, to, name, step } = copy;
  if (!parseSkillRef(ref)) throw new FlowWriteError(`${ref} is not a skill reference.`);
  const catalog = await api.skills();
  const problem = copyNameProblem(name, to, catalog);
  if (problem) throw new FlowWriteError(problem);
  const scope: FlowScope = to === "ws" ? "team" : "me";
  const customId = step?.startsWith("custom:") ? step.slice("custom:".length) : undefined;

  return guarded(`the copy of ${skillName(ref)}`, async () => {
    const files = await api.skillFiles(ref);
    const original = files.find((f) => f.path === "SKILL.md")?.text ?? "";
    const folder = `skills/${name}`;
    const slotFor = (path: string): Slot =>
      to === "ws"
        ? { where: "workspace", path: `${folder}/${path}` }
        : { where: "personal-file", path: `${folder}/${path}` };
    const writes: FlowWrite[] = [];
    try {
      const ordered = [
        ...files.filter((f) => f.path !== "SKILL.md"),
        { path: "SKILL.md", text: copy.text ?? renameSkillText(original, name) },
      ];
      for (const f of ordered) {
        const slot = slotFor(f.path);
        const rev = await putText(slot, f.text);
        refresh(slot);
        writes.push({ ...slot, before: null, rev });
      }
      if (step) {
        const target = `${to === "ws" ? "ws" : "me"}:${name}`;
        const table = customId ? customTable(customId) : tableFor(step as FlowStepId, "skill");
        const w = customId
          ? await editSlot(
              slotOf(scope),
              (text) => {
                if (!listTomlTables(text).includes(table))
                  throw new FlowWriteError(
                    `${customId} is not a step of ${fileOf(scope)}: ${
                      scope === "me" ? "a team step can be changed by the team only" : "it is gone"
                    }.`,
                  );
                return setTomlKey(text, table, "skill", target);
              },
              table,
            )
          : await editSlot(
              slotOf(scope),
              (text) =>
                setTomlKey(text, table, "skill", target, {
                  comment: introFor(scope, text, table),
                }),
              table,
            );
        if (w !== "same") writes.push(w);
      }
    } catch (err) {
      // Leave nothing half written.
      await undoFlowChange({ writes });
      throw err;
    }
    return { undo: { writes }, file: step ? fileOf(scope) : `${folder}/` };
  });
}
