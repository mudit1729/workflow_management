// Kit entries for the markdown-grounded library: the document viewer, the source-line tag and the
// Glossary page. The documents are real files of the mock workspace; edit one in Workdatabase · Files
// and the page here changes.
import type { ReactNode } from "react";
import { toast } from "sonner";
import { SourceLineMarker } from "@/components/common";
import { Skeleton } from "@/components/ui";
import { GlossaryPage, MarkdownDocument } from "@/features/library";
import { useIssue, useWorkspaceFile } from "@/lib/api";
import { entry, type KitEntry, Sandbox, V } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/library";

const GOTCHA = "library/gotchas/notify-macos-rescan-subtrees.md";
const RESEARCH = "issues/wf/web/live-board-updates/notes/research.md";
const GOAL = "issues/wf/web/live-board-updates/goal.md";

/** Hands the text of a workspace file to a variant once it has loaded. */
function WithFile({ path, children }: { path: string; children: (text: string) => ReactNode }) {
  const { data } = useWorkspaceFile(path);
  if (data?.text == null) return <Skeleton className="h-40 w-full rounded-md" />;
  return <>{children(data.text)}</>;
}

/** The scrolling page a document sits in, as the Files view and the library pane give it. */
function Page({ children, padding = "px-6 py-5" }: { children: ReactNode; padding?: string }) {
  return <div className={`min-h-0 flex-1 overflow-y-auto ${padding}`}>{children}</div>;
}

const note = (line: number) => toast(`Would show line ${line} of the source`);

// ---------------------------------------------------------------- MarkdownDocument

function GoalDocument() {
  const diagrams = useIssue(ISSUE.rich).data?.diagrams;
  return (
    <WithFile path={GOAL}>
      {(text) => (
        <MarkdownDocument
          path={GOAL}
          text={text}
          variant="page"
          margin={24}
          diagrams={diagrams}
          issueId={ISSUE.rich}
          onJump={note}
        />
      )}
    </WithFile>
  );
}

function MarkdownDocumentBody() {
  return (
    <>
      <V
        label="a library item · page"
        note="The file as a page: its keys as properties, every section in file order. Hover a block: the tag in the left margin names the line."
        width={900}
        height={620}
      >
        <Sandbox quiet>
          <Page>
            <WithFile path={GOTCHA}>
              {(text) => (
                <MarkdownDocument
                  path={GOTCHA}
                  text={text}
                  variant="page"
                  margin={24}
                  onJump={note}
                />
              )}
            </WithFile>
          </Page>
        </Sandbox>
      </V>
      <V
        label="a doc · notes/research.md (page)"
        note="A file with no frontmatter: just the body, with its table."
        width={900}
        height={560}
      >
        <Sandbox quiet>
          <Page>
            <WithFile path={RESEARCH}>
              {(text) => (
                <MarkdownDocument
                  path={RESEARCH}
                  text={text}
                  variant="page"
                  margin={24}
                  issueId={ISSUE.rich}
                  onJump={note}
                />
              )}
            </WithFile>
          </Page>
        </Sandbox>
      </V>
      <V
        label="goal.md · raw properties, tasks, refs, diagram (page)"
        note="Frontmatter keys as written; the archify block becomes a diagram card and keeps its line."
        width={900}
        height={620}
      >
        <Sandbox quiet>
          <Page>
            <GoalDocument />
          </Page>
        </Sandbox>
      </V>
      <V
        label="pane · 480 px"
        note="In a side pane the tag shows the line; point at it and it opens to the whole path."
        width={480}
        height={560}
      >
        <Sandbox quiet>
          <Page>
            <WithFile path={GOTCHA}>
              {(text) => (
                <MarkdownDocument
                  path={GOTCHA}
                  text={text}
                  variant="pane"
                  margin={24}
                  onJump={note}
                />
              )}
            </WithFile>
          </Page>
        </Sandbox>
      </V>
      <V label="frontmatter only" width={480}>
        <Sandbox quiet>
          <Page padding="px-6 py-4">
            <MarkdownDocument
              path="notes/empty.md"
              text={"---\ntitle: Nothing here yet\nstatus: draft\n---\n"}
              variant="pane"
              margin={24}
            />
          </Page>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SourceLineMarker

function Gutter({ width, line, label }: { width: number; line: number; label: string }) {
  return (
    <V label={label}>
      <div
        className="flex justify-end border-border border-r py-1 pr-3"
        style={{ width }}
        title={`${width} px gutter`}
      >
        <SourceLineMarker path={GOTCHA} line={line} room={width - 14} onJump={note} />
      </div>
    </V>
  );
}

function SourceLineMarkerBody() {
  return (
    <>
      <Gutter width={400} line={14} label="wide margin · the whole path" />
      <Gutter width={270} line={14} label="mid margin · the file name" />
      <Gutter width={130} line={14} label="short margin · the end of the path" />
      <Gutter
        width={40}
        line={142}
        label="narrow gutter · the line (point at it to open the path)"
      />
    </>
  );
}

// ---------------------------------------------------------------- GlossaryPage

function GlossaryPageBody() {
  return (
    <V
      label="top bar with the Workdatabase tabs and search, then the terms"
      note="Point at a term: glossary.md:line appears. Click it to open that line in Workdatabase · Files."
      fill
      height={620}
    >
      <Sandbox quiet path="/glossary">
        <GlossaryPage />
      </Sandbox>
    </V>
  );
}

export const libraryViewerEntries: KitEntry[] = [
  entry(
    "Workdatabase",
    "MarkdownDocument",
    `${SRC}/MarkdownDocument.tsx`,
    "A library item or any doc opens as the rendered page of its own markdown file, so what you read is the file: add a section to the file and it appears, and every block names the line it came from.",
    MarkdownDocumentBody,
  ),
  entry(
    "Workdatabase",
    "SourceLineMarker",
    "src/components/common/SourceLineMarker.tsx",
    "The tag in a page's left margin ties a block to its line in the markdown, quietly, only while you point at it, and opens that line in one click.",
    SourceLineMarkerBody,
  ),
  entry(
    "Workdatabase",
    "GlossaryPage",
    `${SRC}/GlossaryPage.tsx`,
    "The glossary is a Workdatabase view of its own, with the same top bar as the library; every term names its line in glossary.md so the file stays the place you edit it.",
    GlossaryPageBody,
  ),
];
