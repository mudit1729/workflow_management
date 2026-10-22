// The channel between the bundler and the store. `workspace-files.ts` is the module Vite
// replaces when a file under `mock/workspace` changes, so it cannot hold listeners itself:
// they would vanish with the old module. This module never changes, so the listeners stay.

/** The workspace as the bundler sees it on disk, before the clock shift. */
export interface WorkspaceDisk {
  /** Text files by workspace-relative path. */
  text: Record<string, string>;
  /** Binary files (images) by workspace-relative path: where they are served and their size. */
  assets: Record<string, { url: string; bytes: number }>;
  /** Ids of the diagrams that have a stand-in preview page. */
  previews: string[];
}

type Listener = (disk: WorkspaceDisk) => void;

const listeners = new Set<Listener>();

/** Call `fn` whenever the files on disk change (dev server only). Returns the unsubscribe. */
export function onDiskChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tell the stores the files on disk changed. */
export function publishDisk(disk: WorkspaceDisk): void {
  for (const fn of [...listeners]) {
    try {
      fn(disk);
    } catch (err) {
      console.error("mock watcher failed", err);
    }
  }
}
