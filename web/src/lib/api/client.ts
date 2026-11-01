// The `api` object: the mock server in memory, or `fetch("/api/…")` against `wf serve`
// when VITE_API=real (contract 1.10). Both reject with the same errors.
import type {
  Conflict,
  GlossaryTerm,
  Health,
  IssueDetail,
  LibraryItemDetail,
  OpResult,
  SearchHit,
  Unprocessable,
  WorkspaceSnapshot,
} from "@/gen/types";
import { ApiError, NotFoundError } from "./error";
import { isRealApi, loadMock } from "./mock-bridge";
import type { SkillsCatalog } from "./skills";
import type {
  AgentKind,
  CodexRun,
  CodexRunKind,
  Delivery,
  LibraryInfo,
  LibraryMedia,
  LibraryPage,
  LibraryPassage,
  LibraryScope,
  LibrarySource,
  LibraryTree,
  PageRef,
  PersonalConfig,
  ResolvedAddress,
  SearchScope,
  SkillFile,
  SplitInput,
  SplitResult,
  WfOp,
  WorkspaceFile,
  WorkspaceFileInfo,
} from "./types";

const BASE = "/api";

async function request<T>(
  path: string,
  init?: RequestInit,
  as: "json" | "text" = "json",
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (res.status === 409) throw new ApiError(409, (await res.json()) as Conflict);
  if (res.status === 422) throw new ApiError(422, (await res.json()) as Unprocessable);
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`wf serve answered ${res.status} ${res.statusText}.`);
  return (as === "text" ? res.text() : res.json()) as Promise<T>;
}

export interface Api {
  snapshot(): Promise<WorkspaceSnapshot>;
  issue(id: string): Promise<IssueDetail>;
  libraryItem(id: string): Promise<LibraryItemDetail>;
  glossary(): Promise<GlossaryTerm[]>;
  search(q: string, scope?: SearchScope, k?: number): Promise<SearchHit[]>;
  context(id: string, budget?: number): Promise<string>;
  ops(op: WfOp): Promise<OpResult>;
  /** Commits, pull requests and CI runs of an issue, newest first. */
  delivery(issue: string): Promise<Delivery>;
  /** Split a group into issue proposals. `onStep` hears the progress steps of the mock. */
  splitWork(input: SplitInput, onStep?: (step: number) => void): Promise<SplitResult>;
  /** Codex runs of one issue, or of all, newest first. */
  codexRuns(issue?: string): Promise<CodexRun[]>;
  /** `agent` is the one that does the run (default Codex); it names the author of the edits. */
  startCodexRun(issue: string, kind: CodexRunKind, agent?: AgentKind): Promise<CodexRun>;
  cancelCodexRun(id: string): Promise<CodexRun>;
  health(): Promise<Health>;
  /** Every file of the workspace, sorted by path. */
  files(): Promise<WorkspaceFileInfo[]>;
  file(path: string): Promise<WorkspaceFile>;
  /** Save a hand edit. Creates the file when it is missing; 409 when `base_rev` is stale. */
  writeFile(args: { path: string; text: string; base_rev?: string }): Promise<{ rev: string }>;
  deleteFile(args: { path: string; base_rev?: string }): Promise<void>;
  // ---- libraries: the workspace's, the person's and the teams' (docs/plan/proposals/libraries-spec.md)
  /** The workspace library first, then the personal one, then the team libraries. */
  libraries(): Promise<LibraryInfo[]>;
  libraryTree(alias: string): Promise<LibraryTree>;
  /** One page; `path` may leave out `.md` or name a folder. Rejects with `NotFoundError`. */
  libraryPage(alias: string, path: string): Promise<LibraryPage>;
  /** Ranked passages (sections) for a query, within a scope. */
  librarySearch(query: string, scope?: LibraryScope, k?: number): Promise<LibraryPassage[]>;
  /** The pages of any library that link to the page at `address` (`alias:path`). */
  libraryBacklinks(address: string): Promise<PageRef[]>;
  /** Where a link text or an address goes. */
  libraryResolve(raw: string, from?: { alias: string; path: string }): Promise<ResolvedAddress>;
  /** Write a page of the personal library. The bridge commits and pushes it. 409 when `base_rev` is stale. */
  savePage(args: {
    alias: string;
    path: string;
    text: string;
    base_rev?: string;
  }): Promise<{ rev: string; commit: string }>;
  deletePage(args: { alias: string; path: string }): Promise<void>;
  /** Add a pasted or dropped image or video to the personal library. */
  saveMedia(args: { alias: string; path: string; media: LibraryMedia }): Promise<void>;
  /** Add a team library. 422 when its alias is taken. */
  addLibrary(source: LibrarySource): Promise<LibraryInfo>;
  removeLibrary(alias: string): Promise<void>;
  // ---- the skills flow (docs/plan/proposals/skills-flow-spec.md). `wf serve` paths are a guess.
  /**
   * The built-in plugins and skills, then the shelves of this workspace's `skills/` folder, the
   * loaded team libraries and the person's library. A guess for `wf serve`: `GET /api/skills`.
   */
  skills(): Promise<SkillsCatalog>;
  /**
   * The text files of one skill's folder, `SKILL.md` first, paths relative to the folder
   * (scripts and references too). 404 when the reference names no skill. A guess for `wf serve`:
   * `GET /api/skills/files?ref=<ref>`.
   */
  skillFiles(ref: string): Promise<SkillFile[]>;
  /**
   * The person's `library.toml`: text, revision and the `[flow]` override it holds. The one config
   * file of the personal library the dashboard reads and writes (alias `me`). A guess for the
   * bridge: `GET /api/libraries/me/config`.
   */
  personalConfig(): Promise<PersonalConfig>;
  /**
   * Replace the text of the personal `library.toml`. The bridge commits and pushes it. 409 when
   * `base_rev` is stale, 422 when the text is not TOML. A guess for the bridge:
   * `PUT /api/libraries/me/config` with `{ text, base_rev }`.
   */
  savePersonalConfig(args: {
    text: string;
    base_rev?: string;
  }): Promise<{ rev: string; commit: string }>;
}

/** A workspace path in a URL: every segment encoded, the slashes kept. */
const filePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const real: Api = {
  snapshot: () => request("/snapshot"),
  issue: (id) => request(`/issues/${encodeURIComponent(id)}`),
  libraryItem: (id) => request(`/library/${encodeURIComponent(id)}`),
  glossary: () => request("/glossary"),
  search: (q, scope = "all", k = 12) =>
    request(`/search?${new URLSearchParams({ q, scope, k: String(k) })}`),
  context: (id, budget = 6000) =>
    request(`/context/${encodeURIComponent(id)}?budget=${budget}`, undefined, "text"),
  ops: (op) =>
    request("/ops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(op),
    }),
  delivery: (issue) => request(`/issues/${encodeURIComponent(issue)}/delivery`),
  splitWork: (input, onStep) => {
    onStep?.(0);
    return request("/work/split", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  },
  codexRuns: (issue) => request(`/codex/runs${issue ? `?${new URLSearchParams({ issue })}` : ""}`),
  startCodexRun: (issue, kind, agent) =>
    request("/codex/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issue, kind, agent }),
    }),
  cancelCodexRun: (id) => request(`/codex/runs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  health: () => request("/health"),
  files: () => request("/files"),
  file: (path) => request(`/files/${filePath(path)}`),
  writeFile: ({ path, text, base_rev }) =>
    request(`/files/${filePath(path)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, base_rev }),
    }),
  deleteFile: async ({ path, base_rev }) => {
    const query = base_rev ? `?${new URLSearchParams({ base_rev })}` : "";
    await request<unknown>(`/files/${filePath(path)}${query}`, { method: "DELETE" }, "text");
  },
  libraries: () => request("/libraries"),
  libraryTree: (alias) => request(`/libraries/${encodeURIComponent(alias)}/tree`),
  libraryPage: (alias, path) =>
    request(`/libraries/${encodeURIComponent(alias)}/pages/${filePath(path)}`),
  librarySearch: (query, scope = "all", k = 10) =>
    request("/libraries/search", json({ query, scope, k })),
  libraryBacklinks: (address) =>
    request(`/libraries/backlinks?${new URLSearchParams({ address })}`),
  libraryResolve: (raw, from) => request("/libraries/resolve", json({ raw, from })),
  savePage: ({ alias, path, text, base_rev }) =>
    request(`/libraries/${encodeURIComponent(alias)}/pages/${filePath(path)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, base_rev }),
    }),
  deletePage: async ({ alias, path }) => {
    await request<unknown>(
      `/libraries/${encodeURIComponent(alias)}/pages/${filePath(path)}`,
      { method: "DELETE" },
      "text",
    );
  },
  saveMedia: async ({ alias, path, media }) => {
    await request<unknown>(
      `/libraries/${encodeURIComponent(alias)}/media/${filePath(path)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(media),
      },
      "text",
    );
  },
  addLibrary: (source) => request("/libraries", json(source)),
  removeLibrary: async (alias) => {
    await request<unknown>(`/libraries/${encodeURIComponent(alias)}`, { method: "DELETE" }, "text");
  },
  skills: () => request("/skills"),
  skillFiles: (ref) => request(`/skills/files?${new URLSearchParams({ ref })}`),
  personalConfig: () => request("/libraries/me/config"),
  savePersonalConfig: ({ text, base_rev }) =>
    request("/libraries/me/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, base_rev }),
    }),
};

const mock: Api = {
  snapshot: async () => (await loadMock()).snapshot(),
  issue: async (id) => (await loadMock()).issue(id),
  libraryItem: async (id) => (await loadMock()).libraryItem(id),
  glossary: async () => (await loadMock()).glossary(),
  search: async (q, scope, k) => (await loadMock()).search(q, scope, k),
  context: async (id, budget) => (await loadMock()).context(id, budget),
  ops: async (op) => (await loadMock()).ops(op),
  delivery: async (issue) => (await loadMock()).delivery(issue),
  splitWork: async (input, onStep) => (await loadMock()).splitWork(input, onStep),
  codexRuns: async (issue) => (await loadMock()).codexRuns(issue),
  startCodexRun: async (issue, kind, agent) => (await loadMock()).startCodexRun(issue, kind, agent),
  cancelCodexRun: async (id) => (await loadMock()).cancelCodexRun(id),
  health: async () => (await loadMock()).health(),
  files: async () => (await loadMock()).files(),
  file: async (path) => (await loadMock()).file(path),
  writeFile: async (args) => (await loadMock()).writeFile(args),
  deleteFile: async (args) => (await loadMock()).deleteFile(args),
  libraries: async () => (await loadMock()).libraries(),
  libraryTree: async (alias) => (await loadMock()).libraryTree(alias),
  libraryPage: async (alias, path) => (await loadMock()).libraryPage(alias, path),
  librarySearch: async (query, scope, k) => (await loadMock()).librarySearch(query, scope, k),
  libraryBacklinks: async (address) => (await loadMock()).libraryBacklinks(address),
  libraryResolve: async (raw, from) => (await loadMock()).libraryResolve(raw, from),
  savePage: async (args) => (await loadMock()).savePage(args),
  deletePage: async (args) => (await loadMock()).deletePage(args),
  saveMedia: async (args) => (await loadMock()).saveMedia(args),
  addLibrary: async (source) => (await loadMock()).addLibrary(source),
  removeLibrary: async (alias) => (await loadMock()).removeLibrary(alias),
  skills: async () => (await loadMock()).skills(),
  skillFiles: async (ref) => (await loadMock()).skillFiles(ref),
  personalConfig: async () => (await loadMock()).personalConfig(),
  savePersonalConfig: async (args) => (await loadMock()).savePersonalConfig(args),
};

export const api: Api = isRealApi ? real : mock;
