// What Settings says about a skill reference, a source and a step: the words shared by the cards,
// the panel, the editor and the Kit frames.
import type { FlowStepId } from "@/gen/types";
import {
  type ResolvedCustom,
  type ResolvedStep,
  type SkillSource,
  type SkillsCatalog,
  shelfOf,
} from "@/lib/api";

/** "Built-in", "This workspace", the library's name, "Yours". */
export function sourceLabel(
  source: SkillSource,
  alias: string | undefined,
  catalog: SkillsCatalog | undefined,
): string {
  switch (source) {
    case "built-in":
      return "Built-in";
    case "workspace":
      return "This workspace";
    case "me":
      return "Yours";
    case "library":
      return (alias && shelfOf(catalog, alias)?.name) || alias || "Team library";
  }
}

/** Only "Yours" takes the accent: it is the one source that is a person. */
export function sourceTone(source: SkillSource): "neutral" | "outline" | "accent" {
  return source === "built-in" ? "neutral" : source === "me" ? "accent" : "outline";
}

/** The step has a value of mine: my skill, or an option I set. */
export function hasOverride(step: ResolvedStep): boolean {
  return step.origin === "me" || Object.values(step.options).some((o) => o.origin === "me");
}

/** The key of a custom step in the page's addresses: `custom:security-check`. */
export const customKey = (c: Pick<ResolvedCustom, "id">): `custom:${string}` => `custom:${c.id}`;

/** The path of a skill's SKILL.md in its folder's source: workspace root or personal library. */
export const skillFilePath = (name: string) => `skills/${name}/SKILL.md`;

/** The first sentence of "Use when …", without the lead that every skill's line repeats. */
export function afterUseWhen(useWhen: string): string {
  return useWhen.replace(/^Use when\s+/, "");
}

/** A step that runs inside another one (spec 1.1): not drawn on the line, listed in the panel of the step it serves. */
export interface Helper {
  step: FlowStepId;
  /** What it does there, in a few words. */
  why: string;
}

export const HELPERS: Partial<Record<FlowStepId, Helper[]>> = {
  add: [{ step: "style", why: "titles" }],
  plan: [
    { step: "log", why: "the plan's change entry" },
    { step: "style", why: "titles and entries" },
  ],
  do: [
    { step: "plan", why: "when there is no plan yet" },
    { step: "log", why: "the task's entry" },
    { step: "status", why: "finds the ready task" },
  ],
  handoff: [
    { step: "log", why: "the hand-off entry" },
    { step: "status", why: "the state it reports" },
  ],
};

/** The steps whose panel lists `helper` (Log runs in Plan, Do next step and Hand off). */
export function usedIn(helper: FlowStepId): FlowStepId[] {
  return (Object.keys(HELPERS) as FlowStepId[]).filter((id) =>
    HELPERS[id]?.some((h) => h.step === helper),
  );
}
