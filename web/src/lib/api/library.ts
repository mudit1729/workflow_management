// Libraries from the browser: the workspace's own, the person's personal one and any team library
// added by a GitHub link (docs/plan/proposals/libraries-spec.md). All of them are folders of
// markdown, so one set of hooks reads them all: the list, a page tree, a page, the pages that
// link to it, and a search over sections. Reads follow the library live while a component that
// uses them is mounted: an edit in Files, on disk or in the personal library shows at once.
//
// The writes follow `files.ts`: `savePage` shows its own toast on failure and resolves to
// `undefined`; `addLibrary` and `removeLibrary` throw, because their callers (the Add team library
// dialog, a remove button) explain the failure beside the control.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "./client";
import { firstProblem, isConflictError, isUnprocessableError, NotFoundError } from "./error";
import { qk } from "./keys";
import { isRealApi, loadMock } from "./mock-bridge";
import { useDebounced } from "./queries";
import { queryClient } from "./query-client";
import type {
  LibraryInfo,
  LibraryPage,
  LibraryPassage,
  LibraryScope,
  LibrarySource,
  PageRef,
  ResolvedAddress,
} from "./types";

// ---------------------------------------------------------------- following the libraries

let retained = 0;
let release: (() => void) | undefined;

/** Ask for every library query again. */
function refreshLibraries() {
  void queryClient.invalidateQueries({ queryKey: qk.libraries() });
}

/** Subscribe to the mock's library changes. `wf serve` has no stream: writes invalidate instead. */
function connectLibraryLive(): (() => void) | undefined {
  if (isRealApi) return undefined;
  let cancelled = false;
  let off: (() => void) | undefined;
  void loadMock().then((mock) => {
    if (cancelled) return;
    off = mock.subscribeLibraries(refreshLibraries);
  });
  return () => {
    cancelled = true;
    off?.();
  };
}

/**
 * Follow the libraries while a component is mounted. The subscription is shared and counted, so
 * any number of hooks cost one listener (the same shape as `useCodexLive`).
 */
export function useLibraryLive(): void {
  useEffect(() => {
    retained += 1;
    if (retained === 1) release = connectLibraryLive();
    return () => {
      retained -= 1;
      if (retained === 0) {
        release?.();
        release = undefined;
      }
    };
  }, []);
}

// ---------------------------------------------------------------- reads

/** The workspace library first, then the personal one, then the team libraries. */
export function useLibraries() {
  useLibraryLive();
  return useQuery({ queryKey: qk.libraries(), queryFn: () => api.libraries() });
}

/** One library of `useLibraries()` by alias. `undefined` while the list loads or when there is none. */
export function useLibrary(alias?: string): LibraryInfo | undefined {
  return useLibraries().data?.find((l) => l.alias === alias);
}

/** The page tree of a library. */
export function useLibraryTree(alias?: string) {
  useLibraryLive();
  return useQuery({
    queryKey: qk.libraryTree(alias ?? ""),
    queryFn: () => api.libraryTree(alias as string),
    enabled: !!alias,
  });
}

/** One page. `path` may leave out `.md`; a folder name opens the page of the section. */
export function useLibraryPage(alias?: string, path?: string) {
  useLibraryLive();
  return useQuery({
    queryKey: qk.libraryPage(alias ?? "", path ?? ""),
    queryFn: () => api.libraryPage(alias as string, path as string),
    enabled: !!alias && path !== undefined,
  });
}

/** The pages of any library that link to the page at `address` (`alias:path`). */
export function useBacklinks(address?: string) {
  useLibraryLive();
  return useQuery<PageRef[]>({
    queryKey: qk.libraryBacklinks(address ?? ""),
    queryFn: () => api.libraryBacklinks(address as string),
    enabled: !!address,
  });
}

/**
 * Ranked passages (sections of pages) for a query, with the words marked. Waits 150 ms after the
 * last keystroke and keeps the previous passages meanwhile. Nothing is searched for an empty query.
 */
export function useLibrarySearch(query: string, scope: LibraryScope = "all", k = 10) {
  useLibraryLive();
  const term = useDebounced(query.trim(), 150);
  return useQuery<LibraryPassage[]>({
    queryKey: qk.librarySearch(term, scope, k),
    queryFn: () => api.librarySearch(term, scope, k),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

/** Where a link text or an address goes: `runbooks/x`, `platform:runbooks/x#rotate`, `lib-6pm4c`, `wf-3k9x2`. */
export function resolveAddress(
  raw: string,
  from?: { alias: string; path: string },
): Promise<ResolvedAddress> {
  return queryClient.fetchQuery({
    queryKey: qk.libraryResolve(raw, from ? `${from.alias}:${from.path}` : ""),
    queryFn: () => api.libraryResolve(raw, from),
    staleTime: 5_000,
  });
}

/** The workspace's `NotFoundError` for a page nobody wrote. */
export const isPageMissing = (error: unknown): boolean => error instanceof NotFoundError;

// ---------------------------------------------------------------- writes

/**
 * Save a page of the personal library (creates it when missing). Resolves to the new `rev` and
 * the commit the bridge made, or `undefined` after a toast when it failed.
 */
export async function savePage(args: {
  alias: string;
  path: string;
  text: string;
  base_rev?: string;
}): Promise<{ rev: string; commit: string } | undefined> {
  try {
    const result = await api.savePage(args);
    refreshLibraries();
    return result;
  } catch (err) {
    refreshLibraries();
    if (isConflictError(err)) {
      toast.warning(`${err.body.reason}. Your save was refused.`, {
        description: "Use Reload to see the new text, or Overwrite to keep yours.",
        duration: 10_000,
      });
    } else if (isUnprocessableError(err)) {
      toast.error(firstProblem(err).message);
    } else {
      toast.error("Could not save the page", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    }
    return undefined;
  }
}

/** Delete a page of the personal library. Throws when the server refuses. */
export async function deletePage(args: { alias: string; path: string }): Promise<void> {
  try {
    await api.deletePage(args);
  } finally {
    refreshLibraries();
  }
}

/** Add a pasted or dropped image or video to the personal library. Throws when refused. */
export async function saveMedia(args: {
  alias: string;
  path: string;
  media: { url: string; bytes: number };
}): Promise<void> {
  try {
    await api.saveMedia(args);
  } finally {
    refreshLibraries();
  }
}

/** Add a team library. Throws an `ApiError` (422) when its alias is taken. */
export async function addLibrary(source: LibrarySource): Promise<LibraryInfo> {
  try {
    return await api.addLibrary(source);
  } finally {
    refreshLibraries();
  }
}

/** Remove a team library. The workspace library and the personal library stay. */
export async function removeLibrary(alias: string): Promise<void> {
  try {
    await api.removeLibrary(alias);
  } finally {
    refreshLibraries();
  }
}

export const useSavePage = () => savePage;
export const useAddLibrary = () => addLibrary;
export const useRemoveLibrary = () => removeLibrary;

export type { LibraryPage };
