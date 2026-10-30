// Refresh and Summarize (spec 3, L5): a summary is written by the connected agent with the
// `summarizing-codebase` and `summarizing-work` skills. The dashboard asks; the agent writes the
// markdown and the page changes.
//
// The agent connection registers itself with `setPersonalAgent`, like the Ask panel does with
// `setAskHandler`. Until it does, the prototype answers: it rewrites the page itself (the
// generator in `mock/libraries/work-summaries.ts`, or the commit and time of a codebase page) after
// a short "Summarizing…" state, and says so.
import { toast } from "sonner";
import { create } from "zustand";
import { api, savePage } from "@/lib/api";
import { loadMock } from "@/lib/api/mock-bridge";
import { PERSONAL_ALIAS } from "../address";
import { movedTo, repoHead } from "./codebase";
import type { WorkTarget } from "./work";

export type SummarizeRequest =
  | {
      kind: "work";
      /** The issue or the group to summarize. */
      target: WorkTarget;
      /** Every page the run writes, for the "Summarizing…" state: the target, and below a group. */
      pages: string[];
    }
  | { kind: "codebase"; path: string; repo: string };

/** What a connected agent offers the Personal home. */
export interface PersonalAgent {
  /** Run the skill for the request; resolves when the pages are written. */
  summarize(request: SummarizeRequest): Promise<void>;
}

interface AgentState {
  agent?: PersonalAgent;
  /** Pages being written now. */
  busy: ReadonlySet<string>;
}

const useAgentStore = create<AgentState>(() => ({ busy: new Set<string>() }));

/** The agent connection takes over Refresh and Summarize. Returns a function that gives them back. */
export function setPersonalAgent(agent: PersonalAgent): () => void {
  useAgentStore.setState({ agent });
  return () => {
    if (useAgentStore.getState().agent === agent) useAgentStore.setState({ agent: undefined });
  };
}

/** The connected agent, if there is one. */
export function usePersonalAgent(): PersonalAgent | undefined {
  return useAgentStore((s) => s.agent);
}

/** Is the page being written now? (For code outside a render; a component uses `useSummarizing`.) */
export const isSummarizing = (path: string): boolean => useAgentStore.getState().busy.has(path);

/** Is the page being written now? */
export function useSummarizing(path: string): boolean {
  return useAgentStore((s) => s.busy.has(path));
}

const pagesOf = (request: SummarizeRequest) =>
  request.kind === "work" ? request.pages : [request.path];

function mark(pages: string[], on: boolean) {
  useAgentStore.setState((s) => {
    const busy = new Set(s.busy);
    for (const p of pages) on ? busy.add(p) : busy.delete(p);
    return { busy };
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The prototype's own answer: the same pages an agent would write, from the same workspace. */
async function simulate(request: SummarizeRequest): Promise<void> {
  if (import.meta.env.VITE_API === "real")
    throw new Error("No agent is connected, and the prototype's own answer is off in this build.");
  const [mock, work, time] = await Promise.all([
    loadMock(),
    import("@mock/libraries/work-summaries"),
    import("@mock/time"),
    sleep(1100),
  ]);
  if (request.kind === "codebase") {
    const head = repoHead(request.repo);
    if (!head) throw new Error("The prototype does not know the history of this repository.");
    const page = await api.libraryPage(PERSONAL_ALIAS, request.path);
    await savePage({
      alias: PERSONAL_ALIAS,
      path: request.path,
      text: movedTo(page.text, head, time.toTs(mock.server.store.now())),
    });
    return;
  }
  const world = work.workWorld(mock.server.store);
  const pages = work.summarizeWork(world, work.writeOptions(mock.server.store), {
    kind: request.target.kind,
    key: request.target.key,
  });
  const written = await Promise.all(
    Object.entries(pages).map(([path, text]) => savePage({ alias: PERSONAL_ALIAS, path, text })),
  );
  if (written.some((w) => !w)) throw new Error("Some pages could not be saved.");
}

/**
 * Ask for a summary. With an agent connected the agent runs the skill; without one the prototype
 * writes the pages and the toast says so. One toast, when it is done.
 */
export async function summarize(request: SummarizeRequest): Promise<void> {
  const pages = pagesOf(request);
  const agent = useAgentStore.getState().agent;
  mark(pages, true);
  try {
    if (agent) {
      await agent.summarize(request);
      toast.success(request.kind === "codebase" ? "Codebase summary refreshed" : "Summary written");
    } else {
      await simulate(request);
      toast.success(
        request.kind === "codebase"
          ? "Prototype: commit and time moved"
          : "Prototype: summary written",
        {
          description:
            request.kind === "codebase"
              ? "No agent is connected, so the sections were not re-read."
              : "No agent is connected, so the dashboard wrote the page itself.",
        },
      );
    }
  } catch (err) {
    toast.error("Could not summarize", {
      description: err instanceof Error ? err.message : "Try again in a moment.",
    });
  } finally {
    mark(pages, false);
  }
}
