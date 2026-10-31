// What the search box finds: sections of pages, ranked, grouped by library, each with the heading
// it sits under and the matching words marked (spec 5, Search).
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Skeleton } from "@/components/ui";
import { useLibraries, useLibrarySearch } from "@/lib/api";
import type { LibraryPassage, LibraryScope } from "@/lib/api/types";
import { libraryHref, useOpenPage } from "@/lib/nav";
import { Highlighted } from "./Highlighted";

/** Passages grouped by library, in the order of `order` (aliases); a library with none is left out. */
export function groupByLibrary(
  passages: LibraryPassage[],
  order: string[],
): { alias: string; library: string; passages: LibraryPassage[] }[] {
  const by = new Map<string, LibraryPassage[]>();
  for (const p of passages) by.set(p.alias, [...(by.get(p.alias) ?? []), p]);
  const rank = (alias: string) => {
    const i = order.indexOf(alias);
    return i === -1 ? order.length : i;
  };
  return [...by]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([alias, list]) => ({ alias, library: list[0]?.library ?? alias, passages: list }));
}

export function Passage({ hit, onOpen }: { hit: LibraryPassage; onOpen?: () => void }) {
  const open = useOpenPage();
  return (
    <a
      data-wf="SearchPassage"
      href={libraryHref(hit.alias, hit.path, hit.anchor)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        open({ alias: hit.alias, path: hit.path, anchor: hit.anchor });
        onOpen?.();
      }}
      className="flex min-w-0 flex-col gap-1 rounded-md px-3 py-2.5 transition-colors duration-100 ease-wf hover:bg-subtle"
    >
      <span className="flex min-w-0 items-baseline gap-1.5 text-md">
        <span className="min-w-0 truncate font-medium text-fg">{hit.pageTitle}</span>
        {hit.heading && (
          <>
            <span aria-hidden className="text-fg-faint">
              ›
            </span>
            <span className="min-w-0 truncate text-fg-muted">{hit.heading}</span>
          </>
        )}
      </span>
      <span className="line-clamp-2 text-base text-fg-muted leading-snug">
        <Highlighted text={hit.snippet} marks={hit.marks} />
      </span>
    </a>
  );
}

export interface SearchResultsProps {
  q: string;
  scope: LibraryScope;
}

export function SearchResults({ q, scope }: SearchResultsProps) {
  const libraries = useLibraries().data ?? [];
  const search = useLibrarySearch(q, scope, 40);
  const hits = search.data;
  const groups = groupByLibrary(
    hits ?? [],
    libraries.map((l) => l.alias),
  );
  return (
    <div
      data-wf="SearchResults"
      className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-8"
    >
      <h2 className="m-0 font-semibold text-xl text-fg">
        Results for <span className="text-fg-muted">“{q.trim()}”</span>
      </h2>
      {!hits ? (
        <div role="status" aria-label="Searching" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<SearchX strokeWidth={1.75} />}
          title="Nothing matches"
          hint="Try fewer words, or search in all libraries."
        />
      ) : (
        groups.map((g) => (
          <section key={g.alias} aria-label={g.library} className="flex flex-col gap-1">
            <h3 className="m-0 flex items-baseline gap-1.5 px-3 font-medium text-fg-faint text-xs">
              {g.library}
              <span className="tabular font-normal">{g.passages.length}</span>
            </h3>
            <div className="flex flex-col">
              {g.passages.map((p) => (
                <Passage key={p.address} hit={p} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
