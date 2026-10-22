// Goal tab: goal.md. Why the issue exists, how we know it is done, and what it
// leaves out. A file with broken frontmatter still shows: the finding, the raw
// file with the bad line marked, and whatever body the tolerant reader salvaged.
import { FileText, OctagonAlert, Target } from "lucide-react";
import { Fragment, type ReactNode, useId, useLayoutEffect, useMemo, useRef } from "react";
import { CopyButton, EmptyState, MarkdownProse } from "@/components/common";
import type { Diagnostic, IssueDetail } from "@/gen/types";
import { cn } from "@/lib/cn";
import { CoverageStrip } from "../CoverageStrip";
import { CriteriaChecklist } from "../CriteriaChecklist";
import { CodeSpans } from "../LintPanel";

export interface GoalTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function GoalTab({ detail, variant }: GoalTabProps) {
  const { goal, criteria, summary } = detail;
  const tasks = useMemo(() => detail.plan?.phases.flatMap((p) => p.tasks) ?? [], [detail.plan]);
  const extra = Object.entries(goal.extra ?? {});
  const context = goal.context_md?.trim();
  const outOfScope = goal.out_of_scope_md?.trim();
  const links = goal.links_md?.trim();
  const hasBody = Boolean(context || outOfScope || links) || criteria.length > 0;

  return (
    // The frame (IssueView) owns padding and scrolling for both variants.
    <div data-wf="GoalTab" data-variant={variant} className="flex flex-col gap-6">
      {!goal.frontmatter_ok && (
        <FrontmatterError raw={goal.raw} file={goal.edit.file} diagnostics={detail.diagnostics} />
      )}

      {!hasBody && goal.frontmatter_ok && (
        <EmptyState
          icon={<Target strokeWidth={1.75} />}
          title="No goal yet"
          hint="Context says why the issue matters. Success criteria say how we know it is done."
          skill="write-goal"
        />
      )}

      {context && (
        <GoalSection title="Context" wf="GoalContext">
          <MarkdownProse md={goal.context_md} diagrams={detail.diagrams} issueId={summary.id} />
        </GoalSection>
      )}

      {hasBody && (
        <GoalSection title={goal.criteria_heading || "Success criteria"} wf="GoalCriteria">
          <CriteriaChecklist criteria={criteria} issueId={summary.id} />
          {criteria.length > 0 &&
            (detail.plan ? (
              <div className="mt-3 border-t border-border pt-2">
                <CoverageStrip criteria={criteria} tasks={tasks} />
              </div>
            ) : (
              <p className="mt-3 border-t border-border pt-3 text-sm text-fg-faint">
                {summary.size === "xs" || summary.size === "s"
                  ? "No plan.md. Small issues may skip the plan, so task coverage is not tracked."
                  : "No plan.md yet. Coverage shows here once tasks name these criteria in satisfies."}
              </p>
            ))}
        </GoalSection>
      )}

      {outOfScope && (
        <GoalSection title="Out of scope" wf="GoalOutOfScope">
          <div className="text-fg-muted">
            <MarkdownProse md={outOfScope} issueId={summary.id} compact />
          </div>
        </GoalSection>
      )}

      {links && (
        <GoalSection title="Links" wf="GoalLinks">
          <MarkdownProse md={links} issueId={summary.id} compact />
        </GoalSection>
      )}

      {extra.length > 0 && (
        <GoalSection
          title="Other fields"
          wf="GoalExtraFields"
          meta={
            <span className="inline-flex items-center gap-1.5">
              wf keeps keys it does not know, as written
              <span className="font-mono">F006</span>
            </span>
          }
        >
          <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-xs">
            {extra.map(([key, value]) => (
              <Fragment key={key}>
                <dt className="truncate text-fg-faint">{key}</dt>
                <dd className="truncate text-fg-muted" title={value}>
                  {value}
                </dd>
              </Fragment>
            ))}
          </dl>
        </GoalSection>
      )}
    </div>
  );
}

function GoalSection({
  title,
  meta,
  wf,
  children,
}: {
  title: string;
  meta?: ReactNode;
  wf: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section data-wf={wf} aria-labelledby={id}>
      <header className="mb-2 flex min-h-5 items-center gap-2">
        <h3 id={id} className="text-sm font-medium text-fg-muted">
          {title}
        </h3>
        {meta && <div className="ml-auto flex items-center text-xs text-fg-faint">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- F001

function FrontmatterError({
  raw,
  file,
  diagnostics,
}: {
  raw?: string;
  file: string;
  diagnostics: Diagnostic[];
}) {
  const finding =
    diagnostics.find((d) => d.rule === "F001" && d.file.endsWith("goal.md")) ??
    diagnostics.find((d) => d.rule === "F001");
  const fileName = file.split("/").pop() || "goal.md";

  return (
    <section
      data-wf="FrontmatterError"
      aria-label="Invalid frontmatter"
      className="flex flex-col gap-3"
    >
      <div className="flex gap-2.5 rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5">
        <OctagonAlert
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="mt-0.5 shrink-0 text-danger"
        />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-fg">
            {fileName} frontmatter is invalid{" "}
            <span className="font-mono text-sm font-normal text-danger">(F001)</span>
          </p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {finding ? (
              <CodeSpans text={finding.message} />
            ) : (
              "The YAML between the --- lines could not be parsed."
            )}
          </p>
          {finding && (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-xs text-fg-faint">
              <span>
                {fileName}:{finding.line}
                {finding.col > 0 ? `:${finding.col}` : ""}
              </span>
              <span className="font-sans">
                <CopyButton text={`${finding.file}:${finding.line}`} label="Copy location" />
              </span>
            </p>
          )}
          {finding?.fix && (
            <p className="mt-1.5 text-sm text-fg-muted">
              <CodeSpans text={finding.fix} />
            </p>
          )}
        </div>
      </div>

      {raw !== undefined && <RawFile text={raw} fileName={fileName} errorLine={finding?.line} />}

      <p className="text-sm text-fg-faint">
        Fix the YAML by hand or ask an agent to run{" "}
        <code className="rounded-sm bg-muted px-1 py-px font-mono text-xs text-fg-muted">
          write-goal
        </code>
        . The sections below come from the parts wf could still read.
      </p>
    </section>
  );
}

function RawFile({
  text,
  fileName,
  errorLine,
}: {
  text: string;
  fileName: string;
  errorLine?: number;
}) {
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bring the bad line into view inside the block, without moving the tab panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the file or the bad line changes
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const row = box?.querySelector<HTMLElement>("[data-error-line]");
    if (!box || !row) return;
    const top = row.offsetTop - box.clientHeight / 3;
    if (top > 0) box.scrollTop = top;
  }, [errorLine, lines]);

  return (
    <figure data-wf="RawFile" className="overflow-hidden rounded-md border border-border bg-subtle">
      <figcaption className="flex h-8 items-center gap-1.5 border-b border-border pr-1.5 pl-3 text-xs text-fg-faint">
        <FileText size={14} strokeWidth={1.75} aria-hidden />
        <span className="font-mono text-fg-muted">{fileName}</span>
        <span>raw</span>
        {errorLine !== undefined && (
          <span className="text-danger">
            · error on line <span className="tabular">{errorLine}</span>
          </span>
        )}
        <span className="ml-auto">
          <CopyButton text={text} label="Copy file" />
        </span>
      </figcaption>
      <div ref={scrollRef} className="relative max-h-[360px] overflow-auto py-1.5">
        <pre className="min-w-max font-mono text-xs leading-5">
          {lines.map((line, i) => {
            const n = i + 1;
            const bad = n === errorLine;
            return (
              <span
                key={i}
                data-error-line={bad ? "" : undefined}
                className={cn(
                  "flex border-l-2",
                  bad ? "border-danger bg-danger/10" : "border-transparent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "w-10 shrink-0 pr-3 text-right tabular select-none",
                    bad ? "text-danger" : "text-fg-faint",
                  )}
                >
                  {n}
                </span>
                <code className={cn("pr-4", bad ? "text-fg" : "text-fg-muted")}>
                  {bad && <span className="sr-only">Error on line {n}: </span>}
                  {line || " "}
                </code>
              </span>
            );
          })}
        </pre>
      </div>
    </figure>
  );
}
