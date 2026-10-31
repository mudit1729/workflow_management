// The header of a page: breadcrumbs, the title, a meta line (updated, by whom, how long to read)
// and the actions: Ask about this page, Link to an issue…, Copy link, Open on GitHub, the Rendered
// | Source switch and, in the personal library, Edit.
import { Check, ExternalLink, Link as LinkIcon, Pencil, Sparkles } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { AuthorChip, copyText, RelativeTime } from "@/components/common";
import { Button, Chip, Segmented } from "@/components/ui";
import { FilesLink } from "@/features/files/useFilesNav";
import { MetaLine } from "@/features/issue/MetaLine";
import type { LibraryInfo, LibraryPage } from "@/lib/api/types";
import { hrefFor, libraryHref, useGo, useOpenPage } from "@/lib/nav";
import { openAsk } from "./ask-hook";
import { LinkToIssue } from "./LinkToIssue";
import { asTimestamp } from "./page-text";
import { TeamLibraryMenu } from "./team/TeamLibraryMenu";

export type PageView = "rendered" | "source";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** Library / This workspace / Playbooks: each part a link. */
function Breadcrumbs({ page, library }: { page: LibraryPage; library: LibraryInfo }) {
  const open = useOpenPage();
  const go = useGo();
  const crumb = (label: string, href: string, run: () => void): ReactNode => (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        run();
      }}
      className="truncate hover:text-fg"
    >
      {label}
    </a>
  );
  const items: ReactNode[] = [
    crumb("Library", hrefFor("/lib"), () => void go.library()),
    crumb(library.name, libraryHref(library.alias), () => open({ alias: library.alias })),
    ...page.trail.map((t) =>
      crumb(t.title, libraryHref(library.alias, t.page ?? t.path), () =>
        open({ alias: library.alias, path: t.page ?? t.path }),
      ),
    ),
  ];
  return (
    <nav
      data-wf="Breadcrumbs"
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-fg-muted text-sm"
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="text-fg-faint">
              /
            </span>
          )}
          {item}
        </Fragment>
      ))}
    </nav>
  );
}

/** "Updated 3 days ago by @ana · 5 min read", each part only when it is known. */
function PageMeta({ page }: { page: LibraryPage }) {
  return (
    <MetaLine wf="PageMeta" className="text-fg-muted text-sm">
      {page.kind !== "page" && page.kind !== "section" && (
        <Chip>{page.kind.replace(/-/g, " ")}</Chip>
      )}
      {page.updated ? (
        <span className="inline-flex items-center gap-1">
          Updated <RelativeTime ts={asTimestamp(page.updated)} long />
          {page.author && (
            <>
              {" by "}
              <AuthorChip handle={page.author} variant="text" />
            </>
          )}
        </span>
      ) : page.created ? (
        <span className="inline-flex items-center gap-1">
          Created <RelativeTime ts={asTimestamp(page.created)} long />
          {page.author && (
            <>
              {" by "}
              <AuthorChip handle={page.author} variant="text" />
            </>
          )}
        </span>
      ) : (
        page.author && (
          <span className="inline-flex items-center gap-1">
            By <AuthorChip handle={page.author} variant="text" />
          </span>
        )
      )}
      <span>{page.read_minutes} min read</span>
    </MetaLine>
  );
}

/** The address of a page as a link a person can paste, with its heading. */
export function pageUrl(alias: string, path: string, anchor?: string): string {
  return new URL(libraryHref(alias, path, anchor), window.location.href).href;
}

function CopyLink({ page }: { page: LibraryPage }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        if (!(await copyText(pageUrl(page.alias, page.path)))) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check {...ICON} aria-hidden /> : <LinkIcon {...ICON} aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export interface PageHeaderProps {
  page: LibraryPage;
  library: LibraryInfo;
  view: PageView;
  onView: (view: PageView) => void;
  onEdit?: () => void;
  /** Extra controls before the actions (the outline popover, the tree button). */
  leading?: ReactNode;
  /** Something after the meta line: "Saved · pushed a1b2c3d". */
  note?: ReactNode;
}

export function PageHeader({
  page,
  library,
  view,
  onView,
  onEdit,
  leading,
  note,
}: PageHeaderProps) {
  return (
    <header data-wf="PageHeader" className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Breadcrumbs page={page} library={library} />
        <Segmented
          size="sm"
          aria-label="Show the rendered page or the markdown source"
          value={view}
          onChange={onView}
          options={[
            { value: "rendered", label: "Rendered" },
            { value: "source", label: "Source" },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="m-0 text-balance font-semibold text-[26px] text-fg leading-tight tracking-[-0.02em] min-[1280px]:text-[28px]">
          {page.title}
        </h1>
        <PageMeta page={page} />
        {note}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {leading}
        <Button variant="secondary" size="sm" onClick={() => openAsk(page.address)}>
          <Sparkles {...ICON} aria-hidden />
          Ask about this page
        </Button>
        <LinkToIssue page={page} />
        <CopyLink page={page} />
        {page.github && (
          <Button variant="secondary" size="sm" asChild>
            <a href={page.github} target="_blank" rel="noopener noreferrer">
              <ExternalLink {...ICON} aria-hidden />
              Open on GitHub
            </a>
          </Button>
        )}
        {library.kind === "workspace" && (
          <Button variant="secondary" size="sm" asChild>
            <FilesLink path={page.file}>Open in Files</FilesLink>
          </Button>
        )}
        {onEdit && (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil {...ICON} aria-hidden />
            Edit
          </Button>
        )}
        {library.kind === "team" && <TeamLibraryMenu library={library} />}
      </div>
    </header>
  );
}
