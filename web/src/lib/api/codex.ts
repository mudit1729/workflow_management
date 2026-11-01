// Codex from the browser (plan D3, D4).
//  - `codexCommand` is the text "Open in Codex" copies: the resume prompt of format.md section 15,
//    which names the issue and the folder. The installed wf skills do the rest, so the command
//    never goes stale.
//  - `useStartCodexRun` starts and stops a background "Do next step" run; `useCodexRuns` lists the
//    runs and follows them live. A run's edits reach the board through the ordinary live stream,
//    because each phase is a real markdown edit; the run itself and its git and CI data have
//    their own small stream, which the hooks below subscribe to.
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { IssueId } from "@/gen/types";
import { api } from "./client";
import { firstProblem, isUnprocessableError, NotFoundError } from "./error";
import { qk } from "./keys";
import { isRealApi, loadMock } from "./mock-bridge";
import { queryClient } from "./query-client";
import { type ResumeIssue, resumeCommand, resumePrompt } from "./resume";
import type { CodexRun, CodexRunKind } from "./types";

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
  return { prompt: resumePrompt(issue, skill), command: resumeCommand(issue, skill) };
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
 * a run phase by phase while it is mounted.
 */
export function useCodexRuns(issueId?: IssueId): CodexRun[] {
  useCodexLive();
  const runs = useQuery({
    queryKey: qk.codexRuns(issueId),
    queryFn: () => api.codexRuns(issueId),
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
  toast.error("Could not reach Codex", {
    description: err instanceof Error ? err.message : "Try again in a moment.",
  });
}

export interface CodexRunControls {
  /**
   * Start a run. Resolves to the run: check `status`, because a run with nothing to do ends at once
   * as `nothing_ready` with a `reason` to show ("The issue is done.", "Waiting on wf-r6jk2: it is
   * not done."). An issue without a plan is not refused: the run plans it first. Resolves to
   * `undefined` after a toast when the request itself failed, for example when the issue already
   * has an active run.
   */
  start: (issueId: IssueId, kind: CodexRunKind) => Promise<CodexRun | undefined>;
  /** Stop an active run and release its claim. Resolves to the cancelled run. */
  cancel: (runId: string) => Promise<CodexRun | undefined>;
}

export function useStartCodexRun(): CodexRunControls {
  const start = useCallback(async (issueId: IssueId, kind: CodexRunKind) => {
    try {
      const run = await api.startCodexRun(issueId, kind);
      applyRun(run);
      return run;
    } catch (err) {
      explain(err);
      return undefined;
    }
  }, []);

  const cancel = useCallback(async (runId: string) => {
    try {
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
