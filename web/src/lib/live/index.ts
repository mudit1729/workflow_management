// Live updates (contract 1.10 SSE, §6 "Live updates"). `startLive` is called once by the
// shell. It applies `delta` events to the snapshot cache, refreshes changed issue details,
// keeps the activity feed, and shows toasts for notable events.
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  ActivityEvent,
  DeltaEvent,
  DiagramEvent,
  ServerEvent,
  WorkspaceSnapshot,
} from "@/gen/types";
import { applyDelta } from "@/lib/api/delta";
import { qk } from "@/lib/api/keys";
import { isRealApi, loadMock } from "@/lib/api/mock-bridge";
import { announce } from "./notify";
import {
  isRecentlyChanged,
  type LiveState,
  markChanged,
  subscribeChanged,
  useLiveStore,
} from "./store";

export { setLiveNavigator } from "./notify";

// ---------------------------------------------------------------- hooks

export function useLiveStatus(): { state: LiveState; rev: string } {
  return useLiveStore(useShallow((s) => ({ state: s.state, rev: s.rev })));
}

/** True for 1.5 s after a delta touched the issue. Cards add `wf-flash` while it is true. */
export function useRecentlyChanged(id: string): boolean {
  return useSyncExternalStore(
    subscribeChanged,
    () => isRecentlyChanged(id),
    () => false,
  );
}

/** The latest 50 activity events, newest first. */
export function useActivity(): ActivityEvent[] {
  return useLiveStore((s) => s.activity);
}

// ---------------------------------------------------------------- applying events

const SEEN_LIMIT = 512;
const seen = new Set<string>();

function remember(rev: string) {
  seen.add(rev);
  if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
}

function onDelta(client: QueryClient, d: DeltaEvent) {
  // Revs are opaque hashes. A delta is "newer" when the cache has not already absorbed it.
  const snap = client.getQueryData<WorkspaceSnapshot>(qk.snapshot());
  if (seen.has(d.rev) || snap?.rev === d.rev) {
    remember(d.rev);
    return;
  }
  remember(d.rev);
  if (snap) client.setQueryData(qk.snapshot(), applyDelta(snap, d));
  else void client.invalidateQueries({ queryKey: qk.snapshot() });

  for (const id of d.details_changed) void client.invalidateQueries({ queryKey: qk.issue(id) });
  for (const l of d.library_upserted) void client.invalidateQueries({ queryKey: qk.library(l.id) });
  markChanged([...d.issues_upserted.map((i) => i.id), ...d.details_changed]);
}

function onActivity(client: QueryClient, a: ActivityEvent) {
  useLiveStore.getState().push(a);
  announce(a, client.getQueryData<WorkspaceSnapshot>(qk.snapshot()));
}

function onDiagram(client: QueryClient, _d: DiagramEvent) {
  // Diagram status lives in issue details and `config.archify` in the snapshot.
  void client.invalidateQueries({ queryKey: qk.snapshot() });
  void client.invalidateQueries({ queryKey: ["issue"] });
}

/** Apply one server event to the caches. Exported for tests; the transports call it. */
export function applyServerEvent(client: QueryClient, e: ServerEvent) {
  switch (e.event) {
    case "snapshot":
      seen.clear();
      remember(e.data.rev);
      client.setQueryData(qk.snapshot(), e.data);
      break;
    case "delta":
      onDelta(client, e.data);
      break;
    case "activity":
      onActivity(client, e.data);
      break;
    case "diagram":
      onDiagram(client, e.data);
      break;
    case "resync":
      seen.clear();
      void client.invalidateQueries();
      break;
  }
}

// ---------------------------------------------------------------- transports

function connectMock(client: QueryClient): () => void {
  let stop: (() => void) | undefined;
  let cancelled = false;
  void loadMock().then((mock) => {
    if (cancelled) return;
    useLiveStore.getState().setState(mock.connection());
    const offEvents = mock.subscribe((e) => applyServerEvent(client, e));
    const offState = mock.onConnection((s) => useLiveStore.getState().setState(s));
    stop = () => {
      offEvents();
      offState();
    };
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

const EVENT_NAMES = ["snapshot", "delta", "activity", "diagram", "resync"] as const;

function connectEventSource(client: QueryClient): () => void {
  const es = new EventSource("/api/events");
  const live = useLiveStore.getState();
  es.onopen = () => live.setState("live");
  es.onerror = () =>
    live.setState(es.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
  for (const name of EVENT_NAMES) {
    es.addEventListener(name, (m) => {
      const data = JSON.parse((m as MessageEvent<string>).data) as ServerEvent["data"];
      const id = (m as MessageEvent<string>).lastEventId;
      applyServerEvent(client, { event: name, id, data } as ServerEvent);
    });
  }
  return () => es.close();
}

let stopLive: (() => void) | undefined;

/** Start the stream once. Returns a stop function; a second call returns the same one. */
export function startLive(client: QueryClient): () => void {
  if (stopLive) return stopLive;

  // Keep `rev` in step with whatever the cache holds, whether a fetch or a delta put it there.
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== "snapshot") return;
    const data = event.query.state.data as WorkspaceSnapshot | undefined;
    if (data) useLiveStore.getState().setRev(data.rev);
  });
  const disconnect = isRealApi ? connectEventSource(client) : connectMock(client);

  stopLive = () => {
    unsubscribe();
    disconnect();
    stopLive = undefined;
  };
  return stopLive;
}
