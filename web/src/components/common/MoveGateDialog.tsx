// The status gate, rendered once by the shell. Two cases:
// - illegal: the move is not in the transition table; "Move anyway" forces it.
// - done_gate: moving to done with open gaps (contract 1.6); lists them before confirming.
import {
  ArrowRight,
  CircleAlert,
  CircleDashed,
  ListChecks,
  Lock,
  MessageCircleQuestionMark,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button, Dialog, DialogContent, DialogFooter } from "@/components/ui";
import type { IssueStatus } from "@/gen/types";
import { useMoveGate } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/status";
import { StatusIcon } from "./StatusIcon";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

function gapIcon(gap: string): ReactNode {
  if (/criteri/i.test(gap)) return <CircleDashed {...ICON} />;
  if (/task/i.test(gap)) return <ListChecks {...ICON} />;
  if (/lease/i.test(gap)) return <Lock {...ICON} />;
  if (/needs-you|request/i.test(gap)) return <MessageCircleQuestionMark {...ICON} />;
  return <CircleAlert {...ICON} />;
}

function Transition({ from, to }: { from?: IssueStatus; to?: IssueStatus }) {
  if (!from || !to) return null;
  return (
    <div className="flex items-center gap-2 text-fg text-sm">
      <span className="inline-flex items-center gap-1.5">
        <StatusIcon status={from} />
        {STATUS_LABEL[from]}
      </span>
      <ArrowRight aria-hidden size={14} strokeWidth={1.75} className="text-fg-faint" />
      <span className="inline-flex items-center gap-1.5">
        <StatusIcon status={to} />
        {STATUS_LABEL[to]}
      </span>
    </div>
  );
}

export function MoveGateDialog() {
  const gate = useMoveGate();
  // Keep the last content while the dialog animates out, so it does not go blank.
  const last = useRef(gate);
  if (gate.open) last.current = gate;
  const g = gate.open ? gate : last.current;
  const issue = g.issue;
  const subject = issue ? `${issue.id} · ${issue.title}` : undefined;

  // The gate opens from the store, not from a Radix trigger, so Radix has nowhere to return focus
  // to and it would land on <body> (and the board's key bindings lose their anchor). Send it back
  // to the card of the issue that was being moved, else to the page's status control.
  const restoreFocus = (e: Event) => {
    e.preventDefault();
    const id = last.current.issue?.id;
    const card = [...document.querySelectorAll<HTMLElement>('[data-wf="IssueCard"]')].find(
      (el) => el.dataset.issueId === id,
    );
    const target =
      card?.querySelector<HTMLElement>("[data-card-link]") ??
      document.querySelector<HTMLElement>('[data-wf="StatusSelect"]');
    target?.focus({ preventScroll: true });
  };

  return (
    <Dialog
      open={gate.open}
      onOpenChange={(o) => {
        if (!o) gate.cancel();
      }}
    >
      {g.kind === "illegal" ? (
        <DialogContent
          data-wf="MoveGateDialog"
          size="sm"
          hideClose
          title="Move not allowed"
          description={subject}
          onCloseAutoFocus={restoreFocus}
        >
          <div className="flex flex-col gap-3">
            <Transition from={issue?.status} to={g.to} />
            <p className="text-base text-fg-muted">{g.reason}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => gate.cancel()}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => gate.confirm()}>
              Move anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : (
        <DialogContent
          data-wf="MoveGateDialog"
          size="sm"
          hideClose
          title="Move to Done with open gaps?"
          description={subject}
          onCloseAutoFocus={restoreFocus}
        >
          <ul className="flex flex-col gap-1.5">
            {g.gaps.map((gap: string) => (
              <li key={gap} className="flex items-start gap-2 text-base text-fg">
                <span aria-hidden className="mt-0.5 flex shrink-0 text-fg-muted">
                  {gapIcon(gap)}
                </span>
                <span className="min-w-0">{gap}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-fg-muted text-sm">
            <TriangleAlert aria-hidden size={14} strokeWidth={1.75} className="text-stale" />
            Lint will flag this as drift (Q001).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => gate.cancel()}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => gate.confirm()}>
              Move to Done anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
