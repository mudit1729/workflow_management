// The mock server: what `wf serve` answers, kept in memory (contract 1.10).
// `createMockServer()` builds an isolated instance (tests use it); the module also starts one
// shared instance for the app and exposes its controls on `window.__wf` for the Prototype
// panel and the command palette.
import type {
  GlossaryTerm,
  Health,
  IssueDetail,
  LibraryItemDetail,
  OpResult,
  SearchHit,
  ServerEvent,
  WorkspaceSnapshot,
} from "@/gen/types";
import { ApiError, NotFoundError } from "@/lib/api/error";
import type { SearchScope, WfOp, WorkspaceFile, WorkspaceFileInfo } from "@/lib/api/types";
import { contextBundle } from "./context";
import { createEventPlayer } from "./events";
import { listFiles, readFile } from "./files";
import { applyOp } from "./ops";
import { search as searchCorpus } from "./search";
import {
  type Connection,
  checkPath,
  createStore,
  MAX_FILE_BYTES,
  type Store,
  type StoreOptions,
} from "./store";
import { byteLength, clone } from "./util";
import { onDiskChange } from "./workspace-bus";

export type { Connection } from "./store";

/** The dev controls the Prototype panel drives (`window.__wf`). */
export interface MockControls {
  /** The next op is rejected with a 409 "goal.md changed by @codex". */
  conflictNextWrite: () => void;
  /** Play the next scripted live event now. */
  playNextEvent: () => void;
  setArchifyAvailable: (available: boolean) => void;
  /** `reconnecting` and `offline` hold events back; `live` replays them. */
  setConnection: (state: Connection) => void;
  /** Back to the workspace files as they are on disk. */
  reset: () => void;
}

export interface MockServerOptions extends StoreOptions {
  /** Response delay in ms: a fixed number, a [min, max] range, or 0 for none. Default 80–160. */
  latency?: number | [number, number];
  /** Play a scripted event every 20 s. Default false. */
  autoplay?: boolean;
}

export interface MockServer {
  snapshot(): Promise<WorkspaceSnapshot>;
  issue(id: string): Promise<IssueDetail>;
  libraryItem(id: string): Promise<LibraryItemDetail>;
  glossary(): Promise<GlossaryTerm[]>;
  search(q: string, scope?: SearchScope, k?: number): Promise<SearchHit[]>;
  context(id: string, budget?: number): Promise<string>;
  ops(op: WfOp): Promise<OpResult>;
  health(): Promise<Health>;
  /** Every file of the workspace, sorted by path. */
  files(): Promise<WorkspaceFileInfo[]>;
  file(path: string): Promise<WorkspaceFile>;
  /** A hand edit saved to the workspace: creates the file when it is missing. */
  writeFile(args: { path: string; text: string; base_rev?: string }): Promise<{ rev: string }>;
  deleteFile(args: { path: string; base_rev?: string }): Promise<void>;
  subscribe(fn: (e: ServerEvent) => void): () => void;
  onConnection(fn: (state: Connection) => void): () => void;
  connection(): Connection;
  controls: MockControls;
  /** Direct access for tests and tools. */
  store: Store;
  /** Play the next scripted event now; returns its name, or undefined when none applies. */
  playNext(): string | undefined;
  dispose(): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createMockServer(options: MockServerOptions = {}): MockServer {
  const store = createStore(options);
  const player = createEventPlayer(store, { autoplay: options.autoplay });
  const latency = options.latency ?? [80, 160];
  let conflictNext = false;

  const delay = () => {
    const ms = Array.isArray(latency)
      ? latency[0] + Math.random() * (latency[1] - latency[0])
      : latency;
    return ms > 0 ? sleep(ms) : Promise.resolve();
  };

  /** Read after the delay, so a response always carries the state at the moment it is sent. */
  async function read<T>(fn: () => T): Promise<T> {
    await delay();
    return clone(fn());
  }

  const controls: MockControls = {
    conflictNextWrite: () => {
      conflictNext = true;
    },
    playNextEvent: () => {
      player.playNext();
    },
    setArchifyAvailable: (on) => store.setArchify(on),
    setConnection: (state) => store.setConnection(state),
    reset: () => {
      conflictNext = false;
      player.reset();
      store.reset();
    },
  };

  /** The error of a refused file edit, in the shape of a 422. */
  const invalid = (...gaps: string[]) => new ApiError(422, { diagnostics: [], gaps });

  /** Run a commit; a workspace that cannot be read after it is a 422, not a crash. */
  function commit(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw invalid(
        `The workspace could not be read after this change: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    snapshot: () => read(() => store.derived.snapshot),
    issue: (id) =>
      read(() => {
        const detail = store.derived.details.get(id);
        if (!detail) throw new NotFoundError(`Issue ${id}`);
        return detail;
      }),
    libraryItem: (id) =>
      read(() => {
        const item = store.derived.library.get(id);
        if (!item) throw new NotFoundError(`Library item ${id}`);
        return item;
      }),
    glossary: () => read(() => store.world.glossary),
    search: (q, scope, k) => read(() => searchCorpus(store.world, store.derived, q, scope, k)),
    context: async (id, budget) => {
      await delay();
      if (!store.derived.details.has(id)) throw new NotFoundError(`Issue ${id}`);
      return contextBundle(store.derived, id, budget, store.now());
    },
    ops: async (op) => {
      await delay();
      if (conflictNext) {
        conflictNext = false;
        throw simulatedConflict(store, op);
      }
      return clone(applyOp(store, op));
    },
    health: () =>
      read(() => ({
        version: "0.1.0-mock",
        wf_format: 1,
        archify: store.derived.snapshot.config.archify,
        rev: store.rev,
      })),
    files: () => read(() => listFiles(store)),
    file: (path) => read(() => readFile(store, path)),
    writeFile: async ({ path, text, base_rev }) => {
      await delay();
      const checked = checkPath(path);
      if ("error" in checked) throw invalid(checked.error);
      if (store.assets()[checked.path])
        throw invalid(`${checked.path} is a binary file. The editor writes text.`);
      if (byteLength(text) > MAX_FILE_BYTES) throw invalid("That file is too large to save.");
      store.guardFile(checked.path, base_rev);
      commit(() => store.applyChanges([{ path: checked.path, text }], store.me, "file"));
      return { rev: store.pathRev(checked.path) ?? "" };
    },
    deleteFile: async ({ path, base_rev }) => {
      await delay();
      const checked = checkPath(path);
      if ("error" in checked) throw invalid(checked.error);
      if (store.text(checked.path) === undefined) throw new NotFoundError(`File ${checked.path}`);
      store.guardFile(checked.path, base_rev);
      commit(() => store.applyChanges([{ path: checked.path, text: null }], store.me, "file"));
    },
    subscribe: store.subscribe,
    onConnection: store.onConnection,
    connection: store.connection,
    controls,
    store,
    playNext: () => player.playNext(),
    dispose: () => player.dispose(),
  };
}

// ---------------------------------------------------------------- conflictNextWrite

/** The file an op writes, so the simulated conflict names a real one. */
function targetFile(store: Store, op: WfOp): string {
  switch (op.op) {
    case "set_status":
    case "toggle_criterion":
      return store.filePath(op.issue, "goal.md");
    case "set_task_status":
    case "toggle_step":
      return store.filePath(op.issue, "plan.md");
    case "answer_request":
    case "promote":
      return store.filePath(op.issue, "current_state.md");
    case "new_issue":
    case "new_group": {
      const id = op.op === "new_issue" ? op.group : op.parent;
      return `${store.derived.groupDirs.get(id) ?? "issues"}/_group.md`;
    }
    case "approve_library":
      return store.derived.library.get(op.id)?.edit.file ?? "library";
  }
}

function currentValue(store: Store, op: WfOp): unknown {
  switch (op.op) {
    case "set_status":
      return { status: store.summary(op.issue)?.status };
    case "toggle_criterion":
      return {
        checked: store.derived.details.get(op.issue)?.criteria.find((c) => c.id === op.id)?.checked,
      };
    default:
      return null;
  }
}

function simulatedConflict(store: Store, op: WfOp): ApiError {
  const file = targetFile(store, op);
  const name = file.slice(file.lastIndexOf("/") + 1);
  return new ApiError(409, {
    reason: `${name} changed by @codex`,
    by: "codex",
    file,
    current: currentValue(store, op),
  });
}

// ---------------------------------------------------------------- the shared instance

const isBrowser = typeof window !== "undefined";

/** The instance the app talks to. It plays a scripted event every 20 s. */
export const server: MockServer = createMockServer({ autoplay: isBrowser });

export const snapshot = server.snapshot;
export const issue = server.issue;
export const libraryItem = server.libraryItem;
export const glossary = server.glossary;
export const search = server.search;
export const context = server.context;
export const ops = server.ops;
export const health = server.health;
export const files = server.files;
export const file = server.file;
export const writeFile = server.writeFile;
export const deleteFile = server.deleteFile;
export const subscribe = server.subscribe;
export const onConnection = server.onConnection;
export const connection = server.connection;
export const mockControls: MockControls = server.controls;

if (isBrowser && import.meta.env.VITE_API !== "real") {
  (window as unknown as { __wf?: MockControls }).__wf = mockControls;
}

// The mock watcher: when a file under mock/workspace changes on disk, the bundler hands the new
// set of files over (see workspace-files.ts) and the store applies what differs.
const stopWatching = isBrowser ? onDiskChange((disk) => server.store.applyDisk(disk)) : undefined;

// A hot reload replaces this module (and its store): stop the old timer and the watcher.
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    server.dispose();
    stopWatching?.();
  });
