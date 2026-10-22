// /files: the workspace as the files it is, a Workdatabase view. A top bar (the Workdatabase tabs,
// a one-line explanation, the Prototype chip, New file), a tree of every file at the left and the
// open file at the right. Below 768 px the tree and the file are separate screens.
import { FilePlus, FlaskConical, FolderTree } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ViewTabs } from "@/components/common";
import { Button, Chip, Tooltip } from "@/components/ui";
import { useSnapshot } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks";
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

export interface WorkspaceViewProps {
  /** The open file (`?path=`), exactly as typed in the URL. */
  path?: string;
}

export function WorkspaceView({ path }: WorkspaceViewProps) {
  const narrow = useMediaQuery("(max-width: 767px)");
  const nav = useFilesNav();
  const [newOpen, setNewOpen] = useState(false);
  const defaults = useDialogDefaults(path);

  const select = (next: string) => void nav.open(next);
  const newFile = () => setNewOpen(true);

  return (
    <div data-wf="WorkspaceView" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4">
        <h1 className="sr-only">Workdatabase · Files</h1>
        <ViewTabs view="workdatabase" />
        <p className="hidden min-w-0 flex-1 truncate text-fg-faint text-sm min-[1360px]:block">
          {EXPLAIN}
        </p>
        <span className="flex-1 min-[1360px]:hidden" />
        <Tooltip content={PROTOTYPE_NOTE} side="bottom">
          {/* A button is the trigger (focusable): Chip turns into a button itself when it gets an onClick. */}
          <button
            type="button"
            data-wf="PrototypeChip"
            className="inline-flex shrink-0 cursor-default rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus max-[520px]:hidden"
          >
            <Chip tone="outline" icon={<FlaskConical aria-hidden />}>
              Prototype
            </Chip>
          </button>
        </Tooltip>
        <Button
          variant="secondary"
          onClick={newFile}
          aria-label="New file"
          className="max-sm:w-7 max-sm:px-0"
        >
          <FilePlus aria-hidden />
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
                  icon={<FolderTree />}
                  title="Pick a file"
                  hint={
                    <>
                      <Code>goal.md</Code>, <Code>plan.md</Code> and <Code>current_state.md</Code>{" "}
                      drive the issue drawer. Open one to read its source, edit it, and watch the
                      board change.
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
    <code className="rounded-sm bg-muted px-1 py-px font-mono text-[11.5px] text-fg">
      {children}
    </code>
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
