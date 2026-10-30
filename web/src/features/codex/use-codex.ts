// The state behind the Codex buttons. One hook per place: the issue header (`useCodexIssue`), the
// board card (`useCardRun`) and the card's menu (`useNextStep`). All three read the same runs from
// the data layer, so a run started in one place shows in the others.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type CodexRun, useCodexRuns, useStartCodexRun } from "@/lib/api";
import { useOpenIssue } from "@/lib/nav";
import { followRun, holdStrip, type OpenIssue } from "./follow-run";
import type { CodexIssue } from "./open-in-codex";
import { activeRun, reasonAction } from "./run-copy";

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
    const run = await start(issue.id, "next_step");
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
 * True while Codex works on the issue, and a moment after it stops. Codex writes `current_state.md`
 * last, so during a run the log is ahead of it by design (Q005); the header and the Now tab hold
 * that signal back until the run is over and the issue has been read again, so nothing above the
 * tabs appears and disappears while the run goes.
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
  /** True while Codex works on the issue. */
  busy: boolean;
  /** Start the next step; a run with nothing to do is explained in a toast. */
  start: () => Promise<CodexRun | undefined>;
  /** Stop the run that goes on the issue. Does nothing when none does; a cancel gives no toast. */
  cancel: () => Promise<void>;
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
    const run = await start(issue.id, "next_step");
    if (!run) return run;
    if (run.status === "running") followRun(run, issue, openIssue);
    else if (run.status === "nothing_ready") explainNothingReady(run, issue, openIssue);
    return run;
  }, [start, issue, openIssue]);

  const stop = useCallback(async () => {
    if (goingId) await cancel(goingId);
  }, [goingId, cancel]);

  return { busy, start: begin, cancel: stop };
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
