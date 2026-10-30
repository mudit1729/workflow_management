// Turns the result of an `import.meta.glob` over a workspace folder into a `WorkspaceDisk`.
// Both folders go through it: `mock/workspace` (workspace-files.ts, the shipped files) and
// `mock/sample` (sample-files.ts, the fixture). Each module still owns its own glob, because
// Vite reads the glob pattern from the source text.
import type { WorkspaceDisk } from "./workspace-bus";

/** The text files and the images of a folder, as the globs of a `*-files.ts` module return them. */
export interface GlobbedFolder {
  /** The folder prefix of every glob key, with a trailing slash (`./workspace/`). */
  root: string;
  /** Text files by glob key (`?raw`). */
  raw: Record<string, string>;
  /** Images by glob key (`?wf-asset`: `{ url, bytes }`, or a bare URL when the size is unknown). */
  binary: Record<string, { url: string; bytes: number } | string>;
  /** Ids of the diagrams that have a stand-in preview page. */
  previews: Iterable<string>;
}

export function collectDisk({ root, raw, binary, previews }: GlobbedFolder): WorkspaceDisk {
  const rel = (key: string) => (key.startsWith(root) ? key.slice(root.length) : key);
  const text: WorkspaceDisk["text"] = {};
  for (const [key, body] of Object.entries(raw)) text[rel(key)] = body;
  const assets: WorkspaceDisk["assets"] = {};
  for (const [key, value] of Object.entries(binary))
    assets[rel(key)] = typeof value === "string" ? { url: value, bytes: 0 } : value;
  return { text, assets, previews: [...previews] };
}
