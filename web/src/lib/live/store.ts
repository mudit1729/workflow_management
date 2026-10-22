// Live state that is not workspace data: the connection, the activity feed and which
// issues just changed. Plain module state read through `useSyncExternalStore`.
import { create } from "zustand";
import type { ActivityEvent } from "@/gen/types";

export type LiveState = "live" | "reconnecting" | "offline";

interface LiveStore {
  state: LiveState;
  rev: string;
  activity: ActivityEvent[];
  setState: (s: LiveState) => void;
  setRev: (rev: string) => void;
  push: (a: ActivityEvent) => void;
}

export const ACTIVITY_LIMIT = 50;

export const useLiveStore = create<LiveStore>((set) => ({
  state: "live",
  rev: "",
  activity: [],
  setState: (state) => set({ state }),
  setRev: (rev) => set({ rev }),
  push: (a) => set((s) => ({ activity: [a, ...s.activity].slice(0, ACTIVITY_LIMIT) })),
}));

// ---------------------------------------------------------------- recently changed

export const FLASH_MS = 1500;

const until = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Mark issues as changed for 1.5 s. Cards read this through `useRecentlyChanged`. */
export function markChanged(ids: Iterable<string>) {
  const expiry = Date.now() + FLASH_MS;
  for (const id of ids) {
    until.set(id, expiry);
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        if ((until.get(id) ?? 0) <= Date.now()) until.delete(id);
        emit();
      }, FLASH_MS + 10),
    );
  }
  emit();
}

export function subscribeChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isRecentlyChanged(id: string): boolean {
  return (until.get(id) ?? 0) > Date.now();
}
