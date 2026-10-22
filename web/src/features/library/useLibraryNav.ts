// Router access for the library page: tab, kind and q live in the URL, the selected item is the
// path. Selecting an item keeps the search params, so the list does not reset.
// (`useGo().libraryItem` drops them; the casts follow `src/lib/nav.ts`.)
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useLayoutEffect, useState } from "react";
import type { LibId, LibraryKind } from "@/gen/types";
import { type LibrarySearch, usePathname } from "@/lib/nav";

type NavOpts = {
  to: string;
  params?: Record<string, string>;
  search?: unknown;
  replace?: boolean;
};

export type LibraryTab = "items" | "glossary";

export interface LibraryNav {
  tab: LibraryTab;
  kind?: LibraryKind;
  q: string;
  select: (id: LibId) => void;
  close: () => void;
  setTab: (tab: LibraryTab) => void;
  setQuery: (q: string | undefined) => void;
  setKind: (kind: LibraryKind | undefined) => void;
}

function clean(search: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(search)) if (v !== undefined && v !== "") out[k] = v;
  return out;
}

export function useLibraryNav(): LibraryNav {
  const nav = useNavigate() as unknown as (o: NavOpts) => Promise<void>;
  const raw = useSearch({ strict: false }) as LibrarySearch & Record<string, unknown>;
  const path = usePathname();

  const select = useCallback(
    (id: LibId) => {
      void nav({ to: "/lib/$id", params: { id }, search: (prev: unknown) => prev });
    },
    [nav],
  );
  const close = useCallback(() => {
    void nav({ to: "/lib", search: (prev: unknown) => prev });
  }, [nav]);
  const setTab = useCallback(
    (tab: LibraryTab) => {
      // The glossary has no selected item, so it lives at /lib.
      void nav({
        to: "/lib",
        search: clean({ ...raw, tab: tab === "items" ? undefined : tab }),
        replace: true,
      });
    },
    [nav, raw],
  );
  const setQuery = useCallback(
    (q: string | undefined) => {
      void nav({ to: path, search: clean({ ...raw, q }), replace: true });
    },
    [nav, raw, path],
  );
  const setKind = useCallback(
    (kind: LibraryKind | undefined) => {
      void nav({ to: path, search: clean({ ...raw, kind }), replace: true });
    },
    [nav, raw, path],
  );

  return {
    tab: raw.tab === "glossary" ? "glossary" : "items",
    kind: raw.kind as LibraryKind | undefined,
    q: raw.q ?? "",
    select,
    close,
    setTab,
    setQuery,
    setKind,
  };
}

/** Width of an element in px; 0 until the first measurement (before paint). */
export function useElementWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}
