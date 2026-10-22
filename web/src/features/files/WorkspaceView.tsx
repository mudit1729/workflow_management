// /files: the workspace as the files it is, a Workdatabase view. A top bar (the Workdatabase tabs,
// a one-line explanation, New file), a tree of every file at the left and the open file at the
// right. When the page is too narrow for both (under 720 px of page, rail included) the tree and
// the file are separate screens.
import { FilePlus, FolderTree } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ViewTabs } from "@/components/common";
import { Button } from "@/components/ui";
import { useElementWidth } from "@/features/library/useElementWidth";
import { useSnapshot } from "@/lib/api";
import { flattenGroups, useFileContext } from "./context";
import { NewFileDialog } from "./NewFileDialog";
import { dirname } from "./paths";
import { SourceView } from "./SourceView";
import { useFilesNav } from "./useFilesNav";
import { WorkspaceTree } from "./WorkspaceTree";

const EXPLAIN =
  "The Workdatabase is these markdown files. Edit one and the Workflow board changes.";
const PROTOTYPE_NOTE =
  "In this prototype, edits stay in this browser tab until you reset the data. On the dev server, saving a file on disk also updates the board.";

/** Page width under which the tree and the file take turns: a 280 px tree leaves 440 px for a file. */
const SPLIT_AT = 720;

export interface WorkspaceViewProps {
  /** The open file (`?path=`), exactly as typed in the URL. */
  path?: string;
}

export function WorkspaceView({ path }: WorkspaceViewProps) {
  const [measure, width] = useElementWidth();
  // Before the first measurement (0) assume there is room: the layout settles before paint.
  const narrow = width > 0 && width < SPLIT_AT;
  const nav = useFilesNav();
  const [newOpen, setNewOpen] = useState(false);
  const defaults = useDialogDefaults(path);

  const select = (next: string) => void nav.open(next);
  const newFile = () => setNewOpen(true);

  return (
    <div
      ref={measure}
      data-wf="WorkspaceView"
      className="flex h-full min-h-0 min-w-0 flex-col bg-bg"
    >
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4">
        <h1 className="sr-only">Workdatabase · Files</h1>
        <ViewTabs view="workdatabase" />
        <p
          title={PROTOTYPE_NOTE}
          className="hidden min-w-0 flex-1 truncate text-fg-faint text-sm min-[1360px]:block"
        >
          {EXPLAIN}
        </p>
        <span className="flex-1 min-[1360px]:hidden" />
        <Button
          variant="secondary"
          onClick={newFile}
          aria-label="New file"
          className="max-sm:w-7 max-sm:px-0"
        >
          <FilePlus aria-hidden size={14} strokeWidth={1.75} />
          <span className="max-sm:sr-only">New file</span>
        </Button>
      </header>

      {narrow ? (
        path ? (
          <SourceView key={path} path={path} onBack={() => void nav.open()} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="shrink-0 px-4 pt-3 text-fg-faint text-sm">{EXPLAIN}</p>
            <WorkspaceTree onSelect={select} onNewFile={newFile} />
          </div>
        )
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
          <aside aria-label="Files" className="min-h-0 border-border border-r bg-subtle">
            <WorkspaceTree selectedPath={path} onSelect={select} onNewFile={newFile} />
          </aside>
          <section aria-label="File" className="min-h-0 min-w-0">
            {path ? (
              <SourceView key={path} path={path} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={<FolderTree strokeWidth={1.75} />}
                  title="Pick a file"
                  hint={
                    <>
                      <Code>goal.md</Code>, <Code>plan.md</Code> and <Code>current_state.md</Code>{" "}
                      drive the issue drawer. Open one to read its source, edit it, and watch the
                      board change. In this prototype, edits stay in this browser tab until you
                      reset the data.
                    </>
                  }
                />
              </div>
            )}
          </section>
        </div>
      )}

      <NewFileDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultGroup={defaults.group}
        defaultIssue={defaults.issue}
        onCreated={(created) => void nav.open(created)}
        onEdit={(target, intent) => void nav.edit(target, intent)}
      />
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded-sm bg-muted px-1 py-px font-mono text-fg text-xs">{children}</code>
  );
}

/** Where New file starts: the group folder and the issue of the open file. */
function useDialogDefaults(path?: string): { group?: string; issue?: string } {
  const snapshot = useSnapshot().data;
  const ctx = useFileContext(path ?? "");
  return useMemo(() => {
    if (!path || !snapshot) return {};
    if (ctx.issue) return { group: dirname(ctx.issue.path), issue: ctx.issue.id };
    const groups = flattenGroups(snapshot.groups)
      .map((g) => g.path)
      .filter((p) => path.startsWith(`${p}/`))
      .sort((a, b) => b.length - a.length);
    return { group: groups[0] };
  }, [path, snapshot, ctx.issue]);
}
