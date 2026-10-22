// The Library page: Items (facets, list, detail pane) and Glossary under one 44 px top bar.
// The detail pane docks at 1100 px of page width and overlays the list below that. On a phone the
// list and the item are separate screens.
import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/common";
import { SearchInput, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import type { LibId, LibraryKind, LibrarySummary } from "@/gen/types";
import { useGlossary, useSearch as useServerSearch, useSnapshot } from "@/lib/api";
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
import { GlossaryView } from "./GlossaryView";
import { LibraryFacets, LibraryFilterChips } from "./LibraryFacets";
import { LibraryItemView } from "./LibraryItemView";
import { LibraryList } from "./LibraryList";
import { type LibraryTab, useElementWidth, useLibraryNav } from "./useLibraryNav";

/** Page width at which the 480 px detail pane docks beside the list. */
const DOCK_AT = 1100;

export interface LibraryViewProps {
  /** The item open in the detail pane (`/lib/$id`). */
  selectedId?: LibId;
}

export function LibraryView({ selectedId }: LibraryViewProps) {
  const nav = useLibraryNav();
  const snapshot = useSnapshot();
  const glossary = useGlossary();
  const narrow = useMediaQuery("(max-width: 767px)");
  const [measure, width] = useElementWidth();
  const docked = width >= DOCK_AT;

  // ---- search box: instant in the field, debounced into the URL and the server query
  const [input, setInput] = useState(nav.q);
  const written = useRef(nav.q);
  const setQueryRef = useRef(nav.setQuery);
  setQueryRef.current = nav.setQuery;
  useEffect(() => {
    // A link or a back button changed ?q=. Adopt it unless we wrote it ourselves.
    if (nav.q !== written.current) {
      written.current = nav.q;
      setInput(nav.q);
    }
  }, [nav.q]);
  useEffect(() => {
    const next = input.trim();
    if (next === written.current) return;
    const t = setTimeout(() => {
      written.current = next;
      setQueryRef.current(next || undefined);
    }, 200);
    return () => clearTimeout(t);
  }, [input]);
  const clearQuery = () => {
    written.current = "";
    setInput("");
    nav.setQuery(undefined);
  };
  // The glossary filters locally, so only the Items tab asks the server. The hook waits for a
  // pause in typing and keeps the previous hits while the next ones load.
  const q = nav.tab === "items" ? input.trim() : "";

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

  return (
    <Tabs
      data-wf="LibraryView"
      value={nav.tab}
      onValueChange={(v: string) => nav.setTab(v as LibraryTab)}
      className="flex h-full min-h-0 min-w-0 flex-col bg-bg"
    >
      <header
        ref={measure}
        className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4"
      >
        <h1 className="font-semibold text-fg text-md">Library</h1>
        <TabsList aria-label="Library sections" className="h-full gap-4 border-b-0">
          <TabsTrigger value="items" count={items?.length}>
            Items
          </TabsTrigger>
          <TabsTrigger value="glossary" count={glossary.data?.length}>
            Glossary
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto min-w-0 flex-1 sm:w-64 sm:flex-none">
          <SearchInput
            value={input}
            onChange={setInput}
            placeholder={
              narrow ? "Search" : nav.tab === "items" ? "Search the library" : "Search the glossary"
            }
            shortcut={narrow ? undefined : "/"}
          />
        </div>
      </header>

      <TabsContent value="items" className="flex min-h-0 min-w-0 flex-1">
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
              className="min-h-0 w-[480px] shrink-0 border-border border-l bg-bg"
            >
              {selectedId ? (
                <LibraryItemView id={selectedId} onClose={nav.close} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={<BookOpen />}
                    title="Select an item"
                    hint="Pick an item to read its rule, its sources and the issues that use it."
                  />
                </div>
              )}
            </aside>
          )}

          {!docked && !narrow && selectedId && (
            <aside
              aria-label="Library item"
              className={cn(
                "absolute inset-y-0 right-0 z-10 min-h-0 w-[min(480px,100%)] border-border border-l bg-bg shadow-pop",
                "fade-in-0 slide-in-from-right-4 animate-in duration-200 ease-wf",
              )}
            >
              <LibraryItemView id={selectedId} onClose={nav.close} />
            </aside>
          )}
        </div>
      </TabsContent>

      <TabsContent value="glossary" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <GlossaryView query={input} onClearQuery={clearQuery} />
      </TabsContent>
    </Tabs>
  );
}
