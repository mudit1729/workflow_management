// CodexActions (plan D3, D4, D12): "Open in Codex" and "Do next step", side by side in the issue
// header. Both follow the connected agent: "Open in Claude Code" copies `claude '…'`.
//
//  - Open in Codex copies the command and shows the prompt (see OpenInCodex).
//  - Do next step starts a background run. While it runs, the button's slot shows the live phase,
//    a progress pulse and Cancel (a run on a real bridge: "Running on <host>" and the last line the
//    agent printed); a run with nothing to do says why on a line below, with a way to the tab that
//    answers it. When the run ends the slot says how ("Done: T-4", Open log) for a few seconds, and
//    that is the one announcement: the end-of-run toast stays quiet while this strip is on screen
//    (see follow-run.ts). With no agent connected the click opens the connect flow instead and the
//    run starts after it. What the run did is markdown in the issue (the plan, the task, a change
//    entry), a commit and a CI run, which the Plan, Log, Git and CI tabs show.
//  - `children` are more buttons for the same row, such as the header's Copy context.
import { Play } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button, Tooltip } from "@/components/ui";
import { type AgentConnection, agentName, useAgent } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useIssueTab } from "@/lib/nav";
import { OpenInCodex } from "./OpenInCodex";
import type { CodexIssue } from "./open-in-codex";
import { RunNotice, RunStatus } from "./RunStatus";
import { RunsPopover } from "./RunsPopover";
import { useCodexIssue } from "./use-codex";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/**
 * What the button does right now. Without a connected agent it says so: the click connects one. An
 * issue without a plan has no task to claim, so its next step is the plan (`planning-issues`, as
 * `doing-next-step` step 3 says); otherwise it is the next ready task.
 */
export function nextStepHint(issue: CodexIssue, agent: AgentConnection): string {
  const name = agentName(agent.agent ?? "codex");
  if (agent.status === "lost")
    return `${name} stopped answering. The click opens the agent panel, where you can reconnect.`;
  if (agent.status !== "connected")
    return "Needs a connected agent. The click connects one, then starts the next step.";
  const tasks = issue.progress?.tasks;
  if (tasks?.total === 0)
    return `This issue has no plan yet. ${name} writes plan.md from the criteria first, then claims T-1, logs the change, runs CI and finishes it.`;
  const base = `${name} does the next ready task in the background: it claims the task, logs the change, runs CI and finishes it.`;
  if (tasks === undefined) return base;
  return tasks.ready === 0
    ? `${base} No task is ready right now.`
    : `${base} ${tasks.ready} ${tasks.ready === 1 ? "task is" : "tasks are"} ready.`;
}

export interface CodexActionsProps {
  issue: CodexIssue;
  /** More buttons for the same row, after the strip. */
  children?: ReactNode;
  className?: string;
}

export function CodexActions({ issue, children, className }: CodexActionsProps) {
  const { runs, active, outcome, starting, start, cancel, dismiss } = useCodexIssue(issue);
  const { setTab } = useIssueTab();
  const agent = useAgent();

  // Short results take the button's slot; a reason is a sentence and gets its own line.
  const slot =
    active ?? (outcome?.status === "done" || outcome?.status === "cancelled" ? outcome : undefined);
  const notice =
    !active && (outcome?.status === "nothing_ready" || outcome?.status === "failed")
      ? outcome
      : undefined;
  const openTab = (tab: Parameters<typeof setTab>[0]) => void setTab(tab);

  // A key press on a control that then goes away (the button, Cancel, Dismiss) would drop focus to
  // the page. The strip takes it while a run goes, and the button gets it back when the strip goes.
  const root = useRef<HTMLDivElement>(null);
  const byKey = useRef(false);
  useEffect(() => {
    const leave = () => {
      byKey.current = false;
    };
    const elsewhere = (e: FocusEvent) => {
      if (!root.current?.contains(e.target as Node)) byKey.current = false;
    };
    document.addEventListener("pointerdown", leave, true);
    document.addEventListener("focusin", elsewhere);
    return () => {
      document.removeEventListener("pointerdown", leave, true);
      document.removeEventListener("focusin", elsewhere);
    };
  }, []);
  // Every render: cheap, and the loss of focus is only visible after the commit.
  useEffect(() => {
    const el = root.current;
    if (!byKey.current || !el || document.activeElement !== document.body) return;
    const strip = el.querySelector<HTMLElement>("[data-run-focus]");
    const button = el.querySelector<HTMLElement>('[data-wf="DoNextStepButton"]:not(:disabled)');
    (strip ?? button)?.focus({ preventScroll: true });
  });

  return (
    <div
      ref={root}
      data-wf="CodexActions"
      data-busy={active ? "" : undefined}
      // detail is 0 for a click from the keyboard (Enter or Space on a button).
      onClickCapture={(e) => {
        byKey.current = e.detail === 0;
      }}
      className={cn("group/codex @container flex min-w-0 flex-col gap-1.5", className)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <OpenInCodex issue={issue} compact={slot !== undefined} />
        {slot ? (
          <RunStatus
            run={slot}
            host={agent.host}
            onCancel={cancel}
            onOpenLog={() => openTab("log")}
            className="@max-[440px]:min-w-0"
          />
        ) : (
          <Tooltip content={nextStepHint(issue, agent)}>
            <Button
              data-wf="DoNextStepButton"
              variant="secondary"
              onClick={start}
              disabled={starting}
              aria-busy={starting || undefined}
            >
              <Play {...ICON} className="fill-current" />
              Do next step
            </Button>
          </Tooltip>
        )}
        {children}
        <RunsPopover runs={runs} onOpenTab={openTab} yield={slot !== undefined} />
      </div>
      {notice && (
        <RunNotice
          run={notice}
          onOpen={(tab) => {
            openTab(tab);
            dismiss();
          }}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
