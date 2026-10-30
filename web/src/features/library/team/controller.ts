// Add team library: the controller of the flow (spec 4.1). It holds the answers and runs the three
// things that take time: look the link up, read the first page, read the library and add it. It is
// plain TypeScript with its collaborators handed in, so a test runs the whole flow, key by key.
import type {
  Failure,
  Found,
  LibraryRead,
  Outcome,
  Preview,
  RootChoice,
} from "@mock/libraries/github";
import { isUnprocessableError } from "@/lib/api/error";
import type { LibraryInfo, LibrarySource } from "@/lib/api/types";
import { rememberCommit } from "./commits";
import { openConnectAgent } from "./connect-hook";
import { aliasProblem, type Screen, suggestAlias } from "./flow";

/** What the flow needs from outside: GitHub, the library list, and where to go afterwards. */
export interface Deps {
  find(raw: string): Promise<Outcome<Found>>;
  preview(found: Found, choice: RootChoice): Promise<Preview>;
  read(
    found: Found,
    choice: RootChoice,
    alias: string,
    progress: (done: number, total: number) => void,
  ): Promise<Outcome<LibraryRead>>;
  /** Add the library (`addLibrary`). Throws an `ApiError` when the alias is taken. */
  register(source: LibrarySource): Promise<LibraryInfo>;
  /** The aliases in use. */
  taken(): string[];
  /** The library is added: show it. `page` is the page a blob link named. */
  added(info: LibraryInfo, extra: { page?: string; skipped: number }): void;
  close(): void;
}

export interface State {
  screen: Screen;
  /** What is in the field. */
  raw: string;
  /** Looking the link up, reading the first page, or reading the library to add it. */
  busy: "idle" | "looking" | "previewing" | "adding";
  /** What went wrong, on the screen it happened on. */
  failure?: Failure;
  found?: Found;
  /** The folder the folder screen has under the cursor. */
  picked?: string;
  choice?: RootChoice;
  preview?: Preview;
  alias: string;
  editingAlias: boolean;
  /** Set once the alias was refused: it stays on screen beside the field. */
  aliasError?: string;
  progress?: { done: number; total: number };
  /** Said when the person asks for an agent and there is none to connect. */
  note?: string;
}

const initial = (): State => ({
  screen: "link",
  raw: "",
  busy: "idle",
  alias: "",
  editingAlias: false,
});

export interface Controller {
  getState(): State;
  subscribe(fn: () => void): () => void;
  setRaw(text: string): void;
  /** Text pasted into an empty field: take it and go on. */
  paste(text: string): void;
  /** A suggested repo: its link goes in the field and the flow goes on. */
  use(url: string): void;
  /** Enter, or the primary button: go on with the screen on show. */
  advance(): void;
  pick(root: string): void;
  choose(choice: RootChoice): Promise<void>;
  back(): void;
  editAlias(on: boolean): void;
  setAlias(text: string): void;
  connectAgent(): void;
  /** Esc, the ×, a click on the scrim: close, unless a library is being added. */
  close(): void;
  dispose(): void;
}

export function createController(deps: Deps): Controller {
  let state = initial();
  /** A run that is no longer wanted (Back, another link) must not change the screen. */
  let run = 0;
  let aliasTouched = false;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };

  async function submit() {
    if (state.busy !== "idle") return;
    const raw = state.raw;
    const mine = ++run;
    set({ busy: "looking", failure: undefined, note: undefined });
    const found = await deps.find(raw);
    if (mine !== run) return;
    if (!found.ok) return set({ busy: "idle", failure: found.failure });
    set({ found: found.value, busy: "idle" });
    const [only] = found.value.choices;
    if (found.value.choices.length === 1 && only) await choose(only);
    else set({ screen: "root", picked: found.value.choices[0]?.root });
  }

  async function choose(choice: RootChoice) {
    const found = state.found;
    if (!found) return;
    const mine = ++run;
    if (!aliasTouched) set({ alias: suggestAlias(found.repo.repo, deps.taken()) });
    set({ screen: "preview", choice, preview: undefined, busy: "previewing", failure: undefined });
    const preview = await deps.preview(found, choice);
    if (mine !== run) return;
    set({ preview, busy: "idle" });
  }

  async function add() {
    const { found, choice, alias, busy } = state;
    if (!found || !choice || busy !== "idle") return;
    const problem = aliasProblem(alias, deps.taken());
    if (problem) return set({ editingAlias: true, aliasError: problem });
    const mine = ++run;
    set({
      busy: "adding",
      failure: undefined,
      aliasError: undefined,
      progress: { done: 0, total: 0 },
    });
    const name = alias.trim().toLowerCase();
    const read = await deps.read(found, choice, name, (done, total) => {
      if (mine === run) set({ progress: { done, total } });
    });
    if (mine !== run) return;
    if (!read.ok) return set({ busy: "idle", failure: read.failure, progress: undefined });
    let info: LibraryInfo;
    try {
      info = await deps.register(read.value.source);
    } catch (err) {
      if (mine !== run) return;
      const taken = isUnprocessableError(err);
      return set({
        busy: "idle",
        progress: undefined,
        ...(taken
          ? { editingAlias: true, aliasError: err.message }
          : { failure: { kind: "unreachable", message: "Could not add the library. Try again." } }),
      });
    }
    rememberCommit(info.alias, {
      commit: found.repo.commit,
      ...(found.repo.committedAt ? { committedAt: found.repo.committedAt } : {}),
      ...(found.repo.message ? { message: found.repo.message } : {}),
      ...(found.repo.author ? { author: found.repo.author } : {}),
    });
    // A blob link opens its page, if the library holds it.
    const page = found.repo.page && underRoot(found.repo.page, choice.root);
    deps.added(info, { ...(page ? { page } : {}), skipped: read.value.skipped });
    deps.close();
  }

  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setRaw: (raw) => set({ raw, failure: undefined, note: undefined }),
    paste(text) {
      if (state.busy !== "idle") return;
      set({ raw: text.trim(), failure: undefined, note: undefined });
      void submit();
    },
    use(url) {
      if (state.busy !== "idle") return;
      set({ raw: url, failure: undefined, note: undefined });
      void submit();
    },
    advance() {
      if (state.busy !== "idle") return;
      if (state.screen === "link") {
        if (state.raw.trim()) void submit();
      } else if (state.screen === "root") {
        const choice = state.found?.choices.find((c) => c.root === state.picked);
        if (choice) void choose(choice);
      } else if (state.preview) void add();
    },
    pick: (root) => set({ picked: root }),
    choose,
    back() {
      if (state.busy === "adding" || state.busy === "looking") return;
      run += 1;
      if (state.screen === "preview") {
        const several = (state.found?.choices.length ?? 0) > 1;
        set({
          screen: several ? "root" : "link",
          picked: state.choice?.root,
          choice: undefined,
          preview: undefined,
          busy: "idle",
          failure: undefined,
          editingAlias: false,
          aliasError: undefined,
          ...(several ? {} : { found: undefined }),
        });
      } else if (state.screen === "root") {
        set({ screen: "link", found: undefined, picked: undefined, failure: undefined });
      }
    },
    editAlias: (on) => set({ editingAlias: on, ...(on ? {} : { aliasError: undefined }) }),
    setAlias(text) {
      aliasTouched = true;
      set({ alias: text, aliasError: aliasProblem(text, deps.taken()) });
    },
    connectAgent() {
      if (openConnectAgent()) return;
      set({
        note: "No agent is connected in this prototype. With one, it reads the repo with your git credentials and the library appears here.",
      });
    },
    close() {
      if (state.busy !== "adding") deps.close();
    },
    dispose() {
      run += 1;
      listeners.clear();
    },
  };
}

/** The path of a repo file relative to the library root, or nothing when it is outside it. */
function underRoot(path: string, root: string): string | undefined {
  if (!root) return path;
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
}
