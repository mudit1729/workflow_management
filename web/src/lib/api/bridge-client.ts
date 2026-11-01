// The dashboard's side of the bridge (plan D9, D13): talks to `plugins/workflow/scripts/wf-bridge.mjs`
// on 127.0.0.1:7457. Pair once with the code the dashboard showed, then ask for a status, start a
// run on an issue id, follow its output and stop it. The browser never sends a prompt, a path or a
// command: the bridge builds those itself from the issue id.
//
// Two errors tell the callers what happened. `BridgeError`: the bridge answered with a refusal (its
// own words are the message). `BridgeUnreachableError`: nothing answered, which is normal while the
// person has not started the bridge yet, and means "lost" for a bridge that was connected.
//
// `fetch` streaming reads a run's events (EventSource cannot send the token); a stream that ends
// before the run's exit is asked for again with `Last-Event-ID`. The client takes its URL and
// `fetch` as options, so tests talk to a bridge on another port or to a stub.
import type { AgentKind, AgentSkills, CodexRunKind } from "./types";

/** Where the bridge listens. The dashboard expects the default port. */
export const BRIDGE_URL = "http://127.0.0.1:7457";

/** `GET /status`. */
export interface BridgeStatus {
  agent: AgentKind;
  /** The number only ("0.46.0"), or null when the agent did not answer `--version`. */
  version: string | null;
  host: string;
  repo: { name: string; remote?: string };
  /** The workspace the bridge found: relative to the repository when it lies inside, else the full path. Null when none. */
  workspace: string | null;
  skills: AgentSkills;
  /** Runs the bridge remembers, and the ones going now. */
  runs: number;
  active: number;
}

export type BridgeRunStatus = "running" | "done" | "failed" | "cancelled";

/** A run as the bridge reports it. */
export interface BridgeRun {
  id: string;
  issue: string;
  agent: AgentKind;
  /** RFC 3339, UTC. */
  startedAt: string;
  status: BridgeRunStatus;
  finishedAt?: string;
  /** The agent's exit code once it ended; null when a signal ended it. */
  code?: number | null;
  signal?: string | null;
  /** The last line the agent printed. */
  lastLine?: string;
}

/** What the `exit` event of a run carries. */
export interface BridgeExit {
  code: number | null;
  signal: string | null;
  status: Exclude<BridgeRunStatus, "running">;
}

/**
 * The bridge answered with a refusal. `code` is its short name (`busy`, `no_issue`, `unauthorized`...).
 * `instance` names the bridge process that refused, so a restarted bridge can be told from the old one.
 */
export class BridgeError extends Error {
  readonly status: number;
  readonly code: string;
  readonly instance?: string;
  constructor(status: number, code: string, message: string, instance?: string) {
    super(message);
    this.name = "BridgeError";
    this.status = status;
    this.code = code;
    this.instance = instance;
  }
}

/** Nothing answered on the bridge's address: it is not running, or it stopped. */
export class BridgeUnreachableError extends Error {
  constructor(message = "The bridge does not answer.") {
    super(message);
    this.name = "BridgeUnreachableError";
  }
}

export interface FollowHandlers {
  /** One line of the agent's output (stdout and stderr). */
  onLine: (text: string) => void;
  /** The run ended: the last thing the stream says. */
  onExit: (exit: BridgeExit) => void;
}

/** Refusals of a pair attempt that mean another bridge holds the port and will not take this code. */
const PAIR_REFUSED = new Set(["wrong_code", "paired", "locked", "stopping"]);

export interface PairPollOptions {
  signal?: AbortSignal;
  /** Time between attempts, and between looks at a bridge that refused (ms). Default 1000. */
  intervalMs?: number;
  /**
   * Another bridge still holds the port and refused this code (the one of the last pairing, still
   * running; or one that is full). Called with its refusal once it has stayed for an interval, and
   * with `null` when it is gone and the attempts go on. Not called for a bridge that is on its way
   * out.
   */
  onBlocked?: (refusal: BridgeError | null) => void;
}

export interface BridgeClientOptions {
  /** The bridge's address, or a function that returns it. Default `BRIDGE_URL`. */
  url?: string | (() => string);
  fetch?: typeof fetch;
  /** Time before a stream that ended early is asked for again (ms). Default 300. */
  resumeMs?: number;
}

export interface BridgeClient {
  /** One pair attempt. Resolves to the token. */
  pair(code: string, options?: { signal?: AbortSignal }): Promise<string>;
  /**
   * Pair with the code, trying every `intervalMs` (default 1000) while the bridge does not answer
   * yet. Resolves to the token. A bridge that is already there and refuses the code (an old one that
   * was not stopped) costs one of its five attempts, so the code is not tried on it again: the
   * client asks it for its name (no attempt used) until it is gone or replaced, and then goes on
   * with the same code (`onBlocked` says when). Rejects with any other refusal and with an
   * `AbortError` when cancelled.
   */
  pollPair(code: string, options?: PairPollOptions): Promise<string>;
  /** End the pairing: the token stops working and the bridge waits for a new pairing. */
  unpair(token: string): Promise<void>;
  status(token: string, options?: { signal?: AbortSignal }): Promise<BridgeStatus>;
  /** Start "do the next step" on an issue id. The bridge finds the folder and builds the prompt. */
  startRun(token: string, issue: string, kind: CodexRunKind): Promise<BridgeRun>;
  /** The bridge's runs, newest first. */
  listRuns(token: string): Promise<BridgeRun[]>;
  /**
   * Follow a run's output: every line so far, then new ones, then one exit. Resolves after the
   * exit. A stream that ends without one (the bridge drops a reader that fell behind) is asked for
   * again from the last line seen, twice at most. Rejects with `BridgeUnreachableError` when the
   * bridge does not come back and with an `AbortError` when cancelled.
   */
  follow(
    token: string,
    runId: string,
    handlers: FollowHandlers,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Stop a run. Resolves when its process is gone, with the run as `cancelled`. */
  cancel(token: string, runId: string): Promise<BridgeRun>;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

/** How often a stream that ended early is asked for again. */
const RESUMES = 2;

/**
 * Read an event stream into the handlers. Returns true once the exit came, false when the stream
 * ended or broke before it. `seen.id` keeps the newest event id, for `Last-Event-ID`. An abort
 * throws.
 */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  handlers: FollowHandlers,
  seen: { id: string },
  signal?: AbortSignal,
): Promise<boolean> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  /** Handle one event block (`id:`, `event:` and `data:` lines). */
  const handle = (block: string) => {
    let event = "";
    let data = "";
    let id = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
      else if (line.startsWith("id:")) id = line.slice(3).trim();
    }
    if (!event || !data) return;
    const payload = JSON.parse(data);
    if (event === "line") handlers.onLine(String(payload.text ?? ""));
    else if (event === "exit") {
      ended = true;
      handlers.onExit(payload as BridgeExit);
    }
    if (id) seen.id = id;
  };
  try {
    while (!ended) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut !== -1 && !ended) {
        handle(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf("\n\n");
      }
    }
  } catch (e) {
    if (isAbort(e) || signal?.aborted) throw e;
    // A broken stream is an early end: the caller asks again.
  } finally {
    void reader.cancel().catch(() => {});
  }
  return ended;
}

export function createBridgeClient(options: BridgeClientOptions = {}): BridgeClient {
  const resumeMs = options.resumeMs ?? 300;
  const base = () => {
    const url = options.url ?? BRIDGE_URL;
    return typeof url === "function" ? url() : url;
  };

  /** One request. Network failures become `BridgeUnreachableError`, refusals `BridgeError`. */
  async function send(
    path: string,
    init: RequestInit & { token?: string } = {},
  ): Promise<Response> {
    const { token, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (rest.body !== undefined) headers.set("content-type", "application/json");
    let res: Response;
    try {
      res = await (options.fetch ?? fetch)(`${base()}${path}`, {
        ...rest,
        headers,
        cache: "no-store",
      });
    } catch (e) {
      if (isAbort(e) || rest.signal?.aborted) throw e;
      throw new BridgeUnreachableError();
    }
    if (res.ok) return res;
    let body: { error?: string; message?: string; instance?: string } = {};
    try {
      body = await res.json();
    } catch {
      // Not the bridge's JSON: say what the status says.
    }
    throw new BridgeError(
      res.status,
      body.error ?? "error",
      body.message ?? `The bridge answered ${res.status}.`,
      body.instance,
    );
  }

  const json = async <T>(path: string, init?: RequestInit & { token?: string }) =>
    (await (await send(path, init)).json()) as T;

  const post = (path: string, body: unknown, token?: string, signal?: AbortSignal) =>
    json<unknown>(path, { method: "POST", body: JSON.stringify(body), token, signal });

  async function pair(code: string, opts: { signal?: AbortSignal } = {}) {
    const body = (await post("/pair", { code }, undefined, opts.signal)) as { token: string };
    return body.token;
  }

  /**
   * Who answers on the port without a token: its instance name (`""` when it names none), or null
   * when nothing does. `GET /status` without a token answers 401 and uses no pair attempt.
   */
  async function whoAnswers(signal?: AbortSignal): Promise<string | null> {
    try {
      await send("/status", { signal });
      return "";
    } catch (e) {
      if (e instanceof BridgeError) return e.instance ?? "";
      if (e instanceof BridgeUnreachableError) return null;
      throw e;
    }
  }

  /** Wait until the bridge that refused is gone or another one answers in its place. */
  async function waitForOther(
    refusal: BridgeError,
    intervalMs: number,
    onBlocked: PairPollOptions["onBlocked"],
    signal?: AbortSignal,
  ) {
    const was = refusal.instance ?? "";
    let told = false;
    for (;;) {
      await wait(intervalMs, signal);
      const now = await whoAnswers(signal);
      if (now === null || now !== was) break;
      if (!told && refusal.code !== "stopping") {
        told = true;
        onBlocked?.(refusal);
      }
    }
    if (told) onBlocked?.(null);
  }

  return {
    pair,

    async pollPair(code, { signal, intervalMs = 1000, onBlocked } = {}) {
      for (;;) {
        if (signal?.aborted) throw signal.reason;
        try {
          return await pair(code, { signal });
        } catch (e) {
          if (e instanceof BridgeError && PAIR_REFUSED.has(e.code)) {
            await waitForOther(e, intervalMs, onBlocked, signal);
            continue;
          }
          if (!(e instanceof BridgeUnreachableError)) throw e;
        }
        await wait(intervalMs, signal);
      }
    },

    async unpair(token) {
      await send("/pair", { method: "DELETE", token });
    },

    status: (token, opts = {}) => json("/status", { token, signal: opts.signal }),

    startRun: (token, issue, kind) => post("/runs", { issue, kind }, token) as Promise<BridgeRun>,

    listRuns: (token) => json("/runs", { token }),

    async follow(token, runId, handlers, signal) {
      const path = `/runs/${encodeURIComponent(runId)}/events`;
      const seen = { id: "" };
      for (let resumed = 0; ; resumed++) {
        const res = await send(path, {
          token,
          signal,
          headers: seen.id ? { "last-event-id": seen.id } : undefined,
        });
        if (!res.body) throw new BridgeUnreachableError("The bridge sent no stream.");
        if (await readEvents(res.body, handlers, seen, signal)) return;
        // Ended before the exit: the bridge dropped a reader that fell behind, or it is gone (the
        // next request then fails to connect).
        if (resumed >= RESUMES) throw new BridgeUnreachableError("The bridge stopped sending.");
        await wait(resumeMs, signal);
      }
    },

    cancel: (token, runId) =>
      json(`/runs/${encodeURIComponent(runId)}`, { method: "DELETE", token }),
  };
}

/** The address the shared client uses. Tests point it at a bridge on another port. */
let bridgeUrl = BRIDGE_URL;
export const setBridgeUrl = (url: string) => {
  bridgeUrl = url;
};

/** The client the dashboard uses: the bridge on 127.0.0.1:7457. */
export const bridge: BridgeClient = createBridgeClient({ url: () => bridgeUrl });
