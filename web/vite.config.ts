import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    // `wf serve --dev` answers /api when VITE_API=real.
    proxy: { "/api": "http://127.0.0.1:7777" },
  },
});
