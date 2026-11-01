// Lint findings for one issue, grouped by file, with a severity filter.
import { CircleCheck, CircleX, FileText, Info, Pencil, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { CopyButton, EmptyState } from "@/components/common";
import { IconButton, Segmented, Tooltip } from "@/components/ui";
import { FilesLink, useFilesNav } from "@/features/files";
import type { Diagnostic, LintCounts, Severity } from "@/gen/types";
import { cn } from "@/lib/cn";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

type Filter = "all" | Severity;

/** Opens `path` in Workdatabase · Files with its editor on, the caret on `line`. */
export function useEditAtLine() {
  const files = useFilesNav();
  return (path: string, line: number) => files.edit(path, { line });
}

interface LintPanelProps {
  diagnostics: Diagnostic[];
  /** Workspace-relative issue folder; file names are shown relative to it. */
  basePath?: string;
}

export function LintPanel({ diagnostics, basePath }: LintPanelProps) {
  const [filter, setFilter] = useState<Filter>("all");

  if (diagnostics.length === 0) {
    return (
      <div data-wf="LintPanel" data-state="clean">
        <EmptyState
          compact
          icon={<CircleCheck {...ICON} className="text-status-done" />}
          title="No lint findings"
          hint="Every file in this issue passes the format, workflow and writing rules."
        />
      </div>
    );
  }

  const counts = countBySeverity(diagnostics);
  const shown = filter === "all" ? diagnostics : diagnostics.filter((d) => d.severity === filter);
  const groups = groupByFile(shown, basePath);

  return (
    <div data-wf="LintPanel" className="flex flex-col gap-3">
      <Segmented<Filter>
        size="sm"
        aria-label="Filter findings by severity"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: diagnostics.length },
          { value: "error", label: "Errors", count: counts.error },
          { value: "warn", label: "Warnings", count: counts.warn },
          { value: "info", label: "Info", count: counts.info },
        ]}
      />
      {groups.length === 0 ? (
        <p className="px-0.5 py-2 text-fg-faint text-sm">{EMPTY_FILTER[filter]}</p>
      ) : (
        groups.map((g) => (
          <section
            key={g.file}
            aria-label={g.rel}
            className="overflow-hidden rounded-md border border-border"
          >
            <div className="flex h-8 items-center gap-2 border-border border-b bg-subtle px-2.5">
              <FileText {...ICON} className="shrink-0 text-fg-faint" />
              <span className="min-w-0 truncate font-mono text-fg text-sm">{g.rel}</span>
              <span className="ml-auto shrink-0 text-fg-faint text-xs tabular">
                {severitySummary(countBySeverity(g.items))}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {g.items.map((d) => (
                <LintRow
                  key={`${d.rule}:${d.line}:${d.col}:${d.span[0]}`}
                  d={d}
                  path={workspacePath(d.file, basePath)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function LintRow({ d, path }: { d: Diagnostic; path: string }) {
  const editAtLine = useEditAtLine();
  const location = `${path}:${d.line}`;

  return (
    <li
      data-wf="LintRow"
      data-severity={d.severity}
      className="grid grid-cols-[14px_auto_minmax(0,1fr)_auto] items-start gap-x-2 px-2.5 py-2"
    >
      <SeverityIcon severity={d.severity} />
      <Tooltip content={RULE_TITLES[d.rule] ? `${d.rule}: ${RULE_TITLES[d.rule]}` : d.rule}>
        <span className="rounded-sm bg-muted px-1 font-mono text-fg-muted text-xs leading-[19px]">
          {d.rule}
        </span>
      </Tooltip>
      <div className="min-w-0">
        <p className="text-base text-fg">
          <CodeSpans text={d.message} />
        </p>
        {d.fix && (
          <p className="mt-0.5 text-fg-faint text-sm">
            Fix: <CodeSpans text={d.fix} />
          </p>
        )}
      </div>
      <div className="-my-0.5 flex items-center gap-0.5">
        <FilesLink
          path={path}
          line={d.line}
          title={`Open ${location} in Files`}
          aria-label={`Open ${location} in Files`}
          className="inline-flex h-5 items-center whitespace-nowrap rounded-sm px-1 text-fg-faint text-xs tabular transition-colors duration-100 hover:bg-muted hover:text-fg"
        >
          line {d.line}
        </FilesLink>
        <IconButton
          size="sm"
          label="Edit at this line"
          icon={<Pencil {...ICON} />}
          onClick={() => void editAtLine(path, d.line)}
          className="text-fg-faint hover:text-fg"
        />
        <CopyButton text={location} label={`Copy ${location}`} />
      </div>
    </li>
  );
}

/** Messages quote names and commands in backticks. Show those spans as inline code. */
export function CodeSpans({ text }: { text: string }) {
  const parts = text.split("`");
  // An odd number of backticks leaves the last span open: show it as plain text.
  const balanced = parts.length % 2 === 1;
  return (
    <span data-wf="CodeSpans">
      {parts.map((part, i) =>
        i % 2 === 1 && (balanced || i < parts.length - 1) ? (
          <code key={i} className="code-inline rounded-sm bg-muted px-1 py-px text-fg">
            {part}
          </code>
        ) : (
          <span key={i}>
            {i % 2 === 1 ? "`" : ""}
            {part}
          </span>
        ),
      )}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const cls = "mt-[2.5px] shrink-0";
  if (severity === "error")
    return <CircleX {...ICON} aria-label="Error" className={cn(cls, "text-danger")} />;
  if (severity === "warn")
    return <TriangleAlert {...ICON} aria-label="Warning" className={cn(cls, "text-stale")} />;
  return <Info {...ICON} aria-label="Info" className={cn(cls, "text-fg-faint")} />;
}

// ---------------------------------------------------------------- grouping

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
const FILE_ORDER = [
  "goal.md",
  "plan.md",
  "current_state.md",
  "changes.md",
  "decisions.md",
  "learnings.md",
];

const EMPTY_FILTER: Record<Filter, string> = {
  all: "No lint findings.",
  error: "No errors.",
  warn: "No warnings.",
  info: "No info findings.",
};

/** The workspace-relative path of a finding's file (a bare name is taken as inside `basePath`). */
function workspacePath(file: string, basePath?: string): string {
  if (!basePath || file.includes("/")) return file;
  return `${basePath.replace(/\/$/, "")}/${file}`;
}

function relativeTo(file: string, basePath?: string): string {
  if (!basePath) return file;
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return file.startsWith(base) ? file.slice(base.length) : file;
}

function groupByFile(diagnostics: Diagnostic[], basePath?: string) {
  const map = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const list = map.get(d.file);
    if (list) list.push(d);
    else map.set(d.file, [d]);
  }
  const rank = (rel: string) => {
    const i = FILE_ORDER.indexOf(rel);
    return i === -1 ? FILE_ORDER.length : i;
  };
  return [...map.entries()]
    .map(([file, items]) => ({
      file,
      rel: relativeTo(file, basePath),
      items: items.sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.line - b.line,
      ),
    }))
    .sort((a, b) => rank(a.rel) - rank(b.rel) || a.rel.localeCompare(b.rel));
}

/** Findings per severity, in the shape `LintBadge` takes. */
export function countBySeverity(diagnostics: Diagnostic[]): LintCounts {
  const counts: LintCounts = { error: 0, warn: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity] += 1;
  return counts;
}

function severitySummary(c: LintCounts): string {
  const parts: string[] = [];
  if (c.error) parts.push(`${c.error} ${c.error === 1 ? "error" : "errors"}`);
  if (c.warn) parts.push(`${c.warn} ${c.warn === 1 ? "warning" : "warnings"}`);
  if (c.info) parts.push(`${c.info} info`);
  return parts.join(" · ");
}

/** Short names for the canonical rules (contract Part 3 §4), shown on hover. */
const RULE_TITLES: Record<string, string> = {
  F001: "Invalid YAML frontmatter",
  F002: "Required field missing",
  F003: "Value not in the allowed list",
  F004: "Duplicate ID",
  F005: "Malformed entry or task heading",
  F006: "Unknown key, kept as written",
  F007: "wf_format mismatch",
  F008: "Issue folder also has _group.md",
  F009: "Dangling reference",
  F010: "Archify block has an unknown type or invalid JSON",
  F011: "Archify render failed",
  F012: "Git conflict markers",
  F013: "Unknown dependency, or a dependency cycle",
  F014: "Overlapping owns in one plan",
  F016: "Entry without an author",
  F017: "Meta list after a blank line",
  Q001: "Done, but the criteria are not met",
  Q002: "In progress without a plan",
  Q003: "Stale: no recent activity",
  Q004: "Lease expired",
  Q005: "current_state is older than the latest change",
  Q006: "Criterion not covered by any task",
  Q007: "Task satisfies no criterion",
  Q008: "current_state over 400 words, or no Next steps",
  Q009: "Two live decisions share a topic",
  Q010: "Criterion ticked without evidence",
  Q011: "Secret detected",
  Q012: "Author not in authors.md",
  Q013: "Library item past its review date",
  Q014: "Plan too long, or a phase of more than 10 tasks",
  S01: "Sentence too long",
  S02: "Paragraph over 6 sentences",
  S03: "Passive voice",
  S04: "More than one instruction in a step",
  S05: "Step does not start with a verb",
  S06: "Hedge word",
  S07: "Criterion claim cannot be measured",
  S08: "Criterion not in an EARS pattern",
  S09: "Glossary synonym",
  S10: "Undefined acronym",
  S11: 'Starts with "It" or "This", or uses a contraction',
  S12: "Warning placed after its step",
  S13: "Date-only timestamp",
};
