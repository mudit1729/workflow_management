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
import type {
  CodexRun,
  CodexRunKind,
  Delivery,
  SearchScope,
  SplitInput,
  SplitResult,
  WfOp,
  WorkspaceFile,
  WorkspaceFileInfo,
} from "@/lib/api/types";
import { type Codex, type CodexEvent, createCodex } from "./codex";
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
import { split } from "./work";
import { onDiskChange, onSampleChange } from "./workspace-bus";

export type { CodexEvent } from "./codex";
export type { Connection } from "./store";

/** The dev controls the Prototype panel drives (`window.__wf`). */
export interface MockControls {
  /** The next op is rejected with a 409 "goal.md changed by @codex". */
  conflictNextWrite: () => void;
  /** Play the next scripted live event now. Returns its name, or undefined when none applies. */
  playNextEvent: () => string | undefined;
  setArchifyAvailable: (available: boolean) => void;
  /** `reconnecting` and `offline` hold events back; `live` replays them. */
  setConnection: (state: Connection) => void;
  /** Back to the shipped workspace files as they are on disk: groups and library, no issues. */
  reset: () => void;
  /**
   * Replace the working copy with the sample world (`mock/sample`) in one commit. Returns how many
   * issues it holds. Nothing of the previous working copy is kept; `reset()` goes back to empty.
   */
  loadSample: () => number;
  /**
   * Show the sample while a screen needs it (the Kit) and give the working copy back exactly as
   * it was when the last holder releases. Counted. Returns the release function.
   */
  holdSample: () => () => void;
  /** Time between the phases of the Codex runs that start from now on, in ms. Default 2000. */
  setCodexPhaseMs: (ms: number) => void;
}

export interface MockServerOptions extends StoreOptions {
  /** Response delay in ms: a fixed number, a [min, max] range, or 0 for none. Default 80–160. */
  latency?: number | [number, number];
  /** Play a scripted event every 20 s. Default false. */
  autoplay?: boolean;
  /** Time between the phases of a Codex run, in ms. Default 2000. */
  codexPhaseMs?: number;
}

export interface MockServer {
  snapshot(): Promise<WorkspaceSnapshot>;
  issue(id: string): Promise<IssueDetail>;
  libraryItem(id: string): Promise<LibraryItemDetail>;
  glossary(): Promise<GlossaryTerm[]>;
  search(q: string, scope?: SearchScope, k?: number): Promise<SearchHit[]>;
  context(id: string, budget?: number): Promise<string>;
  ops(op: WfOp): Promise<OpResult>;
  /** Commits, pull requests and CI runs of an issue, newest first (plan D2). */
  delivery(issue: string): Promise<Delivery>;
  /**
   * Split a group into issue proposals (plan D6). Takes about 2 s; `onStep` hears each of the
   * three progress steps as it starts.
   */
  splitWork(input: SplitInput, onStep?: (step: number) => void): Promise<SplitResult>;
  /** Codex runs of one issue, or of all, newest first. */
  codexRuns(issue?: string): Promise<CodexRun[]>;
  /** Start a run. A run with nothing to do comes back as `nothing_ready`, not as an error. */
  startCodexRun(issue: string, kind: CodexRunKind): Promise<CodexRun>;
  cancelCodexRun(id: string): Promise<CodexRun>;
  /** Hear every move of a Codex run and every change of an issue's git and CI data. */
  subscribeCodex(fn: (e: CodexEvent) => void): () => void;
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
  codex: Codex;
  /** Play the next scripted event now; returns its name, or undefined when none applies. */
  playNext(): string | undefined;
  dispose(): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createMockServer(options: MockServerOptions = {}): MockServer {
  const store = createStore(options);
  const player = createEventPlayer(store, { autoplay: options.autoplay });
  const codex = createCodex(store, { phaseMs: options.codexPhaseMs });
  const latency = options.latency ?? [80, 160];
  let conflictNext = false;
  /** Holders of the sample that `controls.holdSample` handed out and that have not released yet. */
  let holds = 0;

  const delay = () => {
    const ms = Array.isArray(latency)
      ? latency[0] + Math.random() * (latency[1] - latency[0])
      : latency;
    return ms > 0 ? sleep(ms) : Promise.resolve();
  };

  /** A write cannot reach a server that is offline: the same toast as any failed request. */
  const assertOnline = () => {
    if (store.connection() === "offline") throw new Error("No connection to wf serve");
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
    playNextEvent: () => player.playNext(),
    setArchifyAvailable: (on) => store.setArchify(on),
    setConnection: (state) => store.setConnection(state),
    // A run writes into the working copy it started on: stop the runs before it is replaced.
    reset: () => {
      conflictNext = false;
      player.reset();
      codex.reset();
      store.reset();
    },
    loadSample: () => {
      conflictNext = false;
      player.reset();
      codex.reset();
      store.loadSample();
      return store.derived.snapshot.issues.length;
    },
    holdSample: () => {
      conflictNext = false;
      player.reset();
      if (holds === 0) codex.reset();
      const release = store.holdSample();
      holds += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        // The last release puts the saved working copy back: a run that started on the sample
        // must not outlive it (it would fail on the next phase with a task that is gone).
        if (holds === 0) codex.reset();
        release();
      };
    },
    setCodexPhaseMs: (ms) => codex.setPhaseMs(ms),
  };

  /** What a context id (library item, glossary term, file) is called in a list. */
  const nameOf = (id: string): string | undefined =>
    store.world.library.find((l) => l.id === id)?.title ??
    store.world.glossary.find((t) => t.term === id)?.term ??
    (store.text(id) !== undefined || store.assets()[id]
      ? id.slice(id.lastIndexOf("/") + 1)
      : undefined);

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
      assertOnline();
      if (conflictNext) {
        conflictNext = false;
        throw simulatedConflict(store, op);
      }
      return clone(applyOp(store, op));
    },
    delivery: (issue) =>
      read(() => {
        if (!store.derived.details.has(issue)) throw new NotFoundError(`Issue ${issue}`);
        return store.delivery(issue);
      }),
    splitWork: async (input, onStep) => {
      assertOnline();
      return split(input, { onStep, resolve: nameOf });
    },
    codexRuns: (issue) => read(() => codex.runs(issue)),
    startCodexRun: async (issue, kind) => {
      await delay();
      assertOnline();
      return clone(codex.start(issue, kind));
    },
    cancelCodexRun: async (id) => {
      await delay();
      assertOnline();
      return clone(codex.cancel(id));
    },
    subscribeCodex: (fn) => {
      const offRuns = codex.subscribe(fn);
      const offDelivery = store.onDelivery((issue) => fn({ event: "delivery", issue }));
      return () => {
        offRuns();
        offDelivery();
      };
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
      assertOnline();
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
      assertOnline();
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
    codex,
    playNext: () => player.playNext(),
    dispose: () => {
      player.dispose();
      codex.dispose();
    },
  };
}

// ---------------------------------------------------------------- conflictNextWrite

/** The file an op writes, so the simulated conflict names a real one. */
function targetFile(store: Store, op: WfOp): string {
  switch (op.op) {
    case "set_status":
    case "toggle_criterion":
    case "add_links":
      return store.filePath(op.issue, "goal.md");
    case "set_task_status":
    case "toggle_step":
      return store.filePath(op.issue, "plan.md");
    case "answer_request":
    case "promote":
      return store.filePath(op.issue, "current_state.md");
    case "new_issue":
    case "new_group":
    case "create_work": {
      const id =
        op.op === "new_issue"
          ? op.group
          : op.op === "new_group"
            ? op.parent
            : typeof op.group === "string"
              ? op.group
              : op.group.parent;
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
export const delivery = server.delivery;
export const splitWork = server.splitWork;
export const codexRuns = server.codexRuns;
export const startCodexRun = server.startCodexRun;
export const cancelCodexRun = server.cancelCodexRun;
export const subscribeCodex = server.subscribeCodex;
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
// set of files over (see workspace-files.ts) and the store applies what differs. A file under
// mock/sample reaches the running mock only while the sample is loaded (the store keeps the new
// set for the next "Load sample data" otherwise).
const stopWatching = isBrowser
  ? [
      onDiskChange((disk) => server.store.applyDisk(disk)),
      onSampleChange((disk) => server.store.applySample(disk)),
    ]
  : undefined;

// A hot reload replaces this module (and its store): stop the old timer and the watcher.
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    server.dispose();
    for (const stop of stopWatching ?? []) stop();
  });
