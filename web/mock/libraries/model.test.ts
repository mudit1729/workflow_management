// The library model: the tree and its order, titles, every link form, backlinks, used-in-issues
// and the ranking of the search. The sources are built here, as a repo would hold them.
import { describe, expect, it } from "vitest";
import { formatAddress, parseAddress } from "@/features/library/address";
import { headingsOf, slugify } from "@/features/library/anchors";
import type { LibrarySource } from "@/lib/api/types";
import { buildCorpus, type WorkspaceFacts } from "./corpus";
import { extractImages, extractLinks } from "./links";
import { findLibraryRoot, parseManifest, rootCandidates } from "./manifest";
import { buildSearchIndex, searchSections, snippetOf, stem } from "./search";
import { layoutOf } from "./tree";

const media = (bytes = 1200) => ({ url: `/m/${bytes}.png`, bytes });

/** A team repo: a manifest, a docs/ root with sections, a README and one page per rule. */
function platform(extra: Record<string, string> = {}): LibrarySource {
  return {
    alias: "platform",
    kind: "team",
    name: "Platform handbook",
    url: "https://github.com/acme/platform-handbook",
    ref: "main",
    commit: "a1b2c3d",
    files: {
      "wf-library.toml": `name = "Platform handbook"\nroot = "docs"\nhome = "README.md"\n[nav]\norder = ["getting-started", "runbooks"]\n`,
      "README.md": "# Not the library\n",
      "docs/README.md": "# Platform handbook\n\nStart with [[getting-started]].\n",
      "docs/getting-started.md":
        "---\ntitle: Getting started\norder: 2\n---\n\n# Welcome\n\nSet up your laptop. See [keys](runbooks/rotate-keys.md#rotate).\n",
      "docs/architecture/overview.md":
        "# Architecture\n\nServices talk over [[runbooks/rotate-keys]].\n",
      "docs/architecture/zeta.md": "Zeta has no title and no heading.\n",
      "docs/architecture/alpha-service.md": "Alpha.\n",
      "docs/runbooks/index.md": "---\ntitle: Runbooks\n---\n\nWhat to do when.\n",
      "docs/runbooks/rotate-keys.md":
        "---\ntitle: Rotate signing keys\nupdated: 2026-10-20\nauthors: ['@ana']\n---\n\nRotate the **signing keys** every ninety days.\n\n## Why rotate\n\nA leaked key is valid forever unless it is rotated.\n\n## Rotate\n\n1. Create a new key.\n2. Deploy it.\n3. Revoke the old key.\n\n```sh\n# [[not-a-link]] and [x](nope.md)\nkms rotate\n```\n",
      "docs/runbooks/restore-backup.md":
        "# Restore a backup\n\nRestore the nightly database snapshot. Back to [[runbooks]].\n",
      ...extra,
    },
    media: { "docs/media/flow.gif": media(), "docs/media/demo.webm": media(9000) },
    others: ["docs/spec.pdf"],
  };
}

const personal = (files: Record<string, string>): LibrarySource => ({
  alias: "me",
  kind: "personal",
  name: "Personal library",
  root: "",
  files,
  media: {},
});

describe("finding the library in a repo (spec 4.2)", () => {
  const paths = ["README.md", "docs/a.md", "wiki/b.md", "wiki/c.md", "src/x.ts"];

  it("takes the path in the link first, then the manifest, then the known folders, then the repo", () => {
    expect(findLibraryRoot(paths, { hint: "wiki" })).toEqual({ root: "wiki", by: "link" });
    expect(findLibraryRoot(paths, { manifest: parseManifest('root = "docs"') })).toEqual({
      root: "docs",
      by: "manifest",
    });
    expect(findLibraryRoot(paths)).toEqual({ root: "docs", by: "folder" });
    expect(findLibraryRoot(["README.md", "guide/x.md"])).toEqual({ root: "", by: "repo" });
  });

  it("skips a hint or a manifest root that holds no markdown", () => {
    expect(findLibraryRoot(paths, { hint: "nope" }).by).toBe("folder");
    expect(findLibraryRoot(paths, { manifest: parseManifest('root = "nope"') }).by).toBe("folder");
  });

  it("lists every known folder that holds markdown, with its page count", () => {
    expect(rootCandidates(paths)).toEqual([
      { root: "docs", pages: 1 },
      { root: "wiki", pages: 2 },
    ]);
  });

  it("reads a manifest and survives a broken one", () => {
    const m = parseManifest(
      'name = "X"\n[nav]\norder = ["a", "b"]\n[owners]\nhandles = ["@ana"]\n',
    );
    expect(m).toMatchObject({ name: "X", order: ["a", "b"], owners: ["@ana"] });
    const bad = parseManifest("name = ");
    expect(bad.order).toEqual([]);
    expect(bad.problem).toBeTruthy();
  });
});

describe("the page tree", () => {
  const corpus = buildCorpus([platform()]);
  const tree = corpus.tree("platform");

  it("uses the library root and takes the home page from the manifest", () => {
    expect(layoutOf(platform()).root).toBe("docs");
    expect(tree?.home).toBe("README.md");
    expect(tree?.pages).not.toContain("../README.md");
  });

  it("orders by the manifest's nav.order, then the order: key, then alphabetically", () => {
    const top = tree?.root.children?.map((n) => n.title);
    // nav.order names getting-started and runbooks; architecture is last.
    expect(top).toEqual(["Getting started", "Runbooks", "Architecture"]);
  });

  it("orders unlisted pages by order: first, then by title", () => {
    const files = {
      "a.md": "# Banana\n",
      "b.md": "---\ntitle: Apple\n---\n",
      "c.md": "---\ntitle: Zucchini\norder: 1\n---\n",
      "d.md": "---\ntitle: Cherry\norder: 2\n---\n",
    };
    const t = buildCorpus([personal(files)]).tree("me");
    expect(t?.root.children?.map((n) => n.title)).toEqual([
      "Zucchini",
      "Cherry",
      "Apple",
      "Banana",
    ]);
  });

  it("titles a page by its frontmatter, else its first # heading, else its file name", () => {
    const arch = tree?.root.children?.find((n) => n.path === "architecture");
    const titles = Object.fromEntries((arch?.children ?? []).map((n) => [n.path, n.title]));
    expect(titles["architecture/overview.md"]).toBe("Architecture");
    expect(titles["architecture/zeta.md"]).toBe("Zeta");
    expect(titles["architecture/alpha-service.md"]).toBe("Alpha service");
    const runbooks = tree?.root.children?.find((n) => n.path === "runbooks");
    const rotate = runbooks?.children?.find((n) => n.path === "runbooks/rotate-keys.md");
    expect(rotate?.title).toBe("Rotate signing keys");
  });

  it("makes folders sections, and index.md the section's own page", () => {
    const runbooks = tree?.root.children?.find((n) => n.path === "runbooks");
    expect(runbooks).toMatchObject({
      type: "section",
      page: "runbooks/index.md",
      title: "Runbooks",
    });
    // The section's page is not also a child.
    expect(runbooks?.children?.map((n) => n.path)).not.toContain("runbooks/index.md");
    expect(runbooks?.count).toBe(3);
  });

  it("takes README.md and _group.md as a section's page too, index.md first", () => {
    const t = buildCorpus([
      personal({
        "a/README.md": "# Ay\n",
        "a/x.md": "# X\n",
        "b/_group.md": "---\ntitle: Group B\n---\n",
        "b/y.md": "# Y\n",
        "c/index.md": "# Index C\n",
        "c/README.md": "# Readme C\n",
        "c/z.md": "# Z\n",
      }),
    ]).tree("me");
    const sections = Object.fromEntries((t?.root.children ?? []).map((n) => [n.path, n]));
    expect(sections.a?.page).toBe("a/README.md");
    expect(sections.b).toMatchObject({ page: "b/_group.md", title: "Group B" });
    expect(sections.c?.page).toBe("c/index.md");
    // The other one stays an ordinary page.
    expect(sections.c?.children?.map((n) => n.path)).toContain("c/README.md");
  });

  it("names a section without a page after its folder", () => {
    const t = buildCorpus([
      personal({ "release-notes/2026.md": "# 2026\n", "release-notes/2025.md": "# 2025\n" }),
    ]).tree("me");
    expect(t?.root.children?.[0]).toMatchObject({ type: "section", title: "Release notes" });
    expect(t?.root.children?.[0]?.children?.map((n) => n.title)).toEqual(["2025", "2026"]);
  });

  it("lists the pages in reading order and the files that are neither pages nor media", () => {
    expect(tree?.pages).toEqual([
      "README.md",
      "getting-started.md",
      "runbooks/index.md",
      "runbooks/restore-backup.md",
      "runbooks/rotate-keys.md",
      "architecture/alpha-service.md",
      "architecture/overview.md",
      "architecture/zeta.md",
    ]);
    expect(tree?.others).toEqual(["spec.pdf"]);
  });

  it("sizes each page and each section in characters, for a token estimate", () => {
    const runbooks = tree?.root.children?.find((n) => n.path === "runbooks");
    const pages = runbooks?.children ?? [];
    const own = layoutOf(platform()).pages.get("runbooks/index.md")?.length ?? 0;
    expect(pages.every((p) => (p.chars ?? 0) > 0)).toBe(true);
    expect(runbooks?.chars).toBe(pages.reduce((n, p) => n + (p.chars ?? 0), own));
  });

  it("counts the pages and the media in the library info", () => {
    expect(corpus.info("platform")).toMatchObject({
      pages: 8,
      media: 2,
      others: 1,
      home: "README.md",
      root: "docs",
      kind: "team",
      editable: false,
    });
  });
});

describe("addresses", () => {
  it("round-trips alias:path#heading", () => {
    expect(parseAddress("platform:runbooks/rotate-keys.md#rotate")).toEqual({
      alias: "platform",
      path: "runbooks/rotate-keys.md",
      anchor: "rotate",
    });
    expect(formatAddress({ alias: "me", path: "topics/a/index.md" })).toBe("me:topics/a/index.md");
    expect(parseAddress("https://example.com")).toBeUndefined();
    expect(parseAddress("runbooks/x")).toBeUndefined();
  });

  it("gives headings GitHub's anchors, once each", () => {
    expect(slugify("Where it starts: 2 things!")).toBe("where-it-starts-2-things");
    const md = "# A\n\n## Rotate\n\n```\n## not a heading\n```\n\n## Rotate\n\nSetext\n===\n";
    expect(headingsOf(md).map((h) => h.anchor)).toEqual(["a", "rotate", "rotate-1", "setext"]);
  });
});

describe("link resolution", () => {
  const facts: WorkspaceFacts = {
    alias: "wf",
    issues: [
      {
        id: "wf-3k9x2",
        title: "Push board updates",
        status: "in_progress",
        group_path: ["wf", "web"],
        links: ["platform:runbooks/rotate-keys.md", "lib-6pm4c"],
      },
      {
        id: "wf-b1d7v",
        title: "Build v1",
        status: "backlog",
        group_path: ["wf"],
        links: ["lib-6pm4c"],
      },
    ],
    cites: { "lib-6pm4c": ["wf-3k9x2", "wf-b1d7v"] },
  };
  const ws: LibrarySource = {
    alias: "wf",
    kind: "workspace",
    name: "This workspace",
    root: "library",
    files: {
      "library/playbooks/ears.md":
        "---\nid: lib-6pm4c\ntitle: Write EARS criteria\nkind: playbook\n---\n\n## Procedure\n\nStart with the trigger.\n",
    },
    media: {},
  };
  const corpus = buildCorpus(
    [
      ws,
      platform(),
      personal({
        "topics/index.md": "---\ntitle: Topics\n---\n",
        "topics/agent-context/index.md":
          "---\ntitle: Agent context\n---\n\nNotes: [[topics/agent-context/bundle-sizes]].",
        "topics/agent-context/bundle-sizes.md":
          "# Bundle sizes\n\n## Findings\n\nSee [[platform:runbooks/rotate-keys#why-rotate]], [[platform:runbooks/rotate-keys#nope]], [[platform:nothing]], [[nolib:x]], [[wf-3k9x2#D-7f3k2]], [[wf-zzzzz]], [[lib-6pm4c]], [[lib-00000]], [[#findings]], [[#absent]], [[bundle-size]], [text](./index.md), [up](../index.md), [out](https://example.com/x), [file](../../topics/agent-context/index.md#nope), and [[wf:playbooks/ears.md]].\n",
      }),
    ],
    facts,
  );

  const links = Object.fromEntries(
    (corpus.page("me", "topics/agent-context/bundle-sizes.md")?.links ?? []).map((l) => [
      `${l.form}:${l.raw}`,
      l,
    ]),
  );

  it("resolves a relative markdown link against the page's folder", () => {
    expect(links["relative:./index.md"]).toMatchObject({
      ok: true,
      address: "me:topics/agent-context/index.md",
      title: "Agent context",
    });
    expect(links["relative:../index.md"]).toMatchObject({
      ok: true,
      address: "me:topics/index.md",
    });
    expect(links["relative:../../topics/agent-context/index.md#nope"]).toMatchObject({
      ok: false,
      missing: "heading",
    });
  });

  it("resolves [[path]] and [[path#heading]] in the same library", () => {
    const gs = Object.fromEntries(
      (corpus.page("platform", "getting-started.md")?.links ?? []).map((l) => [l.raw, l]),
    );
    expect(gs["runbooks/rotate-keys.md#rotate"]).toMatchObject({
      form: "relative",
      ok: true,
      address: "platform:runbooks/rotate-keys.md#rotate",
    });
    const arch = corpus.page("platform", "architecture/overview.md")?.links[0];
    expect(arch).toMatchObject({
      form: "wiki",
      ok: true,
      address: "platform:runbooks/rotate-keys.md",
    });
    expect(links["wiki:bundle-size"]).toMatchObject({ ok: false, missing: "page" });
  });

  it("finds a page without .md and a folder by its own page", () => {
    const restore = corpus.page("platform", "runbooks/restore-backup")?.links[0];
    expect(restore).toMatchObject({
      form: "wiki",
      ok: true,
      address: "platform:runbooks/index.md",
    });
  });

  it("resolves [[alias:path]] across libraries, with headings and missing parts", () => {
    expect(links["alias:platform:runbooks/rotate-keys#why-rotate"]).toMatchObject({
      ok: true,
      address: "platform:runbooks/rotate-keys.md#why-rotate",
    });
    expect(links["alias:platform:runbooks/rotate-keys#nope"]).toMatchObject({
      ok: false,
      missing: "heading",
      path: "runbooks/rotate-keys.md",
    });
    expect(links["alias:platform:nothing"]).toMatchObject({ ok: false, missing: "page" });
    expect(links["alias:nolib:x"]).toMatchObject({ ok: false, missing: "library" });
    expect(links["alias:wf:playbooks/ears.md"]).toMatchObject({
      ok: true,
      title: "Write EARS criteria",
    });
  });

  it("resolves [[wf-xxxxx]] to an issue and [[lib-xxxxx]] to a workspace library page", () => {
    expect(links["issue:wf-3k9x2#D-7f3k2"]).toMatchObject({
      ok: true,
      issue: "wf-3k9x2",
      entry: "D-7f3k2",
      title: "Push board updates",
    });
    expect(links["issue:wf-zzzzz"]).toMatchObject({ ok: false, missing: "issue" });
    expect(links["library-item:lib-6pm4c"]).toMatchObject({
      ok: true,
      address: "wf:playbooks/ears.md",
      title: "Write EARS criteria",
    });
    expect(links["library-item:lib-00000"]).toMatchObject({ ok: false, missing: "item" });
  });

  it("resolves a heading of the same page, and leaves external links alone", () => {
    expect(links["anchor:#findings"]).toMatchObject({
      ok: true,
      address: "me:topics/agent-context/bundle-sizes.md#findings",
    });
    expect(links["anchor:#absent"]).toMatchObject({ ok: false, missing: "heading" });
    expect(links["external:https://example.com/x"]).toMatchObject({
      ok: true,
      href: "https://example.com/x",
    });
  });

  it("prefers a page over a missing issue when a name only looks like an issue id", () => {
    const c = buildCorpus([
      personal({ "quick-start.md": "# Quick start\n", "a.md": "[[quick-start]]" }),
    ]);
    expect(c.page("me", "a.md")?.links[0]).toMatchObject({
      ok: true,
      address: "me:quick-start.md",
    });
  });

  it("lists the broken links of a page", () => {
    const broken = corpus
      .page("me", "topics/agent-context/bundle-sizes.md")
      ?.broken.map((l) => l.raw);
    expect(broken).toContain("nolib:x");
    expect(broken).not.toContain("https://example.com/x");
  });

  it("reads no links from code, and no images as links", () => {
    expect(
      extractLinks("`[[a]]` [[b]]\n```\n[[c]]\n```\n![img](x.png) [t](u.md)").map((l) => l.raw),
    ).toEqual(["b", "u.md"]);
    expect(extractLinks("[![poster](p.png)](https://youtu.be/abcdefghijk)")).toEqual([
      { syntax: "md", raw: "https://youtu.be/abcdefghijk", label: "poster" },
    ]);
    expect(extractImages("![One](a.png) ![Two](b/c.gif)").map((i) => i.src)).toEqual([
      "a.png",
      "b/c.gif",
    ]);
  });

  it("resolves an address on its own", () => {
    expect(corpus.resolve("platform:runbooks/rotate-keys#rotate")).toMatchObject({
      ok: true,
      address: "platform:runbooks/rotate-keys.md#rotate",
    });
    expect(corpus.resolve("lib-6pm4c")).toMatchObject({ ok: true, item: "lib-6pm4c", alias: "wf" });
    expect(corpus.resolve("nope:x")).toMatchObject({ ok: false });
  });
});

describe("backlinks and used in issues", () => {
  const facts: WorkspaceFacts = {
    alias: "wf",
    issues: [
      {
        id: "wf-3k9x2",
        title: "Push board updates",
        status: "in_progress",
        group_path: ["wf", "web"],
        links: ["platform:runbooks/rotate-keys.md", "lib-6pm4c", "nolib:x"],
      },
      { id: "wf-b1d7v", title: "Build v1", status: "backlog", group_path: ["wf"], links: [] },
    ],
    cites: { "lib-6pm4c": ["wf-b1d7v"] },
  };
  const ws: LibrarySource = {
    alias: "wf",
    kind: "workspace",
    name: "This workspace",
    root: "library",
    files: { "library/playbooks/ears.md": "---\nid: lib-6pm4c\ntitle: EARS\n---\n\nBody.\n" },
    media: {},
  };
  const corpus = buildCorpus(
    [
      ws,
      platform(),
      personal({
        "n.md":
          "# N\n\nSee [[platform:runbooks/rotate-keys]] and again [[platform:runbooks/rotate-keys#rotate]].\n",
      }),
    ],
    facts,
  );

  it("lists the pages of every library that link to a page, once each", () => {
    const back = corpus
      .page("platform", "runbooks/rotate-keys.md")
      ?.backlinks.map((b) => b.address);
    expect(back?.sort()).toEqual(
      ["me:n.md", "platform:architecture/overview.md", "platform:getting-started.md"].sort(),
    );
    expect(corpus.backlinks("platform:runbooks/rotate-keys.md#anything")).toHaveLength(3);
  });

  it("does not count a page's links to itself", () => {
    const c = buildCorpus([personal({ "a.md": "# A\n\n## B\n\n[[#b]] [[a]]\n" })]);
    expect(c.page("me", "a.md")?.backlinks).toEqual([]);
  });

  it("names the issues whose goal.md Links name a page, by address or by lib id", () => {
    expect(corpus.page("platform", "runbooks/rotate-keys.md")?.used_in.map((i) => i.id)).toEqual([
      "wf-3k9x2",
    ]);
    expect(
      corpus
        .page("wf", "playbooks/ears.md")
        ?.used_in.map((i) => i.id)
        .sort(),
    ).toEqual(["wf-3k9x2", "wf-b1d7v"]);
    expect(corpus.page("wf", "playbooks/ears.md")?.used_in[0]).toMatchObject({
      title: expect.any(String),
      status: expect.any(String),
    });
    expect(corpus.page("platform", "getting-started.md")?.used_in).toEqual([]);
  });
});

describe("the page model", () => {
  const corpus = buildCorpus([platform()]);
  const page = corpus.page("platform", "runbooks/rotate-keys");

  it("finds a page by a path without .md", () => {
    expect(page?.address).toBe("platform:runbooks/rotate-keys.md");
  });

  it("carries the frontmatter, the headings, the date and the author", () => {
    expect(page).toMatchObject({
      title: "Rotate signing keys",
      kind: "page",
      updated: "2026-10-20",
      author: "ana",
      library: "Platform handbook",
      file: "docs/runbooks/rotate-keys.md",
      commit: "a1b2c3d",
    });
    expect(page?.headings.map((h) => h.anchor)).toEqual(["why-rotate", "rotate"]);
    expect(page?.github).toBe(
      "https://github.com/acme/platform-handbook/blob/main/docs/runbooks/rotate-keys.md",
    );
    expect(page?.read_minutes).toBeGreaterThanOrEqual(1);
  });

  it("says a page was created, not updated, when that is all its frontmatter says", () => {
    const c = buildCorpus([
      personal({
        "a.md": "---\ncreated: 2026-10-20\nauthors: ['@ana']\n---\n\nBody\n",
        "b.md": "---\nlast_reviewed: 2026-10-21\ncreated: 2026-10-20\n---\n\nBody\n",
      }),
    ]);
    expect(c.page("me", "a.md")).toMatchObject({ created: "2026-10-20", author: "ana" });
    expect(c.page("me", "a.md")?.updated).toBeUndefined();
    expect(c.page("me", "b.md")?.updated).toBe("2026-10-21");
  });

  it("gives the section trail, the neighbours and the pages of a section", () => {
    expect(page?.trail).toEqual([
      { title: "Runbooks", path: "runbooks", page: "runbooks/index.md" },
    ]);
    expect(page?.prev?.path).toBe("runbooks/restore-backup.md");
    expect(page?.next?.path).toBe("architecture/alpha-service.md");
    const section = corpus.page("platform", "runbooks");
    expect(section).toMatchObject({ section: true, kind: "section" });
    expect(section?.children.map((c) => c.path)).toEqual([
      "runbooks/restore-backup.md",
      "runbooks/rotate-keys.md",
    ]);
    expect(corpus.page("platform", "README.md")?.children.map((c) => c.title)).toEqual([
      "Getting started",
      "Runbooks",
      "Architecture",
    ]);
  });

  it("resolves the media a page names", () => {
    const c = buildCorpus([
      platform({
        "docs/media-page.md":
          "![Flow](media/flow.gif)\n\n![Demo](media/demo.webm)\n\n![Gone](media/none.png)\n\n![Out](https://example.com/a.png)\n",
      }),
    ]);
    const m = c.page("platform", "media-page.md")?.media;
    expect(m?.["media/flow.gif"]).toMatchObject({ kind: "gif", url: "/m/1200.png", bytes: 1200 });
    expect(m?.["media/demo.webm"]).toMatchObject({ kind: "video", bytes: 9000 });
    expect(m?.["media/none.png"]).toMatchObject({ kind: "image", missing: true });
    expect(m?.["https://example.com/a.png"]).toMatchObject({ external: true });
  });
});

describe("search", () => {
  const corpus = buildCorpus([
    platform(),
    personal({
      "topics/keys.md":
        "# Key notes\n\nI keep notes about key management here, and rotation of keys.\n",
      "topics/agent-context/index.md":
        "---\ntitle: Agent context\n---\n\n## Summary\n\nBundles over 6k tokens lose the goal in the middle.\n\n## Findings\n\nRotation was not the issue.\n",
    }),
  ]);

  it("ranks the section that is about the words above one that mentions them", () => {
    const hits = corpus.search("rotate signing keys");
    expect(hits[0]).toMatchObject({ path: "runbooks/rotate-keys.md", alias: "platform" });
    expect(hits.map((h) => h.path)).toContain("topics/keys.md");
  });

  it("returns a passage: the section's heading and anchor, a snippet and the marks", () => {
    const [hit] = corpus.search("revoke old key");
    expect(hit).toMatchObject({
      address: "platform:runbooks/rotate-keys.md#rotate",
      heading: "Rotate",
      anchor: "rotate",
      pageTitle: "Rotate signing keys",
      library: "Platform handbook",
    });
    expect(hit?.snippet).toContain("Revoke the old key");
    const marked = hit?.marks.map(([a, b]) => hit.snippet.slice(a, b).toLowerCase());
    expect(marked).toEqual(expect.arrayContaining(["revoke", "old", "key"]));
  });

  it("matches word forms and prefixes", () => {
    expect(stem("rotating")).toBe(stem("rotate"));
    expect(stem("keys")).toBe(stem("key"));
    expect(corpus.search("rotat")[0]?.path).toBeTruthy();
    expect(corpus.search("snapshot")[0]?.path).toBe("runbooks/restore-backup.md");
  });

  it("lets a heading and the page title count more than the body", () => {
    const idx = buildSearchIndex([
      {
        alias: "a",
        library: "A",
        path: "x.md",
        title: "Deploys",
        body: "Nothing here but words.\n",
      },
      {
        alias: "a",
        library: "A",
        path: "y.md",
        title: "Other",
        body: "We talk about deploys once.\n",
      },
    ]);
    expect(searchSections(idx, "deploys").map((h) => h.path)).toEqual(["x.md", "y.md"]);
  });

  it("scopes to one library, several, or exactly the listed pages", () => {
    expect(new Set(corpus.search("keys", "all").map((h) => h.alias))).toEqual(
      new Set(["platform", "me"]),
    );
    expect(new Set(corpus.search("keys", { alias: "me" }).map((h) => h.alias))).toEqual(
      new Set(["me"]),
    );
    expect(new Set(corpus.search("keys", { aliases: ["platform"] }).map((h) => h.alias))).toEqual(
      new Set(["platform"]),
    );
    const pages = corpus.search("keys", { pages: ["me:topics/keys.md"] });
    expect(pages.map((h) => h.address)).toEqual(["me:topics/keys.md"]);
    expect(corpus.search("keys", { pages: ["me:topics/keys.md#x"] })).toHaveLength(1);
  });

  it("returns nothing for a query that matches nothing, or has no words", () => {
    expect(corpus.search("zzzzqqqq")).toEqual([]);
    expect(corpus.search("   ")).toEqual([]);
  });

  it("does not index code fences' markers or frontmatter, and returns at most k", () => {
    expect(corpus.search("updated authors")).toEqual([]);
    expect(corpus.search("key", "all", 2)).toHaveLength(2);
  });

  it("cuts a long section down to a snippet around the match", () => {
    const text = `${"filler words go here ".repeat(30)}the needle sits here ${"more filler ".repeat(30)}`;
    const { snippet, marks } = snippetOf(text, [[stem("needle")]]);
    expect(snippet.length).toBeLessThan(260);
    expect(snippet.startsWith("… ")).toBe(true);
    const [a, b] = marks[0] ?? [0, 0];
    expect(snippet.slice(a, b)).toBe("needle");
  });
});
