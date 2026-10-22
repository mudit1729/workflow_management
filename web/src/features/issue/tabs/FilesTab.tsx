// Files tab: the issue folder (DocsList, with DocView inline) and its lint findings.
import { type ReactNode, useState } from "react";
import type { IssueDetail } from "@/gen/types";
import { type IssueTab, type LogView, useIssueTab } from "@/lib/nav";
import { DocsList, type IssueFileName } from "../DocsList";
import { DocView } from "../DocView";
import { LintPanel } from "../LintPanel";

/** Where each issue file lives in the issue view. */
const FILE_TARGET: Record<IssueFileName, { tab: IssueTab; log?: LogView }> = {
  "goal.md": { tab: "goal" },
  "plan.md": { tab: "plan" },
  "current_state.md": { tab: "now" },
  "changes.md": { tab: "log", log: "changes" },
  "decisions.md": { tab: "log", log: "decisions" },
  "learnings.md": { tab: "log", log: "learnings" },
};

interface FilesTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
  /** Called after jumping to an issue file's section (the page closes its Files sheet and scrolls there). */
  onNavigate?: (tab: IssueTab) => void;
}

export function FilesTab({ detail, variant, onNavigate }: FilesTabProps) {
  const { setTab, setLog } = useIssueTab();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [returnPath, setReturnPath] = useState<string | undefined>();
  const doc = openPath ? detail.docs.find((d) => d.path === openPath) : undefined;

  if (doc) {
    return (
      <div data-wf="FilesTab" data-variant={variant} data-view="doc">
        <DocView
          doc={doc}
          diagrams={detail.diagrams}
          issueId={detail.summary.id}
          onBack={() => {
            setReturnPath(doc.path);
            setOpenPath(null);
          }}
        />
      </div>
    );
  }

  const openIssueFile = (name: IssueFileName) => {
    const target = FILE_TARGET[name];
    if (target.log) void setLog(target.log);
    else void setTab(target.tab);
    onNavigate?.(target.tab);
  };

  return (
    <div data-wf="FilesTab" data-variant={variant} className="flex flex-col gap-6">
      <Section title="Files">
        <DocsList
          docs={detail.docs}
          detail={detail}
          onOpen={(d) => setOpenPath(d.path)}
          onOpenIssueFile={openIssueFile}
          focusPath={returnPath}
        />
      </Section>
      <Section title="Lint" count={detail.diagnostics.length}>
        <LintPanel diagnostics={detail.diagnostics} basePath={detail.summary.path} />
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 font-medium text-fg-faint text-sm">
        {title}
        {count != null && count > 0 && <span className="tabular">{count}</span>}
      </h3>
      {children}
    </section>
  );
}
