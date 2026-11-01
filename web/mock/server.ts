// The mock server: what `wf serve` answers, kept in memory (contract 1.10).
// `createMockServer()` builds an isolated instance (tests use it); the module also starts one
// shared instance for the app and exposes its controls on `window.__wf` for the Prototype
// panel and the command palette.
import type {
  FlowStepId,
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
import { parseSkillRef, type ResolvedFlow, resolveFlow } from "@/lib/api/flow";
import { type SkillsCatalog, skillExists } from "@/lib/api/skills";
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
} from "@/lib/api/types";
import { type AgentEvent, type AgentHost, createAgentHost } from "./agent";
import { type Codex, type CodexEvent, createCodex } from "./codex";
import { contextBundle } from "./context";
import { createEventPlayer } from "./events";
import { listFiles, readFile } from "./files";
import { createLibraries, type Libraries } from "./libraries";
import { removeTomlTable, setTomlKey } from "./md/toml-edit";
import { applyOp } from "./ops";
import { PERSONAL, PERSONAL_SAMPLE } from "./personal-files";
import { search as searchCorpus } from "./search";
import { builtinSkillFiles } from "./skill-files";
import { composeCatalog, libraryShelf, skillsCatalog, workspaceShelf } from "./skills";
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
import {
  onDiskChange,
  onPersonalChange,
  onSampleChange,
  type WorkspaceDisk,
} from "./workspace-bus";

export type { AgentEvent } from "./agent";
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
  /**
   * Point a step of the skills flow at a skill, as a script would: `setFlow("plan", "ws:acme-planning")`
   * writes `[flow.plan] skill` to `workflow.toml` (the team default); with `"me"` it writes my
   * `library.toml`. One minimal edit of the file, like the Settings page makes.
   */
  setFlow: (step: FlowStepId, ref: string, scope?: "team" | "me") => void;
  /** Back to the built-in flow: no `[flow]` table in `workflow.toml` or in my `library.toml`, no custom step set to fail. */
  resetFlow: () => void;
  /** Make the custom step `id` fail (or pass again) in the Do next step runs that reach it. */
  failCustomStep: (id: string, fail?: boolean) => void;
  /**
   * Connect the simulated agent, as the pairing flow would: the nav shows it connected and Do next
   * step starts runs by it. `kind` is `"codex"` (default) or `"claude"`.
   */
  connectAgent: (kind?: AgentKind) => void;
  /** End the agent connection. */
  disconnectAgent: () => void;
}

export interface MockServerOptions extends StoreOptions {
  /** The personal library's files. Default: the files under `mock/personal`. */
  personal?: WorkspaceDisk;
  /** More personal files, shown only while the sample is loaded. Default: `mock/personal-sample`. */
  personalSample?: WorkspaceDisk;
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
  /**
   * Start a run by `agent` (default Codex). A run with nothing to do comes back as `nothing_ready`,
   * not as an error.
   */
  startCodexRun(issue: string, kind: CodexRunKind, agent?: AgentKind): Promise<CodexRun>;
  cancelCodexRun(id: string): Promise<CodexRun>;
  /** Hear every move of a Codex run and every change of an issue's git and CI data. */
  subscribeCodex(fn: (e: CodexEvent) => void): () => void;
  /** Hear a script connect or disconnect the simulated agent (`controls.connectAgent`). */
  subscribeAgent(fn: (e: AgentEvent) => void): () => void;
  /**
   * The plugins and skills of the repository, read from its files (Workdatabase · Skills), then
   * the shelves of this workspace's `skills/` folder, the loaded team libraries and the personal
   * library.
   */
  skills(): Promise<SkillsCatalog>;
  /** The text files of one skill's folder by reference, `SKILL.md` first. 404 when there is none. */
  skillFiles(ref: string): Promise<SkillFile[]>;
  /** The personal `library.toml`: text, revision and its `[flow]` override. */
  personalConfig(): Promise<PersonalConfig>;
  /** Replace the personal `library.toml`. 409 on a stale `base_rev`, 422 when it is not TOML. */
  savePersonalConfig(args: {
    text: string;
    base_rev?: string;
  }): Promise<{ rev: string; commit: string }>;
  /** The workspace library, the personal one and the team libraries, in that order. */
  libraries(): Promise<LibraryInfo[]>;
  libraryTree(alias: string): Promise<LibraryTree>;
  /** One page; `path` may leave out `.md` or name a folder. 404 when there is none. */
  libraryPage(alias: string, path: string): Promise<LibraryPage>;
  /** Ranked passages (sections) for a query. */
  librarySearch(query: string, scope?: LibraryScope, k?: number): Promise<LibraryPassage[]>;
  /** The pages of any library that link to the page at `address` (`alias:path`). */
  libraryBacklinks(address: string): Promise<PageRef[]>;
  /** Where a link text or an address goes: `runbooks/x`, `platform:runbooks/x#rotate`, `lib-6pm4c`. */
  libraryResolve(raw: string, from?: { alias: string; path: string }): Promise<ResolvedAddress>;
  /** Write a page of the personal library (creates it). The bridge would commit and push it. */
  savePage(args: {
    alias: string;
    path: string;
    text: string;
    base_rev?: string;
  }): Promise<{ rev: string; commit: string }>;
  deletePage(args: { alias: string; path: string }): Promise<void>;
  /** Add a pasted or dropped image or video to the personal library. */
  saveMedia(args: { alias: string; path: string; media: LibraryMedia }): Promise<void>;
  /** Add a team library (its files are in `source`). Listed in the personal `libraries.toml`. */
  addLibrary(source: LibrarySource): Promise<LibraryInfo>;
  removeLibrary(alias: string): Promise<void>;
  /** Hear every change that can alter a library answer. */
  subscribeLibraries(fn: () => void): () => void;
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
  agent: AgentHost;
  libraryRegistry: Libraries;
  /** Play the next scripted event now; returns its name, or undefined when none applies. */
  playNext(): string | undefined;
  dispose(): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createMockServer(options: MockServerOptions = {}): MockServer {
  const store = createStore(options);
  const player = createEventPlayer(store, { autoplay: options.autoplay });
  const agent = createAgentHost();
  const libs = createLibraries(store, {
    personal: options.personal ?? PERSONAL,
    personalSample: options.personalSample ?? PERSONAL_SAMPLE,
  });
  // The flow in effect for the person this server acts for: the team's `[flow]`, my override over
  // it, and the skills that exist (the catalog below). The Do next step run and the context
  // bundle follow it.
  const flowNow = (): ResolvedFlow =>
    resolveFlow({
      team: store.world.config.flow,
      me: libs.personalConfig().flow,
      exists: skillExists(catalog()),
    });
  const codex = createCodex(store, { phaseMs: options.codexPhaseMs, flow: flowNow });
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
      libs.reset();
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
    setFlow: (step, ref, scope = "team") => {
      if (scope === "me") {
        const mine = libs.personalConfig().text || 'kind = "personal"\n';
        libs.savePersonalConfig({ text: setTomlKey(mine, `flow.${step}`, "skill", ref) });
        return;
      }
      const text = store.text("workflow.toml") ?? "wf_format = 1\n";
      commit(() =>
        store.applyChanges(
          [{ path: "workflow.toml", text: setTomlKey(text, `flow.${step}`, "skill", ref) }],
          store.me,
          "file",
        ),
      );
    },
    resetFlow: () => {
      codex.resetFailures();
      const mine = libs.personalConfig().text;
      const mineAfter = removeTomlTable(mine, "flow", { deep: true });
      if (mineAfter !== mine) libs.savePersonalConfig({ text: mineAfter });
      const text = store.text("workflow.toml");
      if (text === undefined) return;
      const after = removeTomlTable(text, "flow", { deep: true });
      if (after !== text)
        commit(() =>
          store.applyChanges([{ path: "workflow.toml", text: after }], store.me, "file"),
        );
    },
    failCustomStep: (id, fail) => codex.failCustomStep(id, fail),
    connectAgent: (kind) => void agent.connect(kind),
    disconnectAgent: () => agent.disconnect(),
  };

  /** What a context id (library item, glossary term, file) is called in a list. */
  const nameOf = (id: string): string | undefined =>
    store.world.library.find((l) => l.id === id)?.title ??
    store.world.glossary.find((t) => t.term === id)?.term ??
    (store.text(id) !== undefined || store.assets()[id]
      ? id.slice(id.lastIndexOf("/") + 1)
      : undefined);

  /** The workspace's own skills: its text files under `skills/`. */
  const workspaceSkillFiles = (): Record<string, string> =>
    Object.fromEntries(
      store
        .paths()
        .filter((p) => p.startsWith("skills/"))
        .flatMap((p) => {
          const text = store.text(p);
          return text === undefined ? [] : [[p, text] as const];
        }),
    );

  /** The catalog: the plugins' skills, then each source that is not a plugin. */
  const catalog = (): SkillsCatalog =>
    composeCatalog(skillsCatalog(), [
      workspaceShelf(workspaceSkillFiles()),
      ...libs
        .list()
        .filter((l) => l.loaded && (l.kind === "team" || l.kind === "personal"))
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "team" ? -1 : 1))
        .map((l) => libraryShelf(l, libs.files(l.alias))),
    ]);

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
      return contextBundle(
        store.derived,
        id,
        budget,
        store.now(),
        store.delivery(id),
        libs,
        flowNow(),
      );
    },
    ops: async (op) => {
      await delay();
      assertOnline();
      if (conflictNext) {
        conflictNext = false;
        throw simulatedConflict(store, op);
      }
      return clone(applyOp(store, op, libs));
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
    startCodexRun: async (issue, kind, who) => {
      await delay();
      assertOnline();
      return clone(codex.start(issue, kind, who));
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
    subscribeAgent: agent.subscribe,
    skills: () => read(catalog),
    skillFiles: async (ref) => {
      await delay();
      const parts = parseSkillRef(ref);
      if (!parts) throw new NotFoundError(`Skill ${ref}`);
      const folder = `skills/${parts.name}/`;
      const own = (files: Record<string, string>): SkillFile[] =>
        Object.entries(files)
          .filter(([p]) => p.startsWith(folder))
          .map(([p, text]) => ({ path: p.slice(folder.length), text }));
      const found =
        parts.source === "built-in"
          ? await builtinSkillFiles(parts.name)
          : own(
              parts.source === "workspace"
                ? workspaceSkillFiles()
                : libs.files(parts.source === "me" ? "me" : (parts.alias as string)),
            );
      if (!found.some((f) => f.path === "SKILL.md")) throw new NotFoundError(`Skill ${ref}`);
      return clone(
        found.sort((a, b) =>
          a.path === "SKILL.md" ? -1 : b.path === "SKILL.md" ? 1 : a.path < b.path ? -1 : 1,
        ),
      );
    },
    personalConfig: () => read(() => libs.personalConfig()),
    savePersonalConfig: async (args) => {
      await delay();
      assertOnline();
      return libs.savePersonalConfig(args);
    },
    libraries: () => read(() => libs.list()),
    libraryTree: (alias) => read(() => libs.tree(alias)),
    libraryPage: (alias, path) => read(() => libs.page(alias, path)),
    librarySearch: (query, scope, k) => read(() => libs.search(query, scope, k)),
    libraryBacklinks: (address) => read(() => libs.backlinks(address)),
    libraryResolve: (raw, from) => read(() => libs.resolve(raw, from)),
    savePage: async (args) => {
      await delay();
      assertOnline();
      return libs.savePage(args);
    },
    deletePage: async (args) => {
      await delay();
      assertOnline();
      libs.deletePage(args);
    },
    saveMedia: async (args) => {
      await delay();
      assertOnline();
      libs.saveMedia(args);
    },
    addLibrary: async (source) => {
      await delay();
      assertOnline();
      return clone(libs.registerLibrary(source));
    },
    removeLibrary: async (alias) => {
      await delay();
      assertOnline();
      libs.unregisterLibrary(alias);
    },
    subscribeLibraries: libs.subscribe,
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
    agent,
    libraryRegistry: libs,
    playNext: () => player.playNext(),
    dispose: () => {
      player.dispose();
      codex.dispose();
      libs.dispose();
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
    case "add_learning":
      return store.filePath(op.issue, "learnings.md");
    case "set_task_status":
    case "toggle_step":
      return store.filePath(op.issue, "plan.md");
    case "set_decision_status":
      return store.filePath(op.issue, "decisions.md");
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
export const subscribeAgent = server.subscribeAgent;
export const skills = server.skills;
export const skillFiles = server.skillFiles;
export const personalConfig = server.personalConfig;
export const savePersonalConfig = server.savePersonalConfig;
export const libraries = server.libraries;
export const libraryTree = server.libraryTree;
export const libraryPage = server.libraryPage;
export const librarySearch = server.librarySearch;
export const libraryBacklinks = server.libraryBacklinks;
export const libraryResolve = server.libraryResolve;
export const savePage = server.savePage;
export const deletePage = server.deletePage;
export const saveMedia = server.saveMedia;
export const addLibrary = server.addLibrary;
export const removeLibrary = server.removeLibrary;
export const subscribeLibraries = server.subscribeLibraries;
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
      onPersonalChange((personal, sample) =>
        server.libraryRegistry.applyPersonalDisk(personal, sample),
      ),
    ]
  : undefined;

// A hot reload replaces this module (and its store): stop the old timer and the watcher.
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    server.dispose();
    for (const stop of stopWatching ?? []) stop();
  });
