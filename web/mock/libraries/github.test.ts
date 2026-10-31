// Reading a team library from a GitHub link: the five link forms, why another host is refused, how
// the library is found in a repo (spec 4.2), the typed failures, the ETag cache, and the fixture
// repo that stands for acme/platform-handbook. GitHub is a stubbed `fetch`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCorpus } from "./corpus";
import {
  type Failure,
  findLibrary,
  type GithubDeps,
  type GithubLink,
  homeOf,
  moveRemote,
  openRepo,
  parseGithubLink,
  previewLibrary,
  readLibrary,
  refSplits,
  remoteHead,
  resetRemote,
  rootChoices,
} from "./github";
import { parseManifest } from "./manifest";

// ---------------------------------------------------------------- a stub of GitHub

interface Stub {
  fetch: GithubDeps["fetch"];
  calls: { url: string; headers: Record<string, string> }[];
}

const SHA = "c0ffee1234567890abcdef1234567890abcdef12";
const TREE = "7ree000000000000000000000000000000000000";

/** A tree of blobs: `path` or `[path, size]`. */
const blobs = (...files: (string | [string, number])[]) =>
  files.map((f) => ({
    path: Array.isArray(f) ? f[0] : f,
    type: "blob",
    size: Array.isArray(f) ? f[1] : 100,
  }));

function github(options: {
  files: Record<string, string>;
  tree?: ReturnType<typeof blobs>;
  description?: string | null;
  branch?: string;
  /** Branches and tags that exist; `main` by default. */
  refs?: string[];
  status?: Partial<Record<"repo" | "commit" | "tree" | "raw", number>>;
  headers?: Record<string, string>;
}): Stub {
  const calls: Stub["calls"] = [];
  const refs = options.refs ?? ["main"];
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { etag: '"abc"', "content-type": "application/json", ...options.headers },
      ...init,
    });
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const done = (key: "repo" | "commit" | "tree" | "raw", ok: () => Response) => {
      const status = options.status?.[key];
      return status ? new Response("", { status, headers: options.headers }) : ok();
    };
    if (url === "https://api.github.com/repos/acme/handbook")
      return done("repo", () =>
        json({
          default_branch: options.branch ?? "main",
          description: options.description === undefined ? "Our docs" : options.description,
          private: false,
        }),
      );
    const commit = /\/repos\/acme\/handbook\/commits\/(.+)$/.exec(url);
    if (commit) {
      const ref = decodeURIComponent(commit[1] as string);
      if (!refs.includes(ref)) return new Response("", { status: 404 });
      if ((init?.headers as Record<string, string> | undefined)?.["if-none-match"])
        return new Response(null, { status: 304 });
      return done("commit", () =>
        json({
          sha: SHA,
          commit: {
            message: "Add the failover runbook\n\nLonger text.",
            committer: { date: "2026-10-28T09:00:00Z" },
            author: { name: "Ana Rao" },
            tree: { sha: TREE },
          },
          author: { login: "ana" },
        }),
      );
    }
    if (url === `https://api.github.com/repos/acme/handbook/git/trees/${TREE}?recursive=1`)
      return done("tree", () =>
        json({
          tree: [
            { path: "docs", type: "tree" },
            ...(options.tree ?? blobs(...Object.keys(options.files))),
          ],
          truncated: false,
        }),
      );
    const raw = /^https:\/\/raw\.githubusercontent\.com\/acme\/handbook\/([0-9a-f]+)\/(.+)$/.exec(
      url,
    );
    if (raw) {
      const path = (raw[2] as string).split("/").map(decodeURIComponent).join("/");
      const text = options.files[path];
      return done("raw", () =>
        text === undefined ? new Response("", { status: 404 }) : new Response(text),
      );
    }
    return new Response("", { status: 404 });
  });
  return { fetch: fetchStub as unknown as GithubDeps["fetch"], calls };
}

const deps = (stub: Stub): Partial<GithubDeps> => ({
  fetch: stub.fetch,
  cache: new Map(),
  now: () => Date.parse("2026-10-30T12:00:00Z"),
});

const link = (raw: string): GithubLink => {
  const parsed = parseGithubLink(raw);
  if (!parsed.ok) throw new Error(parsed.failure.message);
  return parsed.value;
};

const failure = <T>(outcome: { ok: true; value: T } | { ok: false; failure: Failure }): Failure => {
  if (outcome.ok) throw new Error("expected a failure");
  return outcome.failure;
};

// ---------------------------------------------------------------- the link

describe("parseGithubLink", () => {
  it.each([
    ["https://github.com/acme/handbook", "https", []],
    ["https://github.com/acme/handbook/", "https", []],
    ["http://www.github.com/acme/handbook?tab=readme#top", "https", []],
    ["https://github.com/acme/handbook.git", "https", []],
    ["github.com/acme/handbook", "https", []],
    ["git@github.com:acme/handbook.git", "ssh", []],
    ["ssh://git@github.com/acme/handbook.git", "ssh", []],
    ["acme/handbook", "short", []],
    ["  acme/handbook \n", "short", []],
    ["https://github.com/acme/handbook/tree/main", "tree", ["main"]],
    [
      "https://github.com/acme/handbook/tree/main/docs/runbooks",
      "tree",
      ["main", "docs", "runbooks"],
    ],
    [
      "https://github.com/acme/handbook/blob/main/docs/runbooks/rotate.md#L10",
      "blob",
      ["main", "docs", "runbooks", "rotate.md"],
    ],
  ])("reads %j", (raw, form, tail) => {
    expect(parseGithubLink(raw)).toEqual({
      ok: true,
      value: {
        owner: "acme",
        repo: "handbook",
        url: "https://github.com/acme/handbook",
        form,
        tail,
      },
    });
  });

  it("keeps a repo name with dots, dashes and capitals as written", () => {
    expect(link("Acme-Co/platform.handbook_v2")).toMatchObject({
      owner: "Acme-Co",
      repo: "platform.handbook_v2",
      url: "https://github.com/Acme-Co/platform.handbook_v2",
    });
  });

  it.each([
    ["https://gitlab.com/acme/handbook", "gitlab.com"],
    ["git@bitbucket.org:acme/handbook.git", "bitbucket.org"],
    ["gitlab.com/acme/handbook", "gitlab.com"],
    ["https://github.com.evil.example/acme/handbook", "github.com.evil.example"],
    ["https://github.com@evil.example/acme/handbook", "evil.example"],
    ["https://codeberg.org/acme/handbook", "codeberg.org"],
  ])("refuses another host, %j, and names it", (raw, host) => {
    const f = failure(parseGithubLink(raw));
    expect(f.kind).toBe("not-github");
    expect(f.message).toBe(`That link is on ${host}. Only GitHub links work for now.`);
  });

  it.each([
    ["", "Paste the repo's address"],
    ["handbook", "does not look like a GitHub repo"],
    ["https://github.com/acme", "not one of its repos"],
    ["https://github.com/", "Paste the repo's address"],
    ["https://github.com/acme/handbook/issues/3", "points at issues"],
    ["https://github.com/acme/handbook/pull/9/files", "points at pull"],
    ["https://github.com/acme/handbook/blob/main/logo.png", "not a page"],
    ["https://github.com/acme/handbook/blob/main", "not a page"],
    ["https://gist.github.com/acme/abc123", "gist"],
    ["https://raw.githubusercontent.com/acme/handbook/main/README.md", "raw file"],
    ["https://user:secret@github.com/acme/handbook", "password"],
    ["ftp://github.com/acme/handbook", "ftp://"],
    ["https://github.com/-bad-/handbook", "not a GitHub repo name"],
    ["acme/..", "not a GitHub repo name"],
  ])("explains a link that is not a repo, %j", (raw, words) => {
    const f = failure(parseGithubLink(raw));
    expect(f.kind).toBe("bad-link");
    expect(f.message).toContain(words);
  });
});

describe("refSplits", () => {
  it("tries the shortest ref first, since a branch name may hold slashes", () => {
    expect(refSplits(link("https://github.com/acme/handbook/tree/feature/x/docs"))).toEqual([
      { ref: "feature", path: "x/docs" },
      { ref: "feature/x", path: "docs" },
      { ref: "feature/x/docs", path: "" },
    ]);
  });

  it("keeps the file name of a blob link out of the ref", () => {
    expect(refSplits(link("https://github.com/acme/handbook/blob/main/docs/a.md"))).toEqual([
      { ref: "main", path: "docs/a.md" },
      { ref: "main/docs", path: "a.md" },
    ]);
  });

  it("has nothing to split in a plain repo link", () => {
    expect(refSplits(link("acme/handbook"))).toEqual([]);
  });
});

// ---------------------------------------------------------------- opening a repo

const FILES = {
  "README.md": "# The repo\n",
  "docs/README.md": "# Handbook\n\nStart with [[runbooks]].\n",
  "docs/runbooks/index.md": "# Runbooks\n",
  "docs/runbooks/rotate.md": "---\ntitle: Rotate keys\n---\nRotate.\n",
  "docs/media/flow.gif": "GIF",
  "docs/media/demo.webm": "WEBM",
  "docs/spec.pdf": "PDF",
  ".github/workflows/ci.yml": "on: push",
};

describe("openRepo", () => {
  it("reads the repo, the commit and the tree with three calls, and pins files to the commit", async () => {
    const stub = github({ files: FILES });
    const opened = await openRepo(link("acme/handbook"), deps(stub));
    if (!opened.ok) throw new Error(opened.failure.message);
    const repo = opened.value;
    expect(stub.calls.map((c) => c.url)).toEqual([
      "https://api.github.com/repos/acme/handbook",
      "https://api.github.com/repos/acme/handbook/commits/main",
      `https://api.github.com/repos/acme/handbook/git/trees/${TREE}?recursive=1`,
    ]);
    expect(repo).toMatchObject({
      owner: "acme",
      repo: "handbook",
      description: "Our docs",
      defaultBranch: "main",
      ref: "main",
      commit: SHA,
      committedAt: "2026-10-28T09:00:00Z",
      message: "Add the failover runbook",
      author: "ana",
      truncated: false,
    });
    expect(repo.paths).toEqual(Object.keys(FILES));
    expect(repo.paths).not.toContain("docs");
    expect(repo.mediaUrl("docs/media/flow.gif")).toBe(
      `https://raw.githubusercontent.com/acme/handbook/${SHA}/docs/media/flow.gif`,
    );
    expect(await repo.read("docs/runbooks/rotate.md")).toContain("Rotate keys");
    await expect(repo.read("docs/missing.md")).rejects.toThrow(
      "GitHub did not serve docs/missing.md (404)",
    );
  });

  it("reads the branch named in the link, and the folder after it as the hint", async () => {
    const stub = github({ files: FILES, refs: ["main", "release"] });
    const opened = await openRepo(
      link("https://github.com/acme/handbook/tree/release/docs"),
      deps(stub),
    );
    expect(opened).toMatchObject({ ok: true, value: { ref: "release", hint: "docs" } });
    expect(stub.calls[1]?.url).toContain("/commits/release");
  });

  it("finds a branch whose name holds a slash by trying the longer ref", async () => {
    const stub = github({ files: FILES, refs: ["feature/x"] });
    const opened = await openRepo(
      link("https://github.com/acme/handbook/tree/feature/x/docs"),
      deps(stub),
    );
    expect(opened).toMatchObject({ ok: true, value: { ref: "feature/x", hint: "docs" } });
    expect(stub.calls.map((c) => c.url).filter((u) => u.includes("/commits/"))).toEqual([
      "https://api.github.com/repos/acme/handbook/commits/feature",
      "https://api.github.com/repos/acme/handbook/commits/feature%2Fx",
    ]);
  });

  it("remembers the page of a blob link", async () => {
    const stub = github({ files: FILES });
    const opened = await openRepo(
      link("https://github.com/acme/handbook/blob/main/docs/runbooks/rotate.md"),
      deps(stub),
    );
    expect(opened).toMatchObject({ ok: true, value: { page: "docs/runbooks/rotate.md" } });
    expect(opened.ok && opened.value.hint).toBeUndefined();
  });

  it("says no-ref when the branch in the link does not exist", async () => {
    const stub = github({ files: FILES });
    const f = failure(
      await openRepo(link("https://github.com/acme/handbook/tree/nope/docs"), deps(stub)),
    );
    expect(f.kind).toBe("no-ref");
  });

  it("asks again with the ETag, and a 304 costs the page nothing", async () => {
    const stub = github({ files: FILES });
    const shared = deps(stub);
    await openRepo(link("acme/handbook"), shared);
    expect(stub.calls.every((c) => !c.headers["if-none-match"])).toBe(true);
    stub.calls.length = 0;
    const again = await openRepo(link("acme/handbook"), shared);
    // The commit is the one call the stub answers 304 to.
    expect(stub.calls.map((c) => c.headers["if-none-match"])).toEqual(['"abc"', '"abc"', '"abc"']);
    expect(again).toMatchObject({
      ok: true,
      value: { commit: SHA, message: "Add the failover runbook" },
    });
  });

  it("asks without the ETag when the browser refuses the extra header", async () => {
    const stub = github({ files: FILES });
    const shared = deps(stub);
    await openRepo(link("acme/handbook"), shared);
    let refused = 0;
    const inner = shared.fetch as GithubDeps["fetch"];
    shared.fetch = ((input, init) => {
      if ((init?.headers as Record<string, string>)?.["if-none-match"]) {
        refused++;
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return inner(input, init);
    }) as GithubDeps["fetch"];
    const again = await openRepo(link("acme/handbook"), shared);
    expect(refused).toBeGreaterThan(0);
    expect(again.ok).toBe(true);
  });

  describe("when GitHub does not give the library", () => {
    it("says private on a 404, since GitHub hides a private repo", async () => {
      const stub = github({ files: FILES, status: { repo: 404 } });
      const f = failure(await openRepo(link("acme/handbook"), deps(stub)));
      expect(f).toMatchObject({
        kind: "private",
        message: "acme/handbook is private, or the name is wrong.",
      });
    });

    it("says rate-limited with the time GitHub lets the page ask again", async () => {
      const stub = github({
        files: FILES,
        status: { repo: 403 },
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1793360000" },
      });
      const f = failure(await openRepo(link("acme/handbook"), deps(stub)));
      expect(f.kind).toBe("rate-limited");
      expect(f.retryAt).toBe(1793360000 * 1000);
      expect(f.message).toMatch(/^GitHub is limiting this page until \d/);
    });

    it("says unreachable on a 403 that is not a limit, as when a proxy blocks GitHub", async () => {
      const stub = github({ files: FILES, status: { repo: 403 } });
      expect(failure(await openRepo(link("acme/handbook"), deps(stub)))).toMatchObject({
        kind: "unreachable",
        message: "Could not reach GitHub from this page.",
      });
    });

    it("says unreachable when there is no network", async () => {
      const f = failure(
        await openRepo(link("acme/handbook"), {
          fetch: () => Promise.reject(new TypeError("Failed to fetch")),
          cache: new Map(),
        }),
      );
      expect(f.kind).toBe("unreachable");
    });

    it("says unreachable when GitHub answers 500 for the tree", async () => {
      const stub = github({ files: FILES, status: { tree: 500 } });
      expect(failure(await openRepo(link("acme/handbook"), deps(stub))).kind).toBe("unreachable");
    });
  });
});

// ---------------------------------------------------------------- where the library is

describe("rootChoices (spec 4.2)", () => {
  const paths = (...p: string[]) => p;

  it("takes the folder in the link first", () => {
    const choices = rootChoices(paths("docs/a.md", "wiki/b.md", "guides/c.md", "guides/d.md"), {
      hint: "guides",
    });
    expect(choices).toEqual([{ root: "guides", pages: 2, media: 0, by: "link" }]);
  });

  it("takes the manifest's root next", () => {
    const manifest = parseManifest('root = "wiki"\n');
    const choices = rootChoices(paths("docs/a.md", "wiki/b.md", "wiki/c.md"), { manifest });
    expect(choices).toEqual([{ root: "wiki", pages: 2, media: 0, by: "manifest" }]);
  });

  it("skips a link path or a manifest root that holds no markdown", () => {
    const manifest = parseManifest('root = "gone"\n');
    expect(rootChoices(paths("docs/a.md", "src/x.ts"), { hint: "src", manifest })).toEqual([
      { root: "docs", pages: 1, media: 0, by: "folder" },
    ]);
  });

  it("offers every known folder that holds markdown, with its pages, the first being the default", () => {
    const choices = rootChoices(
      paths(
        "library/a.md",
        "docs/a.md",
        "docs/b.md",
        "docs/img/x.png",
        "wiki/a.md",
        "handbook/readme.txt",
        "src/index.ts",
      ),
    );
    expect(choices).toEqual([
      { root: "library", pages: 1, media: 0, by: "folder" },
      { root: "docs", pages: 2, media: 1, by: "folder" },
      { root: "wiki", pages: 1, media: 0, by: "folder" },
    ]);
  });

  it("falls back to the repo root, counting the markdown outside hidden folders", () => {
    expect(
      rootChoices(paths("README.md", "guide/a.md", ".github/x.md", "node_modules/p/r.md")),
    ).toEqual([{ root: "", pages: 2, media: 0, by: "repo" }]);
  });
});

describe("homeOf", () => {
  const none = parseManifest(undefined);
  it("is the manifest's home, else a README or index at the root, else the shallowest page", () => {
    expect(homeOf(["docs/a/b.md", "docs/z.md", "docs/index.md"], "docs", none)).toBe("index.md");
    expect(homeOf(["docs/README.md", "docs/index.md"], "docs", none)).toBe("README.md");
    expect(homeOf(["docs/a/b.md", "docs/z.md"], "docs", none)).toBe("z.md");
    expect(
      homeOf(["docs/start.md", "docs/README.md"], "docs", parseManifest('home = "start.md"')),
    ).toBe("start.md");
    expect(homeOf(["src/x.ts"], "docs", none)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- the library

describe("findLibrary and readLibrary", () => {
  const manifest =
    'name = "Platform handbook"\ndescription = "How we run things."\nroot = "docs"\nhome = "README.md"\n';

  it("finds the library by the manifest, previews it and reads it into a source", async () => {
    const stub = github({ files: { ...FILES, "wf-library.toml": manifest } });
    const shared = deps(stub);
    const found = await findLibrary("https://github.com/acme/handbook", shared);
    if (!found.ok) throw new Error(found.failure.message);
    expect(found.value.choices).toEqual([{ root: "docs", pages: 3, media: 2, by: "manifest" }]);

    const choice = found.value.choices[0] as (typeof found.value.choices)[number];
    const preview = await previewLibrary(found.value, choice);
    expect(preview).toMatchObject({
      name: "Platform handbook",
      description: "How we run things.",
      pages: 3,
      media: 2,
      others: 1,
      page: "README.md",
    });
    expect(preview.pageText).toContain("Start with [[runbooks]]");

    const seen: number[] = [];
    const read = await readLibrary(found.value, choice, "platform", (done) => seen.push(done));
    if (!read.ok) throw new Error(read.failure.message);
    const { source, skipped } = read.value;
    expect(skipped).toBe(0);
    expect(seen.length).toBe(4);
    expect(source).toMatchObject({
      alias: "platform",
      kind: "team",
      name: "Platform handbook",
      url: "https://github.com/acme/handbook",
      ref: "main",
      commit: "c0ffee1",
      root: "docs",
      access: "public",
    });
    expect(Object.keys(source.files).sort()).toEqual([
      "docs/README.md",
      "docs/runbooks/index.md",
      "docs/runbooks/rotate.md",
      "wf-library.toml",
    ]);
    expect(source.media["docs/media/flow.gif"]).toEqual({
      url: `https://raw.githubusercontent.com/acme/handbook/${SHA}/docs/media/flow.gif`,
      bytes: 100,
    });
    expect(source.others).toEqual(["docs/spec.pdf"]);

    // The library model reads it as a library: sections, titles, the file on GitHub.
    const corpus = buildCorpus([source]);
    expect(corpus.info("platform")).toMatchObject({
      pages: 3,
      media: 2,
      others: 1,
      home: "README.md",
      root: "docs",
    });
    const page = corpus.page("platform", "runbooks/rotate.md");
    expect(page).toMatchObject({
      title: "Rotate keys",
      file: "docs/runbooks/rotate.md",
      github: "https://github.com/acme/handbook/blob/main/docs/runbooks/rotate.md",
      commit: "c0ffee1",
    });
  });

  it("asks which folder when several hold markdown", async () => {
    const stub = github({
      files: { "docs/a.md": "# A\n", "docs/b.md": "# B\n", "wiki/c.md": "# C\n", "src/x.ts": "x" },
    });
    const found = await findLibrary("acme/handbook", deps(stub));
    expect(found).toMatchObject({
      ok: true,
      value: {
        choices: [
          { root: "docs", pages: 2, by: "folder" },
          { root: "wiki", pages: 1, by: "folder" },
        ],
      },
    });
  });

  it("leaves a page that is too large, or not served, under Other files", async () => {
    // `gone.md` is in the tree, but GitHub answers 404 when the page asks for its text.
    const stub = github({
      files: { "a.md": "# A\n", "big.md": "# Big\n" },
      tree: blobs("a.md", ["big.md", 2_000_000], "gone.md"),
    });
    const found = await findLibrary("acme/handbook", deps(stub));
    if (!found.ok) throw new Error(found.failure.message);
    const read = await readLibrary(found.value, found.value.choices[0] as never, "x");
    if (!read.ok) throw new Error(read.failure.message);
    expect(Object.keys(read.value.source.files)).toEqual(["a.md"]);
    expect(read.value.skipped).toBe(2);
    expect(read.value.source.others).toEqual(["big.md", "gone.md"]);
  });

  it("says empty for a repo with no markdown", async () => {
    const stub = github({ files: { "src/index.ts": "x" } });
    const f = failure(await findLibrary("acme/handbook", deps(stub)));
    expect(f.kind).toBe("empty");
    expect(f.message).toContain("no markdown files");
  });

  it("returns a failure for a link that is not GitHub, before any call", async () => {
    const stub = github({ files: FILES });
    expect(failure(await findLibrary("https://gitlab.com/acme/handbook", deps(stub))).kind).toBe(
      "not-github",
    );
    expect(stub.calls).toEqual([]);
  });

  it("limits what it reads, shallowest pages first", async () => {
    const names = Array.from({ length: 520 }, (_, i) => `deep/p${i}.md`);
    const files = Object.fromEntries([["top.md", "# Top\n"], ...names.map((n) => [n, `# ${n}\n`])]);
    const stub = github({ files });
    const found = await findLibrary("acme/handbook", deps(stub));
    if (!found.ok) throw new Error(found.failure.message);
    const read = await readLibrary(found.value, found.value.choices[0] as never, "big");
    if (!read.ok) throw new Error(read.failure.message);
    expect(Object.keys(read.value.source.files)).toHaveLength(500);
    expect(read.value.source.files["top.md"]).toBeDefined();
    expect(read.value.skipped).toBe(21);
  });
});

// ---------------------------------------------------------------- has the remote moved

describe("remoteHead", () => {
  it("reads the tip of the branch with one call, kept by ETag", async () => {
    const stub = github({ files: FILES });
    const shared = deps(stub);
    const first = await remoteHead("https://github.com/acme/handbook", "main", shared);
    expect(first).toEqual({
      ok: true,
      value: { commit: SHA, committedAt: "2026-10-28T09:00:00Z" },
    });
    const again = await remoteHead("https://github.com/acme/handbook", "main", shared);
    expect(again).toEqual(first);
    expect(stub.calls.map((c) => c.headers["if-none-match"])).toEqual([undefined, '"abc"']);
  });

  it("says private when the branch is gone or the repo is hidden", async () => {
    const stub = github({ files: FILES });
    expect(
      failure(await remoteHead("https://github.com/acme/handbook", "old", deps(stub))).kind,
    ).toBe("private");
  });
});

// ---------------------------------------------------------------- the fixture repo

describe("the fixture acme/platform-handbook", () => {
  afterEach(() => resetRemote());
  const offline: Partial<GithubDeps> = {
    fetch: () => Promise.reject(new Error("the fixture needs no network")),
    cache: new Map(),
    now: () => Date.parse("2026-10-30T12:00:00Z"),
  };

  it.each([
    "https://github.com/acme/platform-handbook",
    "acme/platform-handbook",
    "git@github.com:acme/platform-handbook.git",
    "https://github.com/Acme/Platform-Handbook/tree/main",
    "https://github.com/acme/platform-handbook/tree/main/docs",
    "https://github.com/acme/platform-handbook/blob/main/docs/runbooks/rotate-signing-keys.md",
  ])("is known by %s, with no network", async (raw) => {
    const found = await findLibrary(raw, offline);
    if (!found.ok) throw new Error(found.failure.message);
    expect(found.value.repo.fixture).toBe(true);
    expect(found.value.choices).toHaveLength(1);
    expect(found.value.choices[0]).toMatchObject({ root: "docs", pages: 10, media: 2 });
  });

  it("names the page of a blob link and the folder of a tree link", async () => {
    const blob = await findLibrary(
      "https://github.com/acme/platform-handbook/blob/main/docs/runbooks/rotate-signing-keys.md",
      offline,
    );
    expect(blob).toMatchObject({
      ok: true,
      value: { repo: { page: "docs/runbooks/rotate-signing-keys.md" } },
    });
    const tree = await findLibrary(
      "https://github.com/acme/platform-handbook/tree/main/docs/runbooks",
      offline,
    );
    expect(tree).toMatchObject({
      ok: true,
      value: { choices: [{ root: "docs/runbooks", by: "link", pages: 3 }] },
    });
  });

  it("refuses a branch it does not have", async () => {
    expect(
      failure(await findLibrary("https://github.com/acme/platform-handbook/tree/dev", offline))
        .kind,
    ).toBe("no-ref");
  });

  it("reads into a library with its sections in the manifest's order, its media and its other files", async () => {
    const found = await findLibrary("acme/platform-handbook", offline);
    if (!found.ok) throw new Error(found.failure.message);
    const choice = found.value.choices[0] as never;
    expect(found.value.repo).toMatchObject({
      defaultBranch: "main",
      message: "Add the signing key rotation runbook",
      author: "li",
    });
    expect(found.value.repo.committedAt).toBe("2026-10-28T12:00:00.000Z");
    const preview = await previewLibrary(found.value, choice);
    expect(preview).toMatchObject({
      name: "Platform handbook",
      description: "How the platform team builds, ships and runs things.",
      page: "README.md",
    });

    const read = await readLibrary(found.value, choice, "platform-handbook");
    if (!read.ok) throw new Error(read.failure.message);
    const corpus = buildCorpus([read.value.source], {
      alias: "wf",
      issues: [
        {
          id: "wf-y4bz7",
          title: "Refresh SSO tokens silently",
          status: "in_progress",
          group_path: [],
          links: [],
        },
      ],
      cites: {},
    });
    expect(corpus.info("platform-handbook")).toMatchObject({
      name: "Platform handbook",
      pages: 10,
      media: 2,
      others: 1,
      home: "README.md",
      commit: "a1b2c3d",
      root: "docs",
    });
    const tree = corpus.tree("platform-handbook");
    expect(tree?.root.children?.map((n) => n.title)).toEqual([
      "Getting started",
      "Runbooks",
      "Architecture",
    ]);
    expect(tree?.others).toEqual(["runbooks/alerts.yaml"]);

    // Every link of every page resolves, the issue link included, and the GIF and the video are found.
    for (const address of corpus.addresses("platform-handbook")) {
      const [, path] = address.split(":") as [string, string];
      expect(corpus.page("platform-handbook", path)?.broken, address).toEqual([]);
    }
    const runbook = corpus.page("platform-handbook", "runbooks/rotate-signing-keys.md");
    expect(runbook?.links.some((l) => l.form === "issue" && l.issue === "wf-y4bz7")).toBe(true);
    expect(Object.values(runbook?.media ?? {}).map((m) => m.kind)).toEqual(["video"]);
    const topology = corpus.page("platform-handbook", "architecture/service-topology.md");
    expect(Object.values(topology?.media ?? {}).map((m) => m.kind)).toEqual(["gif"]);
    expect(runbook?.github).toBe(
      "https://github.com/acme/platform-handbook/blob/main/docs/runbooks/rotate-signing-keys.md",
    );
  });

  it("plays a new commit on the remote: the head moves and a new read has the new page", async () => {
    const before = await remoteHead("https://github.com/acme/platform-handbook", "main", offline);
    expect(before).toMatchObject({
      ok: true,
      value: { commit: expect.stringMatching(/^a1b2c3d/) },
    });
    const heard = vi.fn();
    const { onRemoteMoved } = await import("./github");
    const off = onRemoteMoved(heard);

    expect(await moveRemote("acme/platform-handbook")).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    const after = await remoteHead("https://github.com/acme/platform-handbook", "main", offline);
    expect(after).toMatchObject({ ok: true, value: { commit: expect.stringMatching(/^e4f5a6b/) } });
    const found = await findLibrary("acme/platform-handbook", offline);
    expect(found).toMatchObject({ ok: true, value: { choices: [{ pages: 11 }] } });
    expect(found.ok && found.value.repo.commit).toMatch(/^e4f5a6b/);
    const index = found.ok ? await found.value.repo.read("docs/runbooks/index.md") : "";
    expect(index).toContain("[[runbooks/high-latency]]");

    resetRemote();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(await findLibrary("acme/platform-handbook", offline)).toMatchObject({
      ok: true,
      value: { choices: [{ pages: 10 }] },
    });
    off();
  });

  it("moves only a repo that is a fixture", async () => {
    expect(await moveRemote("acme/other")).toBe(false);
  });
});
