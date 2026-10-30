// The issue folder as a list: the six issue files with their presence, then extra docs and assets.
import { ChevronRight, File, FileCode, FileImage, FileText, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { LintBadge, RelativeTime } from "@/components/common";
import { Button } from "@/components/ui";
import type { Diagnostic, DocFile, IssueDetail, LintCounts } from "@/gen/types";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { SkillLink, type WfSkill } from "./skill-hint";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export type IssueFileName =
  | "goal.md"
  | "plan.md"
  | "current_state.md"
  | "changes.md"
  | "decisions.md"
  | "learnings.md";

/** Each file with the skill of the workflow plugin that writes it. */
const ISSUE_FILES: { name: IssueFileName; role: string; skill: WfSkill }[] = [
  { name: "goal.md", role: "Why, and the success criteria", skill: "adding-work" },
  { name: "plan.md", role: "How: approach, phases and tasks", skill: "planning-issues" },
  { name: "current_state.md", role: "Where the work stands now", skill: "handing-off" },
  { name: "changes.md", role: "What changed, one entry each", skill: "logging-work" },
  { name: "decisions.md", role: "Decisions and the reasons", skill: "logging-work" },
  { name: "learnings.md", role: "Lessons worth keeping", skill: "logging-work" },
];

interface DocsListProps {
  docs: DocFile[];
  onOpen: (doc: DocFile) => void;
  /** When given, the six issue files are listed first, with presence, counts and lint. */
  detail?: IssueDetail;
  /** Called when a present issue file is picked; the view jumps to its section. */
  onOpenIssueFile?: (name: IssueFileName) => void;
  /** A doc path to focus on mount, so focus returns to the row after DocView's Back. */
  focusPath?: string;
  /** Shows "View source" on each present file. `rel` is the path inside the issue folder. */
  onViewSource?: (rel: string) => void;
  /** Shows "Create" on a missing issue file. */
  onCreate?: (name: IssueFileName) => void;
  /** Like `focusPath`, but focuses that file's "View source" button. */
  focusSourcePath?: string;
}

export function DocsList({
  docs,
  onOpen,
  detail,
  onOpenIssueFile,
  focusPath,
  onViewSource,
  onCreate,
  focusSourcePath,
}: DocsListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const basePath = detail?.summary.path;
  const diagnostics = detail?.diagnostics ?? [];

  useEffect(() => {
    const target = focusSourcePath
      ? `[data-source-path="${CSS.escape(focusSourcePath)}"]`
      : focusPath
        ? `[data-path="${CSS.escape(focusPath)}"]`
        : undefined;
    if (!target) return;
    rootRef.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: false });
  }, [focusPath, focusSourcePath]);

  const sorted = [...docs].sort(
    (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.path.localeCompare(b.path),
  );

  return (
    <div data-wf="DocsList" ref={rootRef} className="flex flex-col gap-4">
      {detail && (
        <ul aria-label="Issue files" className={LIST}>
          {ISSUE_FILES.map((f) => {
            const present = isPresent(f.name, detail);
            const lint = lintFor(diagnostics, f.name, basePath);
            if (!present) {
              const optional = f.name === "plan.md" && ["xs", "s"].includes(detail.summary.size);
              return (
                <li key={f.name}>
                  <Row
                    icon={<FileText {...ICON} />}
                    name={f.name}
                    secondary={f.role}
                    missing
                    actions={
                      onCreate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Create ${f.name}`}
                          onClick={() => onCreate(f.name)}
                          className="text-fg-muted"
                        >
                          <Plus {...ICON} aria-hidden />
                          Create
                        </Button>
                      )
                    }
                    meta={
                      optional ? (
                        <span>Optional for size {detail.summary.size.toUpperCase()}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          Not created
                          <SkillLink skill={f.skill} className="text-fg-muted text-xs" />
                        </span>
                      )
                    }
                  />
                </li>
              );
            }
            return (
              <li key={f.name}>
                <Row
                  icon={<FileText {...ICON} />}
                  name={f.name}
                  secondary={f.role}
                  meta={issueFileMeta(f.name, detail)}
                  lint={lint}
                  path={f.name}
                  onClick={onOpenIssueFile ? () => onOpenIssueFile(f.name) : undefined}
                  actions={onViewSource && <ViewSource rel={f.name} onViewSource={onViewSource} />}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        {detail && (
          <h4 className="flex items-center gap-1.5 font-medium text-fg-faint text-sm">
            Docs and assets
            {docs.length > 0 && <span className="tabular">{docs.length}</span>}
          </h4>
        )}
        {sorted.length === 0 ? (
          <p className="rounded-md border border-border border-dashed px-3 py-3 text-fg-faint text-sm">
            No other files yet. Notes, evidence and images you add to the issue folder show up here.
          </p>
        ) : (
          <ul aria-label="Docs and assets" className={LIST}>
            {sorted.map((doc) => (
              <li key={doc.path}>
                <Row
                  path={doc.path}
                  icon={<DocKindIcon kind={doc.kind} />}
                  name={<DocName path={doc.path} />}
                  secondary={doc.title}
                  meta={<span className="tabular">{formatBytes(doc.size)}</span>}
                  lint={lintFor(diagnostics, doc.path, basePath)}
                  onClick={() => onOpen(doc)}
                  actions={
                    onViewSource && <ViewSource rel={doc.path} onViewSource={onViewSource} />
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const LIST = "divide-y divide-border overflow-hidden rounded-md border border-border";

function Row({
  icon,
  name,
  secondary,
  meta,
  lint,
  missing = false,
  onClick,
  path,
  actions,
}: {
  icon: ReactNode;
  name: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  lint?: LintCounts;
  missing?: boolean;
  onClick?: () => void;
  path?: string;
  /** Buttons at the end of the row: "View source", "Create". */
  actions?: ReactNode;
}) {
  const hasLint = lint != null && lint.error + lint.warn + lint.info > 0;
  const content = (
    <>
      <span className={cn("shrink-0", missing ? "text-fg-faint opacity-60" : "text-fg-faint")}>
        {icon}
      </span>
      {/* Wide: name, description, lint and meta share one line. Under 480 px the description drops
          to a second line under the name, with the whole row to read in, instead of being cut to two
          letters beside the meta; the meta keeps one right-aligned column. */}
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2.5 @[480px]:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
        <span
          className={cn(
            "col-start-1 row-start-1 min-w-0 truncate font-mono text-sm",
            missing ? "text-fg-faint" : "text-fg",
          )}
        >
          {name}
        </span>
        {secondary && (
          <span className="col-span-3 col-start-1 row-start-2 min-w-0 truncate text-fg-faint text-xs @[480px]:col-span-1 @[480px]:col-start-2 @[480px]:row-start-1 @[480px]:text-sm">
            {secondary}
          </span>
        )}
        {hasLint && lint && (
          <span className="col-start-2 row-start-1 @[480px]:col-start-3">
            <LintBadge counts={lint} variant="dot" />
          </span>
        )}
        {meta && (
          <span className="col-start-3 row-start-1 min-w-[6.5rem] whitespace-nowrap text-right text-fg-faint text-xs tabular @[480px]:col-start-4">
            {meta}
          </span>
        )}
      </span>
    </>
  );

  const main = "flex min-h-9 min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1 text-left";
  return (
    <div
      data-wf="DocsListRow"
      data-missing={missing || undefined}
      className="group @container flex min-h-9 w-full min-w-0 items-center transition-colors duration-100 focus-within:bg-subtle hover:bg-subtle"
    >
      {onClick ? (
        <button
          type="button"
          data-path={path}
          onClick={onClick}
          // The base.css focus ring, drawn inside the row so the list's rounded clip keeps it whole.
          className={cn(main, "focus-visible:-outline-offset-2")}
        >
          {content}
          <ChevronRight
            {...ICON}
            aria-hidden
            className="-mr-0.5 shrink-0 text-fg-faint opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100"
          />
        </button>
      ) : (
        <div className={main}>{content}</div>
      )}
      {actions && <div className="flex shrink-0 items-center pr-1.5">{actions}</div>}
    </div>
  );
}

/** "View source": the file's text, inline. The label shrinks to an icon in a narrow list. */
function ViewSource({ rel, onViewSource }: { rel: string; onViewSource: (rel: string) => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      data-source-path={rel}
      aria-label={`View source of ${rel}`}
      title="View source"
      onClick={() => onViewSource(rel)}
      className="text-fg-muted"
    >
      <FileCode {...ICON} aria-hidden />
      <span className="hidden @[420px]:inline">View source</span>
    </Button>
  );
}

function DocName({ path }: { path: string }) {
  const cut = path.lastIndexOf("/");
  if (cut === -1) return <>{path}</>;
  return (
    <>
      <span className="text-fg-faint">{path.slice(0, cut + 1)}</span>
      {path.slice(cut + 1)}
    </>
  );
}

function DocKindIcon({ kind }: { kind: DocFile["kind"] }) {
  if (kind === "image") return <FileImage {...ICON} />;
  if (kind === "markdown") return <FileText {...ICON} />;
  return <File {...ICON} />;
}

const KIND_RANK: Record<DocFile["kind"], number> = { markdown: 0, image: 1, other: 2 };

function isPresent(name: IssueFileName, d: IssueDetail): boolean {
  if (name in d.files_rev) return true;
  switch (name) {
    case "goal.md":
      return true;
    case "plan.md":
      return d.plan != null;
    case "current_state.md":
      return d.state != null;
    case "changes.md":
      return d.changes.length > 0;
    case "decisions.md":
      return d.decisions.length > 0;
    case "learnings.md":
      return d.learnings.length > 0;
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function issueFileMeta(name: IssueFileName, d: IssueDetail): ReactNode {
  switch (name) {
    case "goal.md":
      return d.goal.frontmatter_ok ? (
        plural(d.criteria.length, "criterion", "criteria")
      ) : (
        <span className="text-danger">Frontmatter does not parse</span>
      );
    case "plan.md": {
      if (!d.plan) return null;
      const tasks = d.plan.phases.reduce((n, p) => n + p.tasks.length, 0);
      return `${plural(tasks, "task", "tasks")} · rev ${d.plan.revision}`;
    }
    case "current_state.md":
      return d.state ? (
        <span className="inline-flex items-center gap-1">
          updated <RelativeTime ts={d.state.updated_at} />
        </span>
      ) : null;
    case "changes.md":
      return d.changes.length ? plural(d.changes.length, "entry", "entries") : "Empty";
    case "decisions.md":
      return d.decisions.length ? plural(d.decisions.length, "entry", "entries") : "Empty";
    case "learnings.md":
      return d.learnings.length ? plural(d.learnings.length, "entry", "entries") : "Empty";
  }
}

function lintFor(diagnostics: Diagnostic[], rel: string, basePath?: string): LintCounts {
  const counts: LintCounts = { error: 0, warn: 0, info: 0 };
  const full = basePath ? `${basePath.replace(/\/$/, "")}/${rel}` : rel;
  for (const d of diagnostics) if (d.file === full || d.file === rel) counts[d.severity] += 1;
  return counts;
}
