// Facet filtering for the library list. Counts follow the usual faceted-search rule: a facet's
// counts ignore its own selection, so you can see what picking another value would give.
import type { LibraryKind, LibraryStatus, LibrarySummary } from "@/gen/types";
import { LIBRARY_KINDS, LIBRARY_STATUSES } from "./meta";

export interface LibraryFilters {
  status?: LibraryStatus;
  /** Every selected tag must match. */
  tags: string[];
  overdue: boolean;
}

export const NO_FILTERS: LibraryFilters = { tags: [], overdue: false };

type Facet = "kind" | "status" | "tags" | "overdue";

export interface FacetState extends LibraryFilters {
  kind?: LibraryKind;
}

export function hasFilters(f: FacetState): boolean {
  return Boolean(f.kind || f.status || f.tags.length > 0 || f.overdue);
}

export function matches(item: LibrarySummary, f: FacetState, skip?: Facet): boolean {
  if (skip !== "kind" && f.kind && item.kind !== f.kind) return false;
  if (skip !== "status" && f.status && item.status !== f.status) return false;
  if (skip !== "tags" && f.tags.some((t) => !item.tags.includes(t))) return false;
  if (skip !== "overdue" && f.overdue && !item.review_overdue) return false;
  return true;
}

export interface FacetCounts {
  kind: Record<LibraryKind, number>;
  status: Record<LibraryStatus, number>;
  tags: Map<string, number>;
  overdue: number;
}

export function facetCounts(base: LibrarySummary[], f: FacetState): FacetCounts {
  const kind = Object.fromEntries(LIBRARY_KINDS.map((k) => [k, 0])) as Record<LibraryKind, number>;
  const status = Object.fromEntries(LIBRARY_STATUSES.map((s) => [s, 0])) as Record<
    LibraryStatus,
    number
  >;
  const tags = new Map<string, number>();
  let overdue = 0;
  for (const item of base) {
    if (matches(item, f, "kind")) kind[item.kind]++;
    if (matches(item, f, "status")) status[item.status]++;
    if (matches(item, f, "tags")) for (const t of item.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    if (matches(item, f, "overdue") && item.review_overdue) overdue++;
  }
  return { kind, status, tags, overdue };
}

/**
 * The tags to offer: the most used ones across `base`, plus any selected tag, so a selection never
 * disappears. The set ignores the other facets, which keeps the list from jumping while you filter.
 */
export function topTags(base: LibrarySummary[], selected: string[], limit = 12): string[] {
  const total = new Map<string, number>();
  for (const item of base) for (const t of item.tags) total.set(t, (total.get(t) ?? 0) + 1);
  const ranked = [...total.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
  const top = ranked.slice(0, limit);
  for (const t of selected) if (!top.includes(t)) top.push(t);
  return top;
}

const STATUS_WEIGHT: Record<LibraryStatus, number> = { draft: 0, reviewed: 1, retired: 2 };

/** Default order: drafts first (they wait for a reviewer), then reviewed, then retired; newest first. */
export function compareLibrary(a: LibrarySummary, b: LibrarySummary): number {
  const byStatus = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
  if (byStatus) return byStatus;
  const byOverdue = Number(b.review_overdue) - Number(a.review_overdue);
  if (byOverdue) return byOverdue;
  const da = a.last_reviewed ?? a.created;
  const db = b.last_reviewed ?? b.created;
  return db.localeCompare(da) || a.title.localeCompare(b.title);
}
