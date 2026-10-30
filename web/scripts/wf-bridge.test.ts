// The bridge (plugins/workflow/scripts/wf-bridge.mjs, plan D9 and D13) as a real child process on
// a random port, with a fake agent binary that prints lines, edits a file of a temporary copy of the
// sample workspace and exits. Nothing here touches the repository's own workspace.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createBridgeClient } from "../src/lib/api/bridge-client";
import format from "../../plugins/workflow/skills/using-wf/references/format.md?raw";
import {
  alive,
  BRIDGE,
  call,
  DASHBOARD,
  freePort,
  ISSUE,
  ISSUE_PATH,
  makeRepo,
  OTHER_ISSUE,
  pair,
  REPO_ROOT,
  type RunningBridge,
  readEvents,
  SHELL_ISSUE,
  SHELL_TITLE,
  sleep,
  startBridge,
  type TestRepo,
  until,
} from "./bridge-test-support";

const SKILLS = readdirSync(join(REPO_ROOT, "plugins/workflow/skills")).sort();

const started: RunningBridge[] = [];
const bridge = async (repo: TestRepo, options?: Parameters<typeof startBridge>[1]) => {
  const b = await startBridge(repo, options);
  started.push(b);
  return b;
};
afterAll(async () => {
  await Promise.all(started.map((b) => b.stop()));
});

/** The bridge writes its lines to a pipe: wait until the one the test needs has arrived. */
const printed = (b: RunningBridge, text: string) => until(() => b.output().includes(text));

/** The resume prompt of format.md section 15, filled in, and the sentence the bridge adds. */
function expectedPrompt(id: string, title: string, path: string): string {
  const template =
    'Work on <id> "<title>" in <issue path>. Read current_state.md first, then use the wf skills (doing-next-step).';
  expect(format).toContain(template);
  return `${template.replace("<id>", id).replace("<title>", title).replace("<issue path>", path)} Use the doing-next-step skill to do the next step.`;
}

const startRun = (b: RunningBridge, token: string, issue = ISSUE) =>
  call(b.port, "POST", "/runs", { token, body: { issue, kind: "next_step" } });

// ---------------------------------------------------------------- pairing

describe("pairing", () => {
  let repo: TestRepo;
  let b: RunningBridge;
  beforeAll(async () => {
    repo = makeRepo();
    b = await bridge(repo);
  });

  test("it says what it waits for in one line", () => {
    const first = b.output().split("\n")[0];
    expect(first).toBe(
      `wf bridge: Codex 1.2.3 on ${os.hostname()}, repo repo. Pair code TEST-42: waiting for the dashboard.`,
    );
  });

  test("the right code returns a token, once", async () => {
    const wrong = await call(b.port, "POST", "/pair", { body: { code: "NOPE-00" } });
    expect(wrong.status).toBe(403);
    expect(wrong.json().error).toBe("wrong_code");
    expect(wrong.text).not.toContain("token");

    // The code is read without regard to case or spaces.
    const right = await call(b.port, "POST", "/pair", { body: { code: " test-42 " } });
    expect(right.status).toBe(200);
    expect(right.json().token).toMatch(/^[0-9a-f]{64}$/);
    await printed(b, "paired with the dashboard");

    // One-time: the code does not pair a second page.
    const again = await call(b.port, "POST", "/pair", { body: { code: "TEST-42" } });
    expect(again.status).toBe(409);
  });

  test("a revoked token stops working and pairing opens again", async () => {
    const other = makeRepo();
    const c = await bridge(other, { pair: "AGAIN-7" });
    const first = await pair(c, "AGAIN-7");
    expect((await call(c.port, "GET", "/status", { token: first })).status).toBe(200);
    expect((await call(c.port, "DELETE", "/pair", { token: first })).status).toBe(200);
    expect((await call(c.port, "GET", "/status", { token: first })).status).toBe(401);
    const second = await pair(c, "AGAIN-7");
    expect(second).not.toBe(first);
    expect((await call(c.port, "GET", "/status", { token: second })).status).toBe(200);
  });

  test("five wrong codes close pairing, and the right one no longer works", async () => {
    const other = makeRepo();
    const c = await bridge(other, { pair: "LOCK-11" });
    for (let i = 0; i < 5; i++) {
      const r = await call(c.port, "POST", "/pair", { body: { code: `BAD-${i}` } });
      expect(r.status).toBe(403);
    }
    const locked = await call(c.port, "POST", "/pair", { body: { code: "LOCK-11" } });
    expect(locked.status).toBe(429);
    expect(locked.json().error).toBe("locked");
    await printed(c, "5 wrong pair codes. Pairing is closed.");
  });

  test("every other route needs the token", async () => {
    const routes: [string, string][] = [
      ["GET", "/status"],
      ["GET", "/runs"],
      ["POST", "/runs"],
      ["GET", "/runs/run-00000000"],
      ["GET", "/runs/run-00000000/events"],
      ["DELETE", "/runs/run-00000000"],
      ["DELETE", "/pair"],
    ];
    const other = makeRepo();
    const c = await bridge(other, { pair: "AUTH-99" });
    await pair(c, "AUTH-99");
    for (const [method, path] of routes) {
      const none = await call(c.port, method, path, { body: method === "POST" ? {} : undefined });
      expect(none.status, `${method} ${path} without a token`).toBe(401);
      const bad = await call(c.port, method, path, { token: "0".repeat(64) });
      expect(bad.status, `${method} ${path} with another token`).toBe(401);
      const odd = await call(c.port, method, path, { headers: { authorization: "Bearer nope" } });
      expect(odd.status, `${method} ${path} with a malformed token`).toBe(401);
    }
  });
});

// ---------------------------------------------------------------- who may ask

describe("who may ask", () => {
  let repo: TestRepo;
  let b: RunningBridge;
  let token: string;
  beforeAll(async () => {
    repo = makeRepo();
    b = await bridge(repo);
    token = await pair(b);
  });

  test("a Host that is not 127.0.0.1 or localhost on its port is refused", async () => {
    for (const host of [
      "evil.example.com",
      `evil.example.com:${b.port}`,
      `127.0.0.1:${b.port + 1}`,
    ]) {
      const r = await call(b.port, "GET", "/status", { token, headers: { host } });
      expect(r.status, host).toBe(403);
      expect(r.json().error).toBe("bad_host");
    }
    const pairing = await call(b.port, "POST", "/pair", {
      body: { code: "TEST-42" },
      headers: { host: "rebind.example.com" },
    });
    expect(pairing.status).toBe(403);
    const preflight = await call(b.port, "OPTIONS", "/runs", {
      headers: { host: "rebind.example.com", "access-control-request-method": "POST" },
    });
    expect(preflight.status).toBe(403);
  });

  test("localhost and 127.0.0.1 on the port both work", async () => {
    for (const host of [`localhost:${b.port}`, `127.0.0.1:${b.port}`, `LOCALHOST:${b.port}`]) {
      const r = await call(b.port, "GET", "/status", { token, headers: { host } });
      expect(r.status, host).toBe(200);
    }
  });

  test("another origin is refused, even with the token, and gets no CORS headers", async () => {
    for (const origin of [
      "http://evil.example.com",
      "null",
      "http://localhost:5178",
      DASHBOARD + ".evil.io",
    ]) {
      const r = await call(b.port, "GET", "/status", { token, origin });
      expect(r.status, origin).toBe(403);
      expect(r.json().error).toBe("bad_origin");
      expect(r.headers["access-control-allow-origin"]).toBeUndefined();
    }
    const post = await call(b.port, "POST", "/pair", {
      body: { code: "TEST-42" },
      origin: "http://evil.example.com",
    });
    expect(post.status).toBe(403);
  });

  test("the dashboard's origins are answered with their own CORS header", async () => {
    for (const origin of [DASHBOARD, "http://127.0.0.1:5177"]) {
      const r = await call(b.port, "GET", "/status", { token, origin });
      expect(r.status).toBe(200);
      expect(r.headers["access-control-allow-origin"]).toBe(origin);
      expect(r.headers.vary).toContain("Origin");
    }
  });

  test("a request with no Origin (a script) still needs the token", async () => {
    expect((await call(b.port, "GET", "/status", { token, origin: null })).status).toBe(200);
    expect((await call(b.port, "GET", "/status", { origin: null })).status).toBe(401);
  });

  test("a preflight is answered for an allowed origin, with the private network header", async () => {
    const r = await call(b.port, "OPTIONS", "/runs", {
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
        "access-control-request-private-network": "true",
      },
    });
    expect(r.status).toBe(204);
    expect(r.headers["access-control-allow-origin"]).toBe(DASHBOARD);
    expect(r.headers["access-control-allow-private-network"]).toBe("true");
    expect(r.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(r.headers["access-control-allow-methods"]).toMatch(/DELETE/);
    expect(r.headers["access-control-allow-headers"]).toMatch(/authorization/);
    expect(r.headers["access-control-allow-headers"]).toMatch(/content-type/);
  });

  test("a preflight from another origin, or from no origin, is refused", async () => {
    const other = await call(b.port, "OPTIONS", "/runs", {
      origin: "http://evil.example.com",
      headers: { "access-control-request-method": "POST" },
    });
    expect(other.status).toBe(403);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    const none = await call(b.port, "OPTIONS", "/runs", { origin: null });
    expect(none.status).toBe(403);
  });

  test("--origin replaces the default origins", async () => {
    const c = await bridge(makeRepo(), { origins: ["https://dash.example.com/"] });
    const dash = "https://dash.example.com";
    const paired = await call(c.port, "POST", "/pair", { body: { code: "TEST-42" }, origin: dash });
    const t = paired.json().token;
    const ok = await call(c.port, "GET", "/status", { token: t, origin: dash });
    expect(ok.status).toBe(200);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://dash.example.com");
    const no = await call(c.port, "GET", "/status", { token: t, origin: DASHBOARD });
    expect(no.status).toBe(403);
  });

  test("it listens on the loopback address only", async () => {
    const outside = Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal);
    const tryConnect = (host: string) =>
      new Promise<string>((resolve) => {
        const socket = net.connect({ host, port: b.port });
        socket.once("connect", () => {
          socket.destroy();
          resolve("connected");
        });
        socket.once("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? "error"));
        socket.setTimeout(2000, () => {
          socket.destroy();
          resolve("timeout");
        });
      });
    expect(await tryConnect("127.0.0.1")).toBe("connected");
    expect(await tryConnect("::1")).not.toBe("connected");
    if (outside) expect(await tryConnect(outside.address)).not.toBe("connected");
  });
});

// ---------------------------------------------------------------- status

describe("status", () => {
  test("it reports the agent, host, repository, workspace and skills", async () => {
    const repo = makeRepo();
    const b = await bridge(repo);
    const token = await pair(b);
    const r = await call(b.port, "GET", "/status", { token });
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({
      agent: "codex",
      version: "1.2.3",
      host: os.hostname(),
      // The password of the remote is not passed on.
      repo: { name: "repo", remote: "https://example.com/team/wf.git" },
      workspace: "workspace",
      skills: { installed: [], missing: SKILLS },
      runs: 0,
      active: 0,
    });
    expect(SKILLS).toHaveLength(8);
  });

  test("Codex skills are the folders of <repo>/.agents/skills that hold a SKILL.md", async () => {
    const repo = makeRepo();
    for (const name of ["using-wf", "doing-next-step"]) {
      mkdirSync(join(repo.dir, ".agents/skills", name), { recursive: true });
      writeFileSync(join(repo.dir, ".agents/skills", name, "SKILL.md"), "---\nname: x\n---\n");
    }
    // A folder without a SKILL.md is not a skill.
    mkdirSync(join(repo.dir, ".agents/skills/logging-work"), { recursive: true });
    const b = await bridge(repo);
    const token = await pair(b);
    const { skills } = (await call(b.port, "GET", "/status", { token })).json();
    expect(skills.installed).toEqual(["doing-next-step", "using-wf"]);
    expect(skills.missing).toEqual(SKILLS.filter((s) => !skills.installed.includes(s)));
  });

  test("Claude Code skills: <repo>/.claude/skills, or the workflow plugin enabled in settings", async () => {
    const copied = makeRepo("web/mock/workspace");
    mkdirSync(join(copied.dir, ".claude/skills/using-wf"), { recursive: true });
    writeFileSync(
      join(copied.dir, ".claude/skills/using-wf/SKILL.md"),
      "---\nname: using-wf\n---\n",
    );
    const a = await bridge(copied, { agent: "claude" });
    const ta = await pair(a);
    const sa = (await call(a.port, "GET", "/status", { token: ta })).json();
    expect(sa.agent).toBe("claude");
    expect(sa.workspace).toBe("web/mock/workspace");
    expect(sa.skills.installed).toEqual(["using-wf"]);

    const plugin = makeRepo();
    mkdirSync(join(plugin.dir, ".claude"), { recursive: true });
    writeFileSync(
      join(plugin.dir, ".claude/settings.json"),
      JSON.stringify({ enabledPlugins: { "workflow@workflow-marketplace": true } }),
    );
    const p = await bridge(plugin, { agent: "claude" });
    const sp = (await call(p.port, "GET", "/status", { token: await pair(p) })).json();
    expect(sp.skills).toEqual({ installed: SKILLS, missing: [] });

    // Switched off: nothing installed.
    const off = makeRepo();
    mkdirSync(join(off.dir, ".claude"), { recursive: true });
    writeFileSync(
      join(off.dir, ".claude/settings.json"),
      JSON.stringify({ enabledPlugins: { "workflow@workflow-marketplace": false } }),
    );
    const o = await bridge(off, { agent: "claude" });
    const so = (await call(o.port, "GET", "/status", { token: await pair(o) })).json();
    expect(so.skills.installed).toEqual([]);
  });

  test("the workspace is found the way using-wf finds it", async () => {
    // From a folder inside the workspace: the nearest workflow.toml above it.
    const repo = makeRepo();
    const inner = join(repo.dir, "workspace/issues");
    const a = await bridge(repo, { repo: inner });
    const sa = (await call(a.port, "GET", "/status", { token: await pair(a) })).json();
    expect(sa.workspace).toBe(join(repo.dir, "workspace"));
    // $WF_ROOT wins.
    const other = makeRepo("elsewhere");
    const b = await bridge(other, { env: { WF_ROOT: join(other.dir, "elsewhere") } });
    const sb = (await call(b.port, "GET", "/status", { token: await pair(b) })).json();
    expect(sb.workspace).toBe("elsewhere");
    // No workspace at all: null, and a run says so.
    const empty = makeRepo();
    const c = await bridge(empty, { repo: os.tmpdir() });
    const tc = await pair(c);
    expect((await call(c.port, "GET", "/status", { token: tc })).json().workspace).toBeNull();
    const run = await startRun(c, tc);
    expect(run.status).toBe(409);
    expect(run.json().error).toBe("no_workspace");
  });
});

// ---------------------------------------------------------------- runs

describe("runs", () => {
  let repo: TestRepo;
  let b: RunningBridge;
  let token: string;
  beforeAll(async () => {
    repo = makeRepo();
    b = await bridge(repo);
    token = await pair(b);
  });

  test("a run starts the agent in the repo with the prompt the bridge built", async () => {
    const r = await startRun(b, token);
    expect(r.status).toBe(200);
    const run = r.json();
    expect(run).toMatchObject({ issue: ISSUE, agent: "codex", status: "running" });
    expect(run.id).toMatch(/^run-[0-9a-f]{8}$/);
    expect(Number.isNaN(Date.parse(run.startedAt))).toBe(false);

    const { events } = await readEvents(b.port, run.id, token);
    const call1 = repo.calls().at(-1);
    const prompt = expectedPrompt(ISSUE, "Push board updates over SSE", ISSUE_PATH);
    // codex exec --full-auto <prompt>
    expect(call1?.argv).toEqual(["exec", "--full-auto", prompt]);
    expect(call1?.cwd).toBe(repo.dir);
    expect(call1?.wfRoot).toBe(join(repo.dir, "workspace"));
    expect(call1?.wfAuthor).toBe("codex");

    // The agent's edit is in the workspace copy.
    const changes = readFileSync(join(repo.dir, "workspace", ISSUE_PATH, "changes.md"), "utf8");
    expect(changes).toContain("<!-- fake agent -->");
    expect(events.at(-1)?.event).toBe("exit");
  });

  test("its events: the lines of stdout and stderr, then one exit", async () => {
    repo.behave(OTHER_ISSUE, "ok");
    const run = (await startRun(b, token, OTHER_ISSUE)).json();
    const { status, events } = await readEvents(b.port, run.id, token);
    expect(status).toBe(200);
    const lines = events.filter((e) => e.event === "line").map((e) => e.data.text);
    expect(lines).toContain("claiming the task");
    expect(lines).toContain("warning: slow disk");
    expect(lines).toContain("logged the change");
    expect(events.filter((e) => e.event === "exit")).toEqual([
      { event: "exit", data: { code: 0, signal: null, status: "done" }, id: undefined },
    ]);
    expect(events.at(-1)?.event).toBe("exit");

    // A reader who comes late gets the same lines, and Last-Event-ID skips the ones it has.
    const late = await readEvents(b.port, run.id, token);
    expect(late.events).toEqual(events);
    const skip = await readEvents(b.port, run.id, token, { "last-event-id": "2" });
    expect(skip.events.filter((e) => e.event === "line")).toHaveLength(lines.length - 2);

    const listed = (await call(b.port, "GET", "/runs", { token })).json();
    // Two pipes, so which line came last is not fixed.
    expect(listed[0]).toMatchObject({ id: run.id, status: "done", code: 0 });
    expect(lines).toContain(listed[0].lastLine);
    expect((await call(b.port, "GET", `/runs/${run.id}`, { token })).json().status).toBe("done");
    await printed(b, `run ${run.id} started on ${OTHER_ISSUE}`);
    await printed(b, `run ${run.id} on ${OTHER_ISSUE} ended: done.`);
  });

  test("a failing agent ends the run as failed with its exit code", async () => {
    repo.behave("wf-7p4dn", "fail");
    const run = (await startRun(b, token, "wf-7p4dn")).json();
    const { events } = await readEvents(b.port, run.id, token);
    expect(events.at(-1)).toMatchObject({ event: "exit", data: { code: 3, status: "failed" } });
    expect((await call(b.port, "GET", `/runs/${run.id}`, { token })).json()).toMatchObject({
      status: "failed",
      code: 3,
    });
  });

  test("a second run on the same issue is refused with 409; another issue is fine", async () => {
    repo.behave("wf-r6jk2", "hang");
    repo.behave("wf-9gr4k", "hang");
    const first = (await startRun(b, token, "wf-r6jk2")).json();
    const second = await startRun(b, token, "wf-r6jk2");
    expect(second.status).toBe(409);
    expect(second.json().error).toBe("busy");
    expect(second.json().message).toBe("Codex is already working on wf-r6jk2.");
    const parallel = await startRun(b, token, "wf-9gr4k");
    expect(parallel.status).toBe(200);
    expect((await call(b.port, "GET", "/status", { token })).json().active).toBe(2);

    // Once the first is stopped the issue is free again.
    expect((await call(b.port, "DELETE", `/runs/${first.id}`, { token })).status).toBe(200);
    repo.behave("wf-r6jk2", "ok");
    expect((await startRun(b, token, "wf-r6jk2")).status).toBe(200);
    await call(b.port, "DELETE", `/runs/${parallel.json().id}`, { token });
  });

  test("cancel stops the agent and the children it started", async () => {
    repo.behave("wf-v1cm9", "hang");
    const run = (await startRun(b, token, "wf-v1cm9")).json();
    const pids = await until(() => {
      const file = join(repo.agentDir, "wf-v1cm9.pids");
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
    });
    expect(alive(pids.pid)).toBe(true);
    expect(alive(pids.child)).toBe(true);
    const stream = readEvents(b.port, run.id, token);

    const cancelled = await call(b.port, "DELETE", `/runs/${run.id}`, { token });
    expect(cancelled.status).toBe(200);
    expect(cancelled.json()).toMatchObject({ id: run.id, status: "cancelled" });
    expect(alive(pids.pid)).toBe(false);
    await until(() => !alive(pids.child));

    const { events } = await stream;
    expect(events.at(-1)).toMatchObject({ event: "exit", data: { status: "cancelled" } });
    await printed(b, `run ${run.id} on wf-v1cm9 ended: cancelled.`);
    // A run that ended cannot be stopped again.
    expect((await call(b.port, "DELETE", `/runs/${run.id}`, { token })).status).toBe(409);
  });

  test("an agent that ignores SIGTERM is killed after three seconds", async () => {
    repo.behave("wf-w8vz4", "stubborn");
    const run = (await startRun(b, token, "wf-w8vz4")).json();
    const pids = await until(() => {
      const file = join(repo.agentDir, "wf-w8vz4.pids");
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
    });
    const at = Date.now();
    const cancelled = await call(b.port, "DELETE", `/runs/${run.id}`, { token });
    expect(cancelled.json().status).toBe("cancelled");
    expect(Date.now() - at).toBeGreaterThanOrEqual(2800);
    expect(alive(pids.pid)).toBe(false);
    await until(() => !alive(pids.child));
  }, 15_000);

  test("an issue id that does not look like one is refused before anything is looked up", async () => {
    const bad = [
      "",
      "wf-3k9x",
      "wf-3k9x22",
      "WF-3K9X2",
      "wf-3k9x2/../x",
      "../../etc/passwd",
      "wf-3k9x2;ls",
      "wf-3k9 2",
      "$(touch PWNED)",
      "issues/wf/web/live-board-updates",
    ];
    const before = repo.calls().length;
    for (const issue of bad) {
      const r = await startRun(b, token, issue);
      expect(r.status, JSON.stringify(issue)).toBe(400);
      expect(r.json().error).toBe("bad_issue");
    }
    for (const issue of [null, 42, ["wf-3k9x2"], { id: "wf-3k9x2" }]) {
      const r = await call(b.port, "POST", "/runs", { token, body: { issue, kind: "next_step" } });
      expect(r.status).toBe(400);
    }
    expect(repo.calls()).toHaveLength(before);
  });

  test("an unknown issue is 404, an unknown kind is 400, bad JSON is 400", async () => {
    const none = await startRun(b, token, "wf-00000");
    expect(none.status).toBe(404);
    expect(none.json().error).toBe("no_issue");
    const kind = await call(b.port, "POST", "/runs", {
      token,
      body: { issue: ISSUE, kind: "shell" },
    });
    expect(kind.status).toBe(400);
    expect(kind.json().error).toBe("bad_kind");
    const missing = await call(b.port, "POST", "/runs", { token, body: { issue: ISSUE } });
    expect(missing.status).toBe(400);
    const json = await call(b.port, "POST", "/runs", { token, body: "{not json" });
    expect(json.status).toBe(400);
    // The browser has no way to name a prompt, a path or a command: extra fields are ignored.
    const before = repo.calls().length;
    const extra = await call(b.port, "POST", "/runs", {
      token,
      body: {
        issue: OTHER_ISSUE,
        kind: "next_step",
        prompt: "rm -rf /",
        command: "id",
        path: "/etc",
      },
    });
    expect(extra.status).toBe(200);
    await readEvents(b.port, extra.json().id, token);
    const sent = repo.calls().slice(before);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0].argv)).not.toContain("rm -rf");
    expect(sent[0].cwd).toBe(repo.dir);
  });

  test("a run id that is not one is 404", async () => {
    for (const id of ["nope", "run-zzzzzzzz", "..%2f..%2fetc", "run-00000000"]) {
      expect((await call(b.port, "GET", `/runs/${id}`, { token })).status, id).toBe(404);
      expect((await call(b.port, "DELETE", `/runs/${id}`, { token })).status, id).toBe(404);
      expect((await call(b.port, "GET", `/runs/${id}/events`, { token })).status, id).toBe(404);
    }
  });

  test("no shell: an issue title with $(...), quotes and backticks reaches the agent as text", async () => {
    const before = repo.calls().length;
    const run = (await startRun(b, token, SHELL_ISSUE)).json();
    await readEvents(b.port, run.id, token);
    const sent = repo.calls().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].argv[2]).toBe(expectedPrompt(SHELL_ISSUE, SHELL_TITLE, "issues/wf/shell/evil"));
    expect(sent[0].argv[2]).toContain("$(touch PWNED)");
    // Nothing ran the substitution.
    for (const dir of [repo.dir, join(repo.dir, "workspace"), process.cwd()])
      for (const name of ["PWNED", "PWNED2"]) expect(existsSync(join(dir, name))).toBe(false);
    expect(
      readFileSync(join(repo.dir, "workspace/issues/wf/shell/evil/changes.md"), "utf8"),
    ).toContain("fake agent");
  });

  test("the issue is found by the id in goal.md, not by its folder name", async () => {
    // Two goal.md with one id are ambiguous: the bridge does not guess.
    const dup = makeRepo();
    mkdirSync(join(dup.dir, "workspace/issues/wf/copy"), { recursive: true });
    writeFileSync(
      join(dup.dir, "workspace/issues/wf/copy/goal.md"),
      `---\nid: ${ISSUE}\ntitle: A copy\nstatus: backlog\n---\n`,
    );
    const c = await bridge(dup);
    const r = await startRun(c, await pair(c));
    expect(r.status).toBe(409);
    expect(r.json().error).toBe("ambiguous");
  });
});

// ---------------------------------------------------------------- the agent's command line

describe("the agent's command line", () => {
  test("extra arguments after -- are passed on, after the bridge's own", async () => {
    const repo = makeRepo();
    const c = await bridge(repo, { extra: ["--model", "gpt-5-codex"] });
    const t = await pair(c);
    const run = (await startRun(c, t)).json();
    await readEvents(c.port, run.id, t);
    expect(repo.calls()[0].argv).toEqual([
      "exec",
      "--full-auto",
      expectedPrompt(ISSUE, "Push board updates over SSE", ISSUE_PATH),
      "--model",
      "gpt-5-codex",
    ]);
  });

  test("an extra argument that picks the sandbox replaces the default flag", async () => {
    const repo = makeRepo();
    const c = await bridge(repo, { extra: ["--sandbox", "read-only"] });
    const t = await pair(c);
    await readEvents(c.port, (await startRun(c, t)).json().id, t);
    const argv = repo.calls()[0].argv;
    expect(argv).not.toContain("--full-auto");
    expect(argv.slice(0, 1)).toEqual(["exec"]);
    expect(argv.slice(-2)).toEqual(["--sandbox", "read-only"]);
  });

  test("Claude Code runs as: -p <prompt> --permission-mode acceptEdits", async () => {
    const repo = makeRepo();
    const c = await bridge(repo, { agent: "claude", extra: ["--model", "sonnet"] });
    const t = await pair(c);
    expect(c.output()).toContain("Claude Code 1.2.3");
    const run = (await startRun(c, t)).json();
    expect(run.agent).toBe("claude");
    await readEvents(c.port, run.id, t);
    const sent = repo.calls()[0];
    expect(sent.argv).toEqual([
      "-p",
      expectedPrompt(ISSUE, "Push board updates over SSE", ISSUE_PATH),
      "--permission-mode",
      "acceptEdits",
      "--model",
      "sonnet",
    ]);
    expect(sent.wfAuthor).toBe("claude");
    expect((await call(c.port, "GET", "/status", { token: t })).json().agent).toBe("claude");
  });

  test("--permission-mode in the extra arguments replaces the default for Claude Code", async () => {
    const repo = makeRepo();
    const c = await bridge(repo, { agent: "claude", extra: ["--permission-mode=plan"] });
    const t = await pair(c);
    await readEvents(c.port, (await startRun(c, t)).json().id, t);
    expect(repo.calls()[0].argv).toEqual([
      "-p",
      expectedPrompt(ISSUE, "Push board updates over SSE", ISSUE_PATH),
      "--permission-mode=plan",
    ]);
  });
});

// ---------------------------------------------------------------- stopping

describe("stopping", () => {
  test("Ctrl+C stops the runs and exits", async () => {
    const repo = makeRepo();
    repo.behave(ISSUE, "hang");
    const c = await bridge(repo);
    const t = await pair(c);
    await startRun(c, t);
    const pids = await until(() => {
      const file = join(repo.agentDir, `${ISSUE}.pids`);
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
    });
    c.child.kill("SIGINT");
    expect(await c.exited).toBe(0);
    expect(alive(pids.pid)).toBe(false);
    await until(() => !alive(pids.child));
    await printed(c, "stopping 1 run.");
  });
});

// ---------------------------------------------------------------- the command line

describe("the command line", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [BRIDGE, ...args], { encoding: "utf8", timeout: 10_000 });

  test("--help prints the usage and exits 0", () => {
    const r = run("--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--agent codex|claude");
    expect(r.stdout).toContain("--pair");
    expect(r.stdout).toContain("--origin");
    expect(r.stdout).toContain("--agent-bin");
  });

  test("a missing or wrong option is a usage error", () => {
    for (const args of [
      [],
      ["--agent", "codex"],
      ["--pair", "AB12-34"],
      ["--agent", "gemini", "--pair", "AB12-34"],
      ["--agent", "codex", "--pair", "x"],
      ["--agent", "codex", "--pair", "AB12-34", "--port", "http"],
      ["--agent", "codex", "--pair", "AB12-34", "--origin", "not a url"],
      ["--agent", "codex", "--pair", "AB12-34", "--whatever"],
      ["--agent", "codex", "--pair"],
    ]) {
      const r = run(...args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toContain("wf bridge:");
    }
  });

  test("an agent binary that does not exist stops it with a plain line", () => {
    const r = run("--agent", "codex", "--pair", "AB12-34", "--agent-bin", "/no/such/codex");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("could not run /no/such/codex");
  });

  test("a port that is taken stops it with a plain line", async () => {
    const repo = makeRepo();
    const first = await bridge(repo);
    const r = run(
      "--agent",
      "codex",
      "--pair",
      "AB12-34",
      "--port",
      String(first.port),
      "--agent-bin",
      repo.bin,
      "--repo",
      repo.dir,
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`port ${first.port} is in use`);
  });

  test("a repo that is not a folder stops it", () => {
    const r = run("--agent", "codex", "--pair", "AB12-34", "--repo", "/no/such/folder");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("is not a folder");
  });

  test("the file parses as plain Node", () => {
    const check = spawnSync(process.execPath, ["--check", BRIDGE], { encoding: "utf8" });
    expect(check.status).toBe(0);
  });
});

// ---------------------------------------------------------------- the dashboard's client

describe("the dashboard's client against the real bridge", () => {
  test("pair, status, start, follow and cancel", async () => {
    const repo = makeRepo();
    repo.behave("wf-v1cm9", "hang");
    const b = await bridge(repo);
    const client = createBridgeClient({ url: b.url });

    const token = await client.pair("test-42");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const status = await client.status(token);
    expect(status).toMatchObject({ agent: "codex", version: "1.2.3", workspace: "workspace" });

    const run = await client.startRun(token, ISSUE, "next_step");
    const lines: string[] = [];
    const exit = await new Promise<{ code: number | null; status: string }>((resolve) => {
      void client.follow(token, run.id, {
        onLine: (text) => lines.push(text),
        onExit: resolve,
      });
    });
    expect(exit).toMatchObject({ code: 0, status: "done" });
    expect(lines).toContain("logged the change");
    expect((await client.listRuns(token))[0]).toMatchObject({ id: run.id, status: "done" });

    // A run that hangs is cancelled through the client.
    const hung = await client.startRun(token, "wf-v1cm9", "next_step");
    await until(() => existsSync(join(repo.agentDir, "wf-v1cm9.pids")));
    const stopped = await client.cancel(token, hung.id);
    expect(stopped.status).toBe("cancelled");

    // A refusal comes back as a BridgeError with the bridge's words.
    await expect(client.startRun(token, "wf-00000", "next_step")).rejects.toMatchObject({
      name: "BridgeError",
      status: 404,
      code: "no_issue",
    });
    await expect(client.status("0".repeat(64))).rejects.toMatchObject({ status: 401 });
  });

  test("pair polling waits for a bridge that is not up yet, then pairs", async () => {
    const repo = makeRepo();
    const port = await freePort();
    const client = createBridgeClient({ url: `http://127.0.0.1:${port}` });
    const polling = client.pollPair("LATE-10", { intervalMs: 50 });
    await sleep(300);
    await bridge(repo, { port, pair: "LATE-10" });
    expect(await polling).toMatch(/^[0-9a-f]{64}$/);
  });

  test("pair polling stops at the first refusal and can be cancelled", async () => {
    const repo = makeRepo();
    const b = await bridge(repo, { pair: "RIGHT-1" });
    const client = createBridgeClient({ url: b.url });
    await expect(client.pollPair("WRONG-1", { intervalMs: 50 })).rejects.toMatchObject({
      name: "BridgeError",
      code: "wrong_code",
    });
    // One wrong code was spent, not five.
    expect(await client.pollPair("RIGHT-1", { intervalMs: 50 })).toMatch(/^[0-9a-f]{64}$/);

    const gone = createBridgeClient({ url: `http://127.0.0.1:${await freePort()}` });
    const controller = new AbortController();
    const waiting = gone.pollPair("ANY-1", { intervalMs: 20, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });

  test("a bridge that is gone is an unreachable error", async () => {
    const repo = makeRepo();
    const b = await bridge(repo);
    const client = createBridgeClient({ url: b.url });
    const token = await client.pair("TEST-42");
    await b.stop();
    await expect(client.status(token)).rejects.toMatchObject({ name: "BridgeUnreachableError" });
  });
});
