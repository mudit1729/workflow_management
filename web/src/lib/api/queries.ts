// Read hooks. Each one is a TanStack Query over the `api` object; the live stream and the
// write hooks keep them fresh by invalidating the keys in `keys.ts`.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./client";
import { qk } from "./keys";
import type { SearchScope } from "./types";

export const snapshotQuery = () => ({
  queryKey: qk.snapshot(),
  queryFn: () => api.snapshot(),
});

export function useSnapshot() {
  return useQuery(snapshotQuery());
}

export function useIssue(id?: string) {
  return useQuery({
    queryKey: qk.issue(id ?? ""),
    queryFn: () => api.issue(id as string),
    enabled: !!id,
  });
}

export function useLibraryItem(id?: string) {
  return useQuery({
    queryKey: qk.library(id ?? ""),
    queryFn: () => api.libraryItem(id as string),
    enabled: !!id,
  });
}

export function useGlossary() {
  return useQuery({
    queryKey: qk.glossary(),
    queryFn: () => api.glossary(),
    staleTime: 5 * 60_000,
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Server-side search. Waits 120 ms after the last keystroke and keeps the previous hits meanwhile. */
export function useSearch(q: string, scope: SearchScope = "all", k = 12) {
  const term = useDebounced(q.trim(), 120);
  return useQuery({
    queryKey: qk.search(term, scope, k),
    queryFn: () => api.search(term, scope, k),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

/** The `wf context` bundle for an issue, as markdown. */
export function useContextBundle(id?: string, budget = 6000) {
  return useQuery({
    queryKey: qk.context(id ?? "", budget),
    queryFn: () => api.context(id as string, budget),
    enabled: !!id,
  });
}
