// /skills keeps the open skill in the URL, so a link opens it. A skill goes by its reference
// (`?skill=adding-work`, `?skill=ws:acme-planning`, `?skill=platform:checking-security`,
// `?skill=me:planning-small`), so two skills of one name in different sources never collide; a
// built-in's reference is its bare name, so the old links still open.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { hrefFor } from "@/lib/nav";

export interface SkillsSearch {
  /** The reference of the skill open in the pane (`Skill.ref`). */
  skill?: string;
}

export function validateSkillsSearch(raw: Record<string, unknown>): SkillsSearch {
  const skill = typeof raw.skill === "string" ? raw.skill.trim() : undefined;
  return { skill: skill || undefined };
}

/** href of a skill by its reference, for `<a>` (new tab, copy link). Hash-router aware. */
export function skillHref(ref: string): string {
  return hrefFor(`/skills?skill=${encodeURIComponent(ref)}`);
}

export interface SkillsNav {
  /** The reference of the open skill. */
  selected?: string;
  select: (ref: string) => void;
  close: () => void;
}

type Navigate = (o: { to: string; search?: unknown; replace?: boolean }) => Promise<void>;

export function useSkillsNav(): SkillsNav {
  const navigate = useNavigate() as unknown as Navigate;
  const raw = useSearch({ strict: false }) as { skill?: string };
  const select = useCallback(
    (ref: string) => void navigate({ to: "/skills", search: { skill: ref } }),
    [navigate],
  );
  const close = useCallback(() => void navigate({ to: "/skills", search: {} }), [navigate]);
  return { selected: raw.skill, select, close };
}
