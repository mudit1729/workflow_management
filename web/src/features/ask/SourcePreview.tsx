// A cited section, opened in the panel: the part of the page the answer drew on, as the library
// renders it, with a way to the whole page. What a citation `[n]` and a source row open.
import { ArrowUpRight, X } from "lucide-react";
import { MarkdownProse } from "@/components/common";
import { IconButton, Skeleton } from "@/components/ui";
import { useLibraryPage } from "@/lib/api";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { headingAnchor } from "./answer";
import { sectionOf } from "./section";

export interface SourcePreviewProps {
  /** `alias:path` of the page. */
  address: string;
  /** The section's heading as the answer wrote it; none for the lead of the page. */
  heading?: string;
  onClose: () => void;
}

export function SourcePreview({ address, heading, onClose }: SourcePreviewProps) {
  const at = address.indexOf(":");
  const alias = address.slice(0, at);
  const path = address.slice(at + 1);
  const query = useLibraryPage(alias, path);
  const page = query.data;
  const open = useOpenPage();
  const section = page ? sectionOf(page, heading) : undefined;
  const anchor = section?.heading ? headingAnchor(section.heading) : undefined;

  return (
    <div
      data-wf="SourcePreview"
      className="flex min-w-0 flex-col rounded-md border border-border bg-subtle"
    >
      <div className="flex min-h-8 items-center gap-1 border-border border-b py-1 pr-1 pl-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm">
          <span className="min-w-0 truncate font-medium text-fg">{page?.title ?? address}</span>
          {section?.heading && (
            <>
              <span aria-hidden className="text-fg-faint">
                ›
              </span>
              <span className="min-w-0 truncate text-fg-muted">{section.heading}</span>
            </>
          )}
        </div>
        <a
          href={libraryHref(alias, path, anchor)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            void open({ alias, path, anchor });
          }}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-fg-muted text-sm hover:bg-muted hover:text-fg"
        >
          Open page
          <ArrowUpRight aria-hidden size={14} strokeWidth={1.75} />
        </a>
        <IconButton
          size="sm"
          label="Close preview"
          icon={<X size={14} strokeWidth={1.75} />}
          onClick={onClose}
        />
      </div>
      <div className="max-h-72 min-w-0 overflow-y-auto px-3 py-2.5">
        {query.isError ? (
          <p className="m-0 text-fg-muted text-sm">This page is not in the library any more.</p>
        ) : !page || !section ? (
          <div role="status" aria-label="Reading the page" className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        ) : (
          <>
            {section.missing && (
              <p className="m-0 mb-2 text-sm text-stale-text">
                The page has no section “{heading}” now. Its start is shown.
              </p>
            )}
            <MarkdownProse
              md={section.md}
              document="pane"
              wiki={{ alias: page.alias, path: page.path, links: page.links, media: page.media }}
            />
          </>
        )}
      </div>
    </div>
  );
}
