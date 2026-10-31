// The libraries of a mock server: the workspace library read from the store (its pages, the
// glossary, the items issues cite), the personal library and its edits, and the team libraries
// added at runtime and listed in libraries.toml.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NotFoundError } from "@/lib/api/error";
import type { LibrarySource } from "@/lib/api/types";
import { SAMPLE } from "../sample-files";
import { createMockServer, type MockServer } from "../server";
import type { WorkspaceDisk } from "../workspace-bus";
import { DISK } from "../workspace-files";
import { parseTeamEntries, withoutTeamEntry, withTeamEntry } from "./libraries";

const personal: WorkspaceDisk = {
  text: {
    "library.toml":
      'name = "Shruti\'s library"\nowner = "shruti"\nkind = "personal"\nurl = "https://github.com/shruti/wf-library"\n',
    "libraries.toml": "# The team libraries this person added.\n",
    "topics/agent-context/index.md":
      "---\ntitle: Agent-readable issue context\nkind: topic\n---\n\n## Summary\n\nBundles lose the goal in the middle. See [[wf-3k9x2]].\n",
  },
  assets: {},
  previews: [],
};
const sampleOnly: WorkspaceDisk = {
  text: {
    "work/wf/web/live-board-updates.md":
      "---\ntitle: Push board updates over SSE\nkind: issue-summary\nissue: wf-3k9x2\n---\n\nWhere it stands.\n",
  },
  assets: {},
  previews: [],
};

let server: MockServer;
beforeEach(() => {
  server = createMockServer({ latency: 0, personal, personalSample: sampleOnly });
});

const team = (alias = "platform"): LibrarySource => ({
  alias,
  kind: "team",
  name: "Platform handbook",
  url: "https://github.com/acme/platform-handbook",
  ref: "main",
  root: "docs",
  access: "public",
  files: {
    "docs/README.md": "# Platform handbook\n\nHello. Read [[runbooks/rotate]].\n",
    "docs/runbooks/rotate.md": "# Rotate\n\nRotate the keys.\n",
  },
  media: {},
});

describe("the workspace library (L4)", () => {
  it("is listed first, named for the workspace, with the glossary as one of its pages", async () => {
    const libs = await server.libraries();
    expect(libs[0]).toMatchObject({
      alias: "wf",
      kind: "workspace",
      name: "This workspace",
      editable: false,
      access: "local",
    });
    expect(libs.map((l) => l.alias)).toEqual(["wf", "me"]);
    const tree = await server.libraryTree("wf");
    expect(tree.pages).toContain("glossary.md");
    expect(tree.root.children?.map((n) => n.title)).toEqual([
      "Playbooks",
      "Patterns",
      "Gotchas",
      "Decisions",
      "Glossary",
    ]);
    const glossary = await server.libraryPage("wf", "glossary.md");
    expect(glossary).toMatchObject({ title: "Glossary", kind: "glossary", file: "glossary.md" });
    expect(glossary.headings.some((h) => h.text === "workspace")).toBe(true);
  });

  it("keeps the items of the library: id, file, status in the frontmatter, and the item id", async () => {
    const page = await server.libraryPage("wf", "playbooks/write-criteria-as-ears.md");
    expect(page).toMatchObject({
      title: "Write criteria as EARS sentences",
      kind: "playbook",
      item: "lib-k2s7b",
      file: "library/playbooks/write-criteria-as-ears.md",
      frontmatter: expect.objectContaining({ status: "draft" }),
    });
    expect(page.headings.map((h) => h.text)).toEqual([
      "Overview",
      "Procedure",
      "Done when",
      "Forbidden",
    ]);
    expect(page.trail).toEqual([{ title: "Playbooks", path: "playbooks" }]);
  });

  it("resolves [[lib-xxxxx]] to the page and follows an edit made in Files", async () => {
    expect(await server.libraryResolve("lib-k2s7b")).toMatchObject({
      ok: true,
      address: "wf:playbooks/write-criteria-as-ears.md",
    });
    const heard = vi.fn();
    server.subscribeLibraries(heard);
    const before = await server.libraryPage("wf", "playbooks/write-criteria-as-ears.md");
    await server.writeFile({
      path: "library/playbooks/write-criteria-as-ears.md",
      text: before.text.replace("## Forbidden", "## Never"),
    });
    expect(heard).toHaveBeenCalled();
    const after = await server.libraryPage("wf", "playbooks/write-criteria-as-ears.md");
    expect(after.headings.map((h) => h.text)).toContain("Never");
  });

  it("lists the issues that cite an item (used in issues) once the sample is loaded", async () => {
    server.controls.loadSample();
    const libs = await server.libraries();
    expect(libs.find((l) => l.alias === "wf")?.pages).toBeGreaterThan(10);
    const cited = server.store.derived.snapshot.library.find((l) => l.used_by > 0);
    expect(cited).toBeTruthy();
    const page = await server.libraryPage("wf", cited?.path.replace(/^library\//, "") ?? "");
    expect(page.used_in.length).toBe(cited?.used_by);
    expect(page.used_in[0]).toMatchObject({
      id: expect.stringMatching(/^wf-/),
      title: expect.any(String),
    });
  });

  it("answers 404 for a page nobody wrote", async () => {
    await expect(server.libraryPage("wf", "nope.md")).rejects.toBeInstanceOf(NotFoundError);
    await expect(server.libraryTree("nolib")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("media of the workspace library", () => {
  it("is collected with the workspace files and resolved from a page of library/", async () => {
    const disk: WorkspaceDisk = {
      ...DISK,
      text: {
        ...DISK.text,
        "library/notes/tour.md":
          "# Tour\n\n![The flow](media/flow.gif)\n\n![Demo](media/demo.webm)\n",
      },
      assets: {
        ...DISK.assets,
        "library/notes/media/flow.gif": { url: "/assets/flow.gif", bytes: 1200 },
        "library/notes/media/demo.webm": { url: "/assets/demo.webm", bytes: 90_000 },
        "issues/not-a-library-file.png": { url: "/assets/other.png", bytes: 10 },
      },
    };
    const mine = createMockServer({ latency: 0, disk, personal, personalSample: sampleOnly });
    const page = await mine.libraryPage("wf", "notes/tour.md");
    expect(page.media["media/flow.gif"]).toMatchObject({
      kind: "gif",
      url: "/assets/flow.gif",
      bytes: 1200,
    });
    expect(page.media["media/demo.webm"]).toMatchObject({
      kind: "video",
      url: "/assets/demo.webm",
    });
    const info = (await mine.libraries()).find((l) => l.alias === "wf");
    // Two media files of library/; the workspace's other images are not the library's.
    expect(info?.media).toBe(2);
    expect((await mine.libraryTree("wf")).others).toEqual([]);
  });
});

describe("the personal library", () => {
  it("reads library.toml, treats the repo as the library and shows its pages", async () => {
    const me = (await server.libraries()).find((l) => l.alias === "me");
    expect(me).toMatchObject({
      kind: "personal",
      name: "Shruti's library",
      editable: true,
      pages: 1,
      url: "https://github.com/shruti/wf-library",
      access: "bridge",
    });
    const page = await server.libraryPage("me", "topics/agent-context");
    expect(page).toMatchObject({
      kind: "topic",
      section: false,
      title: "Agent-readable issue context",
    });
    expect(page.links[0]).toMatchObject({ form: "issue", ok: false, missing: "issue" });
    // The shipped config files are not pages and not "other files".
    expect((await server.libraryTree("me")).others).toEqual([]);
  });

  it("adds the sample's work summaries only while the sample is loaded", async () => {
    expect((await server.libraryTree("me")).pages).not.toContain(
      "work/wf/web/live-board-updates.md",
    );
    server.controls.loadSample();
    expect((await server.libraryTree("me")).pages).toContain("work/wf/web/live-board-updates.md");
    server.controls.reset();
    expect((await server.libraryTree("me")).pages).not.toContain(
      "work/wf/web/live-board-updates.md",
    );
  });

  it("saves a page at once, creates new ones, and tells the listeners", async () => {
    const heard = vi.fn();
    server.subscribeLibraries(heard);
    const saved = await server.savePage({
      alias: "me",
      path: "topics/new/index.md",
      text: "# New topic\n\nHi.\n",
    });
    expect(saved.commit).toHaveLength(7);
    expect(heard).toHaveBeenCalledTimes(1);
    expect((await server.libraryPage("me", "topics/new/index.md")).title).toBe("New topic");
    expect((await server.libraries()).find((l) => l.alias === "me")?.pages).toBe(2);
  });

  it("refuses a save against a stale rev with a 409, and a page outside the personal library with a 422", async () => {
    const page = await server.libraryPage("me", "topics/agent-context/index.md");
    await server.savePage({
      alias: "me",
      path: page.path,
      text: `${page.text}\nMore.\n`,
      base_rev: page.rev,
    });
    const stale = await server
      .savePage({ alias: "me", path: page.path, text: "x\n", base_rev: page.rev })
      .catch((e) => e);
    expect(stale).toBeInstanceOf(ApiError);
    expect(stale.status).toBe(409);
    const other = await server.savePage({ alias: "wf", path: "a.md", text: "x" }).catch((e) => e);
    expect(other.status).toBe(422);
    const notMd = await server.savePage({ alias: "me", path: "a.txt", text: "x" }).catch((e) => e);
    expect(notMd.status).toBe(422);
    const outside = await server
      .savePage({ alias: "me", path: "../a.md", text: "x" })
      .catch((e) => e);
    expect(outside.status).toBe(422);
  });

  it("deletes a page", async () => {
    await server.deletePage({ alias: "me", path: "topics/agent-context/index.md" });
    await expect(server.libraryPage("me", "topics/agent-context/index.md")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("serves media added to it", async () => {
    await server.saveMedia({
      alias: "me",
      path: "topics/a/media/p.png",
      media: { url: "blob:x", bytes: 10 },
    });
    await server.savePage({ alias: "me", path: "topics/a/index.md", text: "![P](media/p.png)\n" });
    const page = await server.libraryPage("me", "topics/a/index.md");
    expect(page.media["media/p.png"]).toMatchObject({ url: "blob:x", kind: "image" });
  });
});

describe("team libraries", () => {
  it("adds one, lists it after the personal library and writes its [[team]] block", async () => {
    const info = await server.addLibrary(team());
    expect(info).toMatchObject({
      alias: "platform",
      kind: "team",
      pages: 2,
      home: "README.md",
      root: "docs",
    });
    expect((await server.libraries()).map((l) => l.alias)).toEqual(["wf", "me", "platform"]);
    const toml =
      (await server.libraryPage("me", "libraries.toml").catch(() => undefined)) ?? undefined;
    expect(toml).toBeUndefined(); // not a page
    const entries = server.libraryRegistry.teamEntries();
    expect(entries).toEqual([
      expect.objectContaining({
        alias: "platform",
        url: "https://github.com/acme/platform-handbook",
        ref: "main",
        root: "docs",
        access: "public",
        added: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
      }),
    ]);
  });

  it("makes its pages readable, linkable from the personal library and searchable", async () => {
    await server.addLibrary(team());
    await server.savePage({
      alias: "me",
      path: "n.md",
      text: "# Note\n\nSee [[platform:runbooks/rotate]].\n",
    });
    const page = await server.libraryPage("platform", "runbooks/rotate.md");
    expect(page.backlinks.map((b) => b.address).sort()).toEqual(["me:n.md", "platform:README.md"]);
    expect(page.github).toBe(
      "https://github.com/acme/platform-handbook/blob/main/docs/runbooks/rotate.md",
    );
    const hits = await server.librarySearch("rotate keys", { alias: "platform" });
    expect(hits[0]).toMatchObject({ alias: "platform", path: "runbooks/rotate.md" });
    expect(await server.libraryBacklinks("platform:runbooks/rotate.md")).toHaveLength(2);
  });

  it("refuses a taken alias, a bad alias and a non-team source", async () => {
    await server.addLibrary(team());
    for (const alias of ["me", "t", "wf", "Bad Alias!"]) {
      const err = await server.addLibrary(team(alias)).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(422);
    }
    const kind = await server.addLibrary({ ...team("other"), kind: "personal" }).catch((e) => e);
    expect(kind.status).toBe(422);
    // The same alias again replaces the library and its block.
    await server.addLibrary({ ...team(), name: "Renamed" });
    expect((await server.libraries()).filter((l) => l.alias === "platform")).toHaveLength(1);
    expect(server.libraryRegistry.teamEntries()).toHaveLength(1);
  });

  it("removes one and its block; the workspace and personal libraries stay", async () => {
    await server.addLibrary(team());
    await server.removeLibrary("platform");
    expect((await server.libraries()).map((l) => l.alias)).toEqual(["wf", "me"]);
    expect(server.libraryRegistry.teamEntries()).toEqual([]);
    for (const alias of ["wf", "me"])
      expect((await server.removeLibrary(alias).catch((e) => e)).status).toBe(422);
    await expect(server.removeLibrary("platform")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("goes with Reset data", async () => {
    await server.addLibrary(team());
    await server.savePage({ alias: "me", path: "z.md", text: "# Z\n" });
    server.controls.reset();
    expect((await server.libraries()).map((l) => l.alias)).toEqual(["wf", "me"]);
    expect((await server.libraryTree("me")).pages).not.toContain("z.md");
  });
});

describe("libraries.toml", () => {
  const block = (alias: string) =>
    `[[team]]\nalias = "${alias}"\nurl = "https://github.com/acme/${alias}"\nref = "main"\naccess = "public"\nadded = 2026-10-30\n`;

  it("reads the blocks, with the date as a string", () => {
    const entries = parseTeamEntries(`# top\n${block("a")}\n${block("b")}`);
    expect(entries.map((e) => e.alias)).toEqual(["a", "b"]);
    expect(entries[0]).toMatchObject({ ref: "main", access: "public", added: "2026-10-30" });
    expect(parseTeamEntries("this is = not toml [")).toEqual([]);
    expect(parseTeamEntries(undefined)).toEqual([]);
  });

  it("adds, replaces and removes a block, and keeps the comment above them", () => {
    const start = "# The team libraries this person added.\n";
    const one = withTeamEntry(start, {
      alias: "a",
      url: "https://github.com/acme/a",
      added: "2026-10-30",
    });
    const two = withTeamEntry(one, { alias: "b", url: "https://github.com/acme/b", root: "docs" });
    expect(two.startsWith(start.trimEnd())).toBe(true);
    expect(parseTeamEntries(two).map((e) => e.alias)).toEqual(["a", "b"]);
    const renamed = withTeamEntry(two, { alias: "a", url: "https://github.com/acme/a2" });
    expect(parseTeamEntries(renamed).map((e) => e.url)).toEqual([
      "https://github.com/acme/a2",
      "https://github.com/acme/b",
    ]);
    const without = withoutTeamEntry(renamed, "a");
    expect(parseTeamEntries(without).map((e) => e.alias)).toEqual(["b"]);
    expect(without).toContain("# The team libraries");
    expect(without.endsWith("\n")).toBe(true);
    expect(withoutTeamEntry(without, "b").trim()).toBe(start.trim());
  });

  it("lists a team library that libraries.toml names and nobody has loaded", async () => {
    await server.savePage({ alias: "me", path: "x.md", text: "x" }); // touch
    server.libraryRegistry.applyPersonalDisk(
      { ...personal, text: { ...personal.text, "libraries.toml": block("ghost") } },
      sampleOnly,
    );
    const ghost = (await server.libraries()).find((l) => l.alias === "ghost");
    expect(ghost).toMatchObject({
      kind: "team",
      loaded: false,
      pages: 0,
      url: "https://github.com/acme/ghost",
    });
  });
});

describe("the shipped personal library", () => {
  it("has a manifest for the current user and an empty libraries.toml", async () => {
    const shipped = createMockServer({ latency: 0, disk: SAMPLE });
    const me = (await shipped.libraries()).find((l) => l.alias === "me");
    expect(me).toMatchObject({
      kind: "personal",
      owner: "shruti",
      url: "https://github.com/shruti/wf-library",
      editable: true,
    });
    expect(shipped.libraryRegistry.teamEntries()).toEqual([]);
  });
});
