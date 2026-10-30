// The personal library on disk: the files of the person's private repo, `github.com/<handle>/
// wf-library`. Everything under `mock/personal` is always there; everything under
// `mock/personal-sample` (same layout) shows only while the sample world is loaded, which is how
// the work summaries of the sample issues appear and an empty workspace has an empty Work section.
// Images, GIFs and videos are collected like the workspace's (`?wf-asset`: URL plus size).
//
// In the dev server a saved, added or removed file replaces this module (it accepts its own
// update) and the new sets are handed to the library through `workspace-bus.ts`.
import { collectDisk } from "./disk-collect";
import { publishPersonal, type WorkspaceDisk } from "./workspace-bus";

const raw = import.meta.glob("./personal/**/*.{md,toml}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const binary = import.meta.glob("./personal/**/*.{png,jpg,jpeg,gif,svg,webp,mp4,webm}", {
  query: "?wf-asset",
  import: "default",
  eager: true,
}) as Record<string, { url: string; bytes: number } | string>;

const sampleRaw = import.meta.glob("./personal-sample/**/*.{md,toml}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const sampleBinary = import.meta.glob(
  "./personal-sample/**/*.{png,jpg,jpeg,gif,svg,webp,mp4,webm}",
  { query: "?wf-asset", import: "default", eager: true },
) as Record<string, { url: string; bytes: number } | string>;

/** The personal library, always. */
export const PERSONAL: WorkspaceDisk = collectDisk({
  root: "./personal/",
  raw,
  binary,
  previews: [],
});

/** More of the personal library, only while the sample is loaded. */
export const PERSONAL_SAMPLE: WorkspaceDisk = collectDisk({
  root: "./personal-sample/",
  raw: sampleRaw,
  binary: sampleBinary,
  previews: [],
});

if (import.meta.hot) {
  if (import.meta.hot.data.loaded) publishPersonal(PERSONAL, PERSONAL_SAMPLE);
  import.meta.hot.data.loaded = true;
  import.meta.hot.accept();
}
