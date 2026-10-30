// The sample world on disk: everything under `mock/sample`, a full copy of the workspace the
// prototype used to ship (26 issues in seven groups, the library, the glossary). It is a fixture,
// not shipped content: the Kit, the tests and "Load sample data" use it; the board starts without
// it. Read the same way as `workspace-files.ts` reads `mock/workspace`.
//
// In the dev server a saved, added or removed file here replaces this module (it accepts its own
// update) and the new set is handed to the stores through `workspace-bus.ts`. A store applies it
// only while the sample is loaded; otherwise it keeps it for the next "Load sample data".

import previewIds from "./diagram-previews.json";
import { collectDisk } from "./disk-collect";
import { publishSample, type WorkspaceDisk } from "./workspace-bus";

const raw = import.meta.glob("./sample/**/*.{md,toml}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const binary = import.meta.glob("./sample/**/*.{png,jpg,jpeg,gif,svg,webp}", {
  query: "?wf-asset",
  import: "default",
  eager: true,
}) as Record<string, { url: string; bytes: number } | string>;

/** The sample workspace on disk, in the frame of the day it was recorded. */
export const SAMPLE: WorkspaceDisk = collectDisk({
  root: "./sample/",
  raw,
  binary,
  previews: previewIds,
});

if (import.meta.hot) {
  if (import.meta.hot.data.loaded) publishSample(SAMPLE);
  import.meta.hot.data.loaded = true;
  import.meta.hot.accept();
}
