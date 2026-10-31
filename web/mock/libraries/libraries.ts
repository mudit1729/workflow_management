// The libraries of one mock server: the workspace library (read from the store), the person's
// personal library (the files under `mock/personal`, with the edits made in the browser) and any
// team libraries added at runtime. It builds a `Corpus` (tree, pages, links, search) when something
// changed and answers the library endpoints from it.
//
// Team libraries are listed in the personal library's `libraries.toml` (spec 4.4), so the list
// stays markdown-grounded: `registerLibrary` appends a `[[team]]` block to that text and `unregisterLibrary`
// removes it. The files of a team library are held in memory; a real build would fetch them from
// GitHub or the bridge.
import { parse } from "smol-toml";
import { PERSONAL_ALIAS } from "@/features/library/address";
import { ApiError, NotFoundError } from "@/lib/api/error";
import type {
  LibraryInfo,
  LibraryMedia,
  LibraryPage,
  LibraryPassage,
  LibraryScope,
  LibrarySource,
  LibraryTree,
  PageRef,
  ResolvedAddress,
} from "@/lib/api/types";
import type { Store } from "../store";
import { toDate } from "../time";
import { byteLength, rev } from "../util";
import type { WorkspaceDisk } from "../workspace-bus";
import { buildCorpus, type Corpus } from "./corpus";
import { parseManifest } from "./manifest";
import { workspaceAlias, workspaceFacts, workspaceSignature, workspaceSource } from "./workspace";

/** The largest page the mock accepts, as for workspace files. */
const MAX_PAGE_BYTES = 1_000_000;

/** An alias as a link can write it. `me` and `t` are taken by the routes. */
const ALIAS = /^[a-z0-9][a-z0-9_-]*$/;
const RESERVED = new Set([PERSONAL_ALIAS, "t"]);

/** One `[[team]]` block of `libraries.toml`. */
export interface TeamEntry {
  alias: string;
  url: string;
  ref?: string;
  root?: string;
  access?: "public" | "bridge";
  /** `YYYY-MM-DD`. */
  added?: string;
}

export interface LibrariesOptions {
  /** The files of the personal library on disk. Default: nothing. */
  personal?: WorkspaceDisk;
  /** More personal files, shown only while the sample world is loaded (work summaries of sample issues). */
  personalSample?: WorkspaceDisk;
}

export interface Libraries {
  /** The workspace library first, then the personal one, then team libraries in the order added. */
  list(): LibraryInfo[];
  tree(alias: string): LibraryTree;
  page(alias: string, path: string): LibraryPage;
  search(query: string, scope?: LibraryScope, k?: number): LibraryPassage[];
  backlinks(address: string): PageRef[];
  resolve(raw: string, from?: { alias: string; path: string }): ResolvedAddress;
  /** Write a page of the personal library. Creates it when missing. */
  savePage(args: { alias: string; path: string; text: string; base_rev?: string }): {
    rev: string;
    commit: string;
  };
  deletePage(args: { alias: string; path: string }): void;
  /** Add a media file to the personal library (a pasted or dropped image or video). */
  saveMedia(args: { alias: string; path: string; media: LibraryMedia }): void;
  /** Add a team library, or replace the one with the same alias. Writes its `[[team]]` block. */
  registerLibrary(source: LibrarySource): LibraryInfo;
  /** Remove a team library and its `[[team]]` block. */
  unregisterLibrary(alias: string): void;
  /** The team libraries `libraries.toml` lists, loaded or not. */
  teamEntries(): TeamEntry[];
  /** Hear every change that can alter an answer: the workspace library, the personal files, the teams. */
  subscribe(fn: () => void): () => void;
  /** The personal files on disk changed (dev server). */
  applyPersonalDisk(personal: WorkspaceDisk, sample: WorkspaceDisk): void;
  /** Back to the shipped personal files, and no team libraries. */
  reset(): void;
  dispose(): void;
}

const empty: WorkspaceDisk = { text: {}, assets: {}, previews: [] };

// ---------------------------------------------------------------- libraries.toml

/** The `[[team]]` blocks of a `libraries.toml`. A file that is not valid TOML lists none. */
export function parseTeamEntries(text: string | undefined): TeamEntry[] {
  if (!text) return [];
  try {
    const data = parse(text) as { team?: Record<string, unknown>[] };
    return (data.team ?? []).flatMap((t) => {
      if (typeof t.alias !== "string" || typeof t.url !== "string") return [];
      const access = t.access === "bridge" || t.access === "public" ? t.access : undefined;
      return [
        {
          alias: t.alias,
          url: t.url,
          ...(typeof t.ref === "string" ? { ref: t.ref } : {}),
          ...(typeof t.root === "string" ? { root: t.root } : {}),
          ...(access ? { access } : {}),
          ...(t.added
            ? {
                added: String(
                  t.added instanceof Date ? t.added.toISOString().slice(0, 10) : t.added,
                ),
              }
            : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

const quote = (s: string) => JSON.stringify(s);

function teamBlock(e: TeamEntry): string {
  return [
    "[[team]]",
    `alias = ${quote(e.alias)}`,
    `url = ${quote(e.url)}`,
    ...(e.ref ? [`ref = ${quote(e.ref)}`] : []),
    ...(e.root ? [`root = ${quote(e.root)}`] : []),
    ...(e.access ? [`access = ${quote(e.access)}`] : []),
    ...(e.added ? [`added = ${e.added}`] : []),
    "",
  ].join("\n");
}

/** Split a `libraries.toml` into the text before the first `[[team]]` and one text per block. */
function blocksOf(text: string): { head: string; blocks: { alias?: string; text: string }[] } {
  const parts = text.split(/^(?=\[\[team\]\][ \t]*$)/m);
  const head = parts[0]?.startsWith("[[team]]") ? "" : (parts.shift() ?? "");
  return {
    head,
    blocks: parts.map((t) => ({ alias: /^alias\s*=\s*"([^"]*)"/m.exec(t)?.[1], text: t })),
  };
}

/** The text of `libraries.toml` with the block of `entry.alias` added or replaced. */
export function withTeamEntry(text: string, entry: TeamEntry): string {
  const { head, blocks } = blocksOf(text);
  const next = teamBlock(entry);
  const at = blocks.findIndex((b) => b.alias === entry.alias);
  if (at === -1) blocks.push({ alias: entry.alias, text: next });
  else blocks[at] = { alias: entry.alias, text: next };
  return join(
    head,
    blocks.map((b) => b.text),
  );
}

/** The text of `libraries.toml` without the block of `alias`. */
export function withoutTeamEntry(text: string, alias: string): string {
  const { head, blocks } = blocksOf(text);
  return join(
    head,
    blocks.filter((b) => b.alias !== alias).map((b) => b.text),
  );
}

function join(head: string, blocks: string[]): string {
  const lead = head.trimEnd();
  const body = blocks.map((b) => b.trimEnd()).join("\n\n");
  return `${[lead, body].filter(Boolean).join("\n\n")}\n`;
}

// ---------------------------------------------------------------- the registry

const PERSONAL_FILES = {
  manifest: "library.toml",
  teams: "libraries.toml",
};

export function createLibraries(store: Store, options: LibrariesOptions = {}): Libraries {
  let base = options.personal ?? empty;
  let sample = options.personalSample ?? empty;
  /** What the browser changed in the personal library: text (or null: deleted) by path. */
  let edits = new Map<string, string | null>();
  let mediaEdits = new Map<string, LibraryMedia>();
  const teams = new Map<string, LibrarySource>();
  /** Bumped by every change made here; the workspace has its own signature. */
  let local = 0;
  let built: { key: string; corpus: Corpus } | undefined;
  const listeners = new Set<() => void>();

  // ---- the personal library

  function personalFiles(): Record<string, string> {
    const files: Record<string, string> = {
      ...base.text,
      ...(store.sampleLoaded ? sample.text : {}),
    };
    for (const [path, text] of edits) {
      if (text === null) delete files[path];
      else files[path] = text;
    }
    return files;
  }

  function personalSource(): LibrarySource {
    const files = personalFiles();
    const manifest = parseManifest(files[PERSONAL_FILES.manifest]);
    const handle = store.me;
    return {
      alias: PERSONAL_ALIAS,
      kind: "personal",
      name: manifest.name ?? "Personal library",
      ...(manifest.description ? { description: manifest.description } : {}),
      url: manifest.url ?? `https://github.com/${handle}/wf-library`,
      access: "bridge",
      // A personal repo is the library: the folder rules of 4.2 are for a team's repo.
      root: "",
      files,
      media: {
        ...base.assets,
        ...(store.sampleLoaded ? sample.assets : {}),
        ...Object.fromEntries(mediaEdits),
      },
    };
  }

  // ---- the corpus

  function key(): string {
    return `${workspaceSignature(store)}#${store.sampleLoaded ? 1 : 0}#${local}`;
  }

  function corpus(): Corpus {
    const k = key();
    if (built?.key !== k) {
      const sources = [workspaceSource(store), personalSource(), ...teams.values()];
      built = { key: k, corpus: buildCorpus(sources, workspaceFacts(store)) };
    }
    return built.corpus;
  }

  // ---- change notification

  let heard = key();
  function changed() {
    const k = key();
    if (k === heard) return;
    heard = k;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (err) {
        console.error("library listener failed", err);
      }
    }
  }
  const stopStore = store.subscribe(() => changed());

  function touch() {
    local += 1;
    changed();
  }

  // ---- reads

  const missing = (what: string) => new NotFoundError(what);

  function teamEntries(): TeamEntry[] {
    return parseTeamEntries(personalFiles()[PERSONAL_FILES.teams]);
  }

  function list(): LibraryInfo[] {
    const c = corpus();
    const infos = c.infos();
    // A library listed in libraries.toml whose files nobody has loaded is still listed.
    for (const entry of teamEntries()) {
      if (c.info(entry.alias)) continue;
      infos.push({
        alias: entry.alias,
        kind: "team",
        name: entry.alias,
        url: entry.url,
        ...(entry.ref ? { ref: entry.ref } : {}),
        ...(entry.root ? { root: entry.root } : {}),
        ...(entry.access ? { access: entry.access } : {}),
        pages: 0,
        media: 0,
        others: 0,
        home: null,
        editable: false,
        loaded: false,
      });
    }
    return infos;
  }

  // ---- writes

  const invalid = (...gaps: string[]) => new ApiError(422, { diagnostics: [], gaps });

  function personalPath(alias: string, raw: string): string {
    if (alias !== PERSONAL_ALIAS) throw invalid("Only the personal library can be edited here.");
    const path = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path || path.split("/").some((s) => s === ".." || s === "." || s === ""))
      throw invalid(`${raw} is not a path inside the library.`);
    return path;
  }

  function writeText(path: string, text: string | null) {
    edits = new Map(edits).set(path, text);
    touch();
  }

  return {
    list,
    tree: (alias) => {
      const tree = corpus().tree(alias);
      if (!tree) throw missing(`Library ${alias}`);
      return tree;
    },
    page: (alias, path) => {
      const page = corpus().page(alias, path);
      if (!page) throw missing(`Page ${alias}:${path}`);
      return page;
    },
    search: (query, scope, k) => corpus().search(query, scope, k),
    backlinks: (address) => corpus().backlinks(address),
    resolve: (raw, from) => corpus().resolve(raw, from),

    savePage: ({ alias, path: raw, text, base_rev }) => {
      const path = personalPath(alias, raw);
      if (!/\.md$/i.test(path)) throw invalid("A page is a markdown file: its name ends in .md.");
      if (byteLength(text) > MAX_PAGE_BYTES) throw invalid("That page is too large to save.");
      const current = personalFiles()[path];
      if (base_rev !== undefined && current !== undefined && rev(current) !== base_rev)
        throw new ApiError(409, {
          reason: `${path.slice(path.lastIndexOf("/") + 1)} changed by @disk`,
          file: path,
          by: "disk",
          current: null,
        });
      writeText(path, text);
      // The bridge would commit and push; the prototype names the commit it would have made.
      const hash = rev(text);
      return { rev: hash, commit: hash.slice(0, 7) };
    },
    deletePage: ({ alias, path: raw }) => {
      const path = personalPath(alias, raw);
      if (personalFiles()[path] === undefined) throw missing(`Page ${alias}:${path}`);
      writeText(path, null);
    },
    saveMedia: ({ alias, path: raw, media }) => {
      const path = personalPath(alias, raw);
      mediaEdits = new Map(mediaEdits).set(path, media);
      touch();
    },

    registerLibrary: (source) => {
      const alias = source.alias.trim().toLowerCase();
      if (!ALIAS.test(alias))
        throw invalid(`${source.alias} cannot be an alias. Use letters, digits, - and _.`);
      if (RESERVED.has(alias) || alias === workspaceAlias(store))
        throw invalid(`The alias ${alias} is taken. Pick another.`);
      if (source.kind !== "team") throw invalid("Only a team library can be added.");
      teams.set(alias, { ...source, alias });
      if (source.url) {
        const text = personalFiles()[PERSONAL_FILES.teams] ?? "";
        writeText(
          PERSONAL_FILES.teams,
          withTeamEntry(text, {
            alias,
            url: source.url,
            ...(source.ref ? { ref: source.ref } : {}),
            ...(source.root ? { root: source.root } : {}),
            ...(source.access === "public" || source.access === "bridge"
              ? { access: source.access }
              : {}),
            added: toDate(store.now()),
          }),
        );
      } else touch();
      const info = corpus().info(alias);
      if (!info) throw missing(`Library ${alias}`);
      return info;
    },
    unregisterLibrary: (alias) => {
      if (alias === PERSONAL_ALIAS || alias === workspaceAlias(store))
        throw invalid("The workspace library and the personal library stay.");
      const listed = teamEntries().some((e) => e.alias === alias);
      if (!teams.has(alias) && !listed) throw missing(`Library ${alias}`);
      teams.delete(alias);
      if (listed)
        writeText(
          PERSONAL_FILES.teams,
          withoutTeamEntry(personalFiles()[PERSONAL_FILES.teams] ?? "", alias),
        );
      else touch();
    },
    teamEntries,

    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    applyPersonalDisk: (personal, extra) => {
      base = personal;
      sample = extra;
      touch();
    },
    reset: () => {
      edits = new Map();
      mediaEdits = new Map();
      teams.clear();
      base = options.personal ?? empty;
      sample = options.personalSample ?? empty;
      touch();
    },
    dispose: () => {
      stopStore();
      listeners.clear();
    },
  };
}
