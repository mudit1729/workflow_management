// The pages a person opened last, for the Library home. A per-viewer convenience kept in this
// browser only (the markdown holds the libraries; this holds where you were).
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface RecentPage {
  address: string;
  alias: string;
  path: string;
  title: string;
  library: string;
  /** When it was opened, epoch ms. */
  at: number;
}

/** Pages kept. */
export const RECENT_LIMIT = 8;

const memory = new Map<string, string>();
// Storage can throw (private window, blocked site data): fall back to memory.
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

/** The list with `page` first, once, and no more than `RECENT_LIMIT`. Pure. */
export function withVisit(list: RecentPage[], page: RecentPage): RecentPage[] {
  return [page, ...list.filter((p) => p.address !== page.address)].slice(0, RECENT_LIMIT);
}

interface RecentState {
  pages: RecentPage[];
  visit: (page: Omit<RecentPage, "at">) => void;
  forget: (alias: string) => void;
}

export const useRecentPages = create<RecentState>()(
  persist(
    (set) => ({
      pages: [],
      visit: (page) => set((s) => ({ pages: withVisit(s.pages, { ...page, at: Date.now() }) })),
      forget: (alias) => set((s) => ({ pages: s.pages.filter((p) => p.alias !== alias) })),
    }),
    { name: "wf-library-recent", storage: createJSONStorage(() => safeStorage), version: 0 },
  ),
);
