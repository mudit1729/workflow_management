// The connected agent (plan D9 to D14): Codex or Claude Code, one at a time, shared by the whole
// dashboard. The hooks below are what the UI builds on:
//
//   useAgent()           the connection, live: `{ status, agent, mode, host, repo, ... }`
//   useAgentControls()   begin(agent), cancel(), disconnect(), simulate(), recheck()
//   usePreferredAgent()  the agent the buttons should name: the connected one, else the last chosen
//
// How a connection comes about:
//  - `begin(agent)` makes a pair code and the command to run in the repository, and sets `pairing`.
//  - In the dev server the dashboard polls the real bridge on 127.0.0.1:7457 until it answers with
//    the code (`mode: "bridge"`). `simulate()` is the escape hatch: it pairs at once with the
//    prototype's own answers (`mode: "simulated"`).
//  - The static build (`VITE_STATIC=1`, the published artifact) cannot reach 127.0.0.1, so there
//    `begin` pairs in simulated mode by itself after about 2.5 s. `isStaticBuild` tells the two apart;
//    the screen says "Prototype: the bridge answers by itself".
//
// A bridge connection is kept in `localStorage` (key `wf-agent`) so a reload stays connected: on
// load the dashboard asks the bridge for its status and turns the connection `lost` when it does
// not answer. A connected bridge is checked again every 15 s; a bridge that fails two checks in a
// row, or a call that finds it gone, turns the connection `lost`.
import { useSyncExternalStore } from "react";
import {
  AGENT_KINDS,
  agentCommand,
  agentHandle,
  agentName,
  makePairCode,
  pairCommand,
  simulatedConnection,
} from "./agent-info";
import { type BridgeClient, BridgeError, type BridgeStatus, bridge } from "./bridge-client";
import { isRealApi, loadMock } from "./mock-bridge";
import type { AgentConnection, AgentKind } from "./types";

export { AGENT_KINDS, agentCommand, agentHandle, agentName };

/** True in the static artifact build (`pnpm build:static`), where no bridge can be reached. */
export const isStaticBuild = import.meta.env.VITE_STATIC === "1";

/** Where the connection is kept between reloads. */
export const AGENT_STORAGE_KEY = "wf-agent";

/** How long the simulated pairing takes in the static build (ms). */
export const SIMULATED_PAIR_MS = 2500;

/** How often a connected bridge is asked for its status (ms). */
const HEARTBEAT_MS = 15_000;

const NONE: AgentConnection = { status: "none" };

// ---------------------------------------------------------------- the error

/**
 * `start` of a run needs a connected agent. It rejects with this error when there is none, so the
 * UI can open the connect flow and start the run once the agent is connected; it is never toasted.
 * `status` is the connection's status at that moment: `none`, `pairing` or `lost`.
 */
export class AgentNotConnectedError extends Error {
  readonly status: "none" | "pairing" | "lost";
  constructor(status: "none" | "pairing" | "lost" = "none") {
    super(
      status === "pairing"
        ? "Finish connecting the agent first."
        : status === "lost"
          ? "The agent stopped answering. Connect it again."
          : "Connect an agent first.",
    );
    this.name = "AgentNotConnectedError";
    this.status = status;
  }
}

// ---------------------------------------------------------------- the store

/** The parts of `Storage` the store uses, so a test can hand it a stand-in. */
export type AgentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface AgentStoreOptions {
  client?: BridgeClient;
  /** Where to keep the connection. Default `localStorage`; null keeps nothing. */
  storage?: AgentStorage | null;
  /** The static build: pair in simulated mode by itself. Default `isStaticBuild`. */
  static?: boolean;
  simulatePairMs?: number;
  heartbeatMs?: number;
}

export interface AgentControls {
  /**
   * Start connecting `agent`: make a pair code and the command to copy, and set `pairing`. Resolves
   * at once with that pairing connection; it does not wait for the bridge. Watch `useAgent()`.
   * Any earlier connection or pairing ends first (the old bridge's token is revoked).
   */
  begin: (agent: AgentKind) => Promise<AgentConnection>;
  /** Stop a pairing: back to `none`. Does nothing for any other status. */
  cancel: () => void;
  /** End the connection: the bridge is told to forget the token, and the status is `none`. */
  disconnect: () => void;
  /**
   * Prototype: connect at once in simulated mode, as the agent being paired, or the preferred one.
   * Works in every build; it is the way out when no bridge can run.
   */
  simulate: (agent?: AgentKind) => AgentConnection;
  /** Ask the bridge for its status now: a `lost` connection comes back when it answers. */
  recheck: () => Promise<AgentConnection>;
}

export interface AgentStore extends AgentControls {
  get: () => AgentConnection;
  subscribe: (fn: () => void) => () => void;
  /** The agent the buttons name: the connected one, else the last chosen, else Codex. */
  preferred: () => AgentKind;
  /** The bridge token of a bridge connection. Only the run code reads it; the UI never needs it. */
  token: () => string | undefined;
  /** A call to the bridge found it gone: the connection is `lost`. `rejected` also drops the token. */
  markLost: (problem: string, rejected?: boolean) => void;
  dispose: () => void;
}

interface Saved {
  v: 1;
  last?: AgentKind;
  connection?: AgentConnection & { token?: string };
}

const isKind = (x: unknown): x is AgentKind => x === "codex" || x === "claude";

function browserStorage(): AgentStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The facts of a status, as a connected `AgentConnection`. */
function connectedFrom(status: BridgeStatus, since: string): AgentConnection {
  return {
    status: "connected",
    agent: status.agent,
    mode: "bridge",
    host: status.host,
    repo: status.repo.name,
    version: status.version ? `${status.agent} ${status.version}` : undefined,
    workspace: status.workspace ?? undefined,
    skills: status.skills,
    since,
  };
}

export function createAgentStore(options: AgentStoreOptions = {}): AgentStore {
  const client = options.client ?? bridge;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const staticBuild = options.static ?? isStaticBuild;
  const simulatePairMs = options.simulatePairMs ?? SIMULATED_PAIR_MS;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;

  let connection: AgentConnection = NONE;
  let token: string | undefined;
  let last: AgentKind | undefined;
  /** Each begin, connect and disconnect starts a new one: an answer from an older one is dropped. */
  let generation = 0;
  let polling: AbortController | undefined;
  let pairTimer: ReturnType<typeof setTimeout> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  let misses = 0;
  const listeners = new Set<() => void>();

  const now = () => new Date().toISOString();

  // ---- keeping it

  /** What survives a reload: a pairing, a simulated connection, a bridge connection with its token. */
  function save() {
    if (!storage) return;
    const c = connection;
    const keep =
      c.status === "pairing" ||
      (c.status !== "none" && (c.mode === "simulated" || token !== undefined));
    try {
      if (!keep && !last) {
        storage.removeItem(AGENT_STORAGE_KEY);
        return;
      }
      const saved: Saved = {
        v: 1,
        last,
        connection: keep
          ? {
              ...c,
              status: c.status === "pairing" ? "pairing" : "connected",
              problem: undefined,
              token,
            }
          : undefined,
      };
      storage.setItem(AGENT_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Storage can refuse (private mode, full): the connection then lasts until the reload.
    }
  }

  function load(): Saved | undefined {
    if (!storage) return undefined;
    try {
      const raw = storage.getItem(AGENT_STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as Saved) : undefined;
      if (saved?.v !== 1) return undefined;
      const c = saved.connection;
      const ok =
        c &&
        isKind(c.agent) &&
        (c.mode === "bridge" || c.mode === "simulated") &&
        (c.status === "pairing"
          ? typeof c.pairCode === "string" && typeof c.command === "string"
          : true) &&
        (c.status === "connected" && c.mode === "bridge" ? typeof c.token === "string" : true);
      return {
        v: 1,
        last: isKind(saved.last) ? saved.last : undefined,
        connection: ok ? c : undefined,
      };
    } catch {
      return undefined;
    }
  }

  function set(next: AgentConnection) {
    connection = next;
    save();
    for (const fn of [...listeners]) fn();
  }

  // ---- timers

  function stopWork() {
    polling?.abort();
    polling = undefined;
    clearTimeout(pairTimer);
    pairTimer = undefined;
    clearInterval(beat);
    beat = undefined;
    misses = 0;
  }

  function startBeat() {
    clearInterval(beat);
    beat = setInterval(() => void check(2), heartbeatMs);
  }

  /** Forget the bridge: tell it, best effort, to drop the token. */
  function revoke() {
    const old = token;
    token = undefined;
    if (old) void client.unpair(old).catch(() => {});
  }

  // ---- connecting

  function connectSimulated(agent: AgentKind): AgentConnection {
    stopWork();
    revoke();
    generation += 1;
    last = agent;
    set({ ...simulatedConnection(agent), since: now() });
    return connection;
  }

  function markLost(problem: string, rejected = false) {
    if (connection.mode !== "bridge") return;
    if (connection.status !== "connected" && connection.status !== "lost") return;
    clearInterval(beat);
    beat = undefined;
    if (rejected) token = undefined;
    set({ ...connection, status: "lost", problem });
  }

  /** Ask the bridge for its status; `needed` failures in a row turn the connection `lost`. */
  async function check(needed: number): Promise<AgentConnection> {
    const t = token;
    if (!t || connection.mode !== "bridge" || connection.status === "pairing") return connection;
    const id = generation;
    try {
      const status = await client.status(t);
      if (id !== generation) return connection;
      misses = 0;
      last = status.agent;
      set({ ...connectedFrom(status, connection.since ?? now()) });
      if (!beat) startBeat();
    } catch (e) {
      if (id !== generation) return connection;
      if (e instanceof BridgeError && (e.status === 401 || e.status === 403)) {
        markLost("The bridge was restarted. Connect the agent again.", true);
      } else {
        misses += 1;
        if (misses >= needed) markLost("The bridge does not answer. Is it still running?");
      }
    }
    return connection;
  }

  /** The bridge accepted the code: read its status and become connected. */
  async function finishPairing(id: number, newToken: string) {
    // The person cancelled or chose something else while the bridge paired: give the token back.
    const giveBack = () => void client.unpair(newToken).catch(() => {});
    if (id !== generation) return giveBack();
    try {
      const status = await client.status(newToken);
      if (id !== generation) return giveBack();
      token = newToken;
      last = status.agent;
      set(connectedFrom(status, now()));
      startBeat();
    } catch {
      if (id !== generation) return;
      set({ ...connection, problem: "The bridge paired, then stopped answering. Try again." });
    }
  }

  function startPairing(agent: AgentKind, code: string, command: string) {
    stopWork();
    revoke();
    generation += 1;
    const id = generation;
    last = agent;
    set({
      status: "pairing",
      agent,
      mode: staticBuild ? "simulated" : "bridge",
      pairCode: code,
      command,
    });
    if (staticBuild) {
      // No bridge can run next to the published artifact: it answers by itself.
      pairTimer = setTimeout(() => {
        if (id === generation) connectSimulated(agent);
      }, simulatePairMs);
      return;
    }
    const controller = new AbortController();
    polling = controller;
    client.pollPair(code, { signal: controller.signal }).then(
      (t) => finishPairing(id, t),
      (e) => {
        if (id !== generation || controller.signal.aborted) return;
        const problem =
          e instanceof BridgeError && e.code === "wrong_code"
            ? "A bridge answered, but with another code. Stop it (Ctrl+C) and run the command again."
            : e instanceof BridgeError
              ? e.message
              : "The bridge could not be reached.";
        set({ ...connection, problem });
      },
    );
  }

  // ---- the store

  const preferred = (): AgentKind =>
    (connection.status === "connected" && connection.agent) || last || "codex";

  const store: AgentStore = {
    begin: async (agent) => {
      const code = makePairCode();
      startPairing(agent, code, pairCommand(agent, code));
      return connection;
    },
    cancel: () => {
      if (connection.status !== "pairing") return;
      stopWork();
      generation += 1;
      set(NONE);
    },
    disconnect: () => {
      stopWork();
      revoke();
      generation += 1;
      set(NONE);
    },
    simulate: (agent) =>
      connectSimulated(
        agent ?? (connection.status === "pairing" ? connection.agent : undefined) ?? preferred(),
      ),
    recheck: () => check(1),
    get: () => connection,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    preferred,
    token: () => token,
    markLost,
    dispose: () => {
      stopWork();
      listeners.clear();
    },
  };

  // ---- the page was reloaded

  const saved = load();
  last = saved?.last;
  const kept = saved?.connection;
  if (kept?.agent) {
    if (kept.status === "pairing" && kept.pairCode && kept.command) {
      startPairing(kept.agent, kept.pairCode, kept.command);
    } else if (kept.mode === "simulated") {
      set({ ...simulatedConnection(kept.agent), since: kept.since ?? now() });
    } else if (kept.mode === "bridge" && !staticBuild && kept.token) {
      // Connected until the bridge says otherwise: ask it now.
      const { token: stored, ...facts } = kept;
      token = stored;
      set({ ...facts, status: "connected" });
      startBeat();
      void check(1);
    }
  }

  return store;
}

// ---------------------------------------------------------------- the shared store

export const agentStore: AgentStore = createAgentStore();

/** The same controls without a hook, for code that is not a component (the palette's commands). */
export const agentControls: AgentControls = {
  begin: agentStore.begin,
  cancel: agentStore.cancel,
  disconnect: agentStore.disconnect,
  simulate: agentStore.simulate,
  recheck: agentStore.recheck,
};

/** The connection, live. The same object until something changes. */
export function useAgent(): AgentConnection {
  return useSyncExternalStore(agentStore.subscribe, agentStore.get, agentStore.get);
}

/** begin, cancel, disconnect, simulate, recheck. The object never changes. */
export function useAgentControls(): AgentControls {
  return agentControls;
}

/** The agent the buttons should name: the connected one, else the last one chosen, else Codex. */
export function preferredAgent(): AgentKind {
  return agentStore.preferred();
}

/** `preferredAgent()` that re-renders the component when it changes. */
export function usePreferredAgent(): AgentKind {
  return useSyncExternalStore(agentStore.subscribe, agentStore.preferred, agentStore.preferred);
}

// `window.__wf.connectAgent(kind)` and `disconnectAgent()` (scripts, tests) reach the dashboard
// through the mock server, which announces them.
if (!isRealApi)
  void loadMock().then((mock) => {
    mock.subscribeAgent((e) => {
      if (e.event === "connect") agentStore.simulate(e.agent);
      else agentStore.disconnect();
    });
  });
