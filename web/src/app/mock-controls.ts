// Typed access to the mock server's controls (`window.__wf`, set by `@mock/server`).
// Absent when the app talks to the real daemon (`VITE_API=real`), so every caller
// guards on `undefined`.
import { toast } from "sonner";

export type MockConnection = "live" | "reconnecting" | "offline";

export interface MockControls {
  conflictNextWrite: () => void;
  /** Plays the next scripted live event. Returns its name, or undefined when none applies. */
  playNextEvent: () => string | undefined;
  setArchifyAvailable: (available: boolean) => void;
  setConnection: (state: MockConnection) => void;
  /** Back to the shipped workspace: groups, library and glossary, no issues. */
  reset: () => void;
  /** Replaces the working copy with the sample world in one commit. Returns the issue count. */
  loadSample: () => number;
  /** Shows the sample until the returned function is called, then restores the working copy. */
  holdSample: () => () => void;
  /** Time between the phases of the Codex runs that start from now on, in ms. Default 2000. */
  setCodexPhaseMs: (ms: number) => void;
}

export function getMockControls(): MockControls | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __wf?: MockControls }).__wf;
}

/**
 * Play the next scripted live event. The events belong to the sample issues, so on a workspace
 * without them nothing happens; say so quietly and point to "Load sample data". (After the sample
 * has played them all, loading it again starts them over.)
 */
export function playNextEvent(controls: MockControls): void {
  if (controls.playNextEvent()) return;
  toast("No live events apply here. Load sample data to play them.");
}

/** Run a mock control, or explain why it is unavailable. Returns true when it ran. */
export function withMockControls(run: (c: MockControls) => void): boolean {
  const controls = getMockControls();
  if (!controls) {
    toast("Prototype controls are off", {
      description: "They run only on mock data. This build talks to wf serve.",
    });
    return false;
  }
  run(controls);
  return true;
}
