// The Work section's list of targets: every group and issue of the workspace, with the rev of its
// folder now and the summary written for it. In the product the daemon answers this (it reads the
// files and the personal repo); the prototype computes it from the mock store and the personal
// library, and follows both while the component is mounted, so a card moved on the board makes its
// summary stale at once.
import { useEffect, useState } from "react";
import { loadMock } from "@/lib/api/mock-bridge";
import { PERSONAL_ALIAS } from "../address";
import type { WorkList } from "./work";

export interface WorkListState {
  data?: WorkList;
  /** The build talks to a real daemon, which has no such answer yet. */
  unavailable: boolean;
}

export function useWorkList(): WorkListState {
  const [state, setState] = useState<WorkListState>({ unavailable: false });

  useEffect(() => {
    if (import.meta.env.VITE_API === "real") {
      setState({ unavailable: true });
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stops: (() => void)[] = [];
    void Promise.all([loadMock(), import("@mock/libraries/work-summaries")])
      .then(([mock, work]) => {
        if (!live) return;
        const { store, libraryRegistry: libs } = mock.server;
        const written = (path: string) => {
          try {
            return libs.page(PERSONAL_ALIAS, path).text;
          } catch {
            return undefined;
          }
        };
        const read = () =>
          setState({ data: work.workList(work.workWorld(store), written), unavailable: false });
        // Many events arrive together (a run writes several files): read once after them.
        const soon = () => {
          clearTimeout(timer);
          timer = setTimeout(read, 40);
        };
        read();
        stops.push(store.subscribe(soon), libs.subscribe(soon));
      })
      .catch(() => live && setState({ unavailable: true }));
    return () => {
      live = false;
      clearTimeout(timer);
      for (const stop of stops) stop();
    };
  }, []);

  return state;
}
