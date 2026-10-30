import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, searchForWorkspaceRoot } from "vite";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
/** The repository root: the skills view reads `plugins/**` and `.claude-plugin/` from it. */
const REPO = fileURLToPath(new URL("..", import.meta.url));
/** The shipped workspace (groups, library, glossary, no issues) and the sample world (a fixture). */
const WORKSPACE = `${ROOT}mock/workspace/`;
const SAMPLE = `${ROOT}mock/sample/`;

/** Matches `/node_modules/<package>/` in a module id, whether or not pnpm nested it under `.pnpm`. */
const pkg = (names: string[]) => new RegExp(`/node_modules/(?:${names.join("|")})/`);

const REACT = ["react", "react-dom", "scheduler"];
const RADIX = [
  "radix-ui",
  "@radix-ui/[^/]+",
  "cmdk",
  "aria-hidden",
  "get-nonce",
  "react-remove-scroll[^/]*",
  "react-style-singleton",
  "use-callback-ref",
  "use-sidecar",
];
const TANSTACK = ["@tanstack/[^/]+", "@atlaskit/[^/]+", "react-resizable-panels", "zustand"];
const MARKDOWN = [
  "react-markdown",
  "remark-[^/]+",
  "rehype-[^/]+",
  "micromark[^/]*",
  "mdast-[^/]+",
  "hast-[^/]+",
  "unist-[^/]+",
  "vfile[^/]*",
  "unified",
  "bail",
  "ccount",
  "character-entities[^/]*",
  "comma-separated-tokens",
  "decode-named-character-reference",
  "devlop",
  "html-url-attributes",
  "inline-style-parser",
  "is-plain-obj",
  "longest-streak",
  "markdown-table",
  "property-information",
  "space-separated-tokens",
  "stringify-entities",
  "style-to-js",
  "style-to-object",
  "trim-lines",
  "trough",
  "zwitch",
  "shiki",
  "@shikijs/[^/]+",
];

/**
 * `import info from "./file.png?wf-asset"` gives `{ url, bytes }`: where the bundler serves the
 * file and how large it is. The mock workspace lists its images with their sizes this way
 * (`mock/workspace-files.ts`), because a plain `?url` import has no size.
 */
function workspaceAssets(): Plugin {
  const SUFFIX = "?wf-asset";
  return {
    name: "wf:workspace-assets",
    enforce: "pre",
    async load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const file = id.slice(0, -SUFFIX.length);
      this.addWatchFile(file);
      const { size } = await stat(file);
      return `import url from ${JSON.stringify(`${file}?url`)};\nexport default { url, bytes: ${size} };\n`;
    },
  };
}

/**
 * The mock "watcher". A file added, changed or removed under `mock/workspace` re-runs
 * `mock/workspace-files.ts`, which accepts its own update and hands the new file set to the
 * store (`mock/workspace-bus.ts`); a file under `mock/sample` does the same through
 * `mock/sample-files.ts`. An edit keeps the file's own `?raw` module in the update
 * (so the watcher imports the new text) and adds the watcher itself. An add or a remove is
 * the watcher alone: by default Vite also puts every module that ever failed to resolve into
 * the update of an added file, and one dead end there reloads the page and drops the
 * in-memory workspace. Dev server only.
 */
function workspaceHot(): Plugin {
  const WATCHERS = [
    { folder: WORKSPACE, module: `${ROOT}mock/workspace-files.ts` },
    { folder: SAMPLE, module: `${ROOT}mock/sample-files.ts` },
  ];
  return {
    name: "wf:workspace-hot",
    apply: "serve",
    hotUpdate: {
      order: "post",
      handler({ file, type, modules }) {
        const owner = WATCHERS.find((w) => file.startsWith(w.folder));
        if (!owner) return;
        const watcher = [...(this.environment.moduleGraph.getModulesByFile(owner.module) ?? [])];
        return type === "update" ? [...modules, ...watcher] : watcher;
      },
    },
  };
}

/**
 * Dev server only: keeps the stand-in diagram previews (`public/diagrams`) in step with the
 * archify blocks of the workspace and the sample world. When a markdown file under
 * `mock/workspace` or `mock/sample` that holds, or held, an archify block changes,
 * `scripts/render-diagram-previews.mjs` runs again. It writes
 * only what differs, so a run that changes nothing makes no noise. A failed run is logged and
 * the page keeps the previews it has.
 */
function diagramPreviews(): Plugin {
  const FOLDERS = [WORKSPACE, SAMPLE];
  const holders = new Set<string>();
  const hasBlock = (text: string) => /^\s{0,3}(`{3,}|~{3,})\s*archify\b/m.test(text);
  return {
    name: "wf:diagram-previews",
    apply: "serve",
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = false;
      let again = false;
      const run = () => {
        if (running) {
          again = true;
          return;
        }
        running = true;
        execFile(
          process.execPath,
          [`${ROOT}scripts/render-diagram-previews.mjs`, "--quiet"],
          { cwd: ROOT },
          (err, _out, stderr) => {
            running = false;
            if (err) server.config.logger.warn(`diagram previews: ${stderr || err.message}`);
            if (again) {
              again = false;
              run();
            }
          },
        );
      };
      // Know which files hold a block now, so removing the last one from a file re-renders.
      for (const folder of FOLDERS) {
        try {
          for (const rel of readdirSync(folder, { recursive: true }) as string[]) {
            if (!rel.endsWith(".md")) continue;
            const file = `${folder}${rel}`;
            if (hasBlock(readFileSync(file, "utf8"))) holders.add(file);
          }
        } catch {
          // No such folder: nothing to watch there.
        }
      }
      const touch = (file: string, exists: boolean) => {
        if (!FOLDERS.some((f) => file.startsWith(f)) || !file.endsWith(".md")) return;
        let relevant = holders.has(file);
        if (exists) {
          try {
            const now = hasBlock(readFileSync(file, "utf8"));
            relevant = relevant || now;
            if (now) holders.add(file);
            else holders.delete(file);
          } catch {
            // The file vanished between the event and the read: the removal event follows.
          }
        } else holders.delete(file);
        if (!relevant) return;
        clearTimeout(timer);
        timer = setTimeout(run, 150);
      };
      server.watcher.on("change", (f) => touch(f, true));
      server.watcher.on("add", (f) => touch(f, true));
      server.watcher.on("unlink", (f) => touch(f, false));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), workspaceAssets(), workspaceHot(), diagramPreviews()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@mock": fileURLToPath(new URL("./mock", import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor groups cache independently of the app code and keep every chunk under the
        // 500 kB warning. The mock server and the diagram card are already dynamic imports.
        codeSplitting: {
          groups: [
            { name: "react", test: pkg(REACT), priority: 50 },
            { name: "radix", test: pkg(RADIX), priority: 40 },
            { name: "tanstack", test: pkg(TANSTACK), priority: 30 },
            { name: "markdown", test: pkg(MARKDOWN), priority: 20 },
            { name: "vendor", test: /\/node_modules\//, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    port: 5177,
    strictPort: true,
    // mock/skills.ts reads plugins/** and .claude-plugin/marketplace.json, which sit above web/.
    fs: { allow: [searchForWorkspaceRoot(ROOT), REPO] },
    // `wf serve --dev` answers /api when VITE_API=real.
    proxy: { "/api": "http://127.0.0.1:7777" },
  },
});
