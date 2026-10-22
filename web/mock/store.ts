// The in-memory store behind the mock server. It owns the world (sources), the derived
// API shapes, the per-file revision history, and the SSE-style event stream.
//
// Writes follow one path: `mutate()` copies the world, lets the caller change the copy,
// re-derives everything, and only then swaps the copy in. A write that throws leaves the
// store untouched. Each committed write bumps the workspace rev and emits a `delta` plus
// the `activity` events the caller declared.
import type {
  ActivityEvent,
  ActivityKind,
  DeltaEvent,
  GroupNode,
  Handle,
  IssueId,
  IssueSummary,
  NeedsYouItem,
  ServerEvent,
} from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import { seedWorld } from "./data";
import { type Derived, derive } from "./derive";
import type { IssueSrc, WorldSrc } from "./source";
import { toTs } from "./time";
import { clone, rev as hashRev, randomId } from "./util";

export type Connection = "live" | "reconnecting" | "offline";

/** Events the server keeps for replay (contract 1.10: ring buffer of 256). */
export const RING_SIZE = 256;

// ---------------------------------------------------------------- what a write declares

/** A file a write changed, and which anchors inside it (`"all"` = the whole file). */
export interface Touch {
  file: string;
  anchors: string[] | "all";
}

export interface ActivityDraft {
  issue_id: IssueId;
  kind: ActivityKind;
  author: Handle;
  title: string;
  notable?: ActivityEvent["notable"];
}

export interface Applied {
  touches: Touch[];
  activity: ActivityDraft[];
  /** The id a creating write made (issue, group, library item). */
  created?: string;
}

export interface Mutation {
  /** The workspace rev after the write (unchanged when nothing changed). */
  rev: string;
  /** The rev of the first file the write touched. */
  file_rev: string;
  changed: boolean;
  created?: string;
  /** Summary of `issueId` after the write, when the caller asked for one. */
  issue?: IssueSummary;
}

interface FileVersion {
  rev: string;
  touched: Set<string> | "all";
  by: Handle | undefined;
}

export interface StoreOptions {
  /** How many events the server keeps for replay. Default 256 (contract 1.10). */
  ringSize?: number;
  clock?: () => number;
  seed?: () => WorldSrc;
  archify?: boolean;
}

export interface Store {
  readonly world: WorldSrc;
  readonly derived: Derived;
  readonly rev: string;
  readonly archify: boolean;
  /** The acting author (`config.author`). */
  readonly me: Handle;
  now(): number;
  stamp(): string;
  newId(prefix: string): string;

  summary(id: IssueId): IssueSummary | undefined;
  issueSrc(id: IssueId): IssueSrc | undefined;
  /** Workspace-relative path of a file in an issue folder. */
  filePath(issue: IssueId, file: string): string;
  pathRev(path: string): string | undefined;

  /** Throw a 409 when `base_rev` is stale for the anchor (see `guard` below). */
  guard(file: string, anchor: string, base: string | undefined, current?: () => unknown): void;
  mutate(by: Handle, issue: IssueId | undefined, fn: (draft: WorldSrc) => Applied): Mutation;
  /** A no-op result for a write that changes nothing. */
  unchanged(file: string, issue?: IssueId): Mutation;
  setArchify(on: boolean): void;
  reset(): void;

  subscribe(fn: (e: ServerEvent) => void): () => void;
  onConnection(fn: (state: Connection) => void): () => void;
  connection(): Connection;
  setConnection(state: Connection): void;
  /** Events still in the ring buffer, oldest first. */
  events(): ServerEvent[];
}

// ---------------------------------------------------------------- helpers

function allIds(w: WorldSrc): Set<string> {
  const ids = new Set<string>();
  for (const g of w.groups) ids.add(g.id);
  for (const l of w.library) ids.add(l.id);
  for (const i of w.issues) {
    ids.add(i.goal.id);
    for (const e of [...i.changes, ...i.decisions, ...i.learnings]) ids.add(e.id);
    for (const r of i.state?.needs_you ?? []) ids.add(r.id);
  }
  return ids;
}

function pathRevs(world: WorldSrc, d: Derived): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, files] of d.files) {
    const dir = d.dirs.get(id);
    for (const [name, text] of Object.entries(files))
      out.set(`${dir}/${name}`, hashRev(text ?? ""));
  }
  for (const item of d.library.values()) out.set(item.edit.file, item.edit.rev);
  for (const g of world.groups) {
    if (g.implicit) continue;
    out.set(`${d.groupDirs.get(g.id)}/_group.md`, hashRev(JSON.stringify(g)));
  }
  return out;
}

const json = (x: unknown) => JSON.stringify(x);

/** Content signatures used to diff two derivations into a delta. */
interface Sigs {
  issues: Map<string, string>;
  details: Map<string, string>;
  library: Map<string, string>;
  groups: string;
  inbox: string;
}

function sigsOf(d: Derived): Sigs {
  return {
    issues: new Map(d.snapshot.issues.map((i) => [i.id, json(i)])),
    details: new Map([...d.details].map(([id, det]) => [id, json(det)])),
    library: new Map(d.snapshot.library.map((l) => [l.id, json(l)])),
    groups: json(d.snapshot.groups),
    inbox: json(d.snapshot.inbox),
  };
}

function makeDelta(next: Derived, prev: Sigs, now: Sigs): DeltaEvent {
  const issues_upserted = next.snapshot.issues.filter(
    (i) => prev.issues.get(i.id) !== now.issues.get(i.id),
  );
  const issues_removed = [...prev.issues.keys()].filter((id) => !now.issues.has(id));
  const library_upserted = next.snapshot.library.filter(
    (l) => prev.library.get(l.id) !== now.library.get(l.id),
  );
  const library_removed = [...prev.library.keys()].filter((id) => !now.library.has(id));
  const details_changed = [...now.details.keys()].filter(
    (id) => prev.details.get(id) !== now.details.get(id),
  );
  const groups: GroupNode | undefined =
    prev.groups !== now.groups ? next.snapshot.groups : undefined;
  const inbox: NeedsYouItem[] | undefined =
    prev.inbox !== now.inbox ? next.snapshot.inbox : undefined;
  return {
    rev: next.rev,
    issues_upserted,
    issues_removed,
    groups,
    inbox,
    library_upserted,
    library_removed,
    details_changed,
  };
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// ---------------------------------------------------------------- the store

export function createStore(options: StoreOptions = {}): Store {
  const clock = options.clock ?? Date.now;
  const ringSize = options.ringSize ?? RING_SIZE;
  const seed = options.seed ?? seedWorld;

  let archify = options.archify ?? false;
  let seq = 0;
  let world = seed();
  let rev = nextRev("seed");
  let derived = derive(world, { rev, now: clock(), archify });
  let revs = pathRevs(world, derived);
  let sigs = sigsOf(derived);
  let versions = initialVersions(revs);

  const listeners = new Set<(e: ServerEvent) => void>();
  const connListeners = new Set<(s: Connection) => void>();
  let connection: Connection = "live";
  let ring: ServerEvent[] = [];
  let pending: ServerEvent[] = [];
  let overflowed = false;

  function nextRev(note: string): string {
    seq += 1;
    return hashRev(`${seq}|${note}`);
  }

  function initialVersions(map: Map<string, string>): Map<string, FileVersion[]> {
    return new Map(
      [...map].map(([path, r]) => [path, [{ rev: r, touched: new Set<string>(), by: undefined }]]),
    );
  }

  // ---- events

  function deliver(e: ServerEvent) {
    for (const l of [...listeners]) {
      try {
        l(e);
      } catch (err) {
        console.error("mock event listener failed", err);
      }
    }
  }

  function emit(e: ServerEvent) {
    ring.push(e);
    if (ring.length > ringSize) ring = ring.slice(-ringSize);
    if (connection === "live") {
      deliver(e);
      return;
    }
    pending.push(e);
    if (pending.length > ringSize) {
      pending = pending.slice(-ringSize);
      overflowed = true;
    }
  }

  function setConnection(next: Connection) {
    if (next === connection) return;
    connection = next;
    for (const l of [...connListeners]) l(next);
    if (next !== "live") return;
    // Going live replays what the client missed; a gap beyond the ring asks for a resync.
    const missed = pending;
    const gap = overflowed;
    pending = [];
    overflowed = false;
    if (gap) deliver({ event: "resync", id: rev, data: {} });
    else for (const e of missed) deliver(e);
  }

  // ---- commit

  function install(
    next: Derived,
    nextRevs: Map<string, string>,
    by: Handle | undefined,
    touches: Touch[],
    drafts: ActivityDraft[],
  ) {
    const nextSigs = sigsOf(next);
    const delta = makeDelta(next, sigs, nextSigs);

    // File history: touched anchors where the write said so, the whole file otherwise.
    for (const [path, r] of nextRevs) {
      const log = versions.get(path) ?? [];
      if (log.at(-1)?.rev === r) continue;
      const touch = touches.find((t) => t.file === path);
      const touched = !touch || touch.anchors === "all" ? "all" : new Set(touch.anchors);
      log.push({ rev: r, touched: log.length === 0 ? new Set<string>() : touched, by });
      versions.set(path, log);
    }
    for (const path of versions.keys()) if (!nextRevs.has(path)) versions.delete(path);

    derived = next;
    rev = next.rev;
    revs = nextRevs;
    sigs = nextSigs;

    emit({ event: "delta", id: rev, data: delta });
    const ts = toTs(clock());
    for (const a of drafts) {
      emit({ event: "activity", id: rev, data: { rev, ts, ...a } });
    }
    return delta;
  }

  // ---- public

  const store: Store = {
    get world() {
      return world;
    },
    get derived() {
      return derived;
    },
    get rev() {
      return rev;
    },
    get archify() {
      return archify;
    },
    get me() {
      return world.config.author;
    },
    now: clock,
    stamp: () => toTs(clock()),

    newId(prefix) {
      const taken = allIds(world);
      return randomId((id) => taken.has(id), prefix);
    },

    summary: (id) => derived.snapshot.issues.find((i) => i.id === id),
    issueSrc: (id) => world.issues.find((i) => i.goal.id === id),
    filePath: (issue, file) => `${derived.dirs.get(issue) ?? issue}/${file}`,
    pathRev: (path) => revs.get(path),

    // A base rev is stale for an anchor when the file changed AND a later version touched
    // that anchor (the write protocol of contract 1.10: re-find the anchor, 409 only when
    // the target value moved). A rev the file never had is stale too.
    guard(file, anchor, base, current) {
      const log = versions.get(file);
      const latest = log?.at(-1);
      if (!log || !latest || base === latest.rev) return;
      const at = base ? log.findLastIndex((v) => v.rev === base) : -1;
      const later = at >= 0 ? log.slice(at + 1) : [];
      const moved = later.filter((v) => v.touched === "all" || v.touched.has(anchor));
      if (at >= 0 && moved.length === 0) return;
      const by = (at >= 0 ? moved.at(-1) : latest)?.by;
      throw new ApiError(409, {
        reason: by
          ? `${basename(file)} changed by @${by}`
          : `${basename(file)} changed since you loaded it`,
        file,
        by,
        current: current?.() ?? null,
      });
    },

    mutate(by, issue, fn) {
      const draft = clone(world);
      const applied = fn(draft);
      const previous = world;
      world = draft;
      let next: Derived;
      try {
        next = derive(world, { rev: nextRev(json(applied.touches)), now: clock(), archify });
      } catch (err) {
        world = previous;
        throw err;
      }
      const before = revs;
      const after = pathRevs(world, next);
      const firstFile = applied.touches[0]?.file ?? "";
      const changedAny =
        [...after].some(([p, r]) => before.get(p) !== r) || after.size !== before.size;
      if (!changedAny) {
        world = previous;
        return store.unchanged(firstFile, issue);
      }
      install(next, after, by, applied.touches, applied.activity);
      return {
        rev,
        file_rev: revs.get(firstFile) ?? "",
        changed: true,
        created: applied.created,
        issue: issue ? store.summary(issue) : undefined,
      };
    },

    unchanged(file, issue) {
      return {
        rev,
        file_rev: revs.get(file) ?? "",
        changed: false,
        issue: issue ? store.summary(issue) : undefined,
      };
    },

    setArchify(on) {
      if (on === archify) return;
      archify = on;
      const before = derived;
      const next = derive(world, { rev: nextRev(`archify:${on}`), now: clock(), archify });
      const nextSigs = sigsOf(next);
      const delta = makeDelta(next, sigs, nextSigs);
      derived = next;
      rev = next.rev;
      sigs = nextSigs;
      emit({ event: "delta", id: rev, data: delta });
      // One `diagram` event per diagram whose status moved.
      for (const [id, d] of next.details) {
        for (const dia of d.diagrams) {
          const was = before.details.get(id)?.diagrams.find((x) => x.id === dia.id);
          if (was?.status !== dia.status)
            emit({
              event: "diagram",
              id: rev,
              data: { hash: dia.hash, status: dia.status, errors: dia.errors },
            });
        }
      }
    },

    reset() {
      world = seed();
      rev = nextRev("reset");
      derived = derive(world, { rev, now: clock(), archify });
      revs = pathRevs(world, derived);
      sigs = sigsOf(derived);
      versions = initialVersions(revs);
      ring = [];
      pending = [];
      overflowed = false;
      emit({ event: "resync", id: rev, data: {} });
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    onConnection(fn) {
      connListeners.add(fn);
      return () => {
        connListeners.delete(fn);
      };
    },
    connection: () => connection,
    setConnection,
    events: () => [...ring],
  };
  return store;
}
