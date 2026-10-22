// Status picker. Legal moves look normal; illegal ones are muted with "Needs Move anyway".
// Number keys 1–7 pick a status while the menu is open. Picking goes through useMoveIssue,
// which opens the gate dialog for illegal moves and for the done gate.
import { type KeyboardEvent, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui";
import type { IssueStatus, IssueSummary } from "@/gen/types";
import { useMoveIssue } from "@/lib/api";
import { cn } from "@/lib/cn";
import { isLegalTransition, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { StatusIcon } from "./StatusIcon";

export interface StatusSelectProps {
  issue: IssueSummary;
  size?: "sm" | "md";
  variant?: "pill" | "icon";
  /** Controlled open state, so a hotkey (`s`) can open the menu. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  className?: string;
}

export function StatusSelect({
  issue,
  size = "md",
  variant = "pill",
  open,
  onOpenChange,
  align = "start",
  className,
}: StatusSelectProps) {
  const { move } = useMoveIssue();
  const [innerOpen, setInnerOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const closedAt = useRef(0);
  const isOpen = open ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (!next) closedAt.current = performance.now();
    if (open === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  // Closing the menu returns focus to the trigger; do not pop the tooltip for that.
  const onTipChange = (next: boolean) =>
    setTipOpen(next && performance.now() - closedAt.current > 400);

  const pick = (to: IssueStatus) => {
    setOpen(false);
    if (to !== issue.status) move(issue, to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= STATUS_ORDER.length) {
      e.preventDefault();
      e.stopPropagation();
      pick(STATUS_ORDER[n - 1]);
    }
  };

  const label = STATUS_LABEL[issue.status];
  const sm = size === "sm";
  const trigger =
    variant === "icon" ? (
      <button
        type="button"
        data-wf="StatusSelect"
        aria-label={`Status: ${label}. Change status`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex shrink-0 cursor-default items-center justify-center rounded-sm transition-colors duration-100 hover:bg-muted data-[state=open]:bg-muted",
          sm ? "size-5" : "size-6",
          className,
        )}
      >
        <StatusIcon status={issue.status} size={14} />
      </button>
    ) : (
      <button
        type="button"
        data-wf="StatusSelect"
        aria-label={`Status: ${label}. Change status`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex shrink-0 cursor-default items-center rounded-md border border-border bg-bg font-medium text-fg",
          "transition-colors duration-100 ease-wf hover:bg-subtle data-[state=open]:bg-muted",
          sm ? "h-6 gap-1.5 px-1.5 text-sm" : "h-7 gap-2 px-2 text-base",
          className,
        )}
      >
        <StatusIcon status={issue.status} size={14} />
        <span className="whitespace-nowrap">{label}</span>
      </button>
    );

  return (
    <DropdownMenu open={isOpen} onOpenChange={setOpen}>
      <Tooltip
        content={variant === "icon" ? `${label} · Change status` : "Change status"}
        shortcut="s"
        open={tipOpen && !isOpen}
        onOpenChange={onTipChange}
      >
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent
        align={align}
        className="w-60"
        onKeyDown={onKeyDown}
        // Menu content is portaled, but React events still bubble to the card that holds it.
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          // A gate dialog may have opened; let it keep focus.
          if (document.querySelector('[role="dialog"][data-state="open"]')) e.preventDefault();
        }}
      >
        <DropdownMenuLabel>Move {issue.id} to</DropdownMenuLabel>
        {STATUS_ORDER.map((s, i) => {
          const legal = isLegalTransition(issue.status, s);
          return (
            <DropdownMenuItem
              key={s}
              icon={<StatusIcon status={s} />}
              shortcut={String(i + 1)}
              selected={s === issue.status}
              muted={!legal}
              hint={legal ? undefined : "Needs Move anyway"}
              onSelect={() => pick(s)}
            >
              {STATUS_LABEL[s]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
