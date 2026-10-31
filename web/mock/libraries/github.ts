// Reading a team library from a GitHub link (spec 4.1 to 4.3), the way the browser does it for a
// public repo: `api.github.com` for the commit and the file list, `raw.githubusercontent.com` for
// the files, pinned to the commit. A private repo or an unreachable GitHub is a typed result, not
// an exception: the Add team library dialog turns each into one plain sentence and a way forward.
//
//   parseGithubLink   the five link forms, and why another host is refused
//   openRepo          repo facts, the commit, the tree (one call, kept by ETag) and a reader
//   rootChoices       where the library is in the repo (spec 4.2)
//   readLibrary       the repo as a `LibrarySource`
//   remoteHead        has the branch moved since the library was read
//
// The fixture `acme/platform-handbook` (mock/teams) is known by name, so the prototype can add a
// library with no network. `moveRemote()` plays a new commit on it (`window.__wf.teams`).
import { mediaKind, nameOf, normalizePath } from "@/features/library/address";
import type { LibrarySource } from "@/lib/api/types";
import { findLibraryRoot, type LibraryManifest, parseManifest, rootCandidates } from "./manifest";
import { humanize } from "./tree";

// ---------------------------------------------------------------- results

export type FailureKind =
  /** The link is on another host. */
  | "not-github"
  /** A GitHub address that names no repo, or no file of one. */
  | "bad-link"
  /** GitHub answered 404: the repo is private or the name is wrong. The agent bridge reads it (L2). */
  | "private"
  /** The page could not talk to GitHub: offline, blocked, or refused. */
  | "unreachable"
  | "rate-limited"
  /** The branch or tag in the link does not exist. */
  | "no-ref"
  /** The repo has no markdown to read. */
  | "empty";

export interface Failure {
  kind: FailureKind;
  /** One plain sentence for the person. */
  message: string;
  /** Rate-limited: when GitHub lets the page ask again (epoch ms). */
  retryAt?: number;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; failure: Failure };

const fail = (kind: FailureKind, message: string, retryAt?: number): Outcome<never> => ({
  ok: false,
  failure: { kind, message, ...(retryAt ? { retryAt } : {}) },
});

// ---------------------------------------------------------------- the link

export type GithubForm = "https" | "tree" | "blob" | "ssh" | "short";

export interface GithubLink {
  owner: string;
  repo: string;
  /** `https://github.com/owner/repo`: what `libraries.toml` keeps. */
  url: string;
  form: GithubForm;
  /** After `/tree/` or `/blob/`. The ref and the path run together, since a branch name may hold slashes. */
  tail: string[];
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SCP = /^[\w.-]+@([\w.-]+):(.+)$/;
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const PLAIN_REPO = "Paste the repo's address, like github.com/acme/handbook.";

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Read a pasted link. Accepted: `https://github.com/o/r`, `…/tree/<ref>/<path>`,
 * `…/blob/<ref>/<path>.md`, `git@github.com:o/r.git` and `o/r`. Any other host is refused with
 * its name, so the sentence can say where the link is.
 */
export function parseGithubLink(raw: string): Outcome<GithubLink> {
  const text = raw.trim();
  if (!text) return fail("bad-link", PLAIN_REPO);

  let host: string;
  let path: string;
  let form: GithubForm = "https";
  const scp = SCP.exec(text);
  const scheme = SCHEME.exec(text);
  if (scp) {
    host = (scp[1] as string).toLowerCase();
    path = scp[2] as string;
    form = "ssh";
  } else if (scheme) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return fail("bad-link", `That does not look like a link. ${PLAIN_REPO}`);
    }
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol))
      return fail("bad-link", `Links that start with ${url.protocol}// do not work. ${PLAIN_REPO}`);
    // A password in a link would end up in libraries.toml.
    if (url.password)
      return fail("bad-link", "Take the password out of the link and paste it again.");
    host = url.hostname.toLowerCase();
    path = url.pathname;
    form = url.protocol === "ssh:" || url.protocol === "git:" ? "ssh" : "https";
  } else {
    const first = text.split("/")[0] as string;
    if (/^[\w-]+\/[\w.-]+\/?$/.test(text)) {
      host = "github.com";
      path = text;
      form = "short";
    } else if (first.includes(".")) {
      host = first.toLowerCase();
      path = text.slice(first.length);
    } else {
      return fail("bad-link", `That does not look like a GitHub repo. ${PLAIN_REPO}`);
    }
  }

  host = host.replace(/^www\./, "");
  if (host === "raw.githubusercontent.com" || host === "gist.github.com")
    return fail(
      "bad-link",
      `That is a ${host === "gist.github.com" ? "gist" : "raw file"} link. ${PLAIN_REPO}`,
    );
  if (host !== "github.com")
    return fail("not-github", `That link is on ${host}. Only GitHub links work for now.`);

  const parts = path.split(/[?#]/)[0]?.split("/").filter(Boolean).map(decode) as string[];
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, "");
  if (!owner) return fail("bad-link", PLAIN_REPO);
  if (!repo)
    return fail(
      "bad-link",
      `That link is ${owner} itself, not one of its repos. Add the repo: github.com/${owner}/handbook.`,
    );
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..")
    return fail("bad-link", `${owner}/${repo} is not a GitHub repo name. ${PLAIN_REPO}`);

  const rest = parts.slice(2);
  const base = { owner, repo, url: `https://github.com/${owner}/${repo}` };
  if (rest.length === 0) return { ok: true, value: { ...base, form, tail: [] } };
  const [kind, ...tail] = rest as [string, ...string[]];
  if ((kind === "tree" || kind === "blob") && tail.length > 0) {
    if (kind === "blob" && (tail.length < 2 || !/\.(md|markdown)$/i.test(tail.at(-1) as string)))
      return fail(
        "bad-link",
        "That link is a file that is not a page. Paste the link of a .md file, or of the repo.",
      );
    return { ok: true, value: { ...base, form: kind, tail } };
  }
  return fail(
    "bad-link",
    `That link points at ${kind}, not at the repo's files. Paste github.com/${owner}/${repo}.`,
  );
}

/** At most this many places the ref can end in a link such as `tree/feature/x/docs`. */
const MAX_REF_SPLITS = 6;

/**
 * Where the ref ends and the path starts. A branch name may hold slashes, so `tree/feature/x/docs`
 * is read as ref `feature` first, then `feature/x`: the first that GitHub knows wins.
 */
export function refSplits(link: GithubLink): { ref: string; path: string }[] {
  const { tail } = link;
  const out: { ref: string; path: string }[] = [];
  // A blob link keeps at least the file name for the path.
  const last = link.form === "blob" ? tail.length - 1 : tail.length;
  for (let i = 1; i <= last && out.length < MAX_REF_SPLITS; i++)
    out.push({ ref: tail.slice(0, i).join("/"), path: tail.slice(i).join("/") });
  return out;
}

// ---------------------------------------------------------------- reading GitHub

export interface GithubDeps {
  fetch: typeof fetch;
  /** What GitHub said last time, by URL, for `If-None-Match`. A 304 costs no rate limit. */
  cache: Map<string, { etag: string; body: unknown }>;
  now: () => number;
}

/** Kept for the life of the page, so a second look at the same repo is a 304. */
const etags: GithubDeps["cache"] = new Map();

const deps = (d?: Partial<GithubDeps>): GithubDeps => ({
  fetch: d?.fetch ?? ((input, init) => globalThis.fetch(input, init)),
  cache: d?.cache ?? etags,
  now: d?.now ?? Date.now,
});

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

interface Reply<T> {
  status: number;
  body?: T;
}

/** One GET of the API. 404 and 422 come back as replies; a block, a limit or no network is a failure. */
async function get<T>(url: string, d: GithubDeps): Promise<Outcome<Reply<T>>> {
  const known = d.cache.get(url);
  const ask = (withEtag: boolean) =>
    d.fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        ...(withEtag && known ? { "if-none-match": known.etag } : {}),
      },
    });
  let res: Response;
  try {
    // A header outside the simple set makes the browser ask first; if that is refused, ask plainly.
    res = known ? await ask(true).catch(() => ask(false)) : await ask(false);
  } catch {
    return fail("unreachable", "Could not reach GitHub from this page.");
  }
  if (res.status === 304 && known)
    return { ok: true, value: { status: 200, body: known.body as T } };
  if (res.status === 200) {
    let body: T;
    try {
      body = (await res.json()) as T;
    } catch {
      return fail("unreachable", "GitHub sent something this page could not read.");
    }
    const etag = res.headers.get("etag");
    if (etag) d.cache.set(url, { etag, body });
    return { ok: true, value: { status: 200, body } };
  }
  if (res.status === 404 || res.status === 422) return { ok: true, value: { status: res.status } };
  const left = res.headers.get("x-ratelimit-remaining");
  if (res.status === 429 || (res.status === 403 && left === "0")) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const retryAt = reset > 0 ? reset * 1000 : d.now() + 60 * 60_000;
    return fail("rate-limited", `GitHub is limiting this page until ${clock(retryAt)}.`, retryAt);
  }
  return fail("unreachable", "Could not reach GitHub from this page.");
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const rawUrl = (link: { owner: string; repo: string }, commit: string, path: string) =>
  `${RAW}/${link.owner}/${link.repo}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;

// ---------------------------------------------------------------- a repo

/** A repo at one commit: its files and how to read them. */
export interface Repo {
  owner: string;
  repo: string;
  url: string;
  description?: string;
  defaultBranch: string;
  /** The branch or tag the files were read at: the link's, else the default branch. */
  ref: string;
  /** Full sha of the commit the tree is from. */
  commit: string;
  committedAt?: string;
  /** First line of the commit message. */
  message?: string;
  author?: string;
  /** Every file, by repo-relative path, and its size. */
  paths: string[];
  sizes: Record<string, number>;
  /** GitHub listed only part of a very large tree. */
  truncated: boolean;
  /** A path in the link (spec 4.2, first rule). */
  hint?: string;
  /** The page a blob link names, repo-relative. */
  page?: string;
  /** The text of a file. Rejects when GitHub does not serve it. */
  read(path: string): Promise<string>;
  /** Where the browser loads a media file from, pinned to the commit. */
  mediaUrl(path: string): string;
  /** Read from the fixture (mock/teams), not from GitHub. */
  fixture?: boolean;
}

interface RepoMeta {
  default_branch: string;
  description: string | null;
  private: boolean;
}

interface CommitReply {
  sha: string;
  commit: {
    message: string;
    committer?: { date?: string };
    author?: { name?: string; date?: string };
    tree: { sha: string };
  };
  author?: { login?: string } | null;
}

interface TreeReply {
  tree: { path: string; type: string; size?: number }[];
  truncated: boolean;
}

const firstLine = (s: string) => s.split("\n")[0]?.trim() ?? "";

/** The fixture a link names, if any: `acme/platform-handbook` in any link form. */
async function fixtureFor(link: GithubLink) {
  const { FIXTURES } = await import("../teams");
  const key = `${link.owner}/${link.repo}`.toLowerCase();
  return FIXTURES.find((f) => `${f.owner}/${f.repo}`.toLowerCase() === key);
}

/**
 * Open a repo: its facts, the commit the link names (else the default branch) and the file list.
 * Three calls, each kept by ETag: the repo, the commit, and the tree of that commit.
 */
export async function openRepo(link: GithubLink, d?: Partial<GithubDeps>): Promise<Outcome<Repo>> {
  const dep = deps(d);
  const fixture = await fixtureFor(link);
  if (fixture) {
    const splits = refSplits(link);
    const hit = splits.find((s) => s.ref === fixture.defaultBranch) ?? splits[0];
    if (hit && hit.ref !== fixture.defaultBranch)
      return fail("no-ref", `${link.owner}/${link.repo} has no branch or tag ${hit.ref}.`);
    const repo = await fixture.open({
      now: dep.now(),
      moved: remoteMoved.has(key(link)),
      ...(hit?.path && link.form === "tree" ? { hint: hit.path } : {}),
    });
    return { ok: true, value: pinBlob(link, repo, hit?.path) };
  }

  const meta = await get<RepoMeta>(`${API}/repos/${link.owner}/${link.repo}`, dep);
  if (!meta.ok) return meta;
  if (meta.value.status === 404 || meta.value.body?.private)
    return fail("private", `${link.owner}/${link.repo} is private, or the name is wrong.`);
  const info = meta.value.body as RepoMeta;

  const splits = refSplits(link);
  const tries = splits.length > 0 ? splits : [{ ref: info.default_branch, path: "" }];
  let found: { ref: string; path: string; commit: CommitReply } | undefined;
  for (const t of tries) {
    const c = await get<CommitReply>(
      `${API}/repos/${link.owner}/${link.repo}/commits/${encodeURIComponent(t.ref)}`,
      dep,
    );
    if (!c.ok) return c;
    if (c.value.status === 200 && c.value.body) {
      found = { ...t, commit: c.value.body };
      break;
    }
  }
  if (!found)
    return splits.length > 0
      ? fail(
          "no-ref",
          `GitHub has no branch or tag named in that link. Paste the repo link instead.`,
        )
      : fail("empty", `${link.owner}/${link.repo} has no commits yet.`);

  const tree = await get<TreeReply>(
    `${API}/repos/${link.owner}/${link.repo}/git/trees/${found.commit.commit.tree.sha}?recursive=1`,
    dep,
  );
  if (!tree.ok) return tree;
  if (tree.value.status !== 200 || !tree.value.body)
    return fail("unreachable", "Could not reach GitHub from this page.");

  const sizes: Record<string, number> = {};
  const paths: string[] = [];
  for (const t of tree.value.body.tree) {
    if (t.type !== "blob") continue;
    paths.push(t.path);
    sizes[t.path] = t.size ?? 0;
  }
  const sha = found.commit.sha;
  const repo: Repo = {
    owner: link.owner,
    repo: link.repo,
    url: link.url,
    ...(info.description ? { description: info.description } : {}),
    defaultBranch: info.default_branch,
    ref: found.ref,
    commit: sha,
    ...(found.commit.commit.committer?.date
      ? { committedAt: found.commit.commit.committer.date }
      : {}),
    message: firstLine(found.commit.commit.message),
    ...((found.commit.author?.login ?? found.commit.commit.author?.name)
      ? { author: found.commit.author?.login ?? found.commit.commit.author?.name }
      : {}),
    paths,
    sizes,
    truncated: tree.value.body.truncated,
    ...(found.path && link.form === "tree" ? { hint: found.path } : {}),
    async read(path) {
      let res: Response;
      try {
        res = await dep.fetch(rawUrl(link, sha, path));
      } catch {
        throw new Error("Could not reach GitHub from this page.");
      }
      if (!res.ok) throw new Error(`GitHub did not serve ${path} (${res.status}).`);
      return res.text();
    },
    mediaUrl: (path) => rawUrl(link, sha, path),
  };
  return { ok: true, value: pinBlob(link, repo, found.path) };
}

/** A blob link names a page: the repo remembers it, repo-relative. */
function pinBlob(link: GithubLink, repo: Repo, path?: string): Repo {
  return link.form === "blob" && path && repo.paths.includes(path) ? { ...repo, page: path } : repo;
}

// ---------------------------------------------------------------- where the library is

/** One place the library can be in the repo, with what it holds. */
export interface RootChoice {
  /** The folder; "" is the repo root. */
  root: string;
  pages: number;
  media: number;
  /** How it was found. */
  by: "link" | "manifest" | "folder" | "repo";
}

export interface Found {
  repo: Repo;
  manifest: LibraryManifest;
  /** One choice when the rules settle it; several when `library/`, `docs/`, `wiki/` or `handbook/` all hold markdown. */
  choices: RootChoice[];
}

const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);
const isHidden = (path: string) =>
  path.split("/").some((s) => s.startsWith(".") || s === "node_modules");
const CONFIG = new Set(["wf-library.toml", "library.toml", "libraries.toml"]);

const under = (root: string, path: string) =>
  root === "" ? path : path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;

/** What the folder `root` holds: markdown pages, media files, and files that are neither. */
export function countsAt(paths: string[], root: string) {
  let pages = 0;
  let media = 0;
  let others = 0;
  for (const p of paths) {
    const rel = under(root, p);
    if (rel === undefined || isHidden(rel)) continue;
    if (isMarkdown(rel)) pages += 1;
    else if (mediaKind(rel)) media += 1;
    else if (!CONFIG.has(nameOf(rel))) others += 1;
  }
  return { pages, media, others };
}

/**
 * Where the library is (spec 4.2): a path in the link, else the manifest's `root`, else the known
 * folders (every one that holds markdown is a choice, the first is the default), else the repo root.
 */
export function rootChoices(
  paths: string[],
  options: { hint?: string; manifest?: LibraryManifest } = {},
): RootChoice[] {
  const at = (root: string, by: RootChoice["by"]): RootChoice => {
    const { pages, media } = countsAt(paths, root);
    return { root, pages, media, by };
  };
  const first = findLibraryRoot(paths, options);
  if (first.by === "link" || first.by === "manifest") return [at(first.root, first.by)];
  if (first.by === "folder") return rootCandidates(paths).map((c) => at(c.root, "folder"));
  return [at("", "repo")];
}

/** Open a link: the repo, its manifest and where the library is. The first step of the dialog. */
export async function findLibrary(raw: string, d?: Partial<GithubDeps>): Promise<Outcome<Found>> {
  const link = parseGithubLink(raw);
  if (!link.ok) return link;
  const opened = await openRepo(link.value, d);
  if (!opened.ok) return opened;
  const repo = opened.value;
  let manifest: LibraryManifest = { order: [], owners: [] };
  if (repo.paths.includes("wf-library.toml")) {
    try {
      manifest = parseManifest(await repo.read("wf-library.toml"));
    } catch {
      // A manifest that cannot be read is skipped: the repo works without one.
    }
  }
  const choices = rootChoices(repo.paths, { hint: repo.hint, manifest }).filter((c) => c.pages > 0);
  if (choices.length === 0)
    return fail(
      "empty",
      `${repo.owner}/${repo.repo} has no markdown files. A library is a folder of .md files.`,
    );
  return { ok: true, value: { repo, manifest, choices } };
}

// ---------------------------------------------------------------- the preview

export interface Preview {
  name: string;
  description?: string;
  pages: number;
  media: number;
  others: number;
  /** The page shown small: the home page, root-relative. */
  page?: string;
  pageTitle?: string;
  pageText?: string;
}

/** The name a library gets: the manifest's, else the repo name read as words. */
export const libraryName = (found: Found) => found.manifest.name ?? humanize(found.repo.repo);

/** The page a visitor lands on: the manifest's `home`, else the root's README or index, else the first file. */
export function homeOf(
  paths: string[],
  root: string,
  manifest: LibraryManifest,
): string | undefined {
  const pages = paths
    .map((p) => under(root, p))
    .filter((p): p is string => p !== undefined && isMarkdown(p) && !isHidden(p))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const names = [manifest.home, "README.md", "readme.md", "index.md"].filter(Boolean) as string[];
  for (const n of names) {
    const hit = pages.find((p) => p.toLowerCase() === normalizePath(n).toLowerCase());
    if (hit) return hit;
  }
  return pages[0];
}

/** What the dialog shows before Add: counts and the first page (one more file read). */
export async function previewLibrary(found: Found, choice: RootChoice): Promise<Preview> {
  const { repo, manifest } = found;
  const counts = countsAt(repo.paths, choice.root);
  const page = homeOf(repo.paths, choice.root, manifest);
  let pageText: string | undefined;
  if (page) {
    try {
      pageText = await repo.read(choice.root ? `${choice.root}/${page}` : page);
    } catch {
      // The preview is a courtesy: the library can still be added.
    }
  }
  return {
    name: libraryName(found),
    ...((manifest.description ?? repo.description)
      ? { description: manifest.description ?? repo.description }
      : {}),
    ...counts,
    ...(page ? { page } : {}),
    ...(pageText !== undefined ? { pageText } : {}),
  };
}

// ---------------------------------------------------------------- the whole library

/** A page larger than this is listed under "Other files" instead of being read. */
export const MAX_PAGE_BYTES = 1_000_000;
/** The most pages one library reads; the dialog says when there were more. */
export const MAX_PAGES = 500;
const CONCURRENCY = 6;

export interface LibraryRead {
  source: LibrarySource;
  /** Pages that were not read: past the limit, too large, or not served. */
  skipped: number;
}

/** Run `fn` over `items`, a few at a time. */
async function pool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++] as T);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

/**
 * Read the library into a `LibrarySource`: every page under the root, the manifest, the media as
 * URLs pinned to the commit, and the other files by name. `progress` hears each page read.
 */
export async function readLibrary(
  found: Found,
  choice: RootChoice,
  alias: string,
  progress?: (done: number, total: number) => void,
): Promise<Outcome<LibraryRead>> {
  const { repo, manifest } = found;
  const inside = repo.paths.filter((p) => {
    const rel = under(choice.root, p);
    return rel !== undefined && !isHidden(rel);
  });
  const all = inside
    .filter(isMarkdown)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const readable = all.filter((p) => (repo.sizes[p] ?? 0) <= MAX_PAGE_BYTES).slice(0, MAX_PAGES);

  const files: Record<string, string> = {};
  let done = 0;
  const queue = repo.paths.includes("wf-library.toml")
    ? ["wf-library.toml", ...readable]
    : readable;
  await pool(queue, async (path) => {
    try {
      files[path] = await repo.read(path);
    } catch {
      // Left out of `files`: counted as skipped below.
    }
    progress?.(++done, queue.length);
  });
  if (Object.keys(files).filter(isMarkdown).length === 0)
    return fail("unreachable", "Could not read the pages from GitHub.");

  const media: LibrarySource["media"] = {};
  const others: string[] = [];
  for (const path of inside) {
    if (isMarkdown(path)) continue;
    if (mediaKind(path)) media[path] = { url: repo.mediaUrl(path), bytes: repo.sizes[path] ?? 0 };
    else if (!CONFIG.has(nameOf(path))) others.push(path);
  }
  // A page that was not read is still a file of the repo: it opens on GitHub.
  const missing = all.filter((path) => !(path in files));
  others.push(...missing);

  const description = manifest.description ?? repo.description;
  return {
    ok: true,
    value: {
      skipped: missing.length,
      source: {
        alias,
        kind: "team",
        name: libraryName(found),
        ...(description ? { description } : {}),
        url: repo.url,
        ref: repo.ref,
        commit: repo.commit.slice(0, 7),
        root: choice.root,
        access: "public",
        files,
        media,
        ...(others.length > 0 ? { others: others.slice(0, 200) } : {}),
      },
    },
  };
}

// ---------------------------------------------------------------- has the remote moved

export interface Head {
  /** Full sha of the branch's tip. */
  commit: string;
  committedAt?: string;
}

const key = (l: { owner: string; repo: string }) => `${l.owner}/${l.repo}`.toLowerCase();

/** The fixture repos whose remote has a newer commit than the one they were read at. */
const remoteMoved = new Set<string>();
const moveListeners = new Set<() => void>();

/** Hear a simulated move of the fixture's remote (the footer asks GitHub again). */
export function onRemoteMoved(fn: () => void): () => void {
  moveListeners.add(fn);
  return () => {
    moveListeners.delete(fn);
  };
}

/**
 * Play a new commit on a fixture repo, as if someone pushed to GitHub. `window.__wf.teams.moveRemote()`.
 * Returns false for a repo that is not a fixture.
 */
export async function moveRemote(repo = "acme/platform-handbook"): Promise<boolean> {
  const { FIXTURES } = await import("../teams");
  if (!FIXTURES.some((f) => `${f.owner}/${f.repo}`.toLowerCase() === repo.toLowerCase()))
    return false;
  remoteMoved.add(repo.toLowerCase());
  for (const fn of [...moveListeners]) fn();
  return true;
}

/** Undo `moveRemote`: the fixture's remote is at the commit it was first read at. */
export function resetRemote(): void {
  remoteMoved.clear();
  for (const fn of [...moveListeners]) fn();
}

/** The tip of a branch now. One call, kept by ETag, so asking again is free until it moves. */
export async function remoteHead(
  url: string,
  ref: string,
  d?: Partial<GithubDeps>,
): Promise<Outcome<Head>> {
  const link = parseGithubLink(url);
  if (!link.ok) return link;
  const fixture = await fixtureFor(link.value);
  if (fixture) {
    const head = fixture.head({
      now: (d?.now ?? Date.now)(),
      moved: remoteMoved.has(key(link.value)),
    });
    return { ok: true, value: head };
  }
  const dep = deps(d);
  const c = await get<CommitReply>(
    `${API}/repos/${link.value.owner}/${link.value.repo}/commits/${encodeURIComponent(ref)}`,
    dep,
  );
  if (!c.ok) return c;
  if (c.value.status !== 200 || !c.value.body)
    return fail(
      "private",
      `${link.value.owner}/${link.value.repo} is private, or has no branch ${ref}.`,
    );
  return {
    ok: true,
    value: {
      commit: c.value.body.sha,
      ...(c.value.body.commit.committer?.date
        ? { committedAt: c.value.body.commit.committer.date }
        : {}),
    },
  };
}

// ---------------------------------------------------------------- prototype controls

/** `window.__wf.teams`: the controls for the fixture's remote. Added once the mock server is there. */
function installControls(): void {
  if (typeof window === "undefined") return;
  const controls = { moveRemote, resetRemote };
  let tries = 0;
  const put = () => {
    const wf = (window as unknown as { __wf?: Record<string, unknown> }).__wf;
    if (wf) wf.teams = controls;
    else if (tries++ < 50) setTimeout(put, 100);
  };
  put();
}

installControls();
