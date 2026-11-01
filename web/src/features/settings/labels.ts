// What Settings says about a skill reference, a source and a step: the words shared by the cards,
// the panel, the editor and the Kit frames.
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
