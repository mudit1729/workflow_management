// The channel between the bundler and the store. `workspace-files.ts` and `sample-files.ts` are
// the modules Vite replaces when a file under `mock/workspace` or `mock/sample` changes, so they
// cannot hold listeners themselves: the listeners would vanish with the old module. This module
// never changes, so the listeners stay.

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
const sampleListeners = new Set<Listener>();

function notify(set: Set<Listener>, disk: WorkspaceDisk) {
  for (const fn of [...set]) {
    try {
      fn(disk);
    } catch (err) {
      console.error("mock watcher failed", err);
    }
  }
}

/** Call `fn` whenever the shipped files (`mock/workspace`) change on disk (dev server only). */
export function onDiskChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tell the stores the shipped files changed on disk. */
export function publishDisk(disk: WorkspaceDisk): void {
  notify(listeners, disk);
}

/** Call `fn` whenever the sample files (`mock/sample`) change on disk (dev server only). */
export function onSampleChange(fn: Listener): () => void {
  sampleListeners.add(fn);
  return () => {
    sampleListeners.delete(fn);
  };
}

/** Tell the stores the sample files changed on disk. */
export function publishSample(disk: WorkspaceDisk): void {
  notify(sampleListeners, disk);
}
