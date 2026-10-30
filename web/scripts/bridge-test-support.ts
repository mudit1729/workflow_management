// Helpers for the tests that run the real bridge (`plugins/workflow/scripts/wf-bridge.mjs`) as a
// child process: a temporary repository with a copy of the sample workspace, a fake agent binary
// that prints lines and edits a file, the bridge itself on a free port, and small HTTP readers.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("..", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const BRIDGE = join(REPO_ROOT, "plugins/workflow/scripts/wf-bridge.mjs");
const SAMPLE = join(WEB, "mock/sample");

/** The dashboard's dev origin: the bridge allows it by default. */
export const DASHBOARD = "http://localhost:5177";

/** An issue of the sample, and one added to it whose title tries to break out of a shell. */
export const ISSUE = "wf-3k9x2";
export const ISSUE_PATH = "issues/wf/web/live-board-updates";
export const OTHER_ISSUE = "wf-ss0lo";
export const SHELL_ISSUE = "wf-sh3ll";
export const SHELL_TITLE = `Don't "quote" $(touch PWNED) \`touch PWNED2\` ; echo $HOME`;

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `check` returns a truthy value; fail after `ms`. */
export async function until<T>(check: () => T | Promise<T>, ms = 5000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value as NonNullable<T>;
    if (Date.now() > end) throw new Error("until: timed out");
    await sleep(25);
  }
}

// ---------------------------------------------------------------- the fake agent

/**
 * What the fake agent does is chosen by the issue id in its prompt, from `behaviors.json` in
 * `FAKE_AGENT_DIR`: `ok` (default) prints lines, edits `changes.md` of the issue and exits 0;
 * `fail` exits 3; `hang` starts a child and waits to be stopped; `stubborn` ignores SIGTERM.
 * Every call is appended to `calls.jsonl` there.
 */
const FAKE_AGENT = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const argv = process.argv.slice(2);
if (argv.includes("--version")) {
  console.log("fake-agent 1.2.3 (test)");
  process.exit(0);
}
const dir = process.env.FAKE_AGENT_DIR;
const prompt = argv.find((a) => a.startsWith("Work on ")) || "";
const id = (/Work on (wf-[0-9a-z]{5})/.exec(prompt) || [])[1];
const where = (/ in (\\S+)\\. Read current_state/.exec(prompt) || [])[1];
const mode = (JSON.parse(fs.readFileSync(path.join(dir, "behaviors.json"), "utf8"))[id] || {}).mode || "ok";
fs.appendFileSync(path.join(dir, "calls.jsonl"), JSON.stringify({
  argv, cwd: process.cwd(), wfRoot: process.env.WF_ROOT, wfAuthor: process.env.WF_AUTHOR, pid: process.pid, mode,
}) + "\\n");
console.log("claiming the task");
console.error("warning: slow disk");
if (mode === "hang" || mode === "stubborn") {
  if (mode === "stubborn") process.on("SIGTERM", () => console.log("ignoring SIGTERM"));
  const child = spawn("sleep", ["60"], { stdio: "ignore" });
  fs.writeFileSync(path.join(dir, id + ".pids"), JSON.stringify({ pid: process.pid, child: child.pid }));
  console.log("working");
  setInterval(() => {}, 1000);
} else {
  const file = path.join(process.env.WF_ROOT, where, "changes.md");
  fs.appendFileSync(file, "\\n<!-- fake agent -->\\n");
  console.log("logged the change");
  setTimeout(() => process.exit(mode === "fail" ? 3 : 0), 100);
}
`;

// ---------------------------------------------------------------- a repository to work in

export interface TestRepo {
  /** The repository folder (real path). */
  dir: string;
  /** The folder the fake agent and its logs live in. */
  agentDir: string;
  /** The fake agent binary. */
  bin: string;
  /** Where the workspace is, relative to `dir`. */
  workspace: string;
  /** Choose what the fake agent does for an issue. */
  behave(issue: string, mode: "ok" | "fail" | "hang" | "stubborn"): void;
  /** Every call the fake agent got. */
  calls(): {
    argv: string[];
    cwd: string;
    wfRoot: string;
    wfAuthor: string;
    pid: number;
    mode: string;
  }[];
}

/**
 * A temporary git repository holding a copy of the sample workspace at `workspace`, plus the
 * issue whose title tries to break out of a shell. The git remote carries a password so a test
 * can see that it is not passed on.
 */
export function makeRepo(workspace = "workspace"): TestRepo {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "wf-bridge-")));
  const dir = join(base, "repo");
  const agentDir = join(base, "agent");
  mkdirSync(dir);
  mkdirSync(agentDir);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", "https://user:secret@example.com/team/wf.git"], {
    cwd: dir,
  });
  cpSync(SAMPLE, join(dir, workspace), { recursive: true });
  const evil = join(dir, workspace, "issues/wf/shell/evil");
  mkdirSync(evil, { recursive: true });
  writeFileSync(
    join(evil, "goal.md"),
    `---\nid: ${SHELL_ISSUE}\ntitle: ${SHELL_TITLE}\nstatus: backlog\n---\n\n## Context\n\nA title with shell syntax.\n`,
  );
  writeFileSync(join(evil, "changes.md"), "# Changes\n");
  const bin = join(agentDir, "fake-agent");
  writeFileSync(bin, FAKE_AGENT);
  chmodSync(bin, 0o755);
  writeFileSync(join(agentDir, "behaviors.json"), "{}");
  writeFileSync(join(agentDir, "calls.jsonl"), "");
  const behaviors: Record<string, { mode: string }> = {};
  return {
    dir,
    agentDir,
    bin,
    workspace,
    behave(issue, mode) {
      behaviors[issue] = { mode };
      writeFileSync(join(agentDir, "behaviors.json"), JSON.stringify(behaviors));
    },
    calls: () =>
      execFileSync("cat", [join(agentDir, "calls.jsonl")], { encoding: "utf8" })
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
  };
}

/** Is the process running? A zombie that nobody collected counts as gone. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return !execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" })
      .trim()
      .startsWith("Z");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the bridge

export interface RunningBridge {
  port: number;
  /** `http://127.0.0.1:<port>` */
  url: string;
  /** What the bridge printed so far (stdout and stderr). */
  output(): string;
  child: ChildProcess;
  /** Resolves with the exit code once the bridge has ended. */
  exited: Promise<number | null>;
  stop(): Promise<void>;
}

export interface BridgeOptions {
  agent?: "codex" | "claude";
  pair?: string;
  /** Default: the repo's fake agent. */
  bin?: string;
  repo?: string;
  origins?: string[];
  extra?: string[];
  env?: Record<string, string>;
  port?: number;
}

/** Start the bridge on a free port and wait for its first line. */
export async function startBridge(repo: TestRepo, options: BridgeOptions = {}) {
  const port = options.port ?? (await freePort());
  const args = [
    BRIDGE,
    "--agent",
    options.agent ?? "codex",
    "--pair",
    options.pair ?? "TEST-42",
    "--port",
    String(port),
    "--repo",
    options.repo ?? repo.dir,
    "--agent-bin",
    options.bin ?? repo.bin,
    ...(options.origins ?? []).flatMap((o) => ["--origin", o]),
    ...(options.extra ? ["--", ...options.extra] : []),
  ];
  const env: Record<string, string | undefined> = {
    ...process.env,
    FAKE_AGENT_DIR: repo.agentDir,
    ...options.env,
  };
  // A bridge started inside another workspace session must find its own.
  if (!options.env?.WF_ROOT) delete env.WF_ROOT;
  delete env.WF_AUTHOR;
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let text = "";
  child.stdout?.on("data", (d) => {
    text += d;
  });
  child.stderr?.on("data", (d) => {
    text += d;
  });
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  await until(() => text.includes("waiting for the dashboard") || child.exitCode !== null, 10_000);
  const bridge: RunningBridge = {
    port,
    url: `http://127.0.0.1:${port}`,
    output: () => text,
    child,
    exited,
    stop: async () => {
      if (child.exitCode === null) child.kill("SIGTERM");
      await exited;
    },
  };
  return bridge;
}

// ---------------------------------------------------------------- http

export interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  // biome-ignore lint/suspicious/noExplicitAny: a test reads whatever the bridge answered
  json: () => any;
}

export interface CallOptions {
  token?: string;
  /** A JSON body, or a string sent as it is. */
  body?: unknown;
  headers?: Record<string, string>;
  /** The Origin header; `null` sends none. Default: the dashboard's dev origin. */
  origin?: string | null;
}

/** One request with Node's http module, so a test can set Host and Origin freely. */
export function call(
  port: number,
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...options.headers };
    const origin = options.origin === undefined ? DASHBOARD : options.origin;
    if (origin !== null) headers.origin = origin;
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const body =
      options.body === undefined
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
    if (body !== undefined) headers["content-type"] = "application/json";
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        text += c;
      });
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          text,
          json: () => JSON.parse(text),
        }),
      );
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** Pair with the bridge and return the token. */
export async function pair(bridge: RunningBridge, code = "TEST-42"): Promise<string> {
  const reply = await call(bridge.port, "POST", "/pair", { body: { code } });
  if (reply.status !== 200) throw new Error(`pair answered ${reply.status}: ${reply.text}`);
  return reply.json().token;
}

export interface SseEvent {
  event: string;
  // biome-ignore lint/suspicious/noExplicitAny: a test reads whatever the bridge sent
  data: any;
  id?: string;
}

/** Parse the text of an event stream into events. */
export function parseEvents(text: string): SseEvent[] {
  const out: SseEvent[] = [];
  for (const block of text.split("\n\n")) {
    let event = "";
    let data = "";
    let id: string | undefined;
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
      else if (line.startsWith("id: ")) id = line.slice(4);
    }
    if (event) out.push({ event, data: JSON.parse(data), id });
  }
  return out;
}

/** Read a run's event stream until the bridge ends it. */
export function readEvents(
  port: number,
  runId: string,
  token: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; events: SseEvent[] }> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: `/runs/${runId}/events`,
        headers: { authorization: `Bearer ${token}`, origin: DASHBOARD, ...headers },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          text += c;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, events: parseEvents(text) }));
      },
    );
    req.on("error", reject);
    req.setTimeout(15_000, () => req.destroy(new Error("event stream timed out")));
  });
}
