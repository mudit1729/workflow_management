// The skills flow in components: `useFlow()` reads the three files that decide it (the team's
// `workflow.toml`, the person's `library.toml` and the skill catalog, which says what exists) and
// resolves them with `resolveFlow` (flow.ts). Every place that names a skill asks here instead of
// writing the name: the hints, the prompts, the resume line.
//
// Until the files are read the flow is the built-in one, so a component never waits and the
// common case (no `[flow]` anywhere) never flickers.
import { useMemo } from "react";
import type { FlowConfig, FlowStepId } from "@/gen/types";
import {
  BUILTIN_FLOW,
  type FlowOrigin,
  NO_FLOW_CONFIG,
  type ResolvedFlow,
  resolveFlow,
} from "./flow";
import { qk } from "./keys";
import { usePersonalConfig } from "./library";
import { useSnapshot } from "./queries";
import { queryClient } from "./query-client";
import { type SkillsCatalog, skillExists, useSkills } from "./skills";
import type { PersonalConfig } from "./types";

/** What `useFlow()` gives. */
export interface FlowState {
  /** In effect for me: my override over the team's default over the built-in flow. */
  flow: ResolvedFlow;
  /** The team default alone (my override left out): what "Team default" shows and "The team uses …" quotes. */
  team: ResolvedFlow;
  /** The `[flow]` tables as the files write them. */
  config: { team: FlowConfig; me: FlowConfig };
  /** The skill catalog the references were checked against, once it has loaded. */
  catalog: SkillsCatalog | undefined;
  /** What could not be read from my `library.toml` (invalid TOML, a value the flow does not take). */
  personalProblems: string[];
  /** The snapshot or the catalog is still loading: `flow` is the built-in one until they are. */
  loading: boolean;
}

/** Resolve the three inputs: the pure part of `useFlow`, also used outside React. */
export function flowState(args: {
  team: FlowConfig | undefined;
  personal: PersonalConfig | undefined;
  catalog: SkillsCatalog | undefined;
  loading?: boolean;
}): FlowState {
  const team = args.team ?? NO_FLOW_CONFIG;
  const me = args.personal?.flow ?? NO_FLOW_CONFIG;
  const exists = skillExists(args.catalog);
  return {
    flow: resolveFlow({ team, me, exists }),
    team: resolveFlow({ team, exists }),
    config: { team, me },
    catalog: args.catalog,
    personalProblems: args.personal?.problems ?? [],
    loading: args.loading ?? false,
  };
}

/** The flow in effect for me, and the team's alone. */
export function useFlow(): FlowState {
  const snapshot = useSnapshot();
  const personal = usePersonalConfig();
  const skills = useSkills();
  const team = snapshot.data?.config.flow;
  const loading = snapshot.isPending || skills.isPending;
  return useMemo(
    () => flowState({ team, personal: personal.data, catalog: skills.data, loading }),
    [team, personal.data, skills.data, loading],
  );
}

/** The skill reference in effect for a step: `planning-issues`, `ws:acme-planning`, … */
export function useFlowSkill(step: FlowStepId): string {
  return useFlow().flow.steps[step].skill;
}

/** Whose value the skill of a step is. */
export function useFlowOrigin(step: FlowStepId): FlowOrigin {
  return useFlow().flow.steps[step].origin;
}

/**
 * The flow in effect right now, read from the query cache, for code that is not a component (a
 * copy button's handler). The built-in flow before anything has loaded.
 */
export function currentFlow(): ResolvedFlow {
  const snapshot = queryClient.getQueryData<{ config: { flow: FlowConfig } }>(qk.snapshot());
  const personal = queryClient.getQueryData<PersonalConfig>(qk.personalConfig());
  const catalog = queryClient.getQueryData<SkillsCatalog>(qk.skills());
  if (!snapshot && !personal) return BUILTIN_FLOW;
  return flowState({ team: snapshot?.config.flow, personal, catalog }).flow;
}
