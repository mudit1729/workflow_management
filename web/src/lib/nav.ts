// Navigation helpers. Features use these instead of raw router calls, so route
// paths live in one place. Paths (contract 1.11):
//   /w            board            search: group, swim, author, q, show, needs
//   /w/i/$id      board + drawer   search: board search + tab, log
//   /i/$id        full issue page  search: tab, log (tab used below 768 px only)
//   /lib                           Library home: the personal library, the team libraries, recent pages
//   /lib/me, /lib/me/<path>        the personal library (a page, or its home)   search: q, scope, view
//   /lib/t/<alias>, /lib/t/<alias>/<path>   a team library, the workspace's first   search: q, scope, view
//   /lib/$id                       old address of a library item (lib-xxxxx): redirects to its page
//   /glossary                      old address of the glossary: redirects to its page in the workspace library
//   /skills       Workdatabase · Skills        search: skill (the open skill, by reference: planning-issues, ws:acme-planning)
//   /settings                      redirects to /settings/flow
//   /settings/flow                 Settings · Skills flow   search: step (a step id, custom:<id> or new), after (with new), view (team)
//   /settings/flow/edit            the editor of a skill   search: skill, to, name, for
//   /settings/agent, /settings/workspace   the other two Settings tabs
//   /inbox        gone: redirects to /w?needs=me
//   /kit          component gallery (prototype only)
import { useNavigate, useParams, useRouterState, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { PERSONAL_ALIAS } from "@/features/library/address";
import type { IssueId, LibId } from "@/gen/types";

export type IssueTab = "now" | "goal" | "criteria" | "plan" | "log" | "git" | "ci" | "files";
export type LogView = "changes" | "decisions" | "learnings";
export const ISSUE_TABS: IssueTab[] = [
  "now",
  "goal",
  "criteria",
  "plan",
  "log",
  "git",
  "ci",
  "files",
];

export interface BoardSearch {
  group?: string; // group id; the board shows that subtree
  swim?: "child" | "none";
  author?: string; // handle filter
  q?: string; // text filter
  show?: "cancelled";
  needs?: "me"; // only issues with an open request for the person (replaces the inbox)
}

export interface IssueSearch {
  tab?: IssueTab;
  log?: LogView;
}

export type DrawerSearch = BoardSearch & IssueSearch;

export interface LibrarySearch {
  /** The text in the library's search box. Results replace the page while it is set. */
  q?: string;
  /** Where the search looks: `all` (default), `me`, or the alias of a team library. */
  scope?: string;
  /** `source` shows the markdown of a page instead of the rendered page. */
  view?: "source";
  /** Old: `/lib?tab=glossary` was the address of the glossary. It redirects. */
  tab?: "items" | "glossary";
}

type NavOpts = {
  to: string;
  params?: Record<string, string>;
  search?: unknown;
  hash?: string;
  replace?: boolean;
};
function useNav() {
  return useNavigate() as unknown as (o: NavOpts) => Promise<void>;
}

export function usePathname(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}

const BOARD_KEYS: (keyof BoardSearch)[] = ["group", "swim", "author", "q", "show", "needs"];
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

// ---------------------------------------------------------------- library pages

/** Segments of a library path encoded, the slashes kept. */
const encodePath = (path: string) =>
  path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/**
 * Where a page of a library lives: `/lib/me/<path>` for the personal library, `/lib/t/<alias>/<path>`
 * for the others. With no path it is the library's home.
 */
export function libraryPath(alias: string, path = ""): string {
  const base = alias === PERSONAL_ALIAS ? "/lib/me" : `/lib/t/${encodeURIComponent(alias)}`;
  const rest = encodePath(path);
  return rest ? `${base}/${rest}` : base;
}

/** An href for a page, with its heading: for `<a>`, copy link and middle-click. Hash-router aware. */
export function libraryHref(alias: string, path = "", anchor?: string): string {
  return hrefFor(`${libraryPath(alias, path)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`);
}

export interface PageTarget {
  alias: string;
  path?: string;
  anchor?: string;
}

/** Open a page of a library, at a heading if given. A page that is already open scrolls to it. */
export function useOpenPage() {
  const nav = useNav();
  return useCallback(
    ({ alias, path = "", anchor }: PageTarget) => {
      const hash = anchor || undefined;
      const rest = path.replace(/^\/+/, "");
      if (alias === PERSONAL_ALIAS)
        return rest
          ? nav({ to: "/lib/me/$", params: { _splat: rest }, hash })
          : nav({ to: "/lib/me", hash });
      return rest
        ? nav({ to: "/lib/t/$alias/$", params: { alias, _splat: rest }, hash })
        : nav({ to: "/lib/t/$alias", params: { alias }, hash });
    },
    [nav],
  );
}

export function useGo() {
  const nav = useNav();
  return {
    board: (search: BoardSearch = {}) => nav({ to: "/w", search }),
    library: (search: LibrarySearch = {}) => nav({ to: "/lib", search }),
    /** The old address of an item; the route sends it to the item's page. */
    libraryItem: (id: LibId) => nav({ to: "/lib/$id", params: { id } }),
    /** The board with only the issues that wait on me (replaces the inbox). */
    needsYou: (search: BoardSearch = {}) => nav({ to: "/w", search: { ...search, needs: "me" } }),
    kit: () => nav({ to: "/kit" }),
    issuePage: (id: IssueId, search: IssueSearch = {}) =>
      nav({ to: "/i/$id", params: { id }, search }),
  };
}

/** href builders for <a> tags (copy link, middle-click). Hash-router aware. */
export function hrefFor(path: string): string {
  return import.meta.env.VITE_HASH_ROUTER === "1" ? `#${path}` : path;
}
