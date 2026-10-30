// The generated page of a library or a section that has no page of its own: its name, what it
// holds, and its sections with the pages in them. Nothing here is stored; it is the tree, drawn.

import type { LibraryInfo, LibraryTreeNode } from "@/lib/api/types";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { TeamLibraryMenu } from "./team/TeamLibraryMenu";

function PageLinks({ alias, nodes }: { alias: string; nodes: LibraryTreeNode[] }) {
  const open = useOpenPage();
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-6 p-0 sm:grid-cols-2">
      {nodes.map((n) => {
        const path = n.type === "section" ? (n.page ?? n.path) : n.path;
        return (
          <li key={`${n.type}:${n.path}`} className="min-w-0">
            <a
              href={libraryHref(alias, path)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                open({ alias, path });
              }}
              className="flex items-baseline gap-2 truncate py-1 text-md text-fg hover:text-accent"
            >
              <span className="min-w-0 truncate">{n.title}</span>
              {n.type === "section" && (
                <span className="tabular shrink-0 text-fg-faint text-xs">{n.count}</span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export interface LibraryOverviewProps {
  library: LibraryInfo;
  /** The section to draw; the whole library without it. */
  section?: LibraryTreeNode;
  /** The top level of the library. */
  nodes: LibraryTreeNode[];
}

/** The nodes in tree order: each section with its pages, and the loose pages between sections as one list. */
export function overviewBlocks(
  nodes: LibraryTreeNode[],
): ({ section: LibraryTreeNode } | { pages: LibraryTreeNode[] })[] {
  const out: ({ section: LibraryTreeNode } | { pages: LibraryTreeNode[] })[] = [];
  for (const n of nodes) {
    if (n.type === "section") out.push({ section: n });
    else {
      const last = out.at(-1);
      if (last && "pages" in last) last.pages.push(n);
      else out.push({ pages: [n] });
    }
  }
  return out;
}

export function LibraryOverview({ library, section, nodes }: LibraryOverviewProps) {
  const own = section?.children ?? nodes;
  const total = section?.count ?? library.pages;
  return (
    <div
      data-wf="LibraryOverview"
      className="mx-auto flex w-full max-w-[72ch] flex-col gap-8 px-6 py-8 sm:px-10"
    >
      <header className="flex flex-col gap-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h1 className="m-0 font-semibold text-[26px] text-fg leading-tight tracking-[-0.02em] min-[1280px]:text-[28px]">
            {section?.title ?? library.name}
          </h1>
          {!section && <TeamLibraryMenu library={library} />}
        </div>
        {!section && library.description && (
          <p className="m-0 text-fg-muted text-lg leading-snug">{library.description}</p>
        )}
        <p className="m-0 text-fg-muted text-sm">
          {total} {total === 1 ? "page" : "pages"}
          {!section && library.media > 0 && ` · ${library.media} media files`}
        </p>
      </header>
      {overviewBlocks(own).map((block) =>
        "section" in block ? (
          <section
            key={block.section.path}
            aria-label={block.section.title}
            className="flex flex-col gap-1.5"
          >
            <h2 className="m-0 border-border border-b pb-1.5 font-semibold text-fg text-lg">
              {block.section.title}
            </h2>
            <PageLinks alias={library.alias} nodes={block.section.children ?? []} />
          </section>
        ) : (
          <PageLinks key={block.pages[0]?.path} alias={library.alias} nodes={block.pages} />
        ),
      )}
      {own.length === 0 && <p className="m-0 text-fg-faint text-md">No pages here yet.</p>}
    </div>
  );
}
