// Who answers. With an agent connected (Codex or Claude Code through the bridge, spec L2 and L3)
// the question goes to it, and it runs the `querying-library` skill on exactly the pages chosen.
// Without one, this prototype answers from the best passages and says so; and with the prototype
// answers switched off, the panel shows the passages alone. The agent connection is not on every
// branch: it registers itself with `setAskAgent`, and until then the prototype stands in.
//
//   mode "agent"      a connected agent answers
//   mode "prototype"  the prototype's own answer, from the top passages ("Prototype answer")
//   mode "none"       no answer, the five best passages and a button to connect an agent
import { create } from "zustand";
import { getMockControls } from "@/app/mock-controls";
import { isRealApi, loadMock } from "@/lib/api/mock-bridge";
import { askPrompt } from "./answer";

/** What the panel sends. The bridge builds its own prompt from `issue` and `pages` (spec 8). */
export interface AskRequest {
  issue: string;
  /** The pages to read, as `alias:path`; a team page may carry `@<sha>`. */
  pages: string[];
  question: string;
  /** The same request as the text `querying-library` is given. For an agent without a bridge. */
  prompt: string;
}

export interface AskAgent {
  /** Who answers, as a handle: `@codex`. */
  handle: string;
  /**
   * Run `querying-library`. `onText` hears the markdown as it streams; the promise resolves to the
   * whole output (see `parseAnswer`). Reject, or abort the signal, to stop.
   */
  ask(request: AskRequest, signal: AbortSignal, onText?: (text: string) => void): Promise<string>;
}

interface AgentState {
  /** The connected agent, if the agent connection registered one. */
  agent?: AskAgent;
  /** The prototype answers when no agent is connected. Off in a build that talks to `wf serve`. */
  prototype: boolean;
  setPrototype: (on: boolean) => void;
}

export const useAskAgentStore = create<AgentState>()((set) => ({
  agent: undefined,
  prototype: !isRealApi,
  setPrototype: (prototype) => set({ prototype }),
}));

/** The agent connection takes over Ask. Returns a function that gives it back. */
export function setAskAgent(agent: AskAgent | undefined): () => void {
  useAskAgentStore.setState({ agent });
  return () => {
    if (useAskAgentStore.getState().agent === agent)
      useAskAgentStore.setState({ agent: undefined });
  };
}

export const prototypeAgent: AskAgent = {
  handle: "prototype",
  async ask({ pages, question }, signal, onText) {
    const mock = await loadMock();
    const { answerFromPages } = await import("@mock/libraries/ask");
    const text = answerFromPages(mock.server.libraryRegistry, { question, pages });
    // A real agent streams; the prototype does too, so the panel's streaming state is the real one.
    let shown = "";
    for (const chunk of text.match(/\S+\s*/g) ?? []) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      shown += chunk;
      onText?.(shown);
      await new Promise((r) => setTimeout(r, 18));
    }
    return text;
  },
};

export type AskMode = "agent" | "prototype" | "none";

export interface Responder {
  mode: AskMode;
  agent?: AskAgent;
}

/** Who answers: the connected agent, else the prototype when it is on, else nobody. Pure. */
export function responderOf(agent: AskAgent | undefined, prototype: boolean): Responder {
  if (agent) return { mode: "agent", agent };
  if (prototype) return { mode: "prototype", agent: prototypeAgent };
  return { mode: "none" };
}

/** Who answers right now. */
export function useResponder(): Responder {
  const agent = useAskAgentStore((s) => s.agent);
  const prototype = useAskAgentStore((s) => s.prototype);
  return responderOf(agent, prototype);
}

/** The request an agent gets for a question over some pages. */
export function requestFor(issue: string, pages: string[], question: string): AskRequest {
  return { issue, pages, question, prompt: askPrompt({ pages, question }) };
}

interface PrototypeControls {
  setPrototypeAnswers: (on: boolean) => void;
}

// The prototype controls live on `window.__wf`, installed when the mock server loads (the same
// pattern as the personal library's `resetPersonal`). `__wf.setPrototypeAnswers(false)` shows the
// panel as it is with no agent at all.
if (!isRealApi) {
  void loadMock()
    .then(() => {
      const controls = getMockControls() as (PrototypeControls & object) | undefined;
      if (controls)
        controls.setPrototypeAnswers = (on) => useAskAgentStore.getState().setPrototype(on);
    })
    .catch(() => {});
}
