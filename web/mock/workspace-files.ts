// The workspace files on disk: everything under `mock/workspace`, read by the bundler. This is
// the shipped workspace: groups, library, glossary, authors and config, and no issues. The sample
// world (26 issues) lives next to it in `mock/sample` (see `sample-files.ts`).
// In the dev server a saved, added or removed file replaces this module (it accepts its own
// update), and the new set is handed to the stores through `workspace-bus.ts`: that is the mock
// "watcher".

import previewIds from "./diagram-previews.json";
import { collectDisk } from "./disk-collect";
import { publishDisk, type WorkspaceDisk } from "./workspace-bus";

const raw = import.meta.glob("./workspace/**/*.{md,toml}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// `?wf-asset` is the small plugin of vite.config.ts: the asset URL plus the file size.
const binary = import.meta.glob("./workspace/**/*.{png,jpg,jpeg,gif,svg,webp}", {
  query: "?wf-asset",
  import: "default",
  eager: true,
}) as Record<string, { url: string; bytes: number } | string>;

/** The workspace on disk, in the frame of the day it was recorded (see `md/recorded-at.ts`). */
export const DISK: WorkspaceDisk = collectDisk({
  root: "./workspace/",
  raw,
  binary,
  previews: previewIds,
});

if (import.meta.hot) {
  // The first run only records itself. Every later run is a new version of the files.
  if (import.meta.hot.data.loaded) publishDisk(DISK);
  import.meta.hot.data.loaded = true;
  import.meta.hot.accept();
}
