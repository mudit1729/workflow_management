// The right rail of a page: On this page, Linked from, Used in issues and the page's facts.
// At 1280 px and up it is a column beside the document; below that the same sections close the
// page (On this page moves to a popover in the header).
import type { ReactNode } from "react";
import { CopyButton, StatusIcon } from "@/components/common";
import { Tooltip } from "@/components/ui";
import type { IssueStatus } from "@/gen/types";
import type { LibraryPage } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenIssue, useOpenPage } from "@/lib/nav";
import { Fact, FrontmatterFacts, ItemFacts, useItemOf } from "./Facts";
import { Outline } from "./OnThisPage";

export function Section({
  title,
  count,
  children,
  className,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section data-wf="RailSection" className={cn("flex flex-col gap-1.5", className)}>
      <h2 className="m-0 flex items-baseline gap-1.5 font-medium text-fg-faint text-xs">
        {title}
        {count !== undefined && <span className="tabular font-normal">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function LinkedFrom({ page }: { page: LibraryPage }) {
  const open = useOpenPage();
  if (page.backlinks.length === 0) return null;
  return (
    <Section title="Linked from" count={page.backlinks.length}>
      <ul className="m-0 flex list-none flex-col p-0">
        {page.backlinks.map((b) => (
          <li key={b.address}>
            <a
              href={libraryHref(b.alias, b.path)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                open({ alias: b.alias, path: b.path });
              }}
              className="flex min-w-0 flex-col rounded-sm py-1 text-base leading-snug hover:text-fg"
            >
              <span className="truncate text-fg-muted hover:text-fg">{b.title}</span>
              {b.alias !== page.alias && (
                <span className="truncate text-fg-faint text-xs">{b.library}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function UsedIn({ page }: { page: LibraryPage }) {
  const openIssue = useOpenIssue();
  return (
    <Section title="Used in issues" count={page.used_in.length}>
      {page.used_in.length === 0 ? (
        <p className="m-0 text-fg-faint text-sm leading-snug">
          No issue links this page. Use Link to an issue… to add it to one.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {page.used_in.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => void openIssue(i.id)}
                className="flex w-full min-w-0 items-center gap-1.5 rounded-sm py-1 text-left text-base text-fg-muted leading-snug hover:text-fg"
              >
                <StatusIcon status={i.status as IssueStatus} size={12} />
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="shrink-0 font-mono text-fg-faint text-xs">{i.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** The page's own facts: what the frontmatter says, where the file is, which links are broken. */
function PageFacts({ page }: { page: LibraryPage }) {
  const item = useItemOf(page);
  return (
    <Section title="Page facts">
      {item ? <ItemFacts detail={item} /> : <FrontmatterFacts page={page} />}
      <dl className="m-0 mt-1 flex flex-col gap-2.5">
        <Fact label="File">
          <span className="flex min-w-0 items-center gap-1">
            <code className="code-inline min-w-0 flex-1 break-all" title={page.file}>
              {page.file}
            </code>
            <CopyButton text={page.file} label="Copy file path" />
          </span>
        </Fact>
        {page.commit && (
          <Fact label="Commit">
            <code className="code-inline">{page.commit}</code>
          </Fact>
        )}
        {page.broken.length > 0 && (
          <Fact label="Broken links">
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {page.broken.map((l) => (
                <li key={`${l.form}:${l.raw}`}>
                  <Tooltip content={l.missing ? `Missing ${l.missing}` : "Not found"}>
                    <code className="code-inline break-all text-fg-muted underline decoration-dashed decoration-fg-faint underline-offset-[3px]">
                      {l.raw}
                    </code>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </Fact>
        )}
      </dl>
    </Section>
  );
}

export interface RightRailProps {
  page: LibraryPage;
  /** The anchor of the heading being read. */
  active?: string;
  /** Leave out On this page: it is in the header. */
  outline?: boolean;
  className?: string;
}

export function RightRail({ page, active, outline = true, className }: RightRailProps) {
  const hasOutline = outline && page.headings.some((h) => h.depth >= 2 && h.depth <= 3);
  return (
    <div data-wf="RightRail" className={cn("flex flex-col gap-6", className)}>
      {hasOutline && (
        <Section title="On this page">
          <Outline
            alias={page.alias}
            path={page.path}
            headings={page.headings}
            alphabetical={page.kind === "glossary"}
            active={active}
          />
        </Section>
      )}
      <LinkedFrom page={page} />
      <UsedIn page={page} />
      <PageFacts page={page} />
    </div>
  );
}
