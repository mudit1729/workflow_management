// The Library page, the first view of the Workdatabase: facets, the list and the item open in a
// detail pane, under one 44 px top bar that starts with the Workdatabase tabs. By page width
// (the rail counts as page):
//   1100 px and up   facets, list and the item beside each other
//   860 to 1099 px   an open item takes the facets' place: filter chips above the list, the item
//                    beside it (the list keeps its status column)
//   under 860 px     an open item is a screen of its own, and so it is on a phone
// The list never sits half under the item.
import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ViewTabs } from "@/components/common";
import { SearchInput } from "@/components/ui";
import type { LibId, LibraryKind, LibrarySummary } from "@/gen/types";
import { useSearch as useServerSearch, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useHotkey, useMediaQuery } from "@/lib/hooks";
import {
  compareLibrary,
  type FacetState,
  facetCounts,
  hasFilters,
  matches,
  NO_FILTERS,
  topTags,
} from "./filters";
import { LibraryFacets, LibraryFilterChips } from "./LibraryFacets";
import { LibraryItemView } from "./LibraryItemView";
import { LibraryList } from "./LibraryList";
import { useElementWidth } from "./useElementWidth";
import { useLibraryNav } from "./useLibraryNav";
import { useSearchBox } from "./useSearchBox";

/** Page width at which the item docks beside facets and list. */
const DOCK_AT = 1100;
/** Page width under which an open item is a screen of its own: a list needs 360 px beside it. */
const SPLIT_AT = 860;
/** The pane reads a document: docked it grows with the page, 520 to 640 px. */
const paneWidthFor = (page: number) => Math.round(Math.min(640, Math.max(520, page * 0.4)));
/** Without facets the pane takes what the list can spare: the list keeps 360 px. */
const splitPaneWidth = (page: number) => Math.min(560, page - 360);

export interface LibraryViewProps {
  /** The item open in the detail pane (`/lib/$id`). */
  selectedId?: LibId;
}

export function LibraryView({ selectedId }: LibraryViewProps) {
  const nav = useLibraryNav();
  const snapshot = useSnapshot();
  const narrow = useMediaQuery("(max-width: 767px)");
  // Measured on the root, which every layout renders, so a resize is seen from the item screen too.
  const [measure, width] = useElementWidth();
  const docked = !narrow && width >= DOCK_AT;
  // An open item beside the list, without the facets, when the page is between the two widths.
  const split = !narrow && width >= SPLIT_AT && width < DOCK_AT && Boolean(selectedId);
  const itemScreen = Boolean(selectedId) && (narrow || (width > 0 && width < SPLIT_AT));
  const paneWidth = split ? splitPaneWidth(width) : paneWidthFor(width);

  // ---- search box: instant in the field, debounced into the URL and the server query
  const { input, setInput } = useSearchBox(nav.q, nav.setQuery);
  const q = input.trim();

  // ---- items
  const items = snapshot.data?.library;
  const search = useServerSearch(q, "library");
  const hits = q ? search.data : undefined;

  const [local, setLocal] = useState(NO_FILTERS);
  const filters = useMemo<FacetState>(() => ({ ...local, kind: nav.kind }), [local, nav.kind]);

  const base = useMemo<LibrarySummary[]>(() => {
    const all = items ?? [];
    if (!q) return [...all].sort(compareLibrary);
    const byId = new Map(all.map((i) => [i.id, i]));
    const seen = new Set<string>();
    const ordered: LibrarySummary[] = [];
    for (const h of hits ?? []) {
      const item = h.kind === "library" ? byId.get(h.id) : undefined;
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        ordered.push(item);
      }
    }
    return ordered;
  }, [items, q, hits]);

  const counts = useMemo(() => facetCounts(base, filters), [base, filters]);
  const tags = useMemo(() => topTags(base, filters.tags), [base, filters.tags]);
  const visible = useMemo(() => base.filter((i) => matches(i, filters)), [base, filters]);
  const filtered = hasFilters(filters);

  const clearFilters = () => {
    setLocal(NO_FILTERS);
    nav.setKind(undefined);
  };
  const facetHandlers = {
    onKind: (kind: LibraryKind | undefined) => nav.setKind(kind),
    onStatus: (status: FacetState["status"]) => setLocal((f) => ({ ...f, status })),
    onTag: (tag: string) =>
      setLocal((f) => ({
        ...f,
        tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
      })),
    onOverdue: (overdue: boolean) => setLocal((f) => ({ ...f, overdue })),
  };

  useHotkey("Escape", () => nav.close(), { enabled: Boolean(selectedId) });

  const listError =
    snapshot.isError && !items
      ? {
          title: "Could not load the library",
          hint: "The server did not answer. Your files are safe.",
          onRetry: () => void snapshot.refetch(),
        }
      : q && search.isError && !hits
        ? {
            title: "The search failed",
            hint: "The server did not answer. Try again in a moment.",
            onRetry: () => void search.refetch(),
          }
        : undefined;
  const loading = snapshot.isPending || (Boolean(q) && !hits && !search.isError);
  const refreshing = Boolean(q) && Boolean(hits) && (search.isPlaceholderData || search.isFetching);

  // A small page shows an open item as a screen of its own.
  if (itemScreen && selectedId) {
    return (
      <div
        ref={measure}
        data-wf="LibraryView"
        data-screen="item"
        className="h-full min-h-0 min-w-0 bg-bg"
      >
        <h1 className="sr-only">Workdatabase · Library</h1>
        <LibraryItemView id={selectedId} variant="screen" onClose={nav.close} />
      </div>
    );
  }

  const pane = <LibraryItemView id={selectedId as LibId} onClose={nav.close} />;
  const searchBox = (
    <SearchInput
      value={input}
      onChange={setInput}
      placeholder="Search the library"
      shortcut={narrow ? undefined : "/"}
    />
  );
  // The facets give way to the filter chips on a phone and beside an open item.
  const chips = narrow || split;

  return (
    <div ref={measure} data-wf="LibraryView" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4">
        <h1 className="sr-only">Workdatabase · Library</h1>
        <ViewTabs view="workdatabase" />
        {/* The box shrinks before it overflows; on a phone it moves to a row of its own. */}
        {!narrow && <div className="ml-auto min-w-0 max-w-64 flex-1">{searchBox}</div>}
      </header>
      {narrow && <div className="shrink-0 bg-bg px-4 pt-2 pb-2.5">{searchBox}</div>}

      <div className="flex min-h-0 min-w-0 flex-1">
        {!chips && (
          <LibraryFacets
            filters={filters}
            counts={counts}
            tags={tags}
            active={filtered}
            onClear={clearFilters}
            {...facetHandlers}
          />
        )}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <section aria-label="Library list" className="flex min-h-0 min-w-0 flex-1 flex-col">
            {chips && <LibraryFilterChips filters={filters} counts={counts} {...facetHandlers} />}
            <LibraryList
              items={visible}
              selectedId={selectedId}
              onSelect={nav.select}
              query={q}
              loading={loading}
              busy={refreshing}
              error={listError}
              total={items?.length ?? 0}
              filtered={filtered}
              onClearFilters={clearFilters}
            />
          </section>

          {(docked || split) && (
            <aside
              aria-label="Library item"
              style={{ width: paneWidth }}
              className={cn(
                "min-h-0 shrink-0 border-border border-l bg-bg",
                split && "fade-in-0 animate-in duration-150 ease-wf",
              )}
            >
              {selectedId ? (
                pane
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={<BookOpen strokeWidth={1.75} />}
                    title="Select an item"
                    hint="Pick an item to read its page, its sources and the issues that use it."
                  />
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
