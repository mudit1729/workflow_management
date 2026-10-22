// Navigation helpers. Features use these instead of raw router calls, so route
// paths live in one place. Paths (contract 1.11):
//   /w            board            search: group, swim, author, q, show
//   /w/i/$id      board + drawer   search: board search + tab, log
//   /i/$id        full issue page  search: tab, log (tab used below 768 px only)
//   /lib, /lib/$id                 search: tab (items | glossary), kind, q
//   /inbox
//   /kit          component gallery (prototype only)
import { useNavigate, useParams, useRouterState, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { IssueId, LibId } from "@/gen/types";

export type IssueTab = "now" | "goal" | "plan" | "log" | "files";
export type LogView = "changes" | "decisions" | "learnings";
export const ISSUE_TABS: IssueTab[] = ["now", "goal", "plan", "log", "files"];

export interface BoardSearch {
  group?: string; // group id; the board shows that subtree
  swim?: "child" | "none";
  author?: string; // handle filter
  q?: string; // text filter
  show?: "cancelled";
}

export interface IssueSearch {
  tab?: IssueTab;
  log?: LogView;
}

export type DrawerSearch = BoardSearch & IssueSearch;

export interface LibrarySearch {
  tab?: "items" | "glossary";
  kind?: string;
  q?: string;
}

type NavOpts = {
  to: string;
  params?: Record<string, string>;
  search?: unknown;
  replace?: boolean;
};
function useNav() {
  return useNavigate() as unknown as (o: NavOpts) => Promise<void>;
}

export function usePathname(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}

const BOARD_KEYS: (keyof BoardSearch)[] = ["group", "swim", "author", "q", "show"];
function pickBoard(s: Record<string, unknown>): BoardSearch {
  const out: Record<string, unknown> = {};
  for (const k of BOARD_KEYS) if (s[k] !== undefined) out[k] = s[k];
  return out as BoardSearch;
}

/** Open an issue: drawer over the board, or the full page (forced below 768 px). */
export function useOpenIssue() {
  const nav = useNav();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const path = usePathname();
  return useCallback(
    (id: IssueId, opts: { tab?: IssueTab; log?: LogView; page?: boolean } = {}) => {
      const narrow = typeof window !== "undefined" && window.innerWidth < 768;
      const tabSearch: IssueSearch = {};
      if (opts.tab) tabSearch.tab = opts.tab;
      if (opts.log) tabSearch.log = opts.log;
      if (opts.page || narrow) {
        return nav({ to: "/i/$id", params: { id }, search: tabSearch });
      }
      const board = path.startsWith("/w") ? pickBoard(search) : {};
      return nav({ to: "/w/i/$id", params: { id }, search: { ...board, ...tabSearch } });
    },
    [nav, search, path],
  );
}

/** Close the drawer and keep the board filters. */
export function useCloseIssue() {
  const nav = useNav();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  return useCallback(() => nav({ to: "/w", search: pickBoard(search) }), [nav, search]);
}

/** The id of the issue open in the drawer or page, if any. */
export function useOpenIssueId(): IssueId | undefined {
  const params = useParams({ strict: false }) as { id?: string };
  const path = usePathname();
  return path.startsWith("/w/i/") || path.startsWith("/i/") ? params.id : undefined;
}

export function useBoardSearch(): [BoardSearch, (patch: Partial<BoardSearch>) => void] {
  const nav = useNav();
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const path = usePathname();
  const search = pickBoard(raw);
  const set = useCallback(
    (patch: Partial<BoardSearch>) => {
      const next: Record<string, unknown> = { ...raw, ...patch };
      for (const k of Object.keys(next))
        if (next[k] === undefined || next[k] === "") delete next[k];
      nav({ to: path.startsWith("/w") ? path : "/w", search: next, replace: true });
    },
    [nav, raw, path],
  );
  return [search, set];
}

/** Current drawer/page tab and log view, with setters that keep other params. */
export function useIssueTab(defaultTab: IssueTab = "now") {
  const nav = useNav();
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const path = usePathname();
  const tab = (raw.tab as IssueTab | undefined) ?? defaultTab;
  const log = (raw.log as LogView | undefined) ?? "changes";
  const setTab = useCallback(
    (t: IssueTab) => nav({ to: path, search: { ...raw, tab: t }, replace: true }),
    [nav, raw, path],
  );
  const setLog = useCallback(
    (v: LogView) => nav({ to: path, search: { ...raw, tab: "log", log: v }, replace: true }),
    [nav, raw, path],
  );
  return { tab, setTab, log, setLog };
}

export function useGo() {
  const nav = useNav();
  return {
    board: (search: BoardSearch = {}) => nav({ to: "/w", search }),
    library: (search: LibrarySearch = {}) => nav({ to: "/lib", search }),
    libraryItem: (id: LibId) => nav({ to: "/lib/$id", params: { id } }),
    inbox: () => nav({ to: "/inbox" }),
    kit: () => nav({ to: "/kit" }),
    issuePage: (id: IssueId, search: IssueSearch = {}) =>
      nav({ to: "/i/$id", params: { id }, search }),
  };
}

/** href builders for <a> tags (copy link, middle-click). Hash-router aware. */
export function hrefFor(path: string): string {
  return import.meta.env.VITE_HASH_ROUTER === "1" ? `#${path}` : path;
}
