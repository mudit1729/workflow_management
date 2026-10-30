// The scripted side of the simulated agent (plan D14). The connection itself lives in the
// dashboard (`src/lib/api/agent.ts`): it pairs by itself in the static build, and `simulate()` pairs
// at once. What the mock server adds is the way in for scripts and tests, `window.__wf.connectAgent`
// and `disconnectAgent`: they announce a connection here, and the dashboard follows (the same way
// it follows `subscribeCodex`). What a simulated bridge answers is in `simulatedConnection`
// (`src/lib/api/agent-info.ts`); a run by the agent is `startCodexRun(issue, kind, agent)`.
import type { AgentKind } from "@/lib/api/types";

/** A script connected an agent, or disconnected it. */
export type AgentEvent = { event: "connect"; agent: AgentKind } | { event: "disconnect" };

export interface AgentHost {
  /** Connect `agent` (default Codex) the way a finished pairing would. Returns the agent. */
  connect(agent?: AgentKind): AgentKind;
  /** End the connection. */
  disconnect(): void;
  subscribe(fn: (e: AgentEvent) => void): () => void;
}

export function createAgentHost(): AgentHost {
  const listeners = new Set<(e: AgentEvent) => void>();
  const emit = (e: AgentEvent) => {
    for (const l of [...listeners]) {
      try {
        l(e);
      } catch (err) {
        console.error("agent listener failed", err);
      }
    }
  };
  return {
    connect(agent = "codex") {
      emit({ event: "connect", agent });
      return agent;
    },
    disconnect() {
      emit({ event: "disconnect" });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
