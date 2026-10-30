// A run goes on after the person leaves the screen that started it: from the board's card menu
// or the palette the strip in the issue header may not be on screen at all. `followRun` waits for
// the run to end and says so in one toast, whichever button started the run.
//
// One announcement per event: while a `CodexActions` strip of the issue is on screen the strip says
// how the run ended ("Done: T-4", or the reason), so the toast stays quiet; with no strip (the
// board, the palette, another issue's page) the toast is the one line that reaches the person.
//
// The mock stream and the polling of mounted `useCodexRuns` hooks carry the updates. `wf serve`
// has no stream, so a run started there is announced while a hook polls it.
import { toast } from "sonner";
import type { IssueId } from "@/gen/types";
import { type CodexRun, connectCodexLive, qk, queryClient } from "@/lib/api";
import type { IssueTab } from "@/lib/nav";
import type { CodexIssue } from "./open-in-codex";

/** Same shape as `useOpenIssue()` returns. */
export type OpenIssue = (id: IssueId, opts?: { tab?: IssueTab }) => unknown;

const GIVE_UP_MS = 10 * 60_000;

// ---------------------------------------------------------------- who shows the result

/** Strips on screen per issue (the drawer and the page can show the same issue at once). */
const strips = new Map<IssueId, number>();

/** A header strip of the issue is on screen. Returns what to call when it goes away. */
export function holdStrip(issue: IssueId): () => void {
  strips.set(issue, (strips.get(issue) ?? 0) + 1);
  return () => {
    const left = (strips.get(issue) ?? 1) - 1;
    if (left > 0) strips.set(issue, left);
    else strips.delete(issue);
  };
}

/** The strip of the issue says how a run ended, so a toast would say it twice. */
export const stripShows = (issue: IssueId): boolean => strips.has(issue);

function find(id: string, issue: IssueId): CodexRun | undefined {
  for (const key of [qk.codexRuns(), qk.codexRuns(issue)]) {
    const hit = queryClient.getQueryData<CodexRun[]>(key)?.find((r) => r.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Say how the run ended, once. A cancel is the person's own act and needs no toast, and a strip
 * on screen already says the rest.
 */
export function announce(run: CodexRun, issue: CodexIssue, openIssue: OpenIssue) {
  if (stripShows(issue.id)) return;
  const task = run.task ?? "the task";
  if (run.status === "done") {
    toast(`Codex finished ${task}`, {
      description: `${issue.id} · ${issue.title}`,
      action: { label: "Open log", onClick: () => void openIssue(issue.id, { tab: "log" }) },
    });
  } else if (run.status === "failed") {
    toast.error(`Codex failed on ${task}`, {
      description: run.reason,
      action: { label: "Open plan", onClick: () => void openIssue(issue.id, { tab: "plan" }) },
    });
  }
}

/** Follow a run that was just started until it ends. */
export function followRun(run: CodexRun, issue: CodexIssue, openIssue: OpenIssue): void {
  if (run.status !== "running") return;
  // Hold the mock stream open: no hook may be mounted while the person is on another page.
  const stopLive = connectCodexLive();
  let off = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    off();
    stopLive?.();
    clearTimeout(timer);
  };
  off = queryClient.getQueryCache().subscribe(() => {
    const now = find(run.id, issue.id);
    if (!now || now.status === "running") return;
    stop();
    announce(now, issue, openIssue);
  });
  timer = setTimeout(stop, GIVE_UP_MS);
}
