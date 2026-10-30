// The words of a Codex run, in one place. The header strip, the card marker, the runs list and the
// toasts all read a run through these, so one phase never gets two names.
//
// Shape of every line: the state first, then the task ("Claiming T-3", "Done: T-3"). Live phases
// are continuous, finished runs name how they ended. Fixed order: claim, log, verify, done.
import type { CodexPhaseId, CodexRun } from "@/lib/api";

/** What Codex is doing, for the strip in the issue header. */
const LIVE: Record<CodexPhaseId, (task: string) => string> = {
  claim: (task) => `Claiming ${task}`,
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

/** The line for a run: what it is doing now, or how it ended. */
export function runLine(run: CodexRun): string {
  const task = run.task ?? "the task";
  switch (run.status) {
    case "running":
      return LIVE[run.phase ?? "claim"](task);
    case "done":
      return `Done: ${task}`;
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
      return SHORT[run.phase ?? "claim"];
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

/** The run that is going, if any. At most one per issue. */
export function activeRun(runs: readonly CodexRun[]): CodexRun | undefined {
  return runs.find((r) => r.status === "running");
}
