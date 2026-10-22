// The in-memory store behind the mock server. Its state is a set of workspace files (path →
// text): the markdown the daemon would read from disk. Everything else (the sources, the API
// shapes, the lint findings, the revs) is computed from that text by `loadWorkspace` and
// `derive`, after every write.
//
// Writes follow one path. `mutate()` hands the caller a draft copy of the files, the caller edits
// text, and only when the edited files load and derive does the store swap them in. A write that
// throws leaves the store untouched. Each committed write bumps the workspace rev and emits a
// `delta` plus the `activity` events the caller declared. Edits that arrive from outside (a file
// saved in the editor, a file changed on disk) go through `applyChanges()`, which finds out
// who wrote and says so in an activity line.
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
import { type Derived, derive } from "./derive";
import { loadWorkspace } from "./md";
import { isIgnored, normPath } from "./md/paths";
import { rebaseWorkspace, shiftSinceRecording } from "./md/rebase";
import type { LoadedWorkspace } from "./md/types";
import { rawTextUrl } from "./raw-url";
import type { ActivitySrc, IssueSrc, WorldSrc } from "./source";
import { toTs } from "./time";
import { byteLength, rev as hashRev, randomId } from "./util";
import type { WorkspaceDisk } from "./workspace-bus";
import { DISK } from "./workspace-files";

export type Connection = "live" | "reconnecting" | "offline";

/** Events the server keeps for replay (contract 1.10: ring buffer of 256). */
export const RING_SIZE = 256;

/** The largest text file the mock accepts (a guard for the editor, not a product limit). */
export const MAX_FILE_BYTES = 1_000_000;

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

/**
 * Activity that no file records (a status move, a tick). The daemon keeps it in memory and it
 * feeds `last_activity` of the card; it is gone after `reset()`.
 */
export interface ActivityLogItem {
  issue_id: IssueId;
  kind: ActivityKind;
  author: Handle;
  title: string;
}

export interface Applied {
  touches: Touch[];
  activity: ActivityDraft[];
  log?: ActivityLogItem[];
  /** The id a creating write made (issue, group, library item). */
  created?: string;
}

/** The files a write edits. Changes become visible only when the write commits. */
export interface Draft {
  read(path: string): string | undefined;
  write(path: string, text: string): void;
  remove(path: string): void;
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

/** A change to one file from outside the ops: new text, or `null` to delete it. */
export interface FileChange {
  path: string;
  text: string | null;
}

export type ChangeSource = "file" | "disk";

interface FileVersion {
  rev: string;
  touched: Set<string> | "all";
  by: Handle | undefined;
  via: "seed" | "op" | "file" | "disk";
}

export interface StoreOptions {
  /** How many events the server keeps for replay. Default 256 (contract 1.10). */
  ringSize?: number;
  clock?: () => number;
  /** The workspace on disk (recording-frame times). Default: the files under `mock/workspace`. */
  disk?: WorkspaceDisk;
  archify?: boolean;
}

export interface Store {
  /** What the working copy says: the loaded sources, texts, findings, anchors. */
  readonly source: LoadedWorkspace;
  /** The parsed world. Read it; change the files instead. */
  readonly world: WorldSrc;
  readonly derived: Derived;
  readonly rev: string;
  readonly archify: boolean;
  /** The acting author (`config.author`). */
  readonly me: Handle;
  /** Milliseconds the files on disk were moved by, so their times read as recent. */
  readonly shiftMs: number;
  now(): number;
  stamp(): string;
  newId(prefix: string): string;

  summary(id: IssueId): IssueSummary | undefined;
  issueSrc(id: IssueId): IssueSrc | undefined;
  /** Workspace-relative path of a file in an issue folder. */
  filePath(issue: IssueId, file: string): string;
  pathRev(path: string): string | undefined;
  /** Text of a workspace file, or undefined for a missing or binary one. */
  text(path: string): string | undefined;
  /** Every path of the working copy, text and binary, sorted. */
  paths(): string[];
  /** Binary files by path. */
  assets(): Record<string, { url: string; bytes: number }>;

  /** Throw a 409 when `base_rev` is stale for the anchor (see `guard` below). */
  guard(file: string, anchor: string, base: string | undefined, current?: () => unknown): void;
  /** Throw a 409 when `base_rev` is not the current rev of the whole file. */
  guardFile(file: string, base: string | undefined): void;
  mutate(by: Handle, issue: IssueId | undefined, fn: (files: Draft) => Applied): Mutation;
  /** A no-op result for a write that changes nothing. */
  unchanged(file: string, issue?: IssueId): Mutation;
  /**
   * Apply edits that came from outside the ops, as one commit: re-read, derive, delta, and one
   * activity line per file. `by` is who the activity names (`disk` when unknown).
   */
  applyChanges(changes: FileChange[], by: Handle | undefined, via: ChangeSource): boolean;
  /** The files on disk changed (dev server): apply what differs from the working copy. */
  applyDisk(disk: WorkspaceDisk): boolean;
  setArchify(on: boolean): void;
  /** Tell the store which diagrams have a stand-in preview page. */
  setPreviews(ids: Iterable<string>): void;
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

const json = (x: unknown) => JSON.stringify(x);

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Revs of every file: the hash of its text; of a binary file, of its name and size. */
function pathRevs(
  files: ReadonlyMap<string, string>,
  assets: Record<string, { url: string; bytes: number }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, text] of files) out.set(path, hashRev(text));
  for (const [path, a] of Object.entries(assets)) out.set(path, hashRev(`${path}:${a.bytes}`));
  return out;
}

/** Content signatures used to diff two derivations into a delta. */
interface Sigs {
  issues: Map<string, string>;
  details: Map<string, string>;
  library: Map<string, string>;
  libraryDetails: Map<string, string>;
  groups: string;
  inbox: string;
  /** Config, authors and glossary: not part of a delta, so a change asks clients to resync. */
  meta: string;
}

function sigsOf(d: Derived, world: WorldSrc): Sigs {
  return {
    issues: new Map(d.snapshot.issues.map((i) => [i.id, json(i)])),
    details: new Map([...d.details].map(([id, det]) => [id, json(det)])),
    library: new Map(d.snapshot.library.map((l) => [l.id, json(l)])),
    libraryDetails: new Map([...d.library].map(([id, det]) => [id, json(det)])),
    groups: json(d.snapshot.groups),
    inbox: json(d.snapshot.inbox),
    meta: json([d.snapshot.config, d.snapshot.authors, world.glossary]),
  };
}

function makeDelta(next: Derived, prev: Sigs, now: Sigs): DeltaEvent {
  const issues_upserted = next.snapshot.issues.filter(
    (i) => prev.issues.get(i.id) !== now.issues.get(i.id),
  );
  const issues_removed = [...prev.issues.keys()].filter((id) => !now.issues.has(id));
  // A library item counts as changed when its body changed too, so open detail views refetch.
  const library_upserted = next.snapshot.library.filter(
    (l) =>
      prev.library.get(l.id) !== now.library.get(l.id) ||
      prev.libraryDetails.get(l.id) !== now.libraryDetails.get(l.id),
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

/** The activity kind a hand edit of a file stands for. */
function kindOfFile(path: string): ActivityKind {
  switch (basename(path)) {
    case "changes.md":
      return "change";
    case "decisions.md":
      return "decision";
    case "learnings.md":
      return "learning";
    case "goal.md":
      return "status";
    default:
      return "state";
  }
}

/** Entry ids and authors per issue, to find out who wrote a new entry. */
function entryAuthors(w: WorldSrc): Map<IssueId, Map<string, Handle>> {
  const out = new Map<IssueId, Map<string, Handle>>();
  for (const i of w.issues) {
    const m = new Map<string, Handle>();
    for (const e of [...i.changes, ...i.decisions, ...i.learnings]) m.set(e.id, e.author);
    out.set(i.goal.id, m);
  }
  return out;
}

class DraftFiles implements Draft {
  readonly files: Map<string, string>;
  constructor(base: ReadonlyMap<string, string>) {
    this.files = new Map(base);
  }
  // Arrow properties, so a caller may pass `draft.read` around without losing `this`.
  read = (path: string) => this.files.get(path);
  write = (path: string, text: string) => {
    this.files.set(path, text);
  };
  remove = (path: string) => {
    this.files.delete(path);
  };
}

/** The file an error talks about, as the people who wrote it would call it. */
function conflictReason(file: string, v: FileVersion | undefined): string {
  const name = basename(file);
  if (v?.via === "disk") return `${name} changed on disk`;
  return v?.by ? `${name} changed by @${v.by}` : `${name} changed since you loaded it`;
}

// ---------------------------------------------------------------- the store

interface Built {
  source: LoadedWorkspace;
  derived: Derived;
}

export function createStore(options: StoreOptions = {}): Store {
  const clock = options.clock ?? Date.now;
  const ringSize = options.ringSize ?? RING_SIZE;

  let archify = options.archify ?? false;
  let seq = 0;

  // The files on disk, as the bundler last saw them (recording-frame times). The working copy
  // is the same files after the clock shift; ops and hand edits change only the working copy.
  let disk: WorkspaceDisk = options.disk ?? DISK;
  let shiftMs = 0;
  let loadedAt = clock();
  let files = new Map<string, string>();
  let assets: Record<string, { url: string; bytes: number }> = {};
  let previews = new Set<string>();
  let activityLog = new Map<IssueId, ActivitySrc[]>();

  function rebase(text: Record<string, string>): Record<string, string> {
    return rebaseWorkspace(text, shiftMs);
  }

  function takeDisk(from: WorkspaceDisk) {
    disk = from;
    shiftMs = shiftSinceRecording(clock());
    loadedAt = clock();
    files = new Map(Object.entries(rebase(from.text)));
    assets = { ...from.assets };
    previews = new Set(from.previews);
    activityLog = new Map();
  }
  takeDisk(disk);

  function nextRev(note: string): string {
    seq += 1;
    return hashRev(`${seq}|${note}`);
  }

  /** Load and derive the files. Throws when either fails; the caller keeps the old state. */
  function build(
    from: ReadonlyMap<string, string>,
    log: Map<IssueId, ActivitySrc[]>,
    revision: string,
  ): Built {
    const source = loadWorkspace(Object.fromEntries(from), { binary: assets, now: loadedAt });
    // What no file records (status moves, ticks) is kept in memory and feeds `last_activity`.
    for (const src of source.world.issues) {
      const items = log.get(src.goal.id);
      if (items?.length) src.activity = items.map((x) => ({ ...x }));
    }
    const derived = derive(source, {
      rev: revision,
      now: clock(),
      archify,
      previews,
      rawUrl: rawTextUrl,
    });
    return { source, derived };
  }

  let rev = nextRev("seed");
  let built = build(files, activityLog, rev);
  let revs = pathRevs(files, assets);
  let sigs = sigsOf(built.derived, built.source.world);
  let versions = initialVersions(revs);

  const listeners = new Set<(e: ServerEvent) => void>();
  const connListeners = new Set<(s: Connection) => void>();
  let connection: Connection = "live";
  let ring: ServerEvent[] = [];
  let pending: ServerEvent[] = [];
  let overflowed = false;

  function initialVersions(map: Map<string, string>): Map<string, FileVersion[]> {
    return new Map(
      [...map].map(([path, r]) => [
        path,
        [{ rev: r, touched: new Set<string>(), by: undefined, via: "seed" as const }],
      ]),
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

  interface Commit {
    files: Map<string, string>;
    built: Built;
    log: Map<IssueId, ActivitySrc[]>;
    by: Handle | undefined;
    via: FileVersion["via"];
    touches: Touch[];
    drafts: ActivityDraft[];
  }

  function install(c: Commit) {
    const nextRevs = pathRevs(c.files, assets);
    const nextSigs = sigsOf(c.built.derived, c.built.source.world);
    const delta = makeDelta(c.built.derived, sigs, nextSigs);

    // File history: touched anchors where the write said so, the whole file otherwise.
    for (const [path, r] of nextRevs) {
      const log = versions.get(path) ?? [];
      if (log.at(-1)?.rev === r) continue;
      const touch = c.touches.find((t) => t.file === path);
      const touched = !touch || touch.anchors === "all" ? "all" : new Set(touch.anchors);
      log.push({
        rev: r,
        touched: log.length === 0 ? new Set<string>() : touched,
        by: c.by,
        via: c.via,
      });
      versions.set(path, log);
    }
    for (const path of versions.keys()) if (!nextRevs.has(path)) versions.delete(path);

    const metaChanged = nextSigs.meta !== sigs.meta;
    files = c.files;
    activityLog = c.log;
    built = c.built;
    rev = c.built.derived.rev;
    revs = nextRevs;
    sigs = nextSigs;

    emit({ event: "delta", id: rev, data: delta });
    const ts = toTs(clock());
    for (const a of c.drafts) emit({ event: "activity", id: rev, data: { rev, ts, ...a } });
    // Config, authors and the glossary are not in a delta: ask clients to read them again.
    if (metaChanged) emit({ event: "resync", id: rev, data: {} });
    return delta;
  }

  /** Add a commit's activity log items to the log, with the instant they happened. */
  function extendLog(applied: ActivityLogItem[] | undefined): Map<IssueId, ActivitySrc[]> {
    if (!applied?.length) return activityLog;
    const next = new Map(activityLog);
    const ts = toTs(clock());
    for (const { issue_id, author, kind, title } of applied)
      next.set(issue_id, [...(next.get(issue_id) ?? []), { ts, author, kind, title }]);
    return next;
  }

  /** The text files whose content differs between the working copy and a draft of it. */
  function changedPaths(draft: ReadonlyMap<string, string>): Set<string> {
    const changed = new Set<string>();
    for (const [p, text] of draft) if (files.get(p) !== text) changed.add(p);
    for (const p of files.keys()) if (!draft.has(p)) changed.add(p);
    return changed;
  }

  // ---- external edits: a file saved in the editor, a file changed on disk

  /** Who an edit names: the author of the entry it added, else the one that updated the state. */
  function inferAuthor(path: string, before: LoadedWorkspace, after: LoadedWorkspace) {
    const issue = Object.entries(after.issueDirs).find(([, dir]) => path.startsWith(`${dir}/`));
    if (!issue) return undefined;
    const [id] = issue;
    const known = entryAuthors(before.world).get(id) ?? new Map<string, Handle>();
    const now = after.world.issues.find((i) => i.goal.id === id);
    if (!now) return undefined;
    const added = [...now.changes, ...now.decisions, ...now.learnings].filter(
      (e) => !known.has(e.id),
    );
    const last = added.at(-1);
    if (last) return last.author;
    const was = before.world.issues.find((i) => i.goal.id === id)?.state;
    if (
      was &&
      now.state &&
      basename(path) === "current_state.md" &&
      was.updated_at !== now.state.updated_at
    )
      return now.state.updated_by;
    return undefined;
  }

  function describeChange(
    c: FileChange,
    existed: boolean,
    by: Handle | undefined,
    before: LoadedWorkspace,
    after: LoadedWorkspace,
  ): ActivityDraft {
    const author = by ?? inferAuthor(c.path, before, after) ?? "disk";
    const verb = c.text === null ? "deleted" : existed ? "edited" : "created";
    const dirs = Object.entries(after.issueDirs).concat(Object.entries(before.issueDirs));
    const owner = dirs.find(([, dir]) => c.path.startsWith(`${dir}/`));
    return {
      issue_id: owner?.[0] ?? "",
      kind: kindOfFile(c.path),
      author,
      title: `@${author} ${verb} ${basename(c.path)}`,
    };
  }

  function applyChanges(changes: FileChange[], by: Handle | undefined, via: ChangeSource) {
    const draft = new DraftFiles(files);
    const existed = new Map<string, boolean>();
    for (const c of changes) {
      existed.set(c.path, files.has(c.path));
      if (c.text === null) draft.remove(c.path);
      else draft.write(c.path, c.text);
    }
    const changed = changedPaths(draft.files);
    if (changed.size === 0) return false;

    const next = build(draft.files, activityLog, nextRev(`${via}:${[...changed].join(",")}`));
    const drafts = changes
      .filter((c) => changed.has(c.path))
      .slice(0, 12)
      .map((c) => describeChange(c, existed.get(c.path) ?? false, by, built.source, next.source));
    install({
      files: draft.files,
      built: next,
      log: activityLog,
      by,
      via,
      touches: [],
      drafts,
    });
    return true;
  }

  // ---- public

  const store: Store = {
    get source() {
      return built.source;
    },
    get world() {
      return built.source.world;
    },
    get derived() {
      return built.derived;
    },
    get rev() {
      return rev;
    },
    get archify() {
      return archify;
    },
    get me() {
      return built.source.world.config.author;
    },
    get shiftMs() {
      return shiftMs;
    },
    now: clock,
    stamp: () => toTs(clock()),

    newId(prefix) {
      const taken = allIds(built.source.world);
      return randomId((id) => taken.has(id), prefix);
    },

    summary: (id) => built.derived.snapshot.issues.find((i) => i.id === id),
    issueSrc: (id) => built.source.world.issues.find((i) => i.goal.id === id),
    filePath: (issue, file) => `${built.derived.dirs.get(issue) ?? issue}/${file}`,
    pathRev: (path) => revs.get(path),
    text: (path) => files.get(path),
    paths: () => [...files.keys(), ...Object.keys(assets)].sort(),
    assets: () => assets,

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
      const last = at >= 0 ? moved.at(-1) : latest;
      throw new ApiError(409, {
        reason: conflictReason(file, last),
        file,
        by: last?.by,
        current: current?.() ?? null,
      });
    },

    guardFile(file, base) {
      if (base === undefined) return;
      const latest = versions.get(file)?.at(-1);
      if (!latest) {
        throw new ApiError(409, {
          reason: `${basename(file)} was deleted`,
          file,
          current: null,
        });
      }
      if (base === latest.rev) return;
      throw new ApiError(409, {
        reason: conflictReason(file, latest),
        file,
        by: latest.by,
        current: null,
      });
    },

    mutate(by, issue, fn) {
      const draft = new DraftFiles(files);
      const applied = fn(draft);
      const changed = changedPaths(draft.files);
      const firstFile = applied.touches[0]?.file ?? "";
      if (changed.size === 0) return store.unchanged(firstFile, issue);
      const log = extendLog(applied.log);
      const next = build(draft.files, log, nextRev(json(applied.touches)));
      install({
        files: draft.files,
        built: next,
        log,
        by,
        via: "op",
        touches: applied.touches,
        drafts: applied.activity,
      });
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

    applyChanges,

    applyDisk(next) {
      const edits: FileChange[] = [];
      const paths = new Set([...Object.keys(disk.text), ...Object.keys(next.text)]);
      const moved: Record<string, string> = {};
      for (const p of paths) {
        const was = disk.text[p];
        const now = next.text[p];
        if (was === now) continue;
        if (now === undefined) edits.push({ path: p, text: null });
        else moved[p] = now;
      }
      // The same shift as the working copy, so a time typed into a file reads like the others.
      const shifted = rebase(moved);
      // A disk update whose text the store already holds is an echo: skip it.
      for (const [p, text] of Object.entries(shifted)) {
        if (files.get(p) !== text) edits.push({ path: p, text });
      }
      const gone = edits.filter((e) => e.text === null && !files.has(e.path));
      const real = edits.filter((e) => !gone.includes(e));

      const assetsChanged = json(next.assets) !== json(disk.assets);
      const previewsChanged = json([...next.previews].sort()) !== json([...disk.previews].sort());
      disk = next;
      if (previewsChanged) previews = new Set(next.previews);
      if (assetsChanged) assets = { ...next.assets };

      if (real.length > 0) {
        const done = applyChanges(real, undefined, "disk");
        if (done) return true;
      }
      if (assetsChanged || previewsChanged) {
        refresh("disk");
        return true;
      }
      return false;
    },

    setArchify(on) {
      if (on === archify) return;
      archify = on;
      refresh(`archify:${on}`);
    },

    setPreviews(ids) {
      const next = new Set(ids);
      if (json([...next].sort()) === json([...previews].sort())) return;
      previews = next;
      refresh("previews");
    },

    reset() {
      takeDisk(disk);
      rev = nextRev("reset");
      built = build(files, activityLog, rev);
      revs = pathRevs(files, assets);
      sigs = sigsOf(built.derived, built.source.world);
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

  /** Derive again from the same files (archify switched, previews changed) and emit the delta. */
  function refresh(note: string) {
    const before = built.derived;
    const next = build(files, activityLog, nextRev(note));
    const nextSigs = sigsOf(next.derived, next.source.world);
    const delta = makeDelta(next.derived, sigs, nextSigs);
    built = next;
    rev = next.derived.rev;
    revs = pathRevs(files, assets);
    sigs = nextSigs;
    emit({ event: "delta", id: rev, data: delta });
    // One `diagram` event per diagram whose status moved.
    for (const [id, d] of next.derived.details) {
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
  }

  return store;
}

// ---------------------------------------------------------------- paths for the file API

/** A workspace path from a request, or the reason it is refused. */
export function checkPath(raw: string): { path: string } | { error: string } {
  const path = normPath(raw.trim());
  if (!path) return { error: "Give the file a path." };
  if (path.endsWith("/")) return { error: "A file path does not end with a slash." };
  if (path.split("/").some((part) => part === ".." || part === "." || part === ""))
    return { error: "A path cannot hold empty, `.` or `..` segments." };
  if (isIgnored(path)) return { error: `wf ignores ${path}. Pick another name.` };
  if (byteLength(path) > 400) return { error: "That path is too long." };
  return { path };
}
