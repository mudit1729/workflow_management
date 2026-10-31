#!/usr/bin/env node
// wf-bridge.mjs: lets the dashboard run Codex or Claude Code in this repository (plan D9, D13).
//
//   node plugins/workflow/scripts/wf-bridge.mjs --agent codex|claude --pair <CODE> [options] [-- <agent args>]
//
//   --agent codex|claude   which agent to run (required)
//   --pair <CODE>          the code the dashboard shows, like 4F7K-92 (required; $WF_PAIR works too and
//                          keeps the code out of `ps`)
//   --port <n>             port on 127.0.0.1 (default 7457; the dashboard expects the default)
//   --origin <url>         a dashboard origin that may talk to the bridge; repeat it for more
//                          (default http://localhost:5177 and http://127.0.0.1:5177)
//   --repo <dir>           the repository the agent works in (default: the current folder)
//   --agent-bin <path>     the agent's binary (default: codex or claude from the PATH)
//   --                     everything after it goes to the agent as extra arguments
//   -h, --help             this text
//
// What it does: the dashboard pairs once by the code and then asks for one thing, "do the next step
// of issue <id>". The bridge finds the issue folder in the workspace, builds the agent's prompt itself
// (the resume prompt of using-wf references/format.md section 15 plus "Use the doing-next-step skill
// to do the next step.") and starts the agent without a shell, in the repository, in its own process
// group. The agent edits the markdown files; the board shows the edits as it does for any author.
//
// Safety: it binds 127.0.0.1 only; it answers only requests with a Host of 127.0.0.1:<port> or
// localhost:<port> (DNS rebinding) and, when a request names an Origin, only an allowed one; every
// route but POST /pair needs the token that pairing returned; five wrong codes close pairing. The
// browser never sends a prompt, a path or a command: only a validated issue id. A refused Origin or
// Host is logged once, so a dashboard on another address can be told apart from a stranger.
//
// Agent command lines (a change of the agent's flags goes after "--", or use --agent-bin):
//   codex   <bin> exec --full-auto <prompt> [extra...]
//   claude  <bin> -p <prompt> --permission-mode acceptEdits [extra...]
// Extra arguments that set the sandbox or permission mode themselves replace the default flag:
// codex: --sandbox, -s, --ask-for-approval, -a, --full-auto, --dangerously-bypass-approvals-and-sandbox;
// claude: --permission-mode, --dangerously-skip-permissions.
// A headless Claude Code in acceptEdits mode skips helper scripts and git commit; the README lists
// the --allowedTools that let doing-next-step run them.
//
// Routes (JSON; a run's events are text/event-stream):
//   POST   /pair             {code}                  -> {token}
//   DELETE /pair                                     -> disconnect: end the streams, stop the runs and the bridge
//   GET    /status                                   -> {agent, version, host, repo, workspace, skills, runs, active}
//   POST   /runs             {issue, kind:"next_step"} -> {id, issue, agent, startedAt, status}
//   GET    /runs                                     -> [run, ...] newest first
//   GET    /runs/<id>/events                         -> "line" {text} events, then one "exit" {code, signal, status}
//   DELETE /runs/<id>                                -> stop the run (SIGTERM to its group, SIGKILL after 3 s, or at
//                                                       once for what the leader left in the group)
//
// Every refusal is {error, message, instance}; `instance` names this bridge process, so the dashboard
// can tell a restarted bridge from the one it was refused by.
//
// Node 18 or newer, macOS or Linux, no dependencies. Exit codes: 0 stopped, 1 could not start, 2 bad usage.
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 7457;
const DEFAULT_ORIGINS = ["http://localhost:5177", "http://127.0.0.1:5177"];
/** Wrong pair codes before pairing closes. */
const MAX_WRONG_CODES = 5;
/** Time a run gets between SIGTERM and SIGKILL. */
const KILL_AFTER_MS = 3000;
/** Time to wait for the last process of a stopped run to vanish after the SIGKILL. */
const GONE_WITHIN_MS = 1000;
/** Output lines a run keeps for a late reader, and the longest line kept. */
const MAX_LINES = 500;
const MAX_LINE = 2000;
/** Runs going at once, and finished runs remembered. */
const MAX_ACTIVE = 3;
const MAX_RUNS = 50;
const MAX_BODY = 8 * 1024;
/** Bytes an event stream may hold back for a reader that does not read, before it is dropped. */
const MAX_STREAM_BACKLOG = 1024 * 1024;
/** Refused origins and hosts that are logged (once each), so a local script cannot fill the terminal. */
const MAX_REFUSED_LOGGED = 20;

const ISSUE_ID = /^wf-[0-9a-z]{5}$/;
const RUN_ID = /^run-[0-9a-f]{8}$/;
const PAIR_CODE = /^[A-Z0-9][A-Z0-9-]{3,15}$/;

/** The skills of this plugin, for a bridge that was copied away from its `skills` folder. */
const FALLBACK_SKILLS = [
  "adding-work",
  "checking-status",
  "doing-next-step",
  "handing-off",
  "keeping-a-library",
  "logging-work",
  "planning-issues",
  "querying-library",
  "summarizing-codebase",
  "summarizing-work",
  "using-wf",
  "writing-readable-bulk-text",
];

/**
 * How each agent runs headless. `own` lists the flags that mean "I choose the sandbox myself": when
 * the extra arguments hold one, the default flag is left out.
 */
const AGENTS = {
  codex: {
    name: "Codex",
    bin: "codex",
    own: new Set([
      "--sandbox",
      "-s",
      "--ask-for-approval",
      "-a",
      "--full-auto",
      "--dangerously-bypass-approvals-and-sandbox",
    ]),
    args: (prompt, withDefault) => ["exec", ...(withDefault ? ["--full-auto"] : []), prompt],
  },
  claude: {
    name: "Claude Code",
    bin: "claude",
    own: new Set(["--permission-mode", "--dangerously-skip-permissions"]),
    args: (prompt, withDefault) => [
      "-p",
      prompt,
      ...(withDefault ? ["--permission-mode", "acceptEdits"] : []),
    ],
  },
};

/** Extra arguments with which the person already chose what Claude Code may run. */
const CLAUDE_TOOL_FLAGS = /^--(allowed-?tools|permission-mode|dangerously-skip-permissions)\b/i;

const log = (msg) => console.log(`wf bridge: ${msg}`);

/** The comment block at the top of this file, without the slashes. */
function usage() {
  const lines = readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split("\n")
    .slice(1);
  const end = lines.findIndex((l) => !l.startsWith("//"));
  return lines
    .slice(0, end)
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .join("\n");
}

function badUsage(message) {
  console.error(`wf bridge: ${message}\nRun with --help for the options.`);
  process.exit(2);
}

// ---------------------------------------------------------------- the command line

function normalizeOrigin(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return badUsage(`--origin ${text} is not a URL like http://localhost:5177.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return badUsage(`--origin ${text} must start with http:// or https://.`);
  return url.origin;
}

const normalizeCode = (text) =>
  String(text ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();

function parseArgs(argv) {
  const dashes = argv.indexOf("--");
  const own = dashes === -1 ? argv : argv.slice(0, dashes);
  const opts = {
    agent: "",
    pair: "",
    port: DEFAULT_PORT,
    origins: [],
    repo: process.cwd(),
    agentBin: "",
    extra: dashes === -1 ? [] : argv.slice(dashes + 1),
  };
  for (let i = 0; i < own.length; i++) {
    let flag = own[i];
    let value;
    const eq = flag.indexOf("=");
    if (flag.startsWith("--") && eq !== -1) {
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }
    const take = () => {
      if (value !== undefined) return value;
      const next = own[++i];
      if (next === undefined || next.startsWith("--")) return badUsage(`${flag} needs a value.`);
      return next;
    };
    switch (flag) {
      case "-h":
      case "--help":
        console.log(usage());
        process.exit(0);
        break;
      case "--agent":
        opts.agent = take();
        break;
      case "--pair":
        opts.pair = normalizeCode(take());
        break;
      case "--port": {
        const port = Number(take());
        if (!Number.isInteger(port) || port < 0 || port > 65535)
          return badUsage("--port needs a number from 0 to 65535.");
        opts.port = port;
        break;
      }
      case "--origin":
        opts.origins.push(normalizeOrigin(take()));
        break;
      case "--repo":
        opts.repo = resolve(take());
        break;
      case "--agent-bin":
        opts.agentBin = take();
        break;
      default:
        return badUsage(`unknown option ${flag}. Extra agent arguments go after "--".`);
    }
  }
  if (!opts.pair) opts.pair = normalizeCode(process.env.WF_PAIR);
  if (!Object.hasOwn(AGENTS, opts.agent)) return badUsage("--agent must be codex or claude.");
  if (!PAIR_CODE.test(opts.pair))
    return badUsage("--pair needs the code the dashboard shows, like 4F7K-92 (or set WF_PAIR).");
  if (opts.origins.length === 0) opts.origins = DEFAULT_ORIGINS;
  opts.origins = [...new Set(opts.origins)];
  if (opts.agentBin?.includes("/") || opts.agentBin?.includes(sep))
    opts.agentBin = resolve(opts.agentBin);
  return opts;
}

// ---------------------------------------------------------------- small helpers

/** Run a program without a shell and collect its output. Never rejects. */
function capture(file, args, options = {}) {
  return new Promise((done) => {
    execFile(file, args, { timeout: 5000, encoding: "utf8", ...options }, (error, stdout, stderr) =>
      done({ error, stdout: stdout ?? "", stderr: stderr ?? "" }),
    );
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (text) => createHash("sha256").update(text).digest();
const sameText = (a, b) => timingSafeEqual(sha(a), sha(b));

/** A path under `dir` with forward slashes, as the markdown files write them. */
const posix = (path) => path.split(sep).join("/");

/** `a` is `b` or lies inside it. */
const inside = (a, b) => a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);

/** Text from a request, safe to put in the terminal: printable ASCII only, and short. */
const printable = (text) =>
  String(text)
    .replace(/[^\x20-\x7e]/g, "?")
    .slice(0, 80);

// Escape sequences are control characters, and removing them is the point.
// biome-ignore lint/suspicious/noControlCharactersInRegex: see above.
const ANSI_CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: see above.
const ANSI_OSC = /\u001b\][^\u0007]*\u0007/g;
const stripAnsi = (text) => text.replace(ANSI_CSI, "").replace(ANSI_OSC, "");

// ---------------------------------------------------------------- the workspace (using-wf, section 1)

function isWorkspace(dir) {
  try {
    return /^wf_format/m.test(readFileSync(join(dir, "workflow.toml"), "utf8"));
  } catch {
    return false;
  }
}

/** `key = "value"` in the `[table]` of a workflow.toml. */
function tomlValue(text, table, key) {
  let current = "";
  for (const line of text.split("\n")) {
    const head = /^\s*\[([^\]]+)\]/.exec(line);
    if (head) current = head[1].trim();
    else if (current === table) {
      const kv = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`).exec(line);
      if (kv) return kv[1];
    }
  }
  return undefined;
}

/**
 * The workspace folder the way `wf-env.sh root` finds it: `$WF_ROOT`, else the nearest folder with
 * a workflow.toml above the repository, else `workspace/` or `web/mock/workspace/` of the git
 * repository. Null when there is none.
 */
async function findWorkspace(repo) {
  const fromEnv = process.env.WF_ROOT;
  if (fromEnv) {
    const dir = resolve(repo, fromEnv);
    return isWorkspace(dir) ? dir : null;
  }
  for (let dir = repo; ; dir = dirname(dir)) {
    if (isWorkspace(dir)) return dir;
    if (dirname(dir) === dir) break;
  }
  const top = await capture("git", ["-C", repo, "rev-parse", "--show-toplevel"]);
  const base = top.error ? repo : top.stdout.trim() || repo;
  for (const candidate of [join(base, "workspace"), join(base, "web", "mock", "workspace")])
    if (isWorkspace(candidate)) return candidate;
  return null;
}

/** The frontmatter of a markdown file as flat `key: value` pairs. Quotes are removed. */
function frontmatter(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const out = {};
  for (const line of (m?.[1] ?? "").split("\n")) {
    const kv = /^([a-z_]+):\s*(.*?)\s*$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  if (!out.title) out.title = /^# +(.+)$/m.exec(text.replace(/^---[\s\S]*?\n---/, ""))?.[1] ?? "";
  return out;
}

/**
 * The folder of issue `id`: the one goal.md of the workspace whose frontmatter `id` matches. The
 * path comes from the files, never from the browser; symbolic links are not followed.
 * Returns `{dir, title}`, `{error: "missing"}` or `{error: "ambiguous"}`.
 */
function findIssue(root, id) {
  const issues = resolve(
    root,
    tomlValue(readFileSync(join(root, "workflow.toml"), "utf8"), "workspace", "issues_dir") ??
      "issues",
  );
  if (!inside(issues, root)) return { error: "missing" };
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 8 || hits.length > 1) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === "goal.md")) {
      const front = frontmatter(join(dir, "goal.md"));
      if (front.id === id) hits.push({ dir, title: front.title || id });
      return;
    }
    for (const e of entries)
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
        walk(join(dir, e.name), depth + 1);
  };
  walk(issues, 0);
  if (hits.length === 0) return { error: "missing" };
  if (hits.length > 1) return { error: "ambiguous" };
  return hits[0];
}

/** The resume prompt (format.md section 15) and the sentence that asks for the next step. */
function promptFor(id, title, path) {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 200);
  return `Work on ${id} "${clean}" in ${path}. Read current_state.md first, then use the wf skills (doing-next-step). Use the doing-next-step skill to do the next step.`;
}

// ---------------------------------------------------------------- skills

/** The skills this plugin ships: the folders of `../skills` that hold a SKILL.md. */
function expectedSkills() {
  try {
    const dir = join(HERE, "..", "skills");
    const names = readdirSync(dir).filter((n) => existsSync(join(dir, n, "SKILL.md")));
    if (names.length > 0) return names.sort();
  } catch {
    // The script was copied away from the plugin: use the known list.
  }
  return FALLBACK_SKILLS;
}

/** Is the workflow plugin switched on in `<repo>/.claude/settings.json` (or the local one)? */
function pluginEnabled(repo) {
  for (const name of ["settings.json", "settings.local.json"]) {
    try {
      const settings = JSON.parse(readFileSync(join(repo, ".claude", name), "utf8"));
      const enabled = settings?.enabledPlugins ?? {};
      if (Object.entries(enabled).some(([key, on]) => key.startsWith("workflow@") && on === true))
        return true;
    } catch {
      // No such file, or not JSON: it enables nothing.
    }
  }
  return false;
}

/** Which of the plugin's skills the agent finds in this repository. */
function skillsOf(agent, repo) {
  const names = expectedSkills();
  const dir = join(repo, agent === "codex" ? ".agents" : ".claude", "skills");
  const all = agent === "claude" && pluginEnabled(repo);
  const installed = names.filter((n) => all || existsSync(join(dir, n, "SKILL.md")));
  return { installed, missing: names.filter((n) => !installed.includes(n)) };
}

// ---------------------------------------------------------------- the bridge

async function main() {
  if (process.platform === "win32") {
    console.error("wf bridge: macOS and Linux only for now.");
    process.exit(1);
  }
  const opts = parseArgs(process.argv.slice(2));
  const agent = AGENTS[opts.agent];
  const bin = opts.agentBin || agent.bin;

  let repo;
  try {
    repo = realpathSync(opts.repo);
    if (!statSync(repo).isDirectory()) throw new Error("not a folder");
  } catch {
    console.error(`wf bridge: --repo ${opts.repo} is not a folder.`);
    process.exit(1);
  }

  // What the dashboard shows about the agent: asked once.
  const asked = await capture(bin, ["--version"]);
  if (asked.error?.code === "ENOENT") {
    console.error(
      `wf bridge: could not run ${bin}. Install ${agent.name}, or pass --agent-bin <path>.`,
    );
    process.exit(1);
  }
  const first = (asked.stdout || asked.stderr).trim().split("\n")[0] ?? "";
  const version = asked.error
    ? null
    : (/\d+(?:\.\d+)+(?:[-+][\w.]+)?/.exec(first)?.[0] ?? first) || null;
  const host = os.hostname();
  const remote = (await capture("git", ["-C", repo, "config", "--get", "remote.origin.url"])).stdout
    .trim()
    // A remote with a password in it never reaches the browser.
    .replace(/\/\/[^/@\s]*@/, "//");
  const repoInfo = { name: basename(repo), ...(remote ? { remote } : {}) };

  const allowed = new Set(opts.origins);
  /** Names this process in every refusal, so the dashboard can tell a restarted bridge from this one. */
  const instance = randomBytes(4).toString("hex");
  /** Origins and hosts already logged as refused. */
  const refused = new Set();
  let port = opts.port;
  let token = null;
  let wrong = 0;
  let stopping = false;
  /** @type {Map<string, any>} */
  const runs = new Map();

  // ---- runs

  const publicRun = (run) => ({
    id: run.id,
    issue: run.issue,
    agent: opts.agent,
    startedAt: run.startedAt,
    status: run.status,
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(run.status !== "running" ? { code: run.code, signal: run.signal } : {}),
    ...(run.lastLine ? { lastLine: run.lastLine } : {}),
  });
  const active = () => [...runs.values()].filter((r) => r.status === "running");

  const emit = (run, event, data, id) => {
    for (const send of run.listeners) send(event, data, id);
  };

  /** Keep the newest output lines; a lone partial line waits for its end. */
  function addLine(run, raw) {
    const text = stripAnsi(raw).trimEnd().slice(0, MAX_LINE);
    if (text.trim() === "") return;
    run.seq += 1;
    run.lines.push({ seq: run.seq, text });
    if (run.lines.length > MAX_LINES) run.lines.shift();
    run.lastLine = text.slice(0, 200);
    emit(run, "line", { text }, run.seq);
  }

  function splitter(run) {
    let rest = "";
    return {
      write(chunk) {
        const parts = (rest + chunk).split(/\r\n|\n|\r/);
        rest = parts.pop() ?? "";
        for (const part of parts) addLine(run, part);
        if (rest.length > 4 * MAX_LINE) {
          addLine(run, rest);
          rest = "";
        }
      },
      flush() {
        if (rest) addLine(run, rest);
        rest = "";
      },
    };
  }

  /** The signal reaches the run's whole process group, so the agent's own children stop too. */
  function killGroup(run, signal) {
    const pid = run.child?.pid;
    if (!pid) return;
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        run.child.kill(signal);
      } catch {
        // Gone already.
      }
    }
  }

  /** Resolves when no process of the run's group is left, or after a second. */
  async function groupGone(run) {
    const pid = run.child?.pid;
    if (!pid) return;
    const end = Date.now() + GONE_WITHIN_MS;
    for (;;) {
      try {
        process.kill(-pid, 0);
      } catch {
        return;
      }
      if (Date.now() > end) return;
      await sleep(20);
    }
  }

  function finish(run, code, signal) {
    if (run.finished) return;
    run.finished = true;
    // A stopped run leaves nothing behind: the leader is gone, so whatever still lives in its group
    // ignored SIGTERM (a test runner, a dev server, a nohup job). The group id stays valid while
    // any member lives, and ESRCH for an empty group is harmless.
    const sweep = run.cancelled || stopping;
    if (sweep) killGroup(run, "SIGKILL");
    run.flush();
    run.code = code ?? null;
    run.signal = signal ?? null;
    run.status = run.cancelled ? "cancelled" : code === 0 ? "done" : "failed";
    run.finishedAt = new Date().toISOString();
    emit(run, "exit", { code: run.code, signal: run.signal, status: run.status });
    for (const end of run.closers) end();
    run.listeners.clear();
    run.closers.clear();
    const how =
      run.status === "cancelled"
        ? "cancelled"
        : run.status === "done"
          ? "done"
          : `failed (${run.signal ? `signal ${run.signal}` : `exit ${run.code}`})`;
    log(`run ${run.id} on ${run.issue} ended: ${how}.`);
    // Old runs drop off, oldest first.
    const finished = [...runs.values()].filter((r) => r.status !== "running");
    for (const old of finished.slice(0, Math.max(0, finished.length - MAX_RUNS)))
      runs.delete(old.id);
    // `done` means the processes are gone, so "cancelled" is only answered once they are.
    (sweep ? groupGone(run) : Promise.resolve()).then(run.resolveDone);
  }

  /** Stop a run and wait until its process is gone. */
  function cancelRun(run) {
    if (run.finished) return run.done;
    run.cancelled = true;
    killGroup(run, "SIGTERM");
    const hard = setTimeout(() => killGroup(run, "SIGKILL"), KILL_AFTER_MS);
    hard.unref();
    return run.done.then(() => clearTimeout(hard));
  }

  function startRun(issue, found, workspace) {
    const path = posix(relative(workspace, found.dir));
    const prompt = promptFor(issue, found.title, path);
    const own = opts.extra.some((a) => agent.own.has(a.split("=")[0]));
    const args = [...agent.args(prompt, !own), ...opts.extra];
    const id = `run-${randomBytes(4).toString("hex")}`;
    let resolveDone = () => {};
    const done = new Promise((r) => {
      resolveDone = r;
    });
    const run = {
      id,
      issue,
      status: "running",
      startedAt: new Date().toISOString(),
      lines: [],
      seq: 0,
      listeners: new Set(),
      closers: new Set(),
      cancelled: false,
      finished: false,
      done,
      resolveDone,
    };
    // No shell: the prompt is one argument, whatever the issue's title holds.
    const child = spawn(bin, args, {
      cwd: repo,
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        WF_ROOT: workspace,
        WF_AUTHOR: process.env.WF_AUTHOR || opts.agent,
      },
    });
    run.child = child;
    const out = splitter(run);
    const err = splitter(run);
    run.flush = () => {
      out.flush();
      err.flush();
    };
    child.stdout.setEncoding("utf8").on("data", out.write);
    child.stderr.setEncoding("utf8").on("data", err.write);
    child.on("error", (e) => {
      addLine(run, `Could not start ${bin}: ${e.message}`);
      finish(run, null, null);
    });
    // `close` waits for the pipes; a grandchild that keeps one open must not hold the run forever.
    let exited;
    child.on("exit", (code, signal) => {
      exited = [code, signal];
      setTimeout(() => finish(run, ...exited), 300).unref();
    });
    child.on("close", (code, signal) => finish(run, code, signal));
    runs.set(id, run);
    log(`run ${id} started on ${issue} (${path}).`);
    return run;
  }

  // ---- http

  const hostOk = (host) => {
    const h = String(host ?? "").toLowerCase();
    return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
  };

  const send = (res, status, body, headers = {}) => {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(text),
      ...headers,
    });
    res.end(text);
  };
  const fail = (res, status, error, message) => send(res, status, { error, message, instance });

  /** Log a refused origin or host once. */
  function noteRefused(kind, value, advice) {
    const key = `${kind} ${printable(value)}`;
    if (refused.has(key) || refused.size >= MAX_REFUSED_LOGGED) return;
    refused.add(key);
    log(`refused ${key}. ${advice}`);
  }

  /**
   * Why an issue is not in the workspace. Issues made in the prototype (Add work, the loaded
   * sample) live in the browser and are never files, so name the folder that was searched and,
   * in this repository, how to point the bridge at the sample.
   */
  function noIssue(issue, workspace) {
    const sample = existsSync(join(repo, "web", "mock", "sample", "workflow.toml"));
    return (
      `No issue ${issue} in ${workspaceLabel(workspace)}.` +
      (sample
        ? " Issues made in the prototype live in the browser; start the bridge with WF_ROOT=web/mock/sample to try the sample."
        : "")
    );
  }

  /** The workspace as the dashboard reads it: relative to the repository when it lies inside. */
  const workspaceLabel = (workspace) =>
    inside(workspace, repo) ? posix(relative(repo, workspace)) || "." : workspace;

  function readJson(req) {
    return new Promise((done, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(Object.assign(new Error("too big"), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          const body = text ? JSON.parse(text) : {};
          done(body && typeof body === "object" ? body : {});
        } catch {
          reject(Object.assign(new Error("bad json"), { status: 400 }));
        }
      });
      req.on("error", reject);
    });
  }

  const authed = (req) => {
    const m = /^Bearer ([0-9a-f]{64})$/i.exec(req.headers.authorization ?? "");
    return Boolean(token && m && sameText(m[1].toLowerCase(), token));
  };

  async function status() {
    const workspace = await findWorkspace(repo);
    return {
      agent: opts.agent,
      version,
      host,
      repo: repoInfo,
      workspace: workspace ? workspaceLabel(workspace) : null,
      skills: skillsOf(opts.agent, repo),
      runs: runs.size,
      active: active().length,
    };
  }

  function events(req, res, run) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let beat;
    const leave = () => {
      clearInterval(beat);
      run.listeners.delete(write);
      run.closers.delete(end);
    };
    // A reader that does not read (a tab that sleeps with the socket open) must not make the bridge
    // hold the run's output in memory: past a megabyte it is dropped, and it can come back with
    // Last-Event-ID to the lines the ring still holds.
    const write = (event, data, id) => {
      if (res.destroyed) return;
      res.write(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (res.writableLength > MAX_STREAM_BACKLOG) {
        leave();
        res.destroy();
      }
    };
    const end = () => {
      clearInterval(beat);
      res.end();
    };
    const from = Number(req.headers["last-event-id"]) || 0;
    for (const line of run.lines) if (line.seq > from) write("line", { text: line.text }, line.seq);
    if (res.destroyed) return;
    if (run.finished) {
      write("exit", { code: run.code, signal: run.signal, status: run.status });
      res.end();
      return;
    }
    beat = setInterval(() => {
      if (!res.destroyed) res.write(": ping\n\n");
    }, 15_000);
    run.listeners.add(write);
    run.closers.add(end);
    res.on("close", leave);
  }

  async function route(req, res) {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const method = req.method ?? "GET";

    // A bridge on its way out answers nothing: not a pair, not a run.
    if (stopping) return fail(res, 503, "stopping", "The bridge is stopping.");

    if (path === "/pair" && method === "POST") {
      const locked = () => {
        if (wrong < MAX_WRONG_CODES) return false;
        fail(res, 429, "locked", "Pairing is closed after 5 wrong codes. Restart the bridge.");
        return true;
      };
      if (locked()) return;
      const body = await readJson(req);
      // Another request may have used the last attempt while this body was arriving.
      if (locked()) return;
      if (token)
        return fail(res, 409, "paired", "Already paired. Restart the bridge to pair again.");
      if (!sameText(normalizeCode(body.code), opts.pair)) {
        wrong += 1;
        if (wrong >= MAX_WRONG_CODES)
          log("5 wrong pair codes. Pairing is closed. Press Ctrl+C and start the bridge again.");
        return fail(res, 403, "wrong_code", "That code does not match this bridge.");
      }
      token = randomBytes(32).toString("hex");
      log(`paired with the dashboard (${req.headers.origin ?? "no origin"}).`);
      return send(res, 200, { token });
    }

    if (!authed(req)) return fail(res, 401, "unauthorized", "Pair with the bridge first.");

    if (path === "/pair" && method === "DELETE") {
      // Disconnect ends the bridge. One bridge serves one dashboard, and the next pairing (another
      // agent, or the same one again) needs the port and a fresh code: a bridge that kept running
      // would block both and could be paired again by anyone who read the old code.
      token = null;
      log("the dashboard disconnected.");
      const sent = new Promise((done) => res.once("close", done));
      send(res, 200, { ok: true });
      void shutdown(sent);
      return;
    }
    if (path === "/status" && method === "GET") return send(res, 200, await status());
    if (path === "/runs" && method === "GET")
      return send(res, 200, [...runs.values()].map(publicRun).reverse());

    if (path === "/runs" && method === "POST") {
      const body = await readJson(req);
      if (body.kind !== "next_step")
        return fail(res, 400, "bad_kind", 'The only run is "next_step".');
      const issue = body.issue;
      if (typeof issue !== "string" || !ISSUE_ID.test(issue))
        return fail(res, 400, "bad_issue", "That is not an issue id like wf-3k9x2.");
      const workspace = await findWorkspace(repo);
      if (!workspace)
        return fail(
          res,
          409,
          "no_workspace",
          "The bridge found no wf workspace in this repository.",
        );
      const found = findIssue(workspace, issue);
      if (found.error === "ambiguous")
        return fail(res, 409, "ambiguous", `More than one goal.md has the id ${issue}.`);
      if (found.error) return fail(res, 404, "no_issue", noIssue(issue, workspace));
      if (active().some((r) => r.issue === issue))
        return fail(res, 409, "busy", `${agent.name} is already working on ${issue}.`);
      if (active().length >= MAX_ACTIVE)
        return fail(res, 429, "too_many", `${MAX_ACTIVE} runs are going. Wait for one to end.`);
      const run = startRun(issue, found, workspace);
      return send(res, 200, publicRun(run));
    }

    const m = /^\/runs\/([^/]+)(\/events)?$/.exec(path);
    if (m) {
      const run = RUN_ID.test(m[1]) ? runs.get(m[1]) : undefined;
      if (!run) return fail(res, 404, "no_run", "No such run.");
      if (m[2] && method === "GET") return events(req, res, run);
      if (!m[2] && method === "GET") return send(res, 200, publicRun(run));
      if (!m[2] && method === "DELETE") {
        if (run.finished) return fail(res, 409, "finished", "That run already ended.");
        // A process that ignores even SIGKILL must not hold the answer forever.
        await Promise.race([cancelRun(run), sleep(KILL_AFTER_MS + 2000)]);
        return send(res, 200, publicRun(run));
      }
    }
    const known =
      ["/pair", "/status", "/runs"].includes(path) || /^\/runs\/[^/]+(\/events)?$/.test(path);
    return known
      ? fail(res, 405, "method", "That method is not allowed here.")
      : fail(res, 404, "not_found", "No such route.");
  }

  async function handle(req, res) {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    if (!hostOk(req.headers.host)) {
      noteRefused(
        "Host",
        req.headers.host ?? "",
        `The bridge answers 127.0.0.1:${port} and localhost:${port} only.`,
      );
      return fail(res, 403, "bad_host", "Ask for 127.0.0.1 or localhost on the bridge's port.");
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !allowed.has(origin)) {
      noteRefused(
        "Origin",
        origin,
        `If that is your dashboard, start the bridge with --origin ${printable(origin)}.`,
      );
      return fail(res, 403, "bad_origin", "That origin may not use this bridge.");
    }
    if (origin !== undefined) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (origin === undefined) return fail(res, 403, "bad_origin", "A preflight names an origin.");
      res.writeHead(204, {
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "authorization, content-type, last-event-id",
        "access-control-allow-private-network": "true",
        "access-control-max-age": "600",
      });
      return res.end();
    }
    try {
      await route(req, res);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error?.status)
        return fail(res, error.status, "bad_request", "The request body is not valid.");
      console.error(`wf bridge: ${error?.stack ?? error}`);
      return fail(res, 500, "internal", "The bridge failed on that request.");
    }
  }

  const server = http.createServer((req, res) => {
    void handle(req, res);
  });
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `wf bridge: port ${opts.port} is in use. Stop the other bridge (Ctrl+C) or pass --port.`
        : `wf bridge: ${error.message}`,
    );
    process.exit(1);
  });
  process.stdout.on("error", () => {});

  await new Promise((ready) => server.listen(opts.port, "127.0.0.1", ready));
  port = server.address().port;

  log(
    `${agent.name} ${version ?? "(version unknown)"} on ${host}, repo ${repoInfo.name}. Pair code ${opts.pair}: waiting for the dashboard.`,
  );
  if (port !== DEFAULT_PORT)
    log(`listening on 127.0.0.1:${port}; the dashboard expects ${DEFAULT_PORT}.`);
  if (!(await findWorkspace(repo)))
    log("no wf workspace found here. Set WF_ROOT, or run it inside the repository that has one.");
  // A headless Claude Code cannot answer "may I run this?", so in acceptEdits mode it skips the
  // helper scripts and git commit of doing-next-step. Say so where the person can act on it.
  if (opts.agent === "claude" && !opts.extra.some((a) => CLAUDE_TOOL_FLAGS.test(a)))
    log(
      'Claude Code may not run scripts or git commit in this mode. To allow them, see "What it can do" in plugins/workflow/README.md.',
    );

  // ---- stopping

  /**
   * End the bridge: the open streams hear that their runs ended, the runs are stopped and their
   * processes are gone before the exit. `sent` is a pending answer that must reach its reader first.
   */
  async function shutdown(sent = Promise.resolve()) {
    stopping = true;
    token = null;
    const going = active();
    if (going.length > 0) log(`stopping ${going.length} run${going.length === 1 ? "" : "s"}.`);
    server.close();
    for (const run of going) {
      emit(run, "exit", { code: null, signal: null, status: "cancelled" });
      for (const end of run.closers) end();
      run.listeners.clear();
      run.closers.clear();
    }
    await Promise.race([Promise.all([sent, ...going.map(cancelRun)]), sleep(KILL_AFTER_MS + 1000)]);
    process.exit(0);
  }

  const stop = () => {
    if (stopping) process.exit(130);
    void shutdown();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(`wf bridge: ${error?.stack ?? error}`);
  process.exit(1);
});
