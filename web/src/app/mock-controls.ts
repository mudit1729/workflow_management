// Typed access to the mock server's controls (`window.__wf`, set by `@mock/server`).
// Absent when the app talks to the real daemon (`VITE_API=real`), so every caller
// guards on `undefined`.
import { toast } from "sonner";

export type MockConnection = "live" | "reconnecting" | "offline";

export interface MockControls {
  conflictNextWrite: () => void;
  playNextEvent: () => void;
  setArchifyAvailable: (available: boolean) => void;
  setConnection: (state: MockConnection) => void;
  reset: () => void;
}

export function getMockControls(): MockControls | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __wf?: MockControls }).__wf;
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
