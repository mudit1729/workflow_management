// The connected agent (plan D9 to D14): names and commands, pair codes, the store with a stand-in
// bridge client (pairing, the static build's simulated pairing, cancel, disconnect, a reload, a lost
// bridge) and the hooks' view of the shared store.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import readme from "../../../../plugins/workflow/README.md?raw";
import {
  AGENT_STORAGE_KEY,
  AgentNotConnectedError,
  type AgentStorage,
  agentStore,
  BLOCKED_NOTE,
  createAgentStore,
  preferredAgent,
  SIMULATED_PAIR_MS,
  useAgent,
  useAgentControls,
  usePreferredAgent,
} from "./agent";
import {
  AGENT_KINDS,
  agentCommand,
  agentHandle,
  agentName,
  CLAUDE_ALLOWED_TOOLS,
  claudeAllowFlags,
  makePairCode,
  pairCommand,
  simulatedConnection,
  WF_SKILL_NAMES,
} from "./agent-info";
import {
  type BridgeClient,
  BridgeError,
  type BridgeStatus,
  BridgeUnreachableError,
  type PairPollOptions,
} from "./bridge-client";
import { codexCommand } from "./codex";
import { loadMock } from "./mock-bridge";
import { capture } from "./test-support";

const TOKEN = "b".repeat(64);

const issue = {
  id: "wf-3k9x2",
  title: "Push board updates over SSE",
  path: "issues/wf/web/live-board-updates",
};

describe("names, handles and commands", () => {
  test("each agent has a name and a handle", () => {
    expect(AGENT_KINDS).toEqual(["codex", "claude"]);
    expect(agentName("codex")).toBe("Codex");
    expect(agentName("claude")).toBe("Claude Code");
    expect(agentHandle("codex")).toBe("@codex");
    expect(agentHandle("claude")).toBe("@claude");
  });

  test("the command is the agent's own, with the resume prompt in single quotes", () => {
    const codex = agentCommand("codex", issue);
    const claude = agentCommand("claude", issue);
    expect(codex.prompt).toBe(
      'Work on wf-3k9x2 "Push board updates over SSE" in issues/wf/web/live-board-updates. Read current_state.md first, then use the wf skills (doing-next-step).',
    );
    expect(claude.prompt).toBe(codex.prompt);
    expect(codex.command).toBe(`codex '${codex.prompt}'`);
    expect(claude.command).toBe(`claude '${codex.prompt}'`);
    // codexCommand stays, as a wrapper.
    expect(codexCommand(issue)).toEqual(codex);
  });

  test("a single quote in the title survives the shell for either agent", () => {
    const { prompt, command } = agentCommand("claude", { ...issue, title: "Don't poll" });
    expect(command).toBe(`claude '${prompt.replace(/'/g, "'\\''")}'`);
  });
});

describe("what a headless Claude Code may run", () => {
  test("the list the README shows is the list the dashboard has", () => {
    expect(claudeAllowFlags()).toBe(
      "-- --allowedTools 'Bash(*/wf-env.sh *)' 'Bash(*/wf-status.sh *)' 'Bash(git add *)' 'Bash(git commit *)' 'Bash(pnpm *)'",
    );
    for (const tool of CLAUDE_ALLOWED_TOOLS) expect(readme).toContain(`'${tool}'`);
    // The README keeps the line breaks of its example; the flags are the same.
    const example = /--agent claude --pair 4F7K-92 -- \\\n\s+--allowedTools([^`]*)```/.exec(readme);
    expect(example?.[1].replace(/\s*\\\n\s*/g, " ").trim()).toBe(
      CLAUDE_ALLOWED_TOOLS.map((tool) => `'${tool}'`).join(" "),
    );
  });
});

describe("pair codes", () => {
  test("a code looks like 4F7K-92 and leaves out the letters that read alike", () => {
    for (let i = 0; i < 200; i++)
      expect(makePairCode()).toMatch(
        /^[ABCDEFGHJKMNPQRSTVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTVWXYZ2-9]{2}$/,
      );
  });

  test("the code comes from the random bytes it is given", () => {
    expect(makePairCode(() => [0, 1, 2, 3, 4, 5])).toBe("ABCD-EF");
    expect(makePairCode(() => [255, 255, 255, 255, 255, 255])).toMatch(/^.{4}-.{2}$/);
    expect(makePairCode()).not.toBe(makePairCode());
  });

  test("the command to copy runs the bridge for the agent with the code", () => {
    expect(pairCommand("codex", "4F7K-92")).toBe(
      "node plugins/workflow/scripts/wf-bridge.mjs --agent codex --pair 4F7K-92",
    );
    expect(pairCommand("claude", "4F7K-92")).toBe(
      "node plugins/workflow/scripts/wf-bridge.mjs --agent claude --pair 4F7K-92",
    );
  });

  test("a dashboard on another address allows itself with --origin; the dev server's two need nothing", () => {
    const plain = pairCommand("codex", "4F7K-92");
    expect(pairCommand("codex", "4F7K-92", "http://localhost:5177")).toBe(plain);
    expect(pairCommand("codex", "4F7K-92", "http://127.0.0.1:5177")).toBe(plain);
    expect(pairCommand("codex", "4F7K-92", undefined)).toBe(plain);
    expect(pairCommand("claude", "4F7K-92", "http://localhost:4173")).toBe(
      `${pairCommand("claude", "4F7K-92")} --origin http://localhost:4173`,
    );
    expect(pairCommand("codex", "4F7K-92", "http://192.168.1.20:7777")).toMatch(
      / --origin http:\/\/192\.168\.1\.20:7777$/,
    );
    // Anything a shell reads is quoted.
    expect(pairCommand("codex", "4F7K-92", "http://[::1]:5177")).toMatch(
      / --origin 'http:\/\/\[::1\]:5177'$/,
    );
  });
});

// ---------------------------------------------------------------- the store

const status = (over: Partial<BridgeStatus> = {}): BridgeStatus => ({
  agent: "codex",
  version: "0.46.0",
  host: "mudit-laptop",
  repo: { name: "workflow_management", remote: "https://github.com/mudit1729/workflow_management" },
  workspace: "web/mock/workspace",
  skills: { installed: ["using-wf"], missing: ["adding-work"] },
  runs: 0,
  active: 0,
  ...over,
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A bridge client whose answers the test decides. */
function fakeClient() {
  const pairing = deferred<string>();
  const client = {
    pair: vi.fn(),
    pollPair: vi.fn((_code: string, _o?: PairPollOptions) => pairing.promise),
    unpair: vi.fn(async (_t: string) => {}),
    status: vi.fn(async (_t: string) => status()),
    startRun: vi.fn(),
    listRuns: vi.fn(async () => []),
    follow: vi.fn(),
    cancel: vi.fn(),
  };
  return { client: client as unknown as BridgeClient & typeof client, pairing };
}

/** A `Storage` in memory. */
function memory(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  const storage: AgentStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return { storage, data };
}

/** Let promises that are already resolved run. */
const tick = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("begin", () => {
  test("it sets pairing with a code and the command, at once", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    expect(store.get()).toEqual({ status: "none" });
    const pairing = await store.begin("codex");
    expect(pairing).toBe(store.get());
    expect(pairing).toMatchObject({ status: "pairing", agent: "codex", mode: "bridge" });
    expect(pairing.pairCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{2}$/);
    expect(pairing.command).toBe(pairCommand("codex", pairing.pairCode ?? ""));
    // The dev server polls the bridge with that code.
    expect(client.pollPair).toHaveBeenCalledTimes(1);
    expect(client.pollPair.mock.calls[0][0]).toBe(pairing.pairCode);
    // Each begin makes a new code.
    const next = await store.begin("claude");
    expect(next.pairCode).not.toBe(pairing.pairCode);
    expect(next.command).toContain("--agent claude");
  });

  test("the bridge answers: connected, with the facts of its status", async () => {
    const { client, pairing } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    const heard = vi.fn();
    store.subscribe(heard);
    await store.begin("codex");
    pairing.resolve(TOKEN);
    await tick();
    expect(client.status).toHaveBeenCalledWith(TOKEN);
    const c = store.get();
    expect(c).toMatchObject({
      status: "connected",
      agent: "codex",
      mode: "bridge",
      host: "mudit-laptop",
      repo: "workflow_management",
      version: "codex 0.46.0",
      workspace: "web/mock/workspace",
      skills: { installed: ["using-wf"], missing: ["adding-work"] },
    });
    expect(Number.isNaN(Date.parse(c.since ?? ""))).toBe(false);
    expect(c.pairCode).toBeUndefined();
    expect(c.command).toBeUndefined();
    expect(store.token()).toBe(TOKEN);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  test("a bridge that does not know its version leaves it out; no workspace too", async () => {
    const { client, pairing } = fakeClient();
    client.status.mockResolvedValue(status({ version: null, workspace: null }));
    const store = createAgentStore({ client, storage: null });
    await store.begin("codex");
    pairing.resolve(TOKEN);
    await tick();
    expect(store.get().version).toBeUndefined();
    expect(store.get().workspace).toBeUndefined();
  });

  test("a refusal stops the pairing and says why; retry polls again with the same code", async () => {
    const { client, pairing } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    const first = await store.begin("codex");
    pairing.reject(new BridgeError(500, "internal", "The bridge failed on that request."));
    await tick();
    expect(store.get()).toMatchObject({
      status: "pairing",
      pairCode: first.pairCode,
      problem: "The bridge failed on that request.",
    });
    const signal = client.pollPair.mock.calls[0][1]?.signal;

    store.retry();
    const again = store.get();
    expect(again).toMatchObject({
      status: "pairing",
      pairCode: first.pairCode,
      command: first.command,
    });
    expect(again.problem).toBeUndefined();
    expect(client.pollPair).toHaveBeenCalledTimes(2);
    expect(client.pollPair.mock.calls[1][0]).toBe(first.pairCode);
    // The first polling is over; the second has its own signal.
    expect(signal?.aborted).toBe(true);
    expect(client.pollPair.mock.calls[1][1]?.signal?.aborted).toBe(false);

    // Only begin makes a new code.
    const fresh = await store.begin("codex");
    expect(fresh.pairCode).not.toBe(first.pairCode);
  });

  test("retry does nothing unless a pairing waits", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    store.retry();
    expect(store.get()).toEqual({ status: "none" });
    store.simulate("codex");
    store.retry();
    expect(store.get().status).toBe("connected");
    expect(client.pollPair).not.toHaveBeenCalled();
  });

  test("an old bridge that refuses the code is a note, not a problem; the polling goes on", async () => {
    const { client, pairing } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    const first = await store.begin("claude");
    const onBlocked = client.pollPair.mock.calls[0][1]?.onBlocked;
    expect(onBlocked).toBeTypeOf("function");

    // The client says an old bridge stayed: the screen can tell the person what to do.
    onBlocked?.(new BridgeError(403, "wrong_code", "That code does not match this bridge."));
    expect(store.get()).toMatchObject({
      status: "pairing",
      pairCode: first.pairCode,
      note: BLOCKED_NOTE,
    });
    expect(store.get().problem).toBeUndefined();
    expect(BLOCKED_NOTE).toBe(
      "Another bridge is still running. Press Ctrl+C in its terminal, then run this.",
    );

    // It was stopped: the note goes, the same polling pairs.
    onBlocked?.(null);
    expect(store.get().note).toBeUndefined();
    onBlocked?.(new BridgeError(409, "paired", "Already paired."));
    pairing.resolve(TOKEN);
    await tick();
    expect(store.get()).toMatchObject({ status: "connected", agent: "codex" });
    expect(store.get().note).toBeUndefined();
    expect(client.pollPair).toHaveBeenCalledTimes(1);
  });

  test("a note from a pairing that was replaced is dropped", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    await store.begin("codex");
    const old = client.pollPair.mock.calls[0][1]?.onBlocked;
    await store.begin("claude");
    old?.(new BridgeError(403, "wrong_code", "That code does not match this bridge."));
    expect(store.get()).toMatchObject({ status: "pairing", agent: "claude" });
    expect(store.get().note).toBeUndefined();
  });

  test("the note is not kept for a reload", async () => {
    const { client } = fakeClient();
    const { storage, data } = memory();
    const store = createAgentStore({ client, storage });
    await store.begin("codex");
    client.pollPair.mock.calls[0][1]?.onBlocked?.(
      new BridgeError(403, "wrong_code", "That code does not match this bridge."),
    );
    expect(store.get().note).toBe(BLOCKED_NOTE);
    expect(saved(data).connection.note).toBeUndefined();
  });

  test("a bridge that paired and then fails its first status is not connected", async () => {
    const { client, pairing } = fakeClient();
    client.status.mockRejectedValue(new BridgeUnreachableError());
    const store = createAgentStore({ client, storage: null });
    await store.begin("codex");
    pairing.resolve(TOKEN);
    await tick();
    expect(store.get()).toMatchObject({ status: "pairing", problem: expect.any(String) });
    expect(store.token()).toBeUndefined();
    // The token is given back, so the bridge is not left paired with nobody.
    expect(client.unpair).toHaveBeenCalledWith(TOKEN);
  });
});

describe("the static build", () => {
  test("begin pairs by itself in simulated mode after about 2.5 s", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null, static: true });
    const pairing = await store.begin("claude");
    expect(pairing).toMatchObject({ status: "pairing", agent: "claude", mode: "simulated" });
    expect(pairing.pairCode).toBeDefined();
    // No bridge is asked: none can be reached from the published artifact.
    expect(client.pollPair).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SIMULATED_PAIR_MS - 1);
    expect(store.get().status).toBe("pairing");
    await vi.advanceTimersByTimeAsync(1);
    expect(store.get()).toMatchObject({
      status: "connected",
      agent: "claude",
      mode: "simulated",
      host: "this computer",
      version: "claude 2.0",
    });
    expect(SIMULATED_PAIR_MS).toBe(2500);
    expect(store.token()).toBeUndefined();
  });

  test("cancel before the timer ends keeps it from connecting", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null, static: true });
    await store.begin("codex");
    store.cancel();
    expect(store.get()).toEqual({ status: "none" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.get()).toEqual({ status: "none" });
  });

  test("an old timer does not connect a pairing that replaced it", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null, static: true });
    await store.begin("codex");
    await vi.advanceTimersByTimeAsync(2000);
    await store.begin("claude");
    await vi.advanceTimersByTimeAsync(1000);
    // 3 s after the first begin, but only 1 s after the second.
    expect(store.get()).toMatchObject({ status: "pairing", agent: "claude" });
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.get()).toMatchObject({ status: "connected", agent: "claude" });
  });
});

describe("cancel, simulate and disconnect", () => {
  test("cancel stops the polling and a late answer does not connect", async () => {
    const { client, pairing } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    await store.begin("codex");
    const signal = client.pollPair.mock.calls[0][1]?.signal;
    store.cancel();
    expect(signal?.aborted).toBe(true);
    expect(store.get()).toEqual({ status: "none" });
    // The bridge paired just as the person cancelled: the token is given back.
    pairing.resolve(TOKEN);
    await tick();
    expect(store.get()).toEqual({ status: "none" });
    expect(client.unpair).toHaveBeenCalledWith(TOKEN);
  });

  test("cancel does nothing to a connection", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    store.simulate("codex");
    store.cancel();
    expect(store.get().status).toBe("connected");
  });

  test("simulate connects at once, in simulated mode, as the agent being paired", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    await store.begin("claude");
    const signal = client.pollPair.mock.calls[0][1]?.signal;
    const c = store.simulate();
    expect(signal?.aborted).toBe(true);
    expect(c).toBe(store.get());
    expect(c).toMatchObject({ status: "connected", agent: "claude", mode: "simulated" });
    expect(c.skills).toEqual({ installed: [], missing: [...WF_SKILL_NAMES] });
    expect(c.pairCode).toBeUndefined();
    expect(Number.isNaN(Date.parse(c.since ?? ""))).toBe(false);
  });

  test("simulate with no agent in sight is Codex, with every skill installed", () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    const c = store.simulate();
    expect(c).toMatchObject({ agent: "codex", version: "codex 0.46" });
    expect(c.skills).toEqual({ installed: [...WF_SKILL_NAMES], missing: [] });
    expect(store.simulate("claude").agent).toBe("claude");
  });

  test("a late answer from an older pairing is dropped after simulate", async () => {
    const { client, pairing } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    await store.begin("codex");
    store.simulate("codex");
    pairing.resolve(TOKEN);
    await tick();
    expect(store.get().mode).toBe("simulated");
    expect(store.token()).toBeUndefined();
    expect(client.unpair).toHaveBeenCalledWith(TOKEN);
  });

  test("disconnect tells the bridge to forget the token, and the agent is remembered", async () => {
    const { client, pairing } = fakeClient();
    client.status.mockResolvedValue(status({ agent: "claude", version: "2.1.314" }));
    const store = createAgentStore({ client, storage: null });
    await store.begin("claude");
    pairing.resolve(TOKEN);
    await tick();
    expect(store.get()).toMatchObject({
      status: "connected",
      agent: "claude",
      version: "claude 2.1.314",
    });
    store.disconnect();
    expect(client.unpair).toHaveBeenCalledWith(TOKEN);
    expect(store.get()).toEqual({ status: "none" });
    expect(store.token()).toBeUndefined();
    expect(store.preferred()).toBe("claude");
  });

  test("a bridge that cannot be told is no reason to stay connected", async () => {
    const { client, pairing } = fakeClient();
    client.unpair.mockRejectedValue(new BridgeUnreachableError());
    const store = createAgentStore({ client, storage: null });
    await store.begin("codex");
    pairing.resolve(TOKEN);
    await tick();
    store.disconnect();
    await tick();
    expect(store.get().status).toBe("none");
  });

  test("subscribers hear every change and can leave", () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    const heard = vi.fn();
    const off = store.subscribe(heard);
    store.simulate("codex");
    store.disconnect();
    off();
    store.simulate("claude");
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("the preferred agent", () => {
  test("the connected one, else the last chosen, else Codex", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null });
    expect(store.preferred()).toBe("codex");
    await store.begin("claude");
    expect(store.preferred()).toBe("claude");
    store.cancel();
    expect(store.preferred()).toBe("claude");
    store.simulate("codex");
    expect(store.preferred()).toBe("codex");
    store.disconnect();
    expect(store.preferred()).toBe("codex");
  });
});

// ---------------------------------------------------------------- a reload and a lost bridge

const saved = (data: Map<string, string>) => JSON.parse(data.get(AGENT_STORAGE_KEY) ?? "null");

describe("keeping the connection", () => {
  test("a bridge connection is saved with its token, and a reload stays connected", async () => {
    const { client, pairing } = fakeClient();
    const { storage, data } = memory();
    const store = createAgentStore({ client, storage });
    await store.begin("codex");
    pairing.resolve(TOKEN);
    await tick();
    expect(saved(data)).toMatchObject({
      v: 1,
      last: "codex",
      connection: {
        status: "connected",
        agent: "codex",
        mode: "bridge",
        token: TOKEN,
        host: "mudit-laptop",
        repo: "workflow_management",
        version: "codex 0.46.0",
        since: expect.any(String),
      },
    });
    store.dispose();

    // The page reloads: connected at once, and the bridge is asked.
    const later = fakeClient();
    const again = createAgentStore({ client: later.client, storage });
    expect(again.get()).toMatchObject({ status: "connected", agent: "codex", mode: "bridge" });
    expect(again.get().host).toBe("mudit-laptop");
    expect(again.token()).toBe(TOKEN);
    await tick();
    expect(later.client.status).toHaveBeenCalledWith(TOKEN);
    expect(again.get().status).toBe("connected");
  });

  test("a stored bridge that does not answer is lost", async () => {
    const { client, pairing } = fakeClient();
    const { storage } = memory();
    const first = createAgentStore({ client, storage });
    await first.begin("codex");
    pairing.resolve(TOKEN);
    await tick();
    first.dispose();

    const later = fakeClient();
    later.client.status.mockRejectedValue(new BridgeUnreachableError());
    const again = createAgentStore({ client: later.client, storage });
    await tick();
    expect(again.get()).toMatchObject({
      status: "lost",
      agent: "codex",
      host: "mudit-laptop",
      problem: expect.stringContaining("does not answer"),
    });
  });

  test("a bridge that forgot the token is lost for good: the token is dropped", async () => {
    const { client, pairing } = fakeClient();
    const { storage, data } = memory();
    const first = createAgentStore({ client, storage });
    await first.begin("codex");
    pairing.resolve(TOKEN);
    await tick();
    first.dispose();

    const later = fakeClient();
    later.client.status.mockRejectedValue(new BridgeError(401, "unauthorized", "Pair first."));
    const again = createAgentStore({ client: later.client, storage });
    await tick();
    expect(again.get()).toMatchObject({
      status: "lost",
      problem: expect.stringContaining("restarted"),
    });
    expect(again.token()).toBeUndefined();
    expect(saved(data).connection).toBeUndefined();
    expect(saved(data).last).toBe("codex");
  });

  test("a simulated connection comes back after a reload, and needs no bridge", () => {
    const { client } = fakeClient();
    const { storage, data } = memory();
    createAgentStore({ client, storage }).simulate("claude");
    expect(saved(data).connection).toMatchObject({ mode: "simulated", agent: "claude" });
    const again = createAgentStore({ client, storage });
    expect(again.get()).toMatchObject({
      status: "connected",
      agent: "claude",
      mode: "simulated",
      version: "claude 2.0",
    });
    expect(client.status).not.toHaveBeenCalled();
  });

  test("a pairing in progress carries on after a reload with the same code", async () => {
    const { client } = fakeClient();
    const { storage } = memory();
    const first = createAgentStore({ client, storage });
    const pairing = await first.begin("codex");
    first.dispose();
    const later = fakeClient();
    const again = createAgentStore({ client: later.client, storage });
    expect(again.get()).toMatchObject({
      status: "pairing",
      agent: "codex",
      pairCode: pairing.pairCode,
      command: pairing.command,
    });
    expect(later.client.pollPair.mock.calls[0][0]).toBe(pairing.pairCode);
  });

  test("disconnect clears the connection but remembers the agent", () => {
    const { client } = fakeClient();
    const { storage, data } = memory();
    const store = createAgentStore({ client, storage });
    store.simulate("claude");
    store.disconnect();
    expect(saved(data)).toEqual({ v: 1, last: "claude" });
    expect(createAgentStore({ client, storage }).preferred()).toBe("claude");
  });

  test("storage that is broken, empty or does not make sense changes nothing", () => {
    const { client } = fakeClient();
    for (const raw of [
      "{nope",
      "null",
      '{"v":2}',
      '{"v":1,"connection":{"status":"connected","agent":"gemini","mode":"bridge"}}',
      '{"v":1,"connection":{"status":"connected","agent":"codex","mode":"bridge"}}',
    ]) {
      const { storage } = memory({ [AGENT_STORAGE_KEY]: raw });
      const store = createAgentStore({ client, storage });
      expect(store.get(), raw).toEqual({ status: "none" });
    }
    const throwing: AgentStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createAgentStore({ client, storage: throwing });
    expect(() => store.simulate("codex")).not.toThrow();
    expect(store.get().status).toBe("connected");
  });

  test("a bridge connection is not restored in the static build", () => {
    const { client } = fakeClient();
    const { storage } = memory({
      [AGENT_STORAGE_KEY]: JSON.stringify({
        v: 1,
        connection: { status: "connected", agent: "codex", mode: "bridge", token: TOKEN },
      }),
    });
    const store = createAgentStore({ client, storage, static: true });
    expect(store.get()).toEqual({ status: "none" });
    expect(client.status).not.toHaveBeenCalled();
  });
});

describe("a bridge that goes away", () => {
  async function connected(heartbeatMs = 1000) {
    const fake = fakeClient();
    const store = createAgentStore({ client: fake.client, storage: null, heartbeatMs });
    await store.begin("codex");
    fake.pairing.resolve(TOKEN);
    await tick();
    fake.client.status.mockClear();
    return { ...fake, store };
  }

  test("two failed checks in a row make it lost; one does not", async () => {
    const { client, store } = await connected();
    client.status.mockRejectedValueOnce(new BridgeUnreachableError());
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.get().status).toBe("connected");
    // The next check works: the count starts over.
    await vi.advanceTimersByTimeAsync(1000);
    client.status.mockRejectedValue(new BridgeUnreachableError());
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.get().status).toBe("connected");
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.get()).toMatchObject({
      status: "lost",
      agent: "codex",
      host: "mudit-laptop",
      problem: expect.stringContaining("Is it still running"),
    });
    // The checks stop: a lost bridge is not asked every few seconds.
    client.status.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.status).not.toHaveBeenCalled();
  });

  test("a call that finds it gone makes it lost at once", async () => {
    const { store } = await connected();
    store.markLost("The bridge does not answer. Is it still running?");
    expect(store.get().status).toBe("lost");
    // The token stays, so recheck can bring it back.
    expect(store.token()).toBe(TOKEN);
  });

  test("recheck brings a lost connection back when the bridge answers", async () => {
    const { client, store } = await connected();
    store.markLost("gone");
    const c = await store.recheck();
    expect(c.status).toBe("connected");
    expect(c.problem).toBeUndefined();
    expect(client.status).toHaveBeenCalledWith(TOKEN);
    // And the checks start again.
    client.status.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.status).toHaveBeenCalled();
  });

  test("recheck of a bridge that still does not answer stays lost", async () => {
    const { client, store } = await connected();
    store.markLost("gone");
    client.status.mockRejectedValue(new BridgeUnreachableError());
    expect((await store.recheck()).status).toBe("lost");
  });

  test("a rejected token drops it", async () => {
    const { store } = await connected();
    store.markLost("The bridge was restarted. Connect the agent again.", true);
    expect(store.get().status).toBe("lost");
    expect(store.token()).toBeUndefined();
    expect((await store.recheck()).status).toBe("lost");
  });

  test("the checks stop at a disconnect", async () => {
    const { client, store } = await connected();
    store.disconnect();
    client.status.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.status).not.toHaveBeenCalled();
  });

  test("a simulated connection is never lost: there is nothing to ask", async () => {
    const { client } = fakeClient();
    const store = createAgentStore({ client, storage: null, heartbeatMs: 100 });
    store.simulate("codex");
    store.markLost("gone");
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.get().status).toBe("connected");
    expect(client.status).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- the shared store and its hooks

describe("the hooks", () => {
  beforeEach(() => {
    vi.useRealTimers();
    agentStore.disconnect();
  });

  test("useAgent reads the shared connection", () => {
    expect(capture(useAgent)).toEqual({ status: "none" });
    agentStore.simulate("claude");
    expect(capture(useAgent)).toMatchObject({ status: "connected", agent: "claude" });
    expect(capture(usePreferredAgent)).toBe("claude");
    expect(preferredAgent()).toBe("claude");
  });

  test("useAgentControls is one object with begin, retry, cancel, disconnect, simulate and recheck", () => {
    const controls = capture(useAgentControls);
    expect(capture(useAgentControls)).toBe(controls);
    for (const name of ["begin", "retry", "cancel", "disconnect", "simulate", "recheck"] as const)
      expect(controls[name]).toBeTypeOf("function");
    controls.simulate("codex");
    expect(agentStore.get().agent).toBe("codex");
    controls.disconnect();
    expect(agentStore.get().status).toBe("none");
  });

  test("window.__wf.connectAgent and disconnectAgent drive the shared connection", async () => {
    const mock = await loadMock();
    mock.mockControls.connectAgent("claude");
    expect(agentStore.get()).toMatchObject({
      status: "connected",
      agent: "claude",
      mode: "simulated",
    });
    mock.mockControls.connectAgent();
    expect(agentStore.get().agent).toBe("codex");
    mock.mockControls.disconnectAgent();
    expect(agentStore.get().status).toBe("none");
  });
});

describe("AgentNotConnectedError", () => {
  test("it says what to do, by the status the connection had", () => {
    const none = new AgentNotConnectedError();
    expect(none).toBeInstanceOf(Error);
    expect(none).toMatchObject({ name: "AgentNotConnectedError", status: "none" });
    expect(none.message).toBe("Connect an agent first.");
    expect(new AgentNotConnectedError("pairing").message).toBe(
      "Finish connecting the agent first.",
    );
    expect(new AgentNotConnectedError("lost")).toMatchObject({ status: "lost" });
    expect(new AgentNotConnectedError("lost").message).toBe(
      "The agent stopped answering. Connect it again.",
    );
  });
});

describe("the simulated answers", () => {
  test("they are fresh objects", () => {
    expect(simulatedConnection("codex")).not.toBe(simulatedConnection("codex"));
  });
});
