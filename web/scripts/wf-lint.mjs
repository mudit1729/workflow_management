#!/usr/bin/env node
// wf:lint, a stand-in for the future `wf lint`.
//
//   pnpm -C web wf:lint <workspace dir> [--json] [--strict] [--quiet]
//
// Reads every .md and .toml file under the directory, runs the prototype loader of
// web/mock/md (`loadWorkspace`) on them and prints each finding as
//
//   <file>:<line> <rule> <severity> <message>
//
// Exit codes: 0 no errors, 1 at least one error (with --strict, one warning), 2 bad usage.
// F rules (format) and S rules (writing standard) come from the loader. Q rules (workflow
// signals) need the clock and the whole index, so they are not run here.
//
// There is no tsx in the repo. The loader is TypeScript with the `@/` alias, so the script
// loads it through Vite's own SSR loader: no bundle, no browser, about a second for 150 files.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set([".git", ".wf", "node_modules"]);
const TEXT = /\.(md|toml)$/i;
const ORDER = { error: 0, warn: 1, info: 2 };

function usage(message) {
  if (message) process.stderr.write(`wf:lint: ${message}\n`);
  process.stderr.write(
    "usage: pnpm -C web wf:lint <workspace dir> [--json] [--strict] [--quiet]\n" +
      "  prints  <file>:<line> <rule> <severity> <message>  and exits 1 on any error\n",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { json: false, strict: false, quiet: false, dir: undefined };
  for (const arg of argv) {
    if (arg === "--json") opts.json = true;
    else if (arg === "--strict") opts.strict = true;
    else if (arg === "--quiet" || arg === "-q") opts.quiet = true;
    else if (arg === "-h" || arg === "--help") usage();
    else if (arg.startsWith("-")) usage(`unknown option ${arg}`);
    else if (opts.dir === undefined) opts.dir = arg;
    else usage("only one directory is allowed");
  }
  if (opts.dir === undefined) usage("missing workspace directory");
  return opts;
}

/** pnpm runs scripts from web/, so a relative path may mean the caller's directory (INIT_CWD). */
function resolveDir(arg) {
  const candidates = [];
  if (process.env.INIT_CWD) candidates.push(resolve(process.env.INIT_CWD, arg));
  candidates.push(resolve(process.cwd(), arg));
  for (const c of candidates) {
    try {
      if (statSync(c).isDirectory()) return c;
    } catch {
      // try the next candidate
    }
  }
  usage(`not a directory: ${arg}`);
}

/** Every file under `root`: text files by relative path, other files as { bytes }. */
function collect(root) {
  const text = {};
  const binary = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const file = join(dir, entry.name);
      const rel = relative(root, file).split(sep).join("/");
      if (TEXT.test(entry.name)) text[rel] = readFileSync(file, "utf8");
      else binary[rel] = { url: "", bytes: statSync(file).size };
    }
  };
  walk(root);
  return { text, binary };
}

async function loadLoader() {
  const server = await createServer({
    root: WEB,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    clearScreen: false,
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      alias: {
        "@": join(WEB, "src"),
        "@mock": join(WEB, "mock"),
      },
    },
  });
  try {
    const mod = await server.ssrLoadModule("/mock/md/index.ts");
    return { loadWorkspace: mod.loadWorkspace, close: () => server.close() };
  } catch (err) {
    await server.close();
    throw err;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = resolveDir(opts.dir);
  const { text, binary } = collect(root);
  if (!text["workflow.toml"]) {
    process.stderr.write(`wf:lint: warning: no workflow.toml in ${root}; using defaults\n`);
  }

  const { loadWorkspace, close } = await loadLoader();
  let loaded;
  try {
    loaded = loadWorkspace(text, { binary });
  } finally {
    await close();
  }

  const findings = Object.entries(loaded.diagnostics)
    .flatMap(([file, list]) => list.map((d) => ({ ...d, file })))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        ORDER[a.severity] - ORDER[b.severity] ||
        a.rule.localeCompare(b.rule),
    );
  const count = { error: 0, warn: 0, info: 0 };
  for (const f of findings) count[f.severity]++;

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ wf_format: 1, root, files: Object.keys(text).length, counts: count, findings }, null, 2)}\n`,
    );
  } else {
    for (const f of findings) {
      process.stdout.write(`${f.file}:${f.line} ${f.rule} ${f.severity} ${f.message}\n`);
    }
    if (!opts.quiet) {
      process.stderr.write(
        `wf:lint: ${Object.keys(text).length} files, ${loaded.world.issues.length} issues: ` +
          `${count.error} errors, ${count.warn} warnings, ${count.info} info\n`,
      );
    }
  }
  process.exitCode = count.error > 0 || (opts.strict && count.warn > 0) ? 1 : 0;
}

main().catch((err) => {
  process.stderr.write(`wf:lint: ${err instanceof Error ? (err.stack ?? err.message) : err}\n`);
  process.exit(2);
});
