// One page of a library as a document: the rendered markdown (or its source), the pages below it
// when it is a section's page, and a footer with the neighbours in reading order.
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { MarkdownProse } from "@/components/common";
import { SourceCode } from "@/features/files/SourceCode";
import type { LibraryPage, PageRef } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { useItemOf } from "./Facts";
import { GlossaryView } from "./GlossaryView";
import { ItemBanners } from "./ItemBanners";
import { splitFrontmatter } from "./markdown";
import type { PageView as View } from "./PageHeader";
import { withoutTitleHeading } from "./page-text";
import { TeamCommit } from "./team/TeamCommit";

/** The pages below a section, as a list under its own text. */
export function SectionList({ title, pages }: { title: string; pages: PageRef[] }) {
  const open = useOpenPage();
  if (pages.length === 0) return null;
  return (
    <section data-wf="SectionList" aria-label={title} className="flex flex-col gap-2">
      <h2 className="m-0 font-medium text-fg-faint text-xs">{title}</h2>
      <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-md border border-border p-0">
        {pages.map((p) => (
          <li key={p.address}>
            <a
              href={libraryHref(p.alias, p.path)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                open({ alias: p.alias, path: p.path });
              }}
              className="block truncate px-3 py-2 text-base text-fg hover:bg-subtle"
            >
              {p.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Neighbour({ page, side }: { page: PageRef | null; side: "prev" | "next" }) {
  const open = useOpenPage();
  if (!page) return <span />;
  return (
    <a
      href={libraryHref(page.alias, page.path)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open({ alias: page.alias, path: page.path });
      }}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-md border border-border px-3 py-2 transition-colors duration-100 ease-wf hover:border-border-strong hover:bg-subtle",
        side === "next" && "items-end text-right",
      )}
    >
      <span className="flex items-center gap-1 text-fg-faint text-xs">
        {side === "prev" && <ArrowLeft aria-hidden size={12} strokeWidth={1.75} />}
        {side === "prev" ? "Previous" : "Next"}
        {side === "next" && <ArrowRight aria-hidden size={12} strokeWidth={1.75} />}
      </span>
      <span className="max-w-full truncate text-base text-fg">{page.title}</span>
    </a>
  );
}

/** The neighbours in reading order (`[` and `]` go there too), and where the page is from. */
export function PageFooter({ page }: { page: LibraryPage }) {
  return (
    <footer data-wf="PageFooter" className="mt-6 flex flex-col gap-3 border-border border-t pt-4">
      {(page.prev || page.next) && (
        <div className="grid grid-cols-2 gap-3">
          <Neighbour page={page.prev} side="prev" />
          <Neighbour page={page.next} side="next" />
        </div>
      )}
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-fg-faint text-xs">
        {page.libraryKind === "team" ? (
          <TeamCommit page={page} />
        ) : (
          page.commit && <code className="font-mono">{page.commit}</code>
        )}
        <span className="min-w-0 truncate font-mono" title={page.file}>
          {page.file}
        </span>
      </p>
    </footer>
  );
}

export interface PageDocumentProps {
  page: LibraryPage;
  view: View;
}

/** The text of a page, rendered or as written. */
export function PageDocument({ page, view }: PageDocumentProps) {
  const item = useItemOf(page);
  const body = useMemo(
    () => withoutTitleHeading(splitFrontmatter(page.text).body, page.title),
    [page.text, page.title],
  );
  const wiki = useMemo(
    () => ({ alias: page.alias, path: page.path, links: page.links, media: page.media }),
    [page.alias, page.path, page.links, page.media],
  );
  if (view === "source")
    return (
      <SourceCode
        text={page.text}
        lang="md"
        wrap
        className="max-h-[calc(100dvh-300px)] min-h-40 rounded-md border border-border"
      />
    );
  // The glossary reads best as its terms, each with the words to avoid and what to see.
  if (page.kind === "glossary") return <GlossaryView embedded />;
  return (
    <div data-wf="PageDocument" className="flex min-w-0 flex-col gap-5">
      {item && <ItemBanners detail={item} />}
      <MarkdownProse
        md={body}
        document="wiki"
        wiki={wiki}
        empty={<p className="m-0 text-fg-faint text-md">This page has no text yet.</p>}
      />
    </div>
  );
}
