// "Connect an agent to read private repos": the Add team library dialog calls `openConnectAgent()`.
// The agent connection (the bridge, spec L2) registers itself with `setConnectAgentHandler`; until
// it does, the dialog says plainly that there is nothing to connect yet.

let handler: (() => void) | undefined;

/** Open the agent connection. `false` when nothing handles it, so the caller can explain. */
export function openConnectAgent(): boolean {
  if (!handler) return false;
  handler();
  return true;
}

/** The agent connection takes over `openConnectAgent`. Returns a function that gives it back. */
export function setConnectAgentHandler(fn: () => void): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = undefined;
  };
}
