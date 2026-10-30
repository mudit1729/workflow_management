// The client of the bridge against a stand-in `fetch`: what it sends, how it reads a refusal and a
// dead bridge, pair polling, and the event stream (chunks that cut an event in two, CRLF, a stream
// that ends without its exit). The real bridge is exercised in `scripts/wf-bridge.test.ts`.
import { describe, expect, test, vi } from "vitest";
import {
  BRIDGE_URL,
  BridgeError,
  type BridgeRun,
  BridgeUnreachableError,
  createBridgeClient,
} from "./bridge-client";

const TOKEN = "a".repeat(64);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A `fetch` that answers from a function and remembers what it was asked. */
function stub(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; headers: Headers }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, headers: new Headers(init.headers) });
    return answer(url, init);
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls };
}

/** A response whose body arrives in the given chunks. */
function stream(chunks: string[], then: "close" | "error" = "close") {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        if (then === "close") controller.close();
        else controller.error(new TypeError("network error"));
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

const run: BridgeRun = {
  id: "run-0a1b2c3d",
  issue: "wf-3k9x2",
  agent: "codex",
  startedAt: "2026-10-30T10:00:00.000Z",
  status: "running",
};

describe("what it sends", () => {
  test("pair posts the code as JSON, without a token, and returns the token", async () => {
    const s = stub(() => json({ token: TOKEN }));
    const client = createBridgeClient({ fetch: s.fetch });
    expect(await client.pair("4F7K-92")).toBe(TOKEN);
    const [c] = s.calls;
    expect(c.url).toBe(`${BRIDGE_URL}/pair`);
    expect(c.init.method).toBe("POST");
    expect(JSON.parse(String(c.init.body))).toEqual({ code: "4F7K-92" });
    expect(c.headers.get("content-type")).toBe("application/json");
    expect(c.headers.has("authorization")).toBe(false);
  });

  test("every other call carries the token as a Bearer header", async () => {
    const s = stub((url) =>
      url.endsWith("/runs")
        ? json([run])
        : url.endsWith("/status")
          ? json({ agent: "codex" })
          : json(run),
    );
    const client = createBridgeClient({ fetch: s.fetch });
    await client.status(TOKEN);
    await client.listRuns(TOKEN);
    await client.startRun(TOKEN, "wf-3k9x2", "next_step");
    await client.cancel(TOKEN, "run-0a1b2c3d");
    await client.unpair(TOKEN);
    expect(
      s.calls.map((c) => `${c.init.method ?? "GET"} ${c.url.slice(BRIDGE_URL.length)}`),
    ).toEqual([
      "GET /status",
      "GET /runs",
      "POST /runs",
      "DELETE /runs/run-0a1b2c3d",
      "DELETE /pair",
    ]);
    for (const c of s.calls) expect(c.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("a run is started from an issue id and a kind, nothing else", async () => {
    const s = stub(() => json(run));
    const client = createBridgeClient({ fetch: s.fetch });
    expect(await client.startRun(TOKEN, "wf-3k9x2", "next_step")).toEqual(run);
    expect(JSON.parse(String(s.calls[0].init.body))).toEqual({
      issue: "wf-3k9x2",
      kind: "next_step",
    });
  });

  test("the address is a string, or a function read at each call", async () => {
    const s = stub(() => json({}));
    let url = "http://127.0.0.1:9000";
    const client = createBridgeClient({ fetch: s.fetch, url: () => url });
    await client.status(TOKEN);
    url = "http://127.0.0.1:9001";
    await client.status(TOKEN);
    await createBridgeClient({ fetch: s.fetch, url: "http://127.0.0.1:9002" }).status(TOKEN);
    expect(s.calls.map((c) => c.url)).toEqual([
      "http://127.0.0.1:9000/status",
      "http://127.0.0.1:9001/status",
      "http://127.0.0.1:9002/status",
    ]);
  });

  test("a run id is encoded in the path", async () => {
    const s = stub(() => json(run));
    const client = createBridgeClient({ fetch: s.fetch });
    await client.cancel(TOKEN, "../x");
    expect(s.calls[0].url).toBe(`${BRIDGE_URL}/runs/..%2Fx`);
  });
});

describe("what goes wrong", () => {
  test("a refusal is a BridgeError with the bridge's own words", async () => {
    const s = stub(() =>
      json({ error: "busy", message: "Codex is already working on wf-3k9x2." }, 409),
    );
    const client = createBridgeClient({ fetch: s.fetch });
    const err = await client.startRun(TOKEN, "wf-3k9x2", "next_step").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err).toMatchObject({
      name: "BridgeError",
      status: 409,
      code: "busy",
      message: "Codex is already working on wf-3k9x2.",
    });
  });

  test("an answer that is not the bridge's JSON still says what the status was", async () => {
    const s = stub(() => new Response("<html>nope</html>", { status: 502 }));
    const err = await createBridgeClient({ fetch: s.fetch })
      .status(TOKEN)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "BridgeError", status: 502, code: "error" });
    expect((err as Error).message).toBe("The bridge answered 502.");
  });

  test("a fetch that fails is an unreachable bridge", async () => {
    const s = stub(() => {
      throw new TypeError("Failed to fetch");
    });
    const err = await createBridgeClient({ fetch: s.fetch })
      .status(TOKEN)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeUnreachableError);
    expect(err).toMatchObject({ name: "BridgeUnreachableError" });
  });

  test("an abort stays an abort", async () => {
    const controller = new AbortController();
    const s = stub((_url, init) => {
      if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return json({});
    });
    controller.abort();
    const err = await createBridgeClient({ fetch: s.fetch })
      .status(TOKEN, { signal: controller.signal })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AbortError" });
  });
});

describe("pair polling", () => {
  test("it retries while the bridge does not answer, then returns the token", async () => {
    let n = 0;
    const s = stub(() => {
      n += 1;
      if (n < 3) throw new TypeError("Failed to fetch");
      return json({ token: TOKEN });
    });
    const client = createBridgeClient({ fetch: s.fetch });
    expect(await client.pollPair("4F7K-92", { intervalMs: 1 })).toBe(TOKEN);
    expect(s.calls).toHaveLength(3);
  });

  test("it waits the interval between attempts", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const s = stub(() => {
        n += 1;
        if (n < 3) throw new TypeError("Failed to fetch");
        return json({ token: TOKEN });
      });
      const polling = createBridgeClient({ fetch: s.fetch }).pollPair("4F7K-92");
      await vi.advanceTimersByTimeAsync(0);
      expect(s.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(s.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(s.calls).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await polling).toBe(TOKEN);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a refusal ends it at once: a wrong code is never tried twice", async () => {
    const s = stub(() => json({ error: "wrong_code", message: "That code does not match." }, 403));
    const err = await createBridgeClient({ fetch: s.fetch })
      .pollPair("NOPE-00", { intervalMs: 1 })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "BridgeError", code: "wrong_code" });
    expect(s.calls).toHaveLength(1);
  });

  test("cancelling stops it with an AbortError", async () => {
    const s = stub(() => {
      throw new TypeError("Failed to fetch");
    });
    const controller = new AbortController();
    const polling = createBridgeClient({ fetch: s.fetch }).pollPair("4F7K-92", {
      intervalMs: 5,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(polling).rejects.toMatchObject({ name: "AbortError" });
    const asked = s.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(s.calls).toHaveLength(asked);
  });

  test("an already cancelled signal asks nothing", async () => {
    const s = stub(() => json({ token: TOKEN }));
    const controller = new AbortController();
    controller.abort();
    await expect(
      createBridgeClient({ fetch: s.fetch }).pollPair("4F7K-92", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(s.calls).toHaveLength(0);
  });
});

describe("following a run", () => {
  const event = (name: string, data: unknown, id?: number) =>
    `${id ? `id: ${id}\n` : ""}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

  test("lines arrive in order, then the exit, and follow resolves", async () => {
    const s = stub(() =>
      stream([
        event("line", { text: "claiming T-4" }, 1),
        event("line", { text: "editing plan.md" }, 2),
        event("exit", { code: 0, signal: null, status: "done" }),
      ]),
    );
    const lines: string[] = [];
    const exits: unknown[] = [];
    await createBridgeClient({ fetch: s.fetch }).follow(TOKEN, "run-0a1b2c3d", {
      onLine: (t) => lines.push(t),
      onExit: (e) => exits.push(e),
    });
    expect(lines).toEqual(["claiming T-4", "editing plan.md"]);
    expect(exits).toEqual([{ code: 0, signal: null, status: "done" }]);
    expect(s.calls[0].url).toBe(`${BRIDGE_URL}/runs/run-0a1b2c3d/events`);
    expect(s.calls[0].headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("an event cut in two by the network is read whole, and CRLF is fine", async () => {
    const whole =
      event("line", { text: "héllo wörld" }, 1) +
      event("exit", { code: 3, signal: null, status: "failed" });
    // Cut in the middle of an event, and in the middle of a two-byte character.
    const bytes = new TextEncoder().encode(whole.replace(/\n/g, "\r\n"));
    const cut = bytes.indexOf(0xc3) + 1;
    const s = stub(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.slice(0, 20));
              controller.enqueue(bytes.slice(20, cut));
              controller.enqueue(bytes.slice(cut));
              controller.close();
            },
          }),
        ),
    );
    const lines: string[] = [];
    const exits: unknown[] = [];
    await createBridgeClient({ fetch: s.fetch }).follow(TOKEN, "run-0a1b2c3d", {
      onLine: (t) => lines.push(t),
      onExit: (e) => exits.push(e),
    });
    expect(lines).toEqual(["héllo wörld"]);
    expect(exits).toEqual([{ code: 3, signal: null, status: "failed" }]);
  });

  test("a heartbeat comment is ignored", async () => {
    const s = stub(() =>
      stream([": ping\n\n", event("exit", { code: 0, signal: null, status: "done" })]),
    );
    const onLine = vi.fn();
    const onExit = vi.fn();
    await createBridgeClient({ fetch: s.fetch }).follow(TOKEN, "run-0a1b2c3d", { onLine, onExit });
    expect(onLine).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test("a stream that ends without an exit means the bridge is gone", async () => {
    const s = stub(() => stream([event("line", { text: "working" }, 1)]));
    const onLine = vi.fn();
    const err = await createBridgeClient({ fetch: s.fetch })
      .follow(TOKEN, "run-0a1b2c3d", { onLine, onExit: vi.fn() })
      .catch((e: unknown) => e);
    expect(onLine).toHaveBeenCalledWith("working");
    expect(err).toBeInstanceOf(BridgeUnreachableError);
  });

  test("a stream that breaks is the same", async () => {
    const s = stub(() => stream([event("line", { text: "working" }, 1)], "error"));
    const err = await createBridgeClient({ fetch: s.fetch })
      .follow(TOKEN, "run-0a1b2c3d", { onLine: vi.fn(), onExit: vi.fn() })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeUnreachableError);
  });

  test("a refusal before the stream starts is a BridgeError", async () => {
    const s = stub(() => json({ error: "no_run", message: "No such run." }, 404));
    const err = await createBridgeClient({ fetch: s.fetch })
      .follow(TOKEN, "run-0a1b2c3d", { onLine: vi.fn(), onExit: vi.fn() })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "BridgeError", status: 404, code: "no_run" });
  });

  test("cancelling stops it with an AbortError and hands the signal to fetch", async () => {
    const controller = new AbortController();
    const s = stub((_url, init) => {
      expect(init.signal).toBe(controller.signal);
      return new Response(
        new ReadableStream({
          start(c) {
            init.signal?.addEventListener("abort", () =>
              c.error(new DOMException("Aborted", "AbortError")),
            );
          },
        }),
      );
    });
    const following = createBridgeClient({ fetch: s.fetch }).follow(
      TOKEN,
      "run-0a1b2c3d",
      { onLine: vi.fn(), onExit: vi.fn() },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 10);
    await expect(following).rejects.toMatchObject({ name: "AbortError" });
  });
});
