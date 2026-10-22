// "What the agent gets" for an issue that exists: the Workdatabase items goal.md links, sized and
// checked against the budget. Collapsed by default: it is a check, not the content of the tab.
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ContextLink, IssueDetail } from "@/gen/types";
import { api, qk, useGlossary, useSnapshot, useWorkspaceFiles } from "@/lib/api";
import { ContextPreview } from "./ContextPreview";
import { contextLinksOf } from "./links";
import { type ContextItem, decisionItem, fileItem, libraryItem, termItem } from "./types";

/**
 * The picker items behind the links of a goal.md. A link whose target is gone still gets a row
 * (a stub with the label written in the file), so the preview and the file never disagree.
 */
export function useLinkedItems(links: ContextLink[]): ContextItem[] {
  const snapshot = useSnapshot().data;
  const glossary = useGlossary().data;
  const files = useWorkspaceFiles().data;

  const issueIds = [
    ...new Set(links.filter((l) => l.kind === "entry").map((l) => l.target.split("#")[0])),
  ].filter(Boolean);
  const details = useQueries({
    queries: issueIds.map((id) => ({
      queryKey: qk.issue(id),
      queryFn: () => api.issue(id),
      staleTime: 30_000,
    })),
    combine: (results) => results.map((r) => r.data as IssueDetail | undefined),
  });

  return useMemo(
    () =>
      links.map((link): ContextItem => {
        const stub: ContextItem = {
          kind: link.kind,
          target: link.target,
          label: link.label,
          title: link.label || link.target,
          id: link.kind === "library" ? link.target : undefined,
        };
        switch (link.kind) {
          case "library": {
            const l = snapshot?.library.find((x) => x.id === link.target);
            return l ? { ...libraryItem(l), label: link.label } : stub;
          }
          case "term": {
            const t = glossary?.find((x) => x.term === link.target);
            return t ? { ...termItem(t), label: link.label } : { ...stub, title: link.target };
          }
          case "file": {
            const f = files?.find((x) => x.path === link.target);
            const issue = snapshot?.issues.find((i) => i.id === f?.issue);
            return f ? { ...fileItem(f, issue), label: link.label } : stub;
          }
          case "entry": {
            const [issueId, entryId] = link.target.split("#");
            const issue = snapshot?.issues.find((i) => i.id === issueId);
            const detail = details.find((d) => d?.summary.id === issueId);
            const d = detail?.decisions.find((x) => x.id === entryId);
            return issue && d ? { ...decisionItem(issue, d), label: link.label } : stub;
          }
          default:
            return stub;
        }
      }),
    [links, snapshot, glossary, files, details],
  );
}

export interface LinkedPreviewProps {
  /** The text of `## Links`. */
  md: string;
  /** The issue folder, to resolve file links. */
  dir: string;
  issueId: string;
  issueTitle: string;
}

export function LinkedPreview({ md, dir, issueId, issueTitle }: LinkedPreviewProps) {
  const links = useMemo(() => contextLinksOf(md, dir), [md, dir]);
  const items = useLinkedItems(links);
  if (items.length === 0) return null;
  return (
    <ContextPreview
      items={items}
      issueId={issueId}
      issueTitle={issueTitle}
      defaultOpen={false}
      className="mt-2.5"
    />
  );
}
