// The words of a Codex run, in one place. The header strip, the card marker, the runs list and the
// toasts all read a run through these, so one phase never gets two names.
//
// Shape of every line: the state first, then the task ("Claiming T-3", "Done: T-3"). Live phases
// are continuous, finished runs name how they ended. Fixed order: claim, log, verify, done.
//
// A run on a real bridge (`source: "bridge"`, plan D9) has no phases and names no task: the agent
// picks it. Its lines say where it runs ("Running on laptop") and how it ended ("Done", "Failed";
// the reason, such as the exit code, is on the run).
import { type AgentKind, agentName, type CodexPhaseId, type CodexRun } from "@/lib/api";
import type { IssueTab } from "@/lib/nav";

/**
 * The run starts by writing the plan: the issue had none, and "Do next step" always does the next
 * step (`doing-next-step`, step 3). The run says so in `plans`; older runs say it in the label of
 * the first phase ("Plan the issue, claim T-1").
 */
export function plansFirst(run: CodexRun): boolean {
  return run.plans ?? run.phases.find((p) => p.id === "claim")?.label.startsWith("Plan") ?? false;
}

/** What Codex is doing, for the strip in the issue header. */
const LIVE: Record<CodexPhaseId, (task: string, plans: boolean) => string> = {
  claim: (task, plans) => (plans ? `Planning, claiming ${task}` : `Claiming ${task}`),
  log: () => "Logging the change",
  verify: () => "Verifying: CI running",
  done: (task) => `Finishing ${task}`,
};

/** One word for the card, where the task id already sits next to it. */
const SHORT: Record<CodexPhaseId, string> = {
  claim: "Claiming",
  log: "Logging",
  verify: "Verifying",
  done: "Finishing",
};

/** The run is the agent itself working on the person's computer, with no phases of its own. */
export const isBridgeRun = (run: CodexRun): boolean => run.source === "bridge";

/**
 * The line for a run: what it is doing now, or how it ended. `host` is the computer a bridge run
 * works on ("Running on laptop"); a run on the prototype's own simulation has no use for it.
 */
export function runLine(run: CodexRun, host?: string): string {
  if (isBridgeRun(run)) {
    switch (run.status) {
      case "running":
        return host ? `Running on ${host}` : "Running";
      case "done":
        return "Done";
      case "cancelled":
        return "Cancelled";
      case "failed":
        return "Failed";
      case "nothing_ready":
        return "Nothing ready";
    }
  }
  const task = run.task ?? "the task";
  switch (run.status) {
    case "running":
      return LIVE[run.phase ?? "claim"](task, plansFirst(run));
    case "done":
      // A task that waits for a hand check is not done: say what the run did and what is left.
      return run.review ? `Done: ${task}, waiting for a check` : `Done: ${task}`;
    case "cancelled":
      return `Cancelled: ${task}`;
    case "failed":
      return `Failed: ${task}`;
    case "nothing_ready":
      return "Nothing ready";
  }
}

/** The one word the card shows beside the task id. */
export function runWord(run: CodexRun): string {
  switch (run.status) {
    case "running":
      if (isBridgeRun(run)) return "Running";
      return run.phase === "claim" && plansFirst(run) ? "Planning" : SHORT[run.phase ?? "claim"];
    case "done":
      return "Done";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    case "nothing_ready":
      return "Nothing ready";
  }
}

/** Phases finished and phases in all: the progress bar and its accessible value. */
export function runProgress(run: CodexRun): { done: number; total: number } {
  const total = run.phases.length;
  return { done: run.phases.filter((p) => p.state === "done").length, total };
}

/**
 * What to call a list of runs: the name of the agent that did them all ("Codex runs"), "Agent
 * runs" when both agents worked on the issue, and the name of `fallback` (the connected or last
 * chosen agent) for an empty list.
 */
export function runsLabel(runs: readonly CodexRun[], fallback: AgentKind): string {
  const kinds = new Set(runs.map((r) => r.agent));
  if (kinds.size > 1) return "Agent runs";
  return `${agentName(kinds.values().next().value ?? fallback)} runs`;
}

/** The run that is going, if any. At most one per issue. */
export function activeRun(runs: readonly CodexRun[]): CodexRun | undefined {
  return runs.find((r) => r.status === "running");
}

/** Where to look next after a run that did no work, and the button that goes there. */
export interface ReasonAction {
  label: string;
  tab: IssueTab;
}

/**
 * The place that answers a run's reason. A request somebody must answer is in the Now tab, an
 * issue without criteria needs its goal, and tasks in flight or all done are read in the Plan tab.
 * A reason with nowhere to go (another issue is not done, the issue is closed, another author holds
 * the lease) has no button: the header already shows the blocker or the lease. The reasons are the
 * data layer's (`NOTHING_READY`).
 */
export function reasonAction(run: CodexRun): ReasonAction | undefined {
  if (run.status !== "nothing_ready") return undefined;
  const reason = run.reason ?? "";
  if (/^Waiting on Q-/.test(reason)) return { label: "Open Now", tab: "now" };
  if (/no criteria/i.test(reason)) return { label: "Open goal", tab: "goal" };
  if (/^Waiting on |^The issue is |holds the lease/.test(reason)) return undefined;
  return { label: "Open plan", tab: "plan" };
}
