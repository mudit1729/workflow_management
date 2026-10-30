// Goal tab: goal.md. Why the issue exists, the context linked from the Workdatabase and what it
// leaves out. The success criteria have their own tab (Criteria). A file with broken frontmatter
// still shows: the finding, the raw file with the bad line marked, and whatever body the tolerant
// reader salvaged.
import { FileText, OctagonAlert, Pencil, Target } from "lucide-react";
import { Fragment, type ReactNode, useId, useLayoutEffect, useMemo, useRef } from "react";
import { CopyButton, EmptyState, MarkdownProse } from "@/components/common";
import { Button } from "@/components/ui";
import { AddContextButton, LinkedContext, LinkedPreview, linkKeys } from "@/features/context";
import type { Diagnostic, IssueDetail } from "@/gen/types";
import { cn } from "@/lib/cn";
import { CodeSpans, useEditAtLine } from "../LintPanel";
import { ASK, SkillHint, SkillLink } from "../skill-hint";

export interface GoalTabProps {
  detail: IssueDetail;
  variant: "drawer" | "page";
}

export function GoalTab({ detail, variant }: GoalTabProps) {
  const { goal, criteria, summary } = detail;
  const editAtLine = useEditAtLine();
  const extra = Object.entries(goal.extra ?? {});
  const context = goal.context_md?.trim();
  const outOfScope = goal.out_of_scope_md?.trim();
  const links = goal.links_md?.trim();
  const hasText = Boolean(context || outOfScope || links);
  // A goal with only criteria still offers "Add context" below.
  const hasBody = hasText || criteria.length > 0;

  return (
    // The frame (IssueView) owns padding and scrolling for both variants.
    <div data-wf="GoalTab" data-variant={variant} className="flex flex-col gap-6">
      {!goal.frontmatter_ok && (
        <FrontmatterError raw={goal.raw} file={goal.edit.file} diagnostics={detail.diagnostics} />
      )}

      {!hasText && goal.frontmatter_ok && (
        <EmptyState
          compact={criteria.length > 0}
          icon={<Target strokeWidth={1.75} />}
          title={criteria.length > 0 ? "No context yet" : "No goal yet"}
          hint={
            criteria.length > 0
              ? "Context says why the issue matters. The success criteria are in the Criteria tab."
              : "Context says why the issue matters. Success criteria say how we know it is done."
          }
          action={
            <div
              className={cn(
                "flex flex-col gap-3",
                criteria.length > 0 ? "items-start" : "items-center",
              )}
            >
              <Button
                variant="secondary"
                size={criteria.length > 0 ? "sm" : "md"}
                onClick={() => void editAtLine(goal.edit.file, 1)}
              >
                <Pencil aria-hidden />
                Write the context
              </Button>
              <SkillHint
                skill="using-wf"
                prompt={ASK.goal(summary.id)}
                align={criteria.length > 0 ? "start" : "center"}
              />
            </div>
          }
        />
      )}

      {context && (
        <GoalSection title="Context" wf="GoalContext">
          <MarkdownProse md={goal.context_md} diagrams={detail.diagrams} issueId={summary.id} />
        </GoalSection>
      )}

      {outOfScope && (
        <GoalSection title="Out of scope" wf="GoalOutOfScope">
          <div className="text-fg-muted">
            <MarkdownProse md={outOfScope} issueId={summary.id} compact />
          </div>
        </GoalSection>
      )}

      {(links || hasBody) && (
        <GoalSection
          title="Linked context"
          wf="GoalLinks"
          meta={<AddContextButton issueId={summary.id} linked={linkKeys(links, summary.path)} />}
        >
          {links ? (
            <>
              <LinkedContext
                md={links}
                issueId={summary.id}
                dir={summary.path}
                diagrams={detail.diagrams}
              />
              <LinkedPreview
                md={links}
                dir={summary.path}
                issueId={summary.id}
                issueTitle={summary.title}
              />
            </>
          ) : (
            <p className="text-sm text-fg-faint">
              Nothing linked yet. Add library items, glossary terms, files or decisions the agent
              should read.
            </p>
          )}
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
  const editAtLine = useEditAtLine();
  const path = finding?.file ?? file;

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
          <div className="mt-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void editAtLine(path, finding?.line ?? 1)}
            >
              <Pencil aria-hidden />
              Fix in editor
            </Button>
          </div>
        </div>
      </div>

      {raw !== undefined && <RawFile text={raw} fileName={fileName} errorLine={finding?.line} />}

      <p className="text-sm text-fg-faint">
        Fix the YAML in the editor, or ask your agent to repair it with the formats of the{" "}
        <SkillLink skill="using-wf" /> skill. The sections below come from the parts wf could still
        read.
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
