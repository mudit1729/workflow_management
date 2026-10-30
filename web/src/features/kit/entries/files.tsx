import { useSearch } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import {
  NewFileDialog,
  SourceEditor,
  SourceView,
  templateForPath,
  WorkspaceTree,
  WorkspaceView,
} from "@/features/files";
import { useMe, useWorkspaceFile } from "@/lib/api";
import { entry, type KitEntry, Row, Sandbox, V } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/files";

// Files the variants open. They are real files of the sample world (web/mock/sample), which the
// kit holds while it is open (see KitPage.tsx).
const GOAL = "issues/wf/web/live-board-updates/goal.md";
const CHANGES = "issues/wf/web/live-board-updates/changes.md";
const BAD_YAML = "issues/wf/web/tab-title-count/goal.md";
const IMAGE = "issues/wf/web/live-board-updates/evidence/sc2.png";
const CONFIG = "workflow.toml";
const EDITABLE = "issues/wf/skills/promote-learnings/goal.md";

const WRITES =
  "Edit, Create and Delete write to the sample copy the kit holds; Reset data in the Prototype panel restores it, and leaving the kit puts your own workspace back.";

// ---------------------------------------------------------------- WorkspaceView

/** The page route reads `path` from the URL; the sandbox router has no route for it. */
function FilesRoute() {
  const { path } = useSearch({ strict: false }) as { path?: string };
  return <WorkspaceView path={path} />;
}

function WorkspaceViewBody() {
  return (
    <V label="tree and source · goal.md of wf-3k9x2" note={WRITES} fill height={640}>
      <Sandbox quiet path={`/files?path=${encodeURIComponent(GOAL)}`}>
        <FilesRoute />
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- WorkspaceTree

function TreeDemo({ initial }: { initial?: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceTree
        selectedPath={selected}
        onSelect={setSelected}
        onNewFile={() => toast("New file opens the dialog on the Files page")}
      />
    </div>
  );
}

function WorkspaceTreeBody() {
  return (
    <>
      <V
        label="goal.md of wf-3k9x2 selected"
        note="Folders above the selection open; issue folders show status, title and slug."
        width={300}
        height={560}
      >
        <Sandbox quiet>
          <TreeDemo initial={GOAL} />
        </Sandbox>
      </V>
      <V
        label="the file with an error selected"
        note="A dot and a count mark files with findings; a collapsed folder rolls up its children."
        width={300}
        height={560}
      >
        <Sandbox quiet>
          <TreeDemo initial={BAD_YAML} />
        </Sandbox>
      </V>
      <V
        label="nothing selected"
        note="Folders open down to issue level. Type in the filter to match a path, a title or an id."
        width={300}
        height={560}
      >
        <Sandbox quiet>
          <TreeDemo />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SourceView

function Source({
  label,
  path,
  note,
  variant = "pane",
  width = 720,
  height = 420,
}: {
  label: string;
  path: string;
  note?: string;
  variant?: "pane" | "inline";
  width?: number;
  height?: number;
}) {
  return (
    <V label={label} note={note} width={width} height={height}>
      <Sandbox quiet>
        <SourceView path={path} variant={variant} onBack={() => toast("Back to the tree")} />
      </Sandbox>
    </V>
  );
}

function SourceViewBody() {
  return (
    <>
      <Source label="goal.md · numbered lines, highlighted" path={GOAL} note={WRITES} />
      <Source
        label="goal.md with an error · F001 in the gutter"
        path={BAD_YAML}
        note="The finding count cycles through the findings and scrolls to each."
      />
      <Source label="an image · evidence/sc2.png" path={IMAGE} />
      <Source
        label="workflow.toml · editable"
        path={CONFIG}
        note="Saving it re-applies the lint rules, lease limits and staleness thresholds."
      />
      <Source
        label="inline · changes.md in the Files tab"
        path={CHANGES}
        variant="inline"
        width={560}
        height={380}
      />
      <Source
        label="no file at this path"
        path="issues/wf/web/live-board-updates/plan-v2.md"
        note="Offers to create it."
        height={260}
      />
    </>
  );
}

// ---------------------------------------------------------------- SourceEditor

function EditorFrame({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col">{children}</div>;
}

/** Edits a file of the workspace; a save moves the baseline so a second save is not a conflict. */
function EditDemo({ path, staleLiveRev }: { path: string; staleLiveRev?: boolean }) {
  const { data } = useWorkspaceFile(path);
  const [saved, setSaved] = useState<{ rev: string; text: string }>();
  if (!data || data.text === null) return null;
  const baseRev = saved?.rev ?? data.rev;
  return (
    <EditorFrame>
      <SourceEditor
        key={path + (saved?.rev ?? "")}
        path={path}
        mode="edit"
        initialText={saved?.text ?? data.text}
        baseRev={baseRev}
        liveRev={staleLiveRev ? "0000000" : data.rev}
        variant="pane"
        onSaved={({ rev, after }) => setSaved({ rev, text: after })}
        onCancel={() => toast("Cancel closes the editor on the Files page")}
        onReload={() => toast("Reload takes the file as it is on disk now")}
      />
    </EditorFrame>
  );
}

function CreateDemo({ path }: { path: string }) {
  const me = useMe();
  return (
    <EditorFrame>
      <SourceEditor
        path={path}
        mode="create"
        initialText=""
        startText={templateForPath(path, { author: me })}
        variant="pane"
        onSaved={({ rev }) => toast(`Created ${path}`, { description: `rev ${rev}` })}
        onCancel={() => toast("Cancel closes the editor on the Files page")}
        onReload={() => undefined}
      />
    </EditorFrame>
  );
}

function SourceEditorBody() {
  return (
    <>
      <V
        label="edit · goal.md of wf-x5hd3"
        note="Save is ⌘S or ⌘↵, Cancel is Esc. A save re-reads the whole workspace, so the board follows."
        width={720}
        height={420}
      >
        <Sandbox quiet>
          <EditDemo path={EDITABLE} />
        </Sandbox>
      </V>
      <V
        label="the file changed while editing · Reload or Overwrite"
        note="The file's rev moved past the one the editor opened from."
        width={720}
        height={420}
      >
        <Sandbox quiet>
          <EditDemo path={EDITABLE} staleLiveRev />
        </Sandbox>
      </V>
      <V
        label="create · a new goal.md from the template"
        note="Save adds a card to Backlog."
        width={720}
        height={420}
      >
        <Sandbox quiet>
          <CreateDemo path="issues/wf/web/kit-sketch/goal.md" />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- NewFileDialog

function NewFileDemo({ label, group, issue }: { label: string; group?: string; issue?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <NewFileDialog
        open={open}
        onOpenChange={setOpen}
        defaultGroup={group}
        defaultIssue={issue}
        onCreated={(path) => toast(`Created ${path}`)}
        onEdit={(path) => toast(`Open the editor on ${path}`)}
      />
    </>
  );
}

function NewFileDialogBody() {
  return (
    <V
      label="open"
      note="Create writes to the sample copy the kit holds: a new issue is a new card, a change entry opens the editor."
    >
      <Sandbox quiet>
        <Row>
          <NewFileDemo label="New file" />
          <NewFileDemo label="New file in wf / web" group="issues/wf/web" />
          <NewFileDemo label="Change entry for wf-3k9x2" issue={ISSUE.rich} />
        </Row>
      </Sandbox>
    </V>
  );
}

export const filesEntries: KitEntry[] = [
  entry(
    "Workdatabase",
    "WorkspaceView",
    `${SRC}/WorkspaceView.tsx`,
    "The Workdatabase is a folder of markdown files, so Files shows them and lets you change one; seeing a status in the text and on the Workflow card at once is how you trust it.",
    WorkspaceViewBody,
  ),
  entry(
    "Workdatabase",
    "WorkspaceTree",
    `${SRC}/WorkspaceTree.tsx`,
    "The workspace is a folder tree, but a path means little by itself, so issue folders carry their status and title and every file shows its findings.",
    WorkspaceTreeBody,
  ),
  entry(
    "Workdatabase",
    "SourceView",
    `${SRC}/SourceView.tsx`,
    "A file is read as the text it is, with line numbers and the findings the linter put on those lines, so what an agent was told and what is wrong sit in one place.",
    SourceViewBody,
  ),
  entry(
    "Workdatabase",
    "SourceEditor",
    `${SRC}/SourceEditor.tsx`,
    "Editing the file is the one way to change anything, so the editor saves against the rev it opened from and says plainly when the file moved underneath.",
    SourceEditorBody,
  ),
  entry(
    "Workdatabase",
    "NewFileDialog",
    `${SRC}/NewFileDialog.tsx`,
    "A new issue is a folder with a goal.md, so creating one asks for a title and a folder and writes a valid file, and the path stays visible so nothing is hidden.",
    NewFileDialogBody,
  ),
];
