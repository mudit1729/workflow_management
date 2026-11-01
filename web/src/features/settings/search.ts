// What the Settings URLs carry (skills-flow-spec 5.1). The page is a function of its address, so a
// link opens the same step, form or editor:
//   /settings/flow?step=plan                 the panel of a step of the flow
//   /settings/flow?step=custom:<id>          the panel of a custom step
//   /settings/flow?step=new&after=do         the form that adds a custom step after Do next step
//   /settings/flow?view=team                 the team default alone, without my override
//   /settings/flow/edit?skill=<ref>          the editor of a workspace or personal skill
//   /settings/flow/edit?skill=<ref>&to=ws&name=<name>&for=plan   the editor of a copy to be made
// The validators sit apart from the views, so the router does not import them.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { FlowAfter, FlowStepId } from "@/gen/types";
import { CUSTOM_ID, isFlowAfter, isFlowStep, parseSkillRef, SKILL_NAME } from "@/lib/api";

/** Where a copy of a skill lives. */
export type CopyTo = "ws" | "me";

/** The panel on show: a step, a custom step (`custom:<id>`) or the form that adds one. */
export type PanelKey = FlowStepId | `custom:${string}` | "new";

export interface SettingsFlowSearch {
  step?: PanelKey;
  /** With `step=new`: the step the new custom step follows. */
  after?: FlowAfter;
  /** `team`: show the team default alone. Left out: what is in effect for me. */
  view?: "team";
}

export interface SettingsEditSearch {
  /** The skill to edit, or to copy when `to` and `name` are there. */
  skill?: string;
  to?: CopyTo;
  /** The folder name of the copy. */
  name?: string;
  /** The step (or `custom:<id>`) the copy is for, and the panel to come back to. */
  for?: PanelKey;
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined => {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : undefined;
};

/** `plan`, `custom:security-check`, `new`; anything else is nothing. */
export function panelKey(v: unknown): PanelKey | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (s === "new" || isFlowStep(s)) return s;
  if (s.startsWith("custom:") && CUSTOM_ID.test(s.slice(7))) return s as `custom:${string}`;
  return undefined;
}

export function validateSettingsFlowSearch(raw: Raw): SettingsFlowSearch {
  const step = panelKey(raw.step);
  const after = str(raw.after);
  return {
    step,
    after: step === "new" && isFlowAfter(after) ? after : undefined,
    view: raw.view === "team" ? "team" : undefined,
  };
}

export function validateSettingsEditSearch(raw: Raw): SettingsEditSearch {
  const skill = str(raw.skill);
  const name = str(raw.name);
  const to = raw.to === "ws" || raw.to === "me" ? raw.to : undefined;
  const copy = to !== undefined && name !== undefined && SKILL_NAME.test(name);
  return {
    skill: skill && parseSkillRef(skill) ? skill : undefined,
    to: copy ? to : undefined,
    name: copy ? name : undefined,
    for: panelKey(raw.for),
  };
}

/** href of a panel, for `<a>` (new tab, copy link). Hash-router aware. */
export function settingsFlowHref(search: SettingsFlowSearch = {}): string {
  const q = new URLSearchParams();
  if (search.step) q.set("step", search.step);
  if (search.after) q.set("after", search.after);
  if (search.view) q.set("view", search.view);
  const text = q.toString();
  const path = `/settings/flow${text ? `?${text}` : ""}`;
  return import.meta.env.VITE_HASH_ROUTER === "1" ? `#${path}` : path;
}

type Navigate = (o: { to: string; search?: unknown; replace?: boolean }) => Promise<void>;

export interface FlowNav {
  step?: PanelKey;
  after?: FlowAfter;
  view: "me" | "team";
  /** Open the panel of a step or of a custom step. */
  select: (step: PanelKey) => void;
  /** Open the form that adds a custom step after `after`. */
  openNew: (after: FlowAfter) => void;
  /** Close the panel (the flow stays). */
  close: (opts?: { replace?: boolean }) => void;
  setView: (view: "me" | "team") => void;
}

/** The flow tab's address, and the moves between its panels. The view (me or team) is kept. */
export function useFlowNav(): FlowNav {
  const navigate = useNavigate() as unknown as Navigate;
  const raw = useSearch({ strict: false }) as SettingsFlowSearch;
  const view = raw.view === "team" ? "team" : "me";
  const go = useCallback(
    (search: SettingsFlowSearch, replace?: boolean) =>
      void navigate({ to: "/settings/flow", search, replace }),
    [navigate],
  );
  return useMemo<FlowNav>(() => {
    // The view stays through every move: the team default is a place, not a click.
    const keep = view === "team" ? { view: "team" as const } : {};
    return {
      step: raw.step,
      after: raw.after,
      view,
      select: (step) => go({ ...keep, step }),
      openNew: (after) => go({ ...keep, step: "new", after }),
      close: (opts) => go({ ...keep }, opts?.replace),
      setView: (next) =>
        go(
          { ...(next === "team" ? { view: "team" } : {}), step: raw.step, after: raw.after },
          true,
        ),
    };
  }, [raw.step, raw.after, view, go]);
}

export interface EditNav extends SettingsEditSearch {
  /** Open the editor of a skill, or of the copy `to` and `name` describe. */
  open: (args: SettingsEditSearch) => void;
  /** Back to the panel the editor was opened from, or to the flow. */
  back: (replace?: boolean) => void;
}

export function useEditNav(): EditNav {
  const navigate = useNavigate() as unknown as Navigate;
  const raw = useSearch({ strict: false }) as SettingsEditSearch;
  return useMemo<EditNav>(
    () => ({
      skill: raw.skill,
      to: raw.to,
      name: raw.name,
      for: raw.for,
      open: (args) => void navigate({ to: "/settings/flow/edit", search: args }),
      back: (replace) =>
        void navigate({
          to: "/settings/flow",
          search: raw.for ? { step: raw.for } : {},
          replace,
        }),
    }),
    [navigate, raw.skill, raw.to, raw.name, raw.for],
  );
}
