// The state behind the Codex buttons. One hook per place: the issue header (`useCodexIssue`), the
// board card (`useCardRun`) and the card's menu (`useNextStep`). All three read the same runs from
// the data layer, so a run started in one place shows in the others.
//
// Do next step needs a connected agent (plan D12). Where none is, the click is not an error: it
// opens the connect flow, which remembers the issue and starts the run once the agent is
// connected (`askToConnect`, `useResumeNextStep`). An agent that was lost opens the Agent panel
// instead, where Reconnect is. Nothing is toasted for either: the dialog is the answer.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type AgentThen, openAgent, openAgentPanel } from "@/app/shell-store";
import type { IssueId } from "@/gen/types";
import {
  AgentNotConnectedError,
  type CodexRun,
  type CodexRunKind,
  useCodexRuns,
  useIssueMap,
  useStartCodexRun,
} from "@/lib/api";
import { useOpenIssue } from "@/lib/nav";
import { followRun, holdStrip, type OpenIssue } from "./follow-run";
import type { CodexIssue } from "./open-in-codex";
import { activeRun, reasonAction } from "./run-copy";

/**
 * No agent can run it: open the connect flow, with the run to start when the agent is connected
 * (a pairing in progress is picked up where it was), or the Agent panel for an agent that was lost.
 */
export function askToConnect(
  issueId: IssueId,
  kind: CodexRunKind,
  status: "none" | "pairing" | "lost",
) {
  const then: AgentThen = { issueId, kind };
  if (status === "lost") openAgentPanel({ then });
  else openAgent({ then });
}

/** `start`, except that a missing agent asks to be connected and resolves to nothing. */
async function startOrConnect(
  start: (issueId: IssueId, kind: CodexRunKind) => Promise<CodexRun | undefined>,
  issueId: IssueId,
  kind: CodexRunKind,
): Promise<CodexRun | undefined> {
  try {
    return await start(issueId, kind);
  } catch (err) {
    if (!(err instanceof AgentNotConnectedError)) throw err;
    askToConnect(issueId, kind, err.status);
    return undefined;
  }
}

/** How long the end of a run stays on screen (ms). A reason the person must read stays longer. */
const SHOW_DONE_MS = 6000;
const SHOW_REASON_MS = 90_000;
const FLASH_DONE_MS = 4000;

/**
 * The run that is going, and a callback for the moment one ends. A run ends when the one this hook
 * saw running is no longer running; a run that was over before the hook mounted is not an event.
 */
function useActiveRun(runs: readonly CodexRun[], onEnd: (run: CodexRun) => void) {
  const active = activeRun(runs);
  const seen = useRef<string | undefined>(undefined);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });
  useEffect(() => {
    if (active) {
      seen.current = active.id;
      return;
    }
    const id = seen.current;
    seen.current = undefined;
    const ended = id ? runs.find((r) => r.id === id) : undefined;
    if (ended) onEndRef.current(ended);
  }, [active, runs]);
  return active;
}

export interface CodexIssueState {
  runs: CodexRun[];
  /** The run in progress. */
  active?: CodexRun;
  /** How the last run ended, until the person dismisses it or it times out. */
  outcome?: CodexRun;
  /** The request is on its way and no run exists yet. */
  starting: boolean;
  start: () => void;
  cancel: () => void;
  dismiss: () => void;
}

/** Everything the issue header needs: the runs of one issue, start, cancel and the last outcome. */
export function useCodexIssue(issue: CodexIssue): CodexIssueState {
  const runs = useCodexRuns(issue.id);
  const { start, cancel } = useStartCodexRun();
  const openIssue = useOpenIssue();
  const [starting, setStarting] = useState(false);
  const [outcome, setOutcome] = useState<CodexRun | undefined>();

  const active = useActiveRun(runs, setOutcome);

  // While this strip is on screen it says how a run ended, so the end of a run needs no toast.
  useEffect(() => holdStrip(issue.id), [issue.id]);

  // The end of a run does not stay for ever: a result is a moment, a reason is a message.
  useEffect(() => {
    if (!outcome) return;
    const ms =
      outcome.status === "done" || outcome.status === "cancelled" ? SHOW_DONE_MS : SHOW_REASON_MS;
    const timer = setTimeout(() => setOutcome(undefined), ms);
    return () => clearTimeout(timer);
  }, [outcome]);

  const begin = useCallback(async () => {
    setStarting(true);
    setOutcome(undefined);
    const run = await startOrConnect(start, issue.id, "next_step");
    setStarting(false);
    if (!run) return;
    if (run.status === "running") followRun(run, issue, openIssue);
    else setOutcome(run);
  }, [start, issue, openIssue]);

  const stop = useCallback(() => {
    if (active) void cancel(active.id);
  }, [active, cancel]);

  return {
    runs,
    active,
    outcome,
    starting,
    start: () => void begin(),
    cancel: stop,
    dismiss: () => setOutcome(undefined),
  };
}

/**
 * The run to show on an issue's card: the one going, and for a moment after it the run that just
 * finished. Reads the runs of every issue, a single shared query for the whole board.
 */
export function useCardRun(issueId: string): CodexRun | undefined {
  const runs = useCodexRuns();
  const [flash, setFlash] = useState<CodexRun | undefined>();
  const mine = useMemo(() => runs.filter((r) => r.issue === issueId), [runs, issueId]);
  const active = useActiveRun(mine, (run) => {
    if (run.status === "done") setFlash(run);
  });

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(undefined), FLASH_DONE_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  return active ?? flash;
}

/** After a run ends the issue is read again; this long the screens still wait for that read. */
const SETTLE_MS = 1500;

/**
 * True while the agent works on the issue, and a moment after it stops. The agent writes
 * `current_state.md` last, so during a run the log is ahead of it by design (Q005); the header and
 * the Now tab hold that signal back until the run is over and the issue has been read again, so
 * nothing above the tabs appears and disappears while the run goes.
 */
export function useRunActive(issueId: string): boolean {
  const going = activeRun(useCodexRuns(issueId)) !== undefined;
  const [settling, setSettling] = useState(false);
  const was = useRef(going);
  useEffect(() => {
    const ended = was.current && !going;
    was.current = going;
    if (!ended) return;
    setSettling(true);
    const timer = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [going]);
  return going || settling;
}

export interface NextStep {
  /** True while an agent works on the issue. */
  busy: boolean;
  /** The run that goes on the issue: it names the agent that does it. */
  run?: CodexRun;
  /**
   * Start the next step; a run with nothing to do is explained in a toast. With no agent
   * connected it opens the connect flow instead (the Agent panel for a lost one) and resolves to
   * nothing: the run starts when the agent is connected.
   */
  start: () => Promise<CodexRun | undefined>;
  /** Stop the run that goes on the issue. Does nothing when none does; a cancel gives no toast. */
  cancel: () => Promise<void>;
}

/** Start the next step of an issue from a place with no strip, and say what the strip would. */
async function runNextStep(
  issue: CodexIssue,
  start: (issueId: IssueId, kind: CodexRunKind) => Promise<CodexRun | undefined>,
  openIssue: OpenIssue,
): Promise<CodexRun | undefined> {
  const run = await startOrConnect(start, issue.id, "next_step");
  if (!run) return run;
  if (run.status === "running") followRun(run, issue, openIssue);
  else if (run.status === "nothing_ready") explainNothingReady(run, issue, openIssue);
  return run;
}

/**
 * "Do next step" from a place that has no strip (the card menu, the palette). Starting is the whole
 * answer: the card shows the run, one toast says when it ends (the same toast whichever button
 * started the run, unless the issue's own strip is on screen and says it), and a run with nothing
 * to do says why at once. While a run goes, `cancel` stops it from the same place. Without an
 * issue (the palette with nothing open) it is idle and `start` and `cancel` do nothing.
 */
export function useNextStep(issue: CodexIssue | undefined): NextStep {
  const runs = useCodexRuns();
  const { start, cancel } = useStartCodexRun();
  const openIssue = useOpenIssue();
  const going = issue
    ? runs.find((r) => r.issue === issue.id && r.status === "running")
    : undefined;
  const busy = going !== undefined;
  const goingId = going?.id;

  const begin = useCallback(async () => {
    if (!issue) return undefined;
    return runNextStep(issue, start, openIssue);
  }, [start, issue, openIssue]);

  const stop = useCallback(async () => {
    if (goingId) await cancel(goingId);
  }, [goingId, cancel]);

  return { busy, run: going, start: begin, cancel: stop };
}

/**
 * The run a connect flow was opened for (`AgentThen`), started now that the agent is connected. The
 * same path as the card menu's Do next step, so the run, its card marker and its one toast are the
 * same. Returns at once; an issue that is gone starts nothing.
 */
export function useResumeNextStep(): (then: AgentThen) => void {
  const issues = useIssueMap();
  const { start } = useStartCodexRun();
  const openIssue = useOpenIssue();
  return useCallback(
    (then) => {
      const issue = issues.get(then.issueId);
      if (issue) void runNextStep(issue, start, openIssue);
    },
    [issues, start, openIssue],
  );
}

function explainNothingReady(run: CodexRun, issue: CodexIssue, openIssue: OpenIssue) {
  const where = reasonAction(run);
  toast(run.reason ?? "No ready task.", {
    description: `${issue.id} · ${issue.title}`,
    action: where
      ? { label: where.label, onClick: () => void openIssue(issue.id, { tab: where.tab }) }
      : undefined,
  });
}
