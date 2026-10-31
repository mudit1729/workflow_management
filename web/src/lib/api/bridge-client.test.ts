// The client of the bridge against a stand-in `fetch`: what it sends, how it reads a refusal and a
// dead bridge, pair polling (including an old bridge that still holds the port), and the event
// stream (chunks that cut an event in two, CRLF, a stream that ends early and is asked for again).
// The real bridge is exercised in `scripts/wf-bridge.test.ts`.
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

  test("a refusal names the bridge process that gave it", async () => {
    const s = stub(() =>
      json(
        { error: "unauthorized", message: "Pair with the bridge first.", instance: "1a2b3c4d" },
        401,
      ),
    );
    const err = await createBridgeClient({ fetch: s.fetch })
      .status(TOKEN)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 401, code: "unauthorized", instance: "1a2b3c4d" });
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

  test("a refusal other than a held port ends it at once", async () => {
    const s = stub(() =>
      json({ error: "bad_request", message: "The request body is not valid." }, 400),
    );
    const err = await createBridgeClient({ fetch: s.fetch })
      .pollPair("NOPE-00", { intervalMs: 1 })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "BridgeError", code: "bad_request" });
    expect(s.calls).toHaveLength(1);
  });

  /** A bridge that answers every pair attempt with `refusal` while `up()`, then the next one pairs. */
  function oldBridge(refusal: string, up: () => boolean, instance = "old00001") {
    const asked: string[] = [];
    const s = stub((url, init) => {
      const path = url.slice(BRIDGE_URL.length);
      asked.push(`${init.method ?? "GET"} ${path}`);
      if (!up()) {
        // Gone, or a new bridge that takes the code.
        if (path === "/pair") return json({ token: TOKEN });
        throw new TypeError("Failed to fetch");
      }
      if (path === "/pair")
        return json(
          { error: refusal, message: "That code does not match this bridge.", instance },
          403,
        );
      return json({ error: "unauthorized", message: "Pair with the bridge first.", instance }, 401);
    });
    return { ...s, asked };
  }

  test("an old bridge that refuses the code is waited out, and the code is tried once on it", async () => {
    let up = true;
    const old = oldBridge("wrong_code", () => up);
    const told: (string | null)[] = [];
    const polling = createBridgeClient({ fetch: old.fetch }).pollPair("NEW-22", {
      intervalMs: 5,
      onBlocked: (r) => told.push(r ? r.code : null),
    });
    // It stays for a while: the code was tried once, the rest were looks at /status.
    await new Promise((r) => setTimeout(r, 60));
    expect(told).toEqual(["wrong_code"]);
    expect(old.asked.filter((a) => a === "POST /pair")).toHaveLength(1);
    expect(old.asked.filter((a) => a === "GET /status").length).toBeGreaterThan(2);
    up = false;
    // It was stopped: the same code is tried again and pairs.
    expect(await polling).toBe(TOKEN);
    expect(told).toEqual(["wrong_code", null]);
    expect(old.asked.at(-1)).toBe("POST /pair");
    for (const c of old.calls.filter((c) => c.url.endsWith("/status")))
      expect(c.headers.has("authorization")).toBe(false);
    for (const c of old.calls.filter((c) => c.url.endsWith("/pair")))
      expect(JSON.parse(String(c.init.body))).toEqual({ code: "NEW-22" });
  });

  test("an already paired or closed bridge is waited out the same way", async () => {
    for (const refusal of ["paired", "locked"]) {
      let up = true;
      const old = oldBridge(refusal, () => up);
      const told: (string | null)[] = [];
      const polling = createBridgeClient({ fetch: old.fetch }).pollPair("NEW-22", {
        intervalMs: 5,
        onBlocked: (r) => told.push(r ? r.code : null),
      });
      await new Promise((r) => setTimeout(r, 30));
      up = false;
      expect(await polling).toBe(TOKEN);
      expect(told, refusal).toEqual([refusal, null]);
    }
  });

  test("a bridge that was stopped and started again in between is noticed by its name", async () => {
    // The port never goes quiet between two looks: the new bridge answers /status at once, with
    // another instance. The old one's refusal is over; the code goes to the new one.
    let fresh = false;
    const s = stub((url) => {
      const path = url.slice(BRIDGE_URL.length);
      if (path === "/pair" && fresh) return json({ token: TOKEN });
      if (path === "/pair")
        return json({ error: "wrong_code", message: "No.", instance: "old00001" }, 403);
      fresh = true;
      return json({ error: "unauthorized", message: "Pair first.", instance: "new00002" }, 401);
    });
    const told: unknown[] = [];
    const token = await createBridgeClient({ fetch: s.fetch }).pollPair("NEW-22", {
      intervalMs: 1,
      onBlocked: (r) => told.push(r),
    });
    expect(token).toBe(TOKEN);
    // It never stayed long enough to be called a blocker.
    expect(told).toEqual([]);
  });

  test("a bridge on its way out is waited for without a word", async () => {
    let up = true;
    const s = stub((url) => {
      if (!up) {
        if (url.endsWith("/pair")) return json({ token: TOKEN });
        throw new TypeError("Failed to fetch");
      }
      return json(
        { error: "stopping", message: "The bridge is stopping.", instance: "old00001" },
        503,
      );
    });
    const told: unknown[] = [];
    const polling = createBridgeClient({ fetch: s.fetch }).pollPair("NEW-22", {
      intervalMs: 5,
      onBlocked: (r) => told.push(r),
    });
    await new Promise((r) => setTimeout(r, 40));
    up = false;
    expect(await polling).toBe(TOKEN);
    expect(told).toEqual([]);
  });

  test("a bridge that names no instance is waited out until nothing answers", async () => {
    let up = true;
    const s = stub((url) => {
      const path = url.slice(BRIDGE_URL.length);
      if (!up) {
        if (path === "/pair") return json({ token: TOKEN });
        throw new TypeError("Failed to fetch");
      }
      return json({ error: path === "/pair" ? "wrong_code" : "unauthorized", message: "No." }, 403);
    });
    const polling = createBridgeClient({ fetch: s.fetch }).pollPair("NEW-22", { intervalMs: 5 });
    await new Promise((r) => setTimeout(r, 30));
    up = false;
    expect(await polling).toBe(TOKEN);
  });

  test("cancelling while an old bridge is waited out stops it with an AbortError", async () => {
    const old = oldBridge("wrong_code", () => true);
    const controller = new AbortController();
    const polling = createBridgeClient({ fetch: old.fetch }).pollPair("NEW-22", {
      intervalMs: 5,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 40);
    await expect(polling).rejects.toMatchObject({ name: "AbortError" });
    const asked = old.asked.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(old.asked).toHaveLength(asked);
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

  test("a stream that ends early is asked for again from the last line seen", async () => {
    let n = 0;
    const s = stub(() => {
      n += 1;
      return n === 1
        ? stream([event("line", { text: "one" }, 1), event("line", { text: "two" }, 2)])
        : stream([
            event("line", { text: "three" }, 3),
            event("exit", { code: 0, signal: null, status: "done" }),
          ]);
    });
    const lines: string[] = [];
    const exits: unknown[] = [];
    await createBridgeClient({ fetch: s.fetch, resumeMs: 1 }).follow(TOKEN, "run-0a1b2c3d", {
      onLine: (t) => lines.push(t),
      onExit: (e) => exits.push(e),
    });
    expect(lines).toEqual(["one", "two", "three"]);
    expect(exits).toEqual([{ code: 0, signal: null, status: "done" }]);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[0].headers.has("last-event-id")).toBe(false);
    expect(s.calls[1].headers.get("last-event-id")).toBe("2");
    expect(s.calls[1].headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("a stream that breaks is asked for again the same way", async () => {
    let n = 0;
    const s = stub(() => {
      n += 1;
      if (n > 1) return stream([event("exit", { code: 0, signal: null, status: "done" })]);
      // One line gets through, then the connection breaks.
      let sent = false;
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (sent) return controller.error(new TypeError("network error"));
            sent = true;
            controller.enqueue(new TextEncoder().encode(event("line", { text: "one" }, 1)));
          },
        }),
      );
    });
    const onExit = vi.fn();
    await createBridgeClient({ fetch: s.fetch, resumeMs: 1 }).follow(TOKEN, "run-0a1b2c3d", {
      onLine: vi.fn(),
      onExit,
    });
    expect(s.calls[1].headers.get("last-event-id")).toBe("1");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test("a stream that keeps ending without an exit means the bridge is gone", async () => {
    const s = stub(() => stream([event("line", { text: "working" }, 1)]));
    const onLine = vi.fn();
    const err = await createBridgeClient({ fetch: s.fetch, resumeMs: 1 })
      .follow(TOKEN, "run-0a1b2c3d", { onLine, onExit: vi.fn() })
      .catch((e: unknown) => e);
    expect(onLine).toHaveBeenCalledWith("working");
    expect(err).toBeInstanceOf(BridgeUnreachableError);
    // The first request and two more, then it gives up.
    expect(s.calls).toHaveLength(3);
  });

  test("a bridge that does not come back when asked again is unreachable", async () => {
    let n = 0;
    const s = stub(() => {
      n += 1;
      if (n > 1) throw new TypeError("Failed to fetch");
      return stream([event("line", { text: "working" }, 1)]);
    });
    const err = await createBridgeClient({ fetch: s.fetch, resumeMs: 1 })
      .follow(TOKEN, "run-0a1b2c3d", { onLine: vi.fn(), onExit: vi.fn() })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeUnreachableError);
    expect(s.calls).toHaveLength(2);
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
