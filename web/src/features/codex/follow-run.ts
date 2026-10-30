// A run goes on after the person leaves the screen that started it: from the board's card menu
// or the palette the strip in the issue header may not be on screen at all. `followRun` waits for
// the run to end and says so in one toast, whichever button started the run. (The header's strip
// shows the run while it goes; the toast is the one line that reaches the person wherever they are.)
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

function find(id: string, issue: IssueId): CodexRun | undefined {
  for (const key of [qk.codexRuns(), qk.codexRuns(issue)]) {
    const hit = queryClient.getQueryData<CodexRun[]>(key)?.find((r) => r.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Say how the run ended. A cancel is the person's own act and needs no toast. */
function announce(run: CodexRun, issue: CodexIssue, openIssue: OpenIssue) {
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
