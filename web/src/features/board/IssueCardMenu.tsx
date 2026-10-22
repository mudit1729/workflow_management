// The card's "…" and right-click menu. `view="move"` (the `s` key) opens straight
// into the status list; `view="all"` shows Move to…, Open in new page and copy actions.
import { ArrowRightLeft, Copy, Link2, SquareArrowOutUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { StatusIcon } from "@/components/common";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui";
import type { IssueStatus, IssueSummary } from "@/gen/types";
import { useMoveIssue } from "@/lib/api";
import { hrefFor, useOpenIssue } from "@/lib/nav";
import { STATUS_LABEL, STATUS_ORDER, TRANSITIONS } from "@/lib/status";

export type IssueCardMenuView = "all" | "move";

export interface IssueCardMenuProps {
  issue: IssueSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view?: IssueCardMenuView;
  /** Called after a status was picked, so the board can keep focus on the card. */
  onMoved?: (status: IssueStatus) => void;
  /** The trigger, rendered with `asChild`. */
  children: ReactNode;
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast.error("Could not copy. The browser blocked clipboard access.");
  }
}

export function IssueCardMenu({
  issue,
  open,
  onOpenChange,
  view = "all",
  onMoved,
  children,
}: IssueCardMenuProps) {
  const { move } = useMoveIssue();
  const openIssue = useOpenIssue();

  const legal = TRANSITIONS[issue.status];
  const gated = STATUS_ORDER.filter((s) => s !== issue.status && !legal.includes(s));

  const pick = (to: IssueStatus) => {
    move(issue, to);
    onMoved?.(to);
  };

  const statusItems = (
    <>
      <DropdownMenuItem
        disabled
        icon={<StatusIcon status={issue.status} size={14} />}
        hint="Current"
      >
        {STATUS_LABEL[issue.status]}
      </DropdownMenuItem>
      {legal.map((s) => (
        <DropdownMenuItem key={s} icon={<StatusIcon status={s} size={14} />} onSelect={() => pick(s)}>
          {STATUS_LABEL[s]}
        </DropdownMenuItem>
      ))}
      {gated.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Needs Move anyway</DropdownMenuLabel>
          {gated.map((s) => (
            <DropdownMenuItem
              key={s}
              className="text-fg-muted"
              icon={<StatusIcon status={s} size={14} />}
              onSelect={() => pick(s)}
            >
              {STATUS_LABEL[s]}
            </DropdownMenuItem>
          ))}
        </>
      )}
    </>
  );

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        data-wf="IssueCardMenu"
        align="end"
        sideOffset={4}
        className="w-56"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "move" ? (
          <>
            <DropdownMenuLabel>
              Move <span className="font-mono">{issue.id}</span> to…
            </DropdownMenuLabel>
            {statusItems}
          </>
        ) : (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft {...ICON} className="text-fg-muted" />
                Move to…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">{statusItems}</DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={<SquareArrowOutUpRight {...ICON} />}
              shortcut="o"
              onSelect={() => openIssue(issue.id, { page: true })}
            >
              Open in new page
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<Link2 {...ICON} />}
              onSelect={() =>
                copy(new URL(hrefFor(`/i/${issue.id}`), window.location.href).href, "Link copied")
              }
            >
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<Copy {...ICON} />}
              onSelect={() => copy(issue.id, `Copied ${issue.id}`)}
            >
              Copy id
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
