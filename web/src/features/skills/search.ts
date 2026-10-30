// /skills keeps the open skill in the URL (`?skill=adding-work`), so a link opens it.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { hrefFor } from "@/lib/nav";

export interface SkillsSearch {
  /** The name of the skill open in the pane. */
  skill?: string;
}

export function validateSkillsSearch(raw: Record<string, unknown>): SkillsSearch {
  const skill = typeof raw.skill === "string" ? raw.skill.trim() : undefined;
  return { skill: skill || undefined };
}

/** href of a skill, for `<a>` (new tab, copy link). Hash-router aware. */
export function skillHref(name: string): string {
  return hrefFor(`/skills?skill=${encodeURIComponent(name)}`);
}

export interface SkillsNav {
  selected?: string;
  select: (name: string) => void;
  close: () => void;
}

type Navigate = (o: { to: string; search?: unknown; replace?: boolean }) => Promise<void>;

export function useSkillsNav(): SkillsNav {
  const navigate = useNavigate() as unknown as Navigate;
  const raw = useSearch({ strict: false }) as { skill?: string };
  const select = useCallback(
    (name: string) => void navigate({ to: "/skills", search: { skill: name } }),
    [navigate],
  );
  const close = useCallback(() => void navigate({ to: "/skills", search: {} }), [navigate]);
  return { selected: raw.skill, select, close };
}
