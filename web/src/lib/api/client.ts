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
import type {
  AgentKind,
  CodexRun,
  CodexRunKind,
  Delivery,
  SearchScope,
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
}

/** A workspace path in a URL: every segment encoded, the slashes kept. */
const filePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

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
};

export const api: Api = isRealApi ? real : mock;
