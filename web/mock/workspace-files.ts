// The workspace files on disk: everything under `mock/workspace`, read by the bundler.
// This is the only place the mock world comes from. In the dev server a saved, added or
// removed file replaces this module (it accepts its own update), and the new set is handed
// to the stores through `workspace-bus.ts`: that is the mock "watcher".
import previewIds from "./diagram-previews.json";
import { publishDisk, type WorkspaceDisk } from "./workspace-bus";

const ROOT = "./workspace/";
const rel = (key: string) => (key.startsWith(ROOT) ? key.slice(ROOT.length) : key);

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

function collect(): WorkspaceDisk {
  const text: WorkspaceDisk["text"] = {};
  for (const [key, body] of Object.entries(raw)) text[rel(key)] = body;
  const assets: WorkspaceDisk["assets"] = {};
  for (const [key, value] of Object.entries(binary))
    assets[rel(key)] = typeof value === "string" ? { url: value, bytes: 0 } : value;
  return { text, assets, previews: [...previewIds] };
}

/** The workspace on disk, in the frame of the day it was recorded (see `md/recorded-at.ts`). */
export const DISK: WorkspaceDisk = collect();

if (import.meta.hot) {
  // The first run only records itself. Every later run is a new version of the files.
  if (import.meta.hot.data.loaded) publishDisk(DISK);
  import.meta.hot.data.loaded = true;
  import.meta.hot.accept();
}
