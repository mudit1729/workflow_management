import { toast } from "sonner";
import { DocsList } from "@/features/issue/DocsList";
import { DocView } from "@/features/issue/DocView";
import { LintPanel } from "@/features/issue/LintPanel";
import { FilesTab } from "@/features/issue/tabs/FilesTab";
import type { DocFile, IssueDetail } from "@/gen/types";
import { entry, type KitEntry, Sandbox, V, WithDetail } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/issue";

// ---------------------------------------------------------------- FilesTab

function FilesTabBody() {
  return (
    <>
      <V label="wf-3k9x2 · six issue files, two docs, four findings" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.rich}>{(d) => <FilesTab detail={d} variant="drawer" />}</WithDetail>
        </Sandbox>
      </V>
      <V label="wf-k8dv6 · fifteen findings" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.heavyLint}>
            {(d) => <FilesTab detail={d} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
      <V label="wf-m3tq8 · clean" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.cleanDone}>
            {(d) => <FilesTab detail={d} variant="drawer" />}
          </WithDetail>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- DocsList

const opened = (doc: DocFile) => toast(`Open ${doc.path}`);

function DocsListBody() {
  return (
    <>
      <V label="with the issue files first" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.rich}>
            {(d) => <DocsList docs={d.docs} detail={d} onOpen={opened} />}
          </WithDetail>
        </Sandbox>
      </V>
      <V label="docs only" width={560}>
        <WithDetail id={ISSUE.rich}>{(d) => <DocsList docs={d.docs} onOpen={opened} />}</WithDetail>
      </V>
      <V label="a folder with no docs" width={560}>
        <Sandbox quiet>
          <WithDetail id={ISSUE.heavyLint}>
            {(d) => <DocsList docs={[]} detail={d} onOpen={opened} />}
          </WithDetail>
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- DocView

function Doc({
  label,
  pick,
  note,
}: {
  label: string;
  note?: string;
  pick: (d: IssueDetail) => DocFile | undefined;
}) {
  return (
    <V label={label} note={note} width={560}>
      <WithDetail id={ISSUE.rich}>
        {(d) => {
          const doc = pick(d);
          return doc ? (
            <div className="rounded-md border border-border">
              <DocView doc={doc} diagrams={d.diagrams} issueId={d.summary.id} />
            </div>
          ) : null;
        }}
      </WithDetail>
    </V>
  );
}

function DocViewBody() {
  return (
    <>
      <Doc
        label="markdown · notes/research.md"
        pick={(d) => d.docs.find((x) => x.kind === "markdown")}
      />
      <Doc label="image · evidence/sc2.png" pick={(d) => d.docs.find((x) => x.kind === "image")} />
      <Doc
        label="other file · size and raw link"
        note="Spread of a real doc with kind other."
        pick={(d) => {
          const base = d.docs[0];
          return base
            ? {
                ...base,
                kind: "other",
                path: "build/report.bin",
                title: undefined,
                body_md: undefined,
                size: 1_258_291,
              }
            : undefined;
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- LintPanel

function Lint({ id, label, note }: { id: string; label: string; note?: string }) {
  return (
    <V label={label} note={note} width={560}>
      <WithDetail id={id}>
        {(d) => <LintPanel diagnostics={d.diagnostics} basePath={d.summary.path} />}
      </WithDetail>
    </V>
  );
}

function LintPanelBody() {
  return (
    <>
      <Lint id={ISSUE.rich} label="wf-3k9x2 · two warnings, two info" />
      <Lint id={ISSUE.badYaml} label="wf-7yq2m · one error (F001)" />
      <Lint
        id={ISSUE.heavyLint}
        label="wf-k8dv6 · fifteen findings, filterable"
        note="Grouped by file; “line 12” copies path:line."
      />
      <Lint id={ISSUE.cleanDone} label="clean" />
    </>
  );
}

export const issueFilesEntries: KitEntry[] = [
  entry(
    "Issue · Files",
    "FilesTab",
    `${SRC}/tabs/FilesTab.tsx`,
    "Everything is a file on disk; this tab shows the issue folder and its lint findings together, so you can see what exists and what is wrong with it.",
    FilesTabBody,
  ),
  entry(
    "Issue · Files",
    "DocsList",
    `${SRC}/DocsList.tsx`,
    "The six issue files and any notes or evidence are listed with presence, size and lint counts, so a missing file is as visible as a present one.",
    DocsListBody,
  ),
  entry(
    "Issue · Files",
    "DocView",
    `${SRC}/DocView.tsx`,
    "Notes and evidence open in place, rendered as markdown or as an image, so reading a doc never means leaving the issue.",
    DocViewBody,
  ),
  entry(
    "Issue · Files",
    "LintPanel",
    `${SRC}/LintPanel.tsx`,
    "Lint findings are grouped by file with their rule id, message and fix, so a person can read what an agent was told and correct it at the source.",
    LintPanelBody,
  ),
];
