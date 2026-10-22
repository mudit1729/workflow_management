// The middle pane: a count line and the scrolling list of items, with loading, empty and error states.
import { BookOpen, SearchX, TriangleAlert } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { EmptyState } from "@/components/common";
import { Button, Skeleton } from "@/components/ui";
import type { LibId, LibrarySummary } from "@/gen/types";
import { cn } from "@/lib/cn";
import { LibraryRow } from "./LibraryRow";
import { rowDomId } from "./meta";

export interface LibraryListProps {
  items: LibrarySummary[];
  selectedId?: LibId;
  onSelect: (id: LibId) => void;
  /** The text being searched, if any. */
  query: string;
  /** The first load of the snapshot or of a new search. */
  loading: boolean;
  /** A search is refreshing: keep the old rows, dim them. */
  busy: boolean;
  error?: { title: string; hint: string; onRetry: () => void };
  /** Items in the library before any search or filter. */
  total: number;
  filtered: boolean;
  onClearFilters: () => void;
}

export function LibraryList({
  items,
  selectedId,
  onSelect,
  query,
  loading,
  busy,
  error,
  total,
  filtered,
  onClearFilters,
}: LibraryListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Bring a deep-linked item into view once, when the selection changes.
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(rowDomId(selectedId))?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-lib-row]") ?? [])];
    if (rows.length === 0) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    let next = at;
    if (e.key === "ArrowDown") next = Math.min(rows.length - 1, at + 1);
    if (e.key === "ArrowUp") next = Math.max(0, at === -1 ? 0 : at - 1);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = rows.length - 1;
    e.preventDefault();
    rows[next]?.focus();
  };

  return (
    <div data-wf="LibraryList" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-border border-b px-4 text-fg-faint text-sm">
        {loading ? (
          <Skeleton className="h-3 w-20" />
        ) : (
          <>
            <span className="min-w-0 truncate tabular" aria-live="polite">
              {countLine(items.length, total, query, filtered)}
            </span>
            <span className="ml-auto shrink-0 text-xs">
              {query ? "Best match first" : "Drafts first"}
            </span>
          </>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto transition-opacity duration-150",
          busy && "opacity-60",
        )}
        aria-busy={loading || busy}
      >
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={error.title}
            hint={error.hint}
            action={
              <Button size="sm" onClick={error.onRetry}>
                Try again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          total === 0 ? (
            <EmptyState
              icon={<BookOpen />}
              title="The library is empty"
              hint="Promote a learning or decision from an issue. It starts as a draft and waits for a reviewer."
              skill="promote-to-library"
              command="wf promote <issue>#<entry> --kind pattern"
            />
          ) : (
            <EmptyState
              icon={<SearchX />}
              title={query ? `Nothing matches “${query}”` : "No items match these filters"}
              hint={
                query
                  ? "Try a shorter word, or search by tag or file path."
                  : "Remove a filter to see more items."
              }
              action={
                filtered ? (
                  <Button size="sm" onClick={onClearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <ul
            ref={listRef}
            aria-label="Library items"
            onKeyDown={onKeyDown}
            className="divide-y divide-border"
          >
            {items.map((item) => (
              <LibraryRow
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function countLine(shown: number, total: number, query: string, filtered: boolean): string {
  const noun = (n: number) => (n === 1 ? "item" : "items");
  if (query) return `${shown} ${shown === 1 ? "result" : "results"} for “${query}”`;
  if (filtered) return `${shown} of ${total} ${noun(total)}`;
  return `${total} ${noun(total)}`;
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading library" className="divide-y divide-border">
      {["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-3/4", "w-1/2"].map((w, i) => (
        <div key={i} className="flex items-start gap-2.5 px-4 py-3">
          <Skeleton className="mt-0.5 size-3.5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={cn("h-3.5", w)} />
            <Skeleton className="h-3 w-11/12" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
