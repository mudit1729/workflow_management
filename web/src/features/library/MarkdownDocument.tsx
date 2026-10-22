// A whole markdown file as a calm HTML page. The text is the only source: the frontmatter
// becomes a compact properties block, the body is rendered in file order (every section, also
// the ones nobody planned for), and every block can name the line that produced it.
// Edit the file and the page changes with it.
import { type ReactNode, useMemo } from "react";
import { AuthorChip, MarkdownProse, RefLink } from "@/components/common";
import type { Diagram } from "@/gen/types";
import { cn } from "@/lib/cn";
import { type FrontmatterEntry, fenceDiagrams, splitFrontmatter, traceLayout } from "./markdown";
import { useElementWidth } from "./useElementWidth";

export interface MarkdownDocumentProps {
  /** Workspace-relative path of the file. */
  path: string;
  /** The file text, frontmatter included. */
  text: string;
  /**
   * Replaces the raw properties block (title, description and keys read from the text). Pass the
   * parsed fields when you have them, e.g. a library item with author chips.
   */
  frontmatter?: ReactNode;
  /** `page` is a full page (14 px body); `pane` fits a side pane (13 px body). */
  variant?: "page" | "pane";
  /** Diagrams of the issue the file belongs to: ```archify blocks render as cards. */
  diagrams?: Diagram[];
  /** The issue holding the file; resolves [[#T-4]]. */
  issueId?: string;
  /** Called with the file line of a clicked source tag. Default: open it in Workspace files. */
  onJump?: (line: number) => void;
  /**
   * Empty px the host leaves to the left of the document (its padding). The source tags hang
   * into it, so the text stays aligned with the title.
   */
  margin?: number;
  className?: string;
}

export function MarkdownDocument({
  path,
  text,
  frontmatter,
  variant = "page",
  diagrams,
  issueId,
  onJump,
  margin = 0,
  className,
}: MarkdownDocumentProps) {
  const split = useMemo(() => splitFrontmatter(text), [text]);
  const body = useMemo(
    () => (diagrams ? fenceDiagrams(split.body) : split.body),
    [split.body, diagrams],
  );
  const [outerRef, outer] = useElementWidth();
  const [innerRef, inner] = useElementWidth();
  const { gutter, hang } = traceLayout(outer, inner, margin);
  const page = variant === "page";

  return (
    <article
      ref={outerRef}
      data-wf="MarkdownDocument"
      data-variant={variant}
      data-path={path}
      className={cn("min-w-0", className)}
    >
      <div
        ref={innerRef}
        className={cn(
          "mx-auto flex min-w-0 flex-col",
          page ? "max-w-[68ch] gap-5" : "max-w-[72ch] gap-4",
        )}
      >
        {frontmatter ?? (split.entries && <RawHeader entries={split.entries} />)}
        <div style={hang > 0 ? { marginLeft: -hang } : undefined}>
          <MarkdownProse
            md={body}
            document={variant}
            diagrams={diagrams}
            issueId={issueId}
            source={{ path, lineOffset: split.lineOffset, onJump, gutter }}
            empty={
              <p className="text-fg-faint text-sm">This file has no text after its frontmatter.</p>
            }
          />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- properties

/** The grid that holds the properties of a document: two columns where there is room. */
export function Properties({ children }: { children: ReactNode }) {
  return (
    <div data-wf="Properties" className="@container min-w-0">
      <dl
        data-wf="DocumentProperties"
        className="m-0 grid grid-cols-1 gap-x-6 gap-y-1.5 border-border border-y py-2.5 text-sm @sm:grid-cols-2"
      >
        {children}
      </dl>
    </div>
  );
}

/** One property. `wide` takes the whole row (long values, chips). */
export function Property({
  label,
  wide,
  line,
  children,
}: {
  label: string;
  wide?: boolean;
  /** The line of the key in the file, for the tooltip. */
  line?: number;
  children: ReactNode;
}) {
  return (
    <div
      data-wf="Property"
      title={line ? `line ${line}` : undefined}
      className={cn("flex min-w-0 items-baseline gap-2.5", wide && "@sm:col-span-2")}
    >
      <dt className="w-[92px] shrink-0 truncate font-mono text-fg-faint text-xs">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 text-fg-muted">{children}</dd>
    </div>
  );
}

/** Text with [[refs]] and @handles resolved, the way the prose around it does. */
function Value({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^[\]\s]+\]\]|(?<![\w.@/+-])@[a-z0-9][a-z0-9._-]*[a-z0-9])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("[[")) return <RefLink key={i} target={part.slice(2, -2)} />;
        if (part.startsWith("@"))
          return <AuthorChip key={i} handle={part.slice(1)} variant="text" />;
        return part;
      })}
    </>
  );
}

/** The properties of a file we only have text for: the keys as written, in file order. */
function RawHeader({ entries }: { entries: FrontmatterEntry[] }) {
  const title = entries.find((e) => e.key === "title");
  const description = entries.find((e) => e.key === "description");
  const rest = entries.filter((e) => e !== title && e !== description);
  return (
    <header data-wf="DocumentHeader" className="flex min-w-0 flex-col gap-2">
      {title && (
        <h2 title={`line ${title.line}`} className="font-semibold text-fg text-lg leading-snug">
          {title.value}
        </h2>
      )}
      {description && (
        <p title={`line ${description.line}`} className="text-fg-muted text-md leading-normal">
          {description.value}
        </p>
      )}
      {rest.length > 0 && (
        <Properties>
          {rest.map((e) => (
            <Property
              key={`${e.key}-${e.line}`}
              label={e.key}
              line={e.line}
              wide={e.value.includes("\n") || e.value.length > 36}
            >
              {e.value === "" ? (
                <span className="text-fg-faint">empty</span>
              ) : (
                <span className="whitespace-pre-line break-words font-mono text-sm">
                  <Value text={e.value} />
                </span>
              )}
            </Property>
          ))}
        </Properties>
      )}
    </header>
  );
}
