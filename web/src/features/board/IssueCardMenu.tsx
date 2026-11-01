// The card's "…" and right-click menu. `view="move"` (the `s` key) opens straight
// into the status list; `view="all"` shows Move to…, Open in new page and copy actions.
import {
  ArrowRightLeft,
  Copy,
  Link2,
  Play,
  Square,
  SquareArrowOutUpRight,
  Terminal,
} from "lucide-react";
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
import { copyCodexCommand, useNextStep } from "@/features/codex";
import type { IssueStatus, IssueSummary } from "@/gen/types";
import { agentName, useMoveIssue, usePreferredAgent } from "@/lib/api";
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
      <DropdownMenuItem selected icon={<StatusIcon status={issue.status} size={14} />}>
        {STATUS_LABEL[issue.status]}
      </DropdownMenuItem>
      {legal.map((s) => (
        <DropdownMenuItem
          key={s}
          icon={<StatusIcon status={s} size={14} />}
          onSelect={() => pick(s)}
        >
          {STATUS_LABEL[s]}
        </DropdownMenuItem>
      ))}
      {gated.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Needs confirmation</DropdownMenuLabel>
          {gated.map((s) => (
            <DropdownMenuItem
              key={s}
              muted
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
              <DropdownMenuSubTrigger icon={<ArrowRightLeft {...ICON} />}>
                Move to…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">{statusItems}</DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <CodexItems issue={issue} />
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

/**
 * Open in <agent> and Do next step, named for the connected agent (the last one chosen when none
 * is). A component of its own so the run state is read only while the menu is open (its content
 * mounts then), not by every card on the board. While a run goes on the issue the second item
 * stops it, so a run started here (or from the palette) can be cancelled without opening the
 * issue; the card's marker shows the run either way. With no agent connected, Do next step opens
 * the connect flow and starts the run after it.
 */
function CodexItems({ issue }: { issue: IssueSummary }) {
  const next = useNextStep(issue);
  const preferred = usePreferredAgent();
  const busyName = agentName(next.run?.agent ?? preferred);
  return (
    <>
      <DropdownMenuItem icon={<Terminal {...ICON} />} onSelect={() => void copyCodexCommand(issue)}>
        Open in {agentName(preferred)}
      </DropdownMenuItem>
      {next.busy ? (
        <DropdownMenuItem
          icon={<Square {...ICON} />}
          hint={`${busyName} is working on it`}
          onSelect={() => void next.cancel()}
        >
          Cancel {busyName}'s run
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem icon={<Play {...ICON} />} onSelect={() => void next.start()}>
          Do next step
        </DropdownMenuItem>
      )}
    </>
  );
}
