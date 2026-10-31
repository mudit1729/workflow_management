// [[ref]] links: issues, entries/criteria/tasks inside an issue, library items and library pages.
// Titles come from the snapshot (and the issue detail for entries). Dangling refs get a
// dashed underline and an F009 tooltip.
import type { MouseEvent, ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import { AddressLink } from "@/features/ask/AddressLink";
import { isPageAddress } from "@/features/context/links";
import type { IssueDetail, IssueStatus } from "@/gen/types";
import { useIssue, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { hrefFor, type IssueTab, type LogView, useGo, useOpenIssue } from "@/lib/nav";
import { STATUS_LABEL } from "@/lib/status";
import { KindIcon } from "./KindIcon";
import { parseRef } from "./remark-wf";
import { StatusIcon } from "./StatusIcon";

export interface RefLinkProps {
  /** As written inside the brackets: "wf-3k9x2", "wf-3k9x2#D-7f3k2", "#T-4", "lib-4tz7c". */
  target: string;
  /** The issue that contains the text; resolves "#T-4". */
  issueId?: string;
  className?: string;
}

const SUB_KIND: { prefix: RegExp; noun: string; tab: IssueTab; log?: LogView }[] = [
  { prefix: /^C-/, noun: "Change", tab: "log", log: "changes" },
  { prefix: /^D-/, noun: "Decision", tab: "log", log: "decisions" },
  { prefix: /^L-/, noun: "Learning", tab: "log", log: "learnings" },
  { prefix: /^SC-/, noun: "Criterion", tab: "criteria" },
  { prefix: /^T-/, noun: "Task", tab: "plan" },
  { prefix: /^Q-/, noun: "Request", tab: "now" },
];

function subKind(sub: string) {
  return SUB_KIND.find((k) => k.prefix.test(sub));
}

/** Title of an entry, criterion, task (or task step) or request in an issue. */
function findSubTitle(d: IssueDetail, sub: string): string | undefined {
  const id = sub.replace(/\.\d+$/, ""); // "T-3.2" → task T-3
  const entry = [...d.changes, ...d.decisions, ...d.learnings].find((e) => e.id === id);
  if (entry) return entry.title;
  const criterion = d.criteria.find((c) => c.id === id);
  if (criterion) return criterion.text;
  for (const phase of d.plan?.phases ?? []) {
    const task = phase.tasks.find((t) => t.id === id);
    if (task) return task.title;
  }
  return d.state?.needs_you.find((q) => q.id === id)?.question;
}

const DANGLING = "Dangling reference (F009)";

/**
 * Where a click on an entry reference lands, as a URL, so copy link, middle-click and "open in a
 * new tab" agree with the click: the drawer over the board (the full page below 768 px, like
 * `useOpenIssue`), on the tab and log view that hold the entry.
 */
function entryHref(issue: string, tab?: IssueTab, log?: LogView): string {
  const narrow = typeof window !== "undefined" && window.innerWidth < 768;
  const query = new URLSearchParams();
  if (tab) query.set("tab", tab);
  if (log) query.set("log", log);
  const qs = query.toString();
  return hrefFor(`${narrow ? "/i" : "/w/i"}/${issue}${qs ? `?${qs}` : ""}`);
}

const linkClass =
  "inline items-baseline rounded-sm font-medium text-fg underline decoration-border-strong decoration-1 underline-offset-[3px] transition-colors duration-100 hover:bg-muted hover:decoration-fg-muted";

function Dangling({ target, className }: { target: string; className?: string }) {
  return (
    <Tooltip content={DANGLING}>
      <span
        data-wf="RefLink"
        data-dangling=""
        className={cn(
          "code-inline text-fg-muted underline decoration-dashed decoration-fg-faint underline-offset-[3px]",
          className,
        )}
      >
        [[{target}]]
      </span>
    </Tooltip>
  );
}

export function RefLink({ target, issueId, className }: RefLinkProps) {
  const ref = parseRef(target, issueId);
  // `[[platform:runbooks/x.md#rollback]]` is a page of a library, not an entry of an issue.
  const page = isPageAddress(target);
  const snap = useSnapshot().data;
  const detail = useIssue(!page && ref.kind === "entry" ? ref.issue : undefined).data as
    | IssueDetail
    | undefined;
  const openIssue = useOpenIssue();
  const go = useGo();

  const follow = (e: MouseEvent<HTMLAnchorElement>, action: () => void) => {
    e.stopPropagation();
    // Let the browser handle new-tab clicks.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    action();
  };

  // ---- page of a team, personal or workspace library
  if (page) return <AddressLink target={target} className={className} />;

  // ---- library item
  if (ref.kind === "library" && ref.library) {
    const id = ref.library;
    const item = snap?.library.find((l) => l.id === id);
    if (snap && !item) return <Dangling target={target} className={className} />;
    return (
      <Tooltip content={item ? `${item.id} · ${item.kind} · ${item.status}` : `Library item ${id}`}>
        <a
          data-wf="RefLink"
          href={hrefFor(`/lib/${id}`)}
          onClick={(e) => follow(e, () => go.libraryItem(id))}
          className={cn(linkClass, className)}
        >
          {item && (
            <KindIcon
              kind={item.kind}
              size={12}
              className="mr-1 inline-block align-[-1px] text-fg-muted"
            />
          )}
          {item?.title ?? id}
        </a>
      </Tooltip>
    );
  }

  // ---- issue, entry, criterion, task
  const issueIdResolved = ref.issue;
  if (!issueIdResolved) return <Dangling target={target} className={className} />;
  const issue = snap?.issues.find((i) => i.id === issueIdResolved);
  if (snap && !issue) return <Dangling target={target} className={className} />;

  if (ref.kind === "entry" && ref.sub) {
    const sub = ref.sub;
    const kind = subKind(sub);
    const subTitle = detail ? findSubTitle(detail, sub) : undefined;
    if (detail && !subTitle) return <Dangling target={target} className={className} />;
    const local = issueIdResolved === issueId;
    const tip: ReactNode = (
      <span className="flex flex-col gap-0.5">
        <span>
          {kind?.noun ?? "Entry"} {sub}
          {subTitle ? ` · ${subTitle}` : ""}
        </span>
        {!local && issue && <span className="opacity-70">in {issue.title}</span>}
      </span>
    );
    return (
      <Tooltip content={tip}>
        <a
          data-wf="RefLink"
          href={entryHref(issueIdResolved, kind?.tab, kind?.log)}
          onClick={(e) =>
            follow(e, () => openIssue(issueIdResolved, { tab: kind?.tab, log: kind?.log }))
          }
          className={cn(linkClass, "code-inline", className)}
        >
          {local ? sub : `${issueIdResolved} · ${sub}`}
        </a>
      </Tooltip>
    );
  }

  const status = issue?.status as IssueStatus | undefined;
  return (
    <Tooltip
      content={
        issue
          ? `${issue.id} · ${STATUS_LABEL[issue.status]}${issue.group_path.length ? ` · ${issue.group_path.join(" / ")}` : ""}`
          : issueIdResolved
      }
    >
      <a
        data-wf="RefLink"
        href={hrefFor(`/i/${issueIdResolved}`)}
        onClick={(e) => follow(e, () => openIssue(issueIdResolved))}
        className={cn(linkClass, className)}
      >
        {status && (
          <StatusIcon status={status} size={12} className="mr-1 inline-block align-[-1px]" />
        )}
        {issue?.title ?? issueIdResolved}
      </a>
    </Tooltip>
  );
}
