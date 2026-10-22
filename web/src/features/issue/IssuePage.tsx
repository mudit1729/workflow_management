// Full issue page (/i/$id): a top bar with the breadcrumb and a way back, then the issue.
import { ArrowLeft, PanelRight } from "lucide-react";
import { CopyButton, GroupPath } from "@/components/common";
import { Button, IconButton } from "@/components/ui";
import type { IssueId } from "@/gen/types";
import { useIssue } from "@/lib/api";
import { useLayoutMode } from "@/lib/hooks";
import { useGo, useOpenIssue } from "@/lib/nav";
import { IssueView } from "./IssueView";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export function IssuePage({ id }: { id: IssueId }) {
  const { data } = useIssue(id);
  const go = useGo();
  const openIssue = useOpenIssue();
  const mobile = useLayoutMode() === "mobile";
  const groupPath = data?.summary.group_path ?? [];

  return (
    <div data-wf="IssuePage" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <nav
        aria-label="Breadcrumb"
        className="flex h-11 shrink-0 items-center gap-1.5 border-border border-b px-3"
      >
        <Button variant="ghost" size="sm" onClick={() => void go.board()}>
          <ArrowLeft {...ICON} />
          Board
        </Button>
        <span aria-hidden className="text-fg-faint">
          /
        </span>
        <div className="group/id flex min-w-0 items-center gap-1.5 text-sm">
          {groupPath.length > 0 && (
            <>
              <GroupPath path={groupPath} className="min-w-0 truncate text-sm" />
              <span aria-hidden className="text-fg-faint">
                /
              </span>
            </>
          )}
          <span aria-current="page" className="shrink-0 font-mono text-fg-muted text-sm">
            {id}
          </span>
          <span className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/id:opacity-100">
            <CopyButton text={id} label="Copy issue id" />
          </span>
        </div>
        {!mobile && (
          <div className="ml-auto flex items-center">
            <IconButton
              size="sm"
              label="Open beside the board"
              icon={<PanelRight {...ICON} />}
              onClick={() => void openIssue(id)}
            />
          </div>
        )}
      </nav>
      <div className="min-h-0 flex-1">
        <IssueView id={id} variant="page" />
      </div>
    </div>
  );
}
