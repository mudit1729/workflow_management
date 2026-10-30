// The connect flow as plain data (plan D10): three screens, one question each, and the rules for
// where it starts and when it may go on. No React, so the tests pin it.
//
//   which  Which agent?          two big buttons, Codex and Claude Code (keys 1, 2)
//   run    Run this in the repo  the exact command, one Copy button, then the bridge answers
//   done   <Agent> is connected  and what Do next step does now
import type { AgentStart } from "@/app/shell-store";
import type { AgentConnection, AgentKind } from "@/lib/api";
import { agentName } from "@/lib/api";

export type StepId = "which" | "run" | "done";

export const STEP_LABEL: Record<StepId, string> = {
  which: "Which agent",
  run: "Run in the repo",
  done: "Done",
};

/** The screens of the flow. A start that names the agent skips the first question. */
export function stepsFor(skipWhich: boolean): StepId[] {
  return skipWhich ? ["run", "done"] : ["which", "run", "done"];
}

/**
 * Where the flow starts. A start that names the agent, and a pairing or a connection that is
 * already under way, go to the screen that shows the command; otherwise the first question.
 */
export function initialStep(start: AgentStart | undefined, connection: AgentConnection): StepId {
  if (start?.agent) return "run";
  return connection.status === "pairing" || connection.status === "connected" ? "run" : "which";
}

/** The agent the first question starts on: the one named, the one in play, else the last chosen. */
export function initialAgent(
  start: AgentStart | undefined,
  connection: AgentConnection,
  preferred: AgentKind,
): AgentKind {
  return start?.agent ?? connection.agent ?? preferred;
}

/**
 * Choosing `agent` needs a new pairing, unless that agent is already pairing or connected (Back,
 * then the same answer again must not throw a working connection away).
 */
export function needsPairing(agent: AgentKind, connection: AgentConnection): boolean {
  return !(
    connection.agent === agent &&
    (connection.status === "pairing" || connection.status === "connected")
  );
}

/** The screen's answer is complete: the person can go on. */
export function canContinue(step: StepId, agent: AgentKind, connection: AgentConnection): boolean {
  if (step === "run") return connection.status === "connected" && connection.agent === agent;
  return true;
}

/** The words of the last screen. `issueId` is the issue whose Do next step opened the flow. */
export function doneCopy(
  connection: AgentConnection,
  issueId?: string,
): { title: string; text: string } {
  const name = agentName(connection.agent ?? "codex");
  return {
    title: `${name} is connected`,
    text: `Do next step now runs on ${connection.host ?? "this computer"}.${
      issueId ? ` Next: start it on ${issueId}.` : ""
    }`,
  };
}

/** The primary button's words for the screen on show. */
export function primaryLabel(step: StepId, then: boolean): string {
  if (step === "done") return then ? "Do next step" : "Done";
  return "Continue";
}
