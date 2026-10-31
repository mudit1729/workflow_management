// Fixture team repos: GitHub repos the prototype can read with no network. Each folder here is the
// repo as GitHub would hold it, root included, so `acme-platform-handbook/` stands for
// https://github.com/acme/platform-handbook (a `wf-library.toml` that points at `docs/`, ten
// pages in three sections, a GIF, a video and an alert file). The link resolver in
// `libraries/github.ts` checks these first, in any of the link forms, and reads them through the
// same `Repo` interface it uses for a real repo.
//
// A second folder, `acme-platform-handbook-next/`, holds only the files a newer commit changes or
// adds. `window.__wf.teams.moveRemote()` plays that commit, so the page footer can offer Update.
import type { Head, Repo } from "../libraries/github";

/** Text files by glob key: each loads on demand, so the pages are not in the first bundle. */
const base = import.meta.glob("./acme-platform-handbook/**/*.{md,toml,yaml}", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;
const next = import.meta.glob("./acme-platform-handbook-next/**/*.{md,toml,yaml}", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;
// `?wf-asset` is the small plugin of vite.config.ts: the asset URL plus the file size.
const media = import.meta.glob(
  "./acme-platform-handbook/**/*.{png,jpg,jpeg,gif,svg,webp,mp4,webm}",
  {
    query: "?wf-asset",
    import: "default",
    eager: true,
  },
) as Record<string, { url: string; bytes: number } | string>;

const DAY = 86_400_000;

/** A commit of a fixture repo: how long before now it was made. */
interface Commit {
  sha: string;
  ago: number;
  message: string;
  author: string;
}

const COMMITS: { head: Commit; moved: Commit } = {
  head: {
    sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    ago: 2 * DAY,
    message: "Add the signing key rotation runbook",
    author: "li",
  },
  moved: {
    sha: "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3",
    ago: 20 * 60_000,
    message: "Add the high latency runbook",
    author: "ana",
  },
};

export interface FixtureRepo {
  owner: string;
  repo: string;
  defaultBranch: string;
  /** The repo as it is now (or at the commit that `moveRemote` played), read through `Repo`. */
  open(args: { now: number; moved: boolean; hint?: string }): Promise<Repo>;
  /** The tip of the default branch. */
  head(args: { now: number; moved: boolean }): Head;
}

const strip = (prefix: string, key: string) => key.slice(prefix.length);

/** The files of the handbook at a commit: the base, and over it the files the newer commit touches. */
function handbook(moved: boolean) {
  const loaders = new Map<string, () => Promise<string>>();
  for (const [key, load] of Object.entries(base))
    loaders.set(strip("./acme-platform-handbook/", key), load);
  if (moved)
    for (const [key, load] of Object.entries(next))
      loaders.set(strip("./acme-platform-handbook-next/", key), load);
  const assets = new Map<string, { url: string; bytes: number }>();
  for (const [key, value] of Object.entries(media))
    assets.set(
      strip("./acme-platform-handbook/", key),
      typeof value === "string" ? { url: value, bytes: 0 } : value,
    );
  return { loaders, assets };
}

const headOf = (c: Commit, now: number): Head => ({
  commit: c.sha,
  committedAt: new Date(now - c.ago).toISOString(),
});

const platformHandbook: FixtureRepo = {
  owner: "acme",
  repo: "platform-handbook",
  defaultBranch: "main",
  async open({ now, moved, hint }) {
    const { loaders, assets } = handbook(moved);
    const commit = moved ? COMMITS.moved : COMMITS.head;
    const paths = [...loaders.keys(), ...assets.keys()].sort();
    const sizes = Object.fromEntries([...assets].map(([path, a]) => [path, a.bytes]));
    return {
      owner: "acme",
      repo: "platform-handbook",
      url: "https://github.com/acme/platform-handbook",
      description: "The platform team's handbook",
      defaultBranch: "main",
      ref: "main",
      commit: commit.sha,
      committedAt: headOf(commit, now).committedAt,
      message: commit.message,
      author: commit.author,
      paths,
      sizes,
      truncated: false,
      ...(hint ? { hint } : {}),
      async read(path) {
        const load = loaders.get(path);
        if (!load) throw new Error(`GitHub did not serve ${path} (404).`);
        return load();
      },
      mediaUrl(path) {
        const asset = assets.get(path);
        if (!asset) throw new Error(`${path} is not a media file of this repo.`);
        return asset.url;
      },
      fixture: true,
    };
  },
  head: ({ now, moved }) => headOf(moved ? COMMITS.moved : COMMITS.head, now),
};

/** Every fixture repo, by `owner/repo`. */
export const FIXTURES: FixtureRepo[] = [platformHandbook];
