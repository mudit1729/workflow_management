// Codex from the browser (plan D3, D4, D9, D12).
//  - `codexCommand` is the text "Open in Codex" copies: the resume prompt of format.md section 15,
//    which names the issue and the folder. The installed wf skills do the rest, so the command
//    never goes stale. (`agentCommand` in `agent-info.ts` does the same for either agent.)
//  - `useStartCodexRun` starts and stops a background "Do next step" run by the connected agent
//    (`agent.ts`); `useCodexRuns` lists the runs and follows them live. A simulated run's edits reach
//    the board through the ordinary live stream, because each phase is a real markdown edit; the run
//    itself and its git and CI data have their own small stream, which the hooks below subscribe to.
//  - A run on a real bridge (`source: "bridge"`) is the agent itself editing the repository's
//    markdown. The bridge's output stream is followed into the same cached lists, with the last line
//    the agent printed, and ends `done` or `failed` by its exit code.
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { IssueId } from "@/gen/types";
import { AgentNotConnectedError, agentStore } from "./agent";
import { agentCommand, agentName } from "./agent-info";
import { BridgeError, type BridgeRun, BridgeUnreachableError, bridge } from "./bridge-client";
import { api } from "./client";
import { firstProblem, isUnprocessableError, NotFoundError } from "./error";
import { qk } from "./keys";
import { isRealApi, loadMock } from "./mock-bridge";
import { queryClient } from "./query-client";
import type { ResumeIssue } from "./resume";
import type { AgentKind, CodexRun, CodexRunKind } from "./types";

// ---------------------------------------------------------------- the command

/**
 * What "Open in Codex" copies. `prompt` is the resume prompt of `format.md` section 15 (it names the
 * issue and its folder and points at the skill); `command` is `codex` with the prompt as one quoted
 * argument, the interactive form. `codex exec '<prompt>'` is the headless form. `skill` is the Do
 * next step skill in effect (`useFlowSkill("do")`); left out, the built-in one.
 */
export function codexCommand(
  issue: ResumeIssue,
  skill?: string,
): {
  prompt: string;
  command: string;
} {
  return agentCommand("codex", issue, skill);
}

// ---------------------------------------------------------------- the live bridge

type RunsCache = CodexRun[] | undefined;

/** Put a run into a cached list: replace the run with the same id, or add it at the front. */
function upsert(list: RunsCache, run: CodexRun): CodexRun[] | undefined {
  if (!list) return undefined;
  return list.some((r) => r.id === run.id)
    ? list.map((r) => (r.id === run.id ? run : r))
    : [run, ...list];
}

/** A run moved: write it into the cached lists, or ask for them when they are not cached yet. */
function applyRun(run: CodexRun) {
  for (const key of [qk.codexRuns(run.issue), qk.codexRuns()]) {
    const cached = queryClient.getQueryData<CodexRun[]>(key);
    if (cached) queryClient.setQueryData(key, upsert(cached, run));
    else void queryClient.invalidateQueries({ queryKey: key });
  }
}

// ---------------------------------------------------------------- runs on a bridge

/** The runs of the connected bridge. The mock server knows nothing of them, so they are kept here. */
const bridgeRuns = new Map<string, CodexRun>();
/** The runs whose output is being followed, so none is followed twice. */
const followers = new Map<string, AbortController>();
/** How often the last line the agent printed reaches the screen (ms). */
const LINE_MS = 200;
/** Bridge runs kept for the lists. */
const KEEP_BRIDGE_RUNS = 30;

const LOST = "The bridge does not answer. Is it still running?";

/** Why a run ended the way it did. Nothing to say about a run that is done. */
function endedReason(agent: AgentKind, end: Pick<BridgeRun, "status" | "code" | "signal">) {
  if (end.status === "cancelled") return "Stopped before the task finished.";
  if (end.status !== "failed") return undefined;
  if (end.signal) return `${agentName(agent)} was stopped by ${end.signal}.`;
  if (typeof end.code === "number") return `${agentName(agent)} exited with code ${end.code}.`;
  return `${agentName(agent)} did not start.`;
}

/**
 * A bridge run as the dashboard's run. It has no phases of its own: `running`, then `done`,
 * `failed` or `cancelled`; `lastLine` is what the agent printed last.
 */
export function fromBridgeRun(run: BridgeRun): CodexRun {
  const reason = endedReason(run.agent, run);
  return {
    id: run.id,
    issue: run.issue,
    kind: "next_step",
    status: run.status,
    by: run.agent,
    agent: run.agent,
    source: "bridge",
    phases: [],
    started_at: run.startedAt,
    ...(run.finishedAt ? { finished_at: run.finishedAt } : {}),
    ...(reason ? { reason } : {}),
    ...(run.lastLine ? { lastLine: run.lastLine } : {}),
  };
}

/** Forget the bridge runs and stop following them. For tests; a page reload does the same. */
export function forgetBridgeRuns() {
  for (const controller of followers.values()) controller.abort();
  followers.clear();
  bridgeRuns.clear();
}

/** Keep a bridge run and put it into the cached lists. */
function remember(run: CodexRun) {
  bridgeRuns.set(run.id, run);
  for (const old of [...bridgeRuns.keys()].slice(
    0,
    Math.max(0, bridgeRuns.size - KEEP_BRIDGE_RUNS),
  ))
    bridgeRuns.delete(old);
  applyRun(run);
}

/**
 * The server's runs and the bridge's, newest first. The mock server and `wf serve` know nothing of
 * the runs on a bridge, so every read of the lists goes through this.
 */
export function withBridgeRuns(list: CodexRun[], issue?: IssueId): CodexRun[] {
  const mine = [...bridgeRuns.values()].filter((r) => !issue || r.issue === issue);
  if (mine.length === 0) return list;
  return [...mine, ...list].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/** Follow a bridge run's output into the cached lists until it ends. */
function followBridgeRun(token: string, first: CodexRun) {
  if (followers.has(first.id)) return;
  const controller = new AbortController();
  followers.set(first.id, controller);
  let run = first;
  let pending: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const move = (patch: Partial<CodexRun>) => {
    run = { ...run, ...patch };
    remember(run);
  };
  const flush = () => {
    timer = undefined;
    if (pending === undefined) return;
    const lastLine = pending;
    pending = undefined;
    move({ lastLine });
  };
  bridge
    .follow(
      token,
      first.id,
      {
        onLine: (text) => {
          pending = text.slice(0, 200);
          timer ??= setTimeout(flush, LINE_MS);
        },
        onExit: (exit) => {
          clearTimeout(timer);
          timer = undefined;
          const reason = endedReason(run.agent, exit);
          move({
            ...(pending === undefined ? {} : { lastLine: pending }),
            status: exit.status,
            finished_at: new Date().toISOString(),
            ...(reason ? { reason } : {}),
          });
          pending = undefined;
        },
      },
      controller.signal,
    )
    .catch((err) => {
      clearTimeout(timer);
      if (controller.signal.aborted) return;
      // The stream broke before the run's end: the bridge went away.
      move({
        status: "failed",
        finished_at: new Date().toISOString(),
        reason: `Lost the bridge. ${agentName(run.agent)} may still be working on your computer.`,
      });
      if (err instanceof BridgeUnreachableError) agentStore.markLost(LOST);
    })
    .finally(() => followers.delete(first.id));
}

/** Start a run on the connected bridge and follow it. */
async function startOnBridge(issueId: IssueId, kind: CodexRunKind): Promise<CodexRun> {
  const token = agentStore.token();
  if (!token) throw new AgentNotConnectedError("lost");
  try {
    const run = fromBridgeRun(await bridge.startRun(token, issueId, kind));
    remember(run);
    followBridgeRun(token, run);
    return run;
  } catch (err) {
    // A bridge that is gone, or that forgot the token, is not a failed run: the agent is lost.
    if (err instanceof BridgeUnreachableError) {
      agentStore.markLost(LOST);
      throw new AgentNotConnectedError("lost");
    }
    if (err instanceof BridgeError && err.status === 401) {
      agentStore.markLost("The bridge was restarted. Connect the agent again.", true);
      throw new AgentNotConnectedError("lost");
    }
    throw err;
  }
}

/** The bridge's runs after a (re)connect: earlier ones for the lists, running ones followed. */
async function syncBridgeRuns(token: string) {
  try {
    const listed = await bridge.listRuns(token);
    // Oldest first, so each lands in front of the one before and the newest ends up on top.
    for (const listedRun of [...listed].reverse()) {
      const run = fromBridgeRun(listedRun);
      if (bridgeRuns.has(run.id)) continue;
      remember(run);
      if (run.status === "running") followBridgeRun(token, run);
    }
  } catch {
    // The connection check reports a bridge that is gone.
  }
}

let syncedFor: string | undefined;
function onAgentChange() {
  const connection = agentStore.get();
  const token = agentStore.token();
  if (connection.status === "none") syncedFor = undefined;
  if (connection.status !== "connected" || connection.mode !== "bridge" || !token) return;
  if (token === syncedFor) return;
  syncedFor = token;
  void syncBridgeRuns(token);
}
agentStore.subscribe(onAgentChange);
onAgentChange();

let retained = 0;
let release: (() => void) | undefined;

/**
 * Subscribe to the mock server's Codex stream: runs land in the cached lists, and an issue's
 * delivery data is read again when it changes. Returns the stop function. `wf serve` has no such
 * stream, so there the queries poll instead (see `useCodexRuns`).
 */
export function connectCodexLive(): (() => void) | undefined {
  if (isRealApi) return undefined;
  let cancelled = false;
  let off: (() => void) | undefined;
  void loadMock().then((mock) => {
    if (cancelled) return;
    off = mock.subscribeCodex((e) => {
      if (e.event === "run") applyRun(e.run);
      else void queryClient.invalidateQueries({ queryKey: qk.delivery(e.issue) });
    });
  });
  return () => {
    cancelled = true;
    off?.();
  };
}

/**
 * Follow Codex while a component is mounted: runs and delivery data refresh as they change. The
 * subscription is shared and counted, so any number of hooks cost one listener.
 */
export function useCodexLive(): void {
  useEffect(() => {
    retained += 1;
    if (retained === 1) release = connectCodexLive();
    return () => {
      retained -= 1;
      if (retained === 0) {
        release?.();
        release = undefined;
      }
    };
  }, []);
}

// ---------------------------------------------------------------- reads

const NO_RUNS: CodexRun[] = [];

/** Real server: no stream for runs, so poll while one is going. */
const POLL_MS = 2000;

/**
 * Runs of one issue, or of all, newest first. An empty list until the first read. The list follows
 * a run phase by phase while it is mounted (a bridge run: its last line, then its end).
 */
export function useCodexRuns(issueId?: IssueId): CodexRun[] {
  useCodexLive();
  const runs = useQuery({
    queryKey: qk.codexRuns(issueId),
    queryFn: async () => withBridgeRuns(await api.codexRuns(issueId), issueId),
    refetchInterval: isRealApi
      ? (query) => (query.state.data?.some((r) => r.status === "running") ? POLL_MS : false)
      : false,
  });
  return runs.data ?? NO_RUNS;
}

// ---------------------------------------------------------------- writes

function explain(err: unknown) {
  if (isUnprocessableError(err)) {
    toast.error(firstProblem(err).message);
    return;
  }
  if (err instanceof NotFoundError) {
    toast.error("That issue or run no longer exists.");
    return;
  }
  // The bridge words its refusals in plain sentences ("Codex is already working on wf-3k9x2.").
  if (err instanceof BridgeError) {
    toast.error(err.message);
    return;
  }
  toast.error(`Could not reach ${agentName(agentStore.preferred())}`, {
    description: err instanceof Error ? err.message : "Try again in a moment.",
  });
}

export interface CodexRunControls {
  /**
   * Start a run by the connected agent. Resolves to the run: check `status`, because a run with
   * nothing to do ends at once as `nothing_ready` with a `reason` to show ("The issue is done.",
   * "Waiting on wf-r6jk2: it is not done."). An issue without a plan is not refused: the run plans
   * it first. A bridge run has no phases: it is `running` with a `lastLine`, then `done` or
   * `failed`. Resolves to `undefined` after a toast when the request itself failed, for example
   * when the issue already has an active run.
   *
   * Rejects with `AgentNotConnectedError`, and shows nothing, when no agent is connected (or the
   * bridge was lost): open the connect flow, then call `start` again.
   */
  start: (issueId: IssueId, kind: CodexRunKind) => Promise<CodexRun | undefined>;
  /** Stop an active run and release its claim. Resolves to the cancelled run. */
  cancel: (runId: string) => Promise<CodexRun | undefined>;
}

export function useStartCodexRun(): CodexRunControls {
  const start = useCallback(async (issueId: IssueId, kind: CodexRunKind) => {
    const agent = agentStore.get();
    if (agent.status !== "connected" || !agent.agent)
      throw new AgentNotConnectedError(agent.status === "connected" ? "none" : agent.status);
    try {
      if (agent.mode === "bridge") return await startOnBridge(issueId, kind);
      const run = await api.startCodexRun(issueId, kind, agent.agent);
      applyRun(run);
      return run;
    } catch (err) {
      if (err instanceof AgentNotConnectedError) throw err;
      explain(err);
      return undefined;
    }
  }, []);

  const cancel = useCallback(async (runId: string) => {
    try {
      const known = bridgeRuns.get(runId);
      if (known) {
        const token = agentStore.token();
        if (!token) throw new AgentNotConnectedError("lost");
        const stopped = fromBridgeRun(await bridge.cancel(token, runId));
        const run = { ...known, ...stopped, lastLine: stopped.lastLine ?? known.lastLine };
        remember(run);
        return run;
      }
      const run = await api.cancelCodexRun(runId);
      applyRun(run);
      return run;
    } catch (err) {
      explain(err);
      return undefined;
    }
  }, []);

  return useMemo(() => ({ start, cancel }), [start, cancel]);
}
