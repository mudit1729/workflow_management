// The Library page, the first view of the Workdatabase: facets, the list and the item open in a
// detail pane, under one 44 px top bar that starts with the Workdatabase tabs. The detail pane
// docks at 1100 px of page width and overlays the list below that. On a phone the list and the
// item are separate screens.
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

/** Page width at which the detail pane docks beside the list. */
const DOCK_AT = 1100;
/** The pane reads a document: it grows with the page, 520 to 640 px. */
const paneWidthFor = (page: number) => Math.round(Math.min(640, Math.max(520, page * 0.4)));

export interface LibraryViewProps {
  /** The item open in the detail pane (`/lib/$id`). */
  selectedId?: LibId;
}

export function LibraryView({ selectedId }: LibraryViewProps) {
  const nav = useLibraryNav();
  const snapshot = useSnapshot();
  const narrow = useMediaQuery("(max-width: 767px)");
  const [measure, width] = useElementWidth();
  const docked = width >= DOCK_AT;
  const paneWidth = paneWidthFor(width);

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

  // On a phone an open item is a screen of its own.
  if (narrow && selectedId) {
    return (
      <div data-wf="LibraryView" data-screen="item" className="h-full min-h-0 min-w-0 bg-bg">
        <LibraryItemView id={selectedId} variant="screen" onClose={nav.close} />
      </div>
    );
  }

  const pane = <LibraryItemView id={selectedId as LibId} onClose={nav.close} />;

  return (
    <div data-wf="LibraryView" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <header
        ref={measure}
        className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4"
      >
        <ViewTabs view="workdatabase" />
        <div className="ml-auto min-w-0 flex-1 sm:w-64 sm:flex-none">
          <SearchInput
            value={input}
            onChange={setInput}
            placeholder={narrow ? "Search" : "Search the library"}
            shortcut={narrow ? undefined : "/"}
          />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        {!narrow && (
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
            {narrow && <LibraryFilterChips filters={filters} counts={counts} {...facetHandlers} />}
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

          {docked && (
            <aside
              aria-label="Library item"
              style={{ width: paneWidth }}
              className="min-h-0 shrink-0 border-border border-l bg-bg"
            >
              {selectedId ? (
                pane
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={<BookOpen />}
                    title="Select an item"
                    hint="Pick an item to read its page, its sources and the issues that use it."
                  />
                </div>
              )}
            </aside>
          )}

          {!docked && !narrow && selectedId && (
            <aside
              aria-label="Library item"
              className={cn(
                "absolute inset-y-0 right-0 z-10 min-h-0 w-[min(560px,100%)] border-border border-l bg-bg shadow-pop",
                "fade-in-0 slide-in-from-right-4 animate-in duration-200 ease-wf",
              )}
            >
              {pane}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
