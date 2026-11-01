// UI preferences only (zustand). Never workspace state: that lives in files.
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type ThemePref = "system" | "light" | "dark";
export type Density = "comfy" | "compact";

interface Prefs {
  theme: ThemePref;
  density: Density;
  navCollapsed: boolean;
  drawerWidth: number; // px, clamped to --wf-drawer-w-min..max
  foldedColumns: string[]; // statuses folded to a rail
  notifications: boolean; // opt-in browser notifications for blocking requests
  setTheme: (t: ThemePref) => void;
  setDensity: (d: Density) => void;
  toggleNav: () => void;
  setDrawerWidth: (w: number) => void;
  toggleColumnFold: (status: string) => void;
  setNotifications: (on: boolean) => void;
}

// Storage can throw (private mode, sandboxed iframe). Fall back to memory.
const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      memory.delete(k);
    }
  },
};

/** Prefs that were stored once and are gone now (the Plan tab's Lanes view). */
const RETIRED = ["planView"];

/** Stored prefs without the retired keys, so an old value never comes back into the state. */
export function withoutRetired(stored: unknown): Partial<Prefs> {
  const out: Record<string, unknown> = {};
  if (stored && typeof stored === "object")
    for (const [k, v] of Object.entries(stored)) if (!RETIRED.includes(k)) out[k] = v;
  return out as Partial<Prefs>;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: "system",
      density: "comfy",
      navCollapsed: false,
      drawerWidth: 560,
      foldedColumns: ["backlog", "done"],
      notifications: false,
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      setDrawerWidth: (w) => set({ drawerWidth: Math.max(440, Math.min(760, Math.round(w))) }),
      toggleColumnFold: (status) =>
        set((s) => ({
          foldedColumns: s.foldedColumns.includes(status)
            ? s.foldedColumns.filter((x) => x !== status)
            : [...s.foldedColumns, status],
        })),
      setNotifications: (notifications) => set({ notifications }),
    }),
    {
      name: "wf-prefs",
      storage: createJSONStorage(() => safeStorage),
      merge: (stored, current) => ({ ...current, ...withoutRetired(stored) }),
    },
  ),
);

/** Resolved theme ("light" | "dark"), following the OS when the pref is "system". */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
