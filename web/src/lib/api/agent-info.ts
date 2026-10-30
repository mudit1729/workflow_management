// What the dashboard says about an agent (plan D9, D12, D14): names, handles, the command that
// starts the bridge, the command "Open in Codex" copies, and the answers of the simulated bridge.
// Pure text and data, so the mock server (the words of a run and the author it writes as) and the
// hooks of `agent.ts` share it, as `resume.ts` does for the prompt.
import { type ResumeIssue, resumeCommand, resumePrompt } from "./resume";
import type { AgentConnection, AgentKind } from "./types";

/** Every agent the dashboard can connect, in the order the picker shows them. */
export const AGENT_KINDS: readonly AgentKind[] = ["codex", "claude"];

/** "Codex", "Claude Code": the name in labels and sentences. */
export const agentName = (kind: AgentKind): "Codex" | "Claude Code" =>
  kind === "claude" ? "Claude Code" : "Codex";

/** "@codex", "@claude": how markdown writes the agent as an author (`claimed_by: "@codex"`). */
export const agentHandle = (kind: AgentKind): "@codex" | "@claude" =>
  kind === "claude" ? "@claude" : "@codex";

/**
 * What "Open in Codex" and "Open in Claude Code" copy: the resume prompt of `format.md` section 15
 * and the interactive command, `codex '<prompt>'` or `claude '<prompt>'`.
 */
export function agentCommand(
  kind: AgentKind,
  issue: ResumeIssue,
): { prompt: string; command: string } {
  return { prompt: resumePrompt(issue), command: resumeCommand(issue, kind) };
}

// ---------------------------------------------------------------- pairing

/** No 0, O, 1, I, L or U: a code read aloud or typed by hand stays unambiguous. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/**
 * A one-time pair code like `4F7K-92`, for the bridge's `--pair` flag. `random` takes a number of
 * values and returns that many random bytes; the default is the browser's crypto.
 */
export function makePairCode(
  random: (n: number) => ArrayLike<number> = (n) =>
    globalThis.crypto.getRandomValues(new Uint8Array(n)),
): string {
  const bytes = random(6);
  const chars = Array.from({ length: 6 }, (_, i) => CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** The command the person runs in the repository: the bridge, for this agent, with this code. */
export const pairCommand = (kind: AgentKind, code: string) =>
  `node plugins/workflow/scripts/wf-bridge.mjs --agent ${kind} --pair ${code}`;

// ---------------------------------------------------------------- the simulated bridge

/**
 * The skills of `plugins/workflow/skills`, which the status of a bridge lists (the test in
 * `mock/agent.test.ts` keeps this list in step with the folder).
 */
export const WF_SKILL_NAMES: readonly string[] = [
  "adding-work",
  "checking-status",
  "doing-next-step",
  "handing-off",
  "keeping-a-library",
  "logging-work",
  "planning-issues",
  "querying-library",
  "summarizing-codebase",
  "summarizing-work",
  "using-wf",
  "writing-readable-bulk-text",
];

/**
 * What the simulated bridge answers (plan D14): this computer, this repository, the mock
 * workspace. Codex has every wf skill installed; Claude Code has none, so the panel can show the
 * install command. `since` is left to the caller.
 */
export function simulatedConnection(kind: AgentKind): AgentConnection {
  const installed = kind === "codex";
  return {
    status: "connected",
    agent: kind,
    mode: "simulated",
    host: "this computer",
    repo: "workflow_management",
    version: kind === "codex" ? "codex 0.46" : "claude 2.0",
    workspace: "web/mock/workspace",
    skills: {
      installed: installed ? [...WF_SKILL_NAMES] : [],
      missing: installed ? [] : [...WF_SKILL_NAMES],
    },
  };
}
