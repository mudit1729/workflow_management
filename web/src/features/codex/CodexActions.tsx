// CodexActions (plan D3, D4): "Open in Codex" and "Do next step", side by side in the issue header.
//
//  - Open in Codex copies the command and shows the prompt (see OpenInCodex).
//  - Do next step starts a background run. While it runs, the button's slot shows the live phase,
//    a progress pulse and Cancel; a run with nothing to do says why on a line below, with a way to
//    the Plan tab. The result of a run is not shown here: it is markdown in the issue (the task, a
//    change entry), a commit and a CI run, which the Plan, Log, Git and CI tabs show.
import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useIssueTab } from "@/lib/nav";
import { OpenInCodex } from "./OpenInCodex";
import type { CodexIssue } from "./open-in-codex";
import { RunNotice, RunStatus } from "./RunStatus";
import { RunsPopover } from "./RunsPopover";
import { useCodexIssue } from "./use-codex";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

function nextStepHint(issue: CodexIssue): string {
  const base =
    "Codex does the next ready task in the background: it claims the task, logs the change, runs CI and finishes it.";
  const ready = issue.progress?.tasks.ready;
  if (ready === undefined) return base;
  return ready === 0
    ? `${base} No task is ready right now.`
    : `${base} ${ready} ${ready === 1 ? "task is" : "tasks are"} ready.`;
}

export interface CodexActionsProps {
  issue: CodexIssue;
  className?: string;
}

export function CodexActions({ issue, className }: CodexActionsProps) {
  const { runs, active, outcome, starting, start, cancel, dismiss } = useCodexIssue(issue);
  const { setTab } = useIssueTab();

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
      className={cn("@container flex min-w-0 flex-col gap-1.5", className)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <OpenInCodex issue={issue} compact={slot !== undefined} />
        {slot ? (
          <RunStatus
            run={slot}
            onCancel={cancel}
            onOpenLog={() => openTab("log")}
            className="@max-[440px]:min-w-0"
          />
        ) : (
          <Tooltip content={nextStepHint(issue)}>
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
        <RunsPopover runs={runs} onOpenTab={openTab} yield={slot !== undefined} />
      </div>
      {notice && (
        <RunNotice
          run={notice}
          onOpenPlan={() => {
            openTab("plan");
            dismiss();
          }}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
