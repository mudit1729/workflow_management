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
import type { SearchScope, WfOp } from "./types";

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
  health(): Promise<Health>;
}

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
  health: () => request("/health"),
};

const mock: Api = {
  snapshot: async () => (await loadMock()).snapshot(),
  issue: async (id) => (await loadMock()).issue(id),
  libraryItem: async (id) => (await loadMock()).libraryItem(id),
  glossary: async () => (await loadMock()).glossary(),
  search: async (q, scope, k) => (await loadMock()).search(q, scope, k),
  context: async (id, budget) => (await loadMock()).context(id, budget),
  ops: async (op) => (await loadMock()).ops(op),
  health: async () => (await loadMock()).health(),
};

export const api: Api = isRealApi ? real : mock;
