// Add team library, the whole flow run key by key: paste, Enter, the folder, the preview, Add. The
// example library is read through the real GitHub reader with no network, and added to a real mock
// server, so the test sees what lands in the library list and in libraries.toml.

import {
  type Found,
  findLibrary,
  type GithubDeps,
  type LibraryRead,
  type Outcome,
  previewLibrary,
  type RootChoice,
  readLibrary,
} from "@mock/libraries/github";
import { createMockServer, type MockServer } from "@mock/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/error";
import type { LibraryInfo, LibrarySource } from "@/lib/api/types";
import { commitFacts } from "./commits";
import { setConnectAgentHandler } from "./connect-hook";
import { type Controller, createController, type Deps } from "./controller";
import { keyAction, rootOptions } from "./flow";

/** GitHub is out of reach: only the fixture repo can be read. */
const offline: Partial<GithubDeps> = {
  fetch: () => Promise.reject(new TypeError("Failed to fetch")),
  cache: new Map(),
  now: () => Date.parse("2026-10-30T12:00:00Z"),
};

interface Harness {
  controller: Controller;
  deps: Deps;
  added: { info: LibraryInfo; page?: string; skipped: number }[];
  closed: () => number;
}

/** The real reader and a real mock server, which `overrides` can replace piece by piece. */
function harness(server: MockServer, overrides: Partial<Deps> = {}): Harness {
  const added: Harness["added"] = [];
  let closes = 0;
  const deps: Deps = {
    find: (raw) => findLibrary(raw, offline),
    preview: (found, choice) => previewLibrary(found, choice),
    read: (found, choice, alias, progress) => readLibrary(found, choice, alias, progress),
    register: (source) => server.addLibrary(source),
    taken: () => ["wf", "me"],
    added: (info, extra) => added.push({ info, ...extra }),
    close: () => {
      closes++;
    },
    ...overrides,
  };
  return { controller: createController(deps), deps, added, closed: () => closes };
}

const settle = (c: Controller) => vi.waitFor(() => expect(c.getState().busy).toBe("idle"));

/** What the panel does with a key: the pure `keyAction`, then the screen's answer to it. */
function press(c: Controller, key: string, over: { typing?: boolean; onControl?: boolean } = {}) {
  const s = c.getState();
  const act = keyAction(
    { key, typing: false, onControl: false, modified: false, composing: false, ...over },
    s.screen,
  );
  if (!act) return;
  if (act.do === "digit") {
    const option = rootOptions(s.found?.choices ?? [])[act.n - 1];
    if (option) c.pick(option.value);
  } else if (act.do === "back") c.back();
  else c.advance();
}

let server: MockServer;
beforeEach(() => {
  server = createMockServer({ latency: 0 });
});
afterEach(() => server.dispose());

const EXAMPLE = "https://github.com/acme/platform-handbook";

describe("pasting a link", () => {
  it("looks the example up with no network and lands on its preview, one folder being the only choice", async () => {
    const { controller: c } = harness(server);
    c.paste(`  ${EXAMPLE}\n`);
    expect(c.getState()).toMatchObject({ raw: EXAMPLE, busy: "looking" });
    await settle(c);
    expect(c.getState()).toMatchObject({
      screen: "preview",
      alias: "platform-handbook",
      choice: { root: "docs", pages: 11, media: 2, by: "manifest" },
      preview: { name: "Platform handbook", pages: 11, page: "README.md" },
    });
    expect(c.getState().failure).toBeUndefined();
  });

  it("goes on with Enter too, and not with an empty field", async () => {
    const { controller: c } = harness(server);
    press(c, "Enter");
    c.advance();
    expect(c.getState()).toMatchObject({ screen: "link", busy: "idle" });
    c.setRaw("acme/platform-handbook");
    c.advance();
    await settle(c);
    expect(c.getState().screen).toBe("preview");
  });

  it("starts from a suggested repo", async () => {
    const { controller: c } = harness(server);
    c.use(EXAMPLE);
    await settle(c);
    expect(c.getState()).toMatchObject({ screen: "preview", raw: EXAMPLE });
  });

  it("says why a link is refused, and clears the sentence when the field changes", async () => {
    const { controller: c } = harness(server);
    c.paste("https://gitlab.com/acme/handbook");
    await settle(c);
    expect(c.getState()).toMatchObject({
      screen: "link",
      failure: {
        kind: "not-github",
        message: "That link is on gitlab.com. Only GitHub links work for now.",
      },
    });
    c.setRaw("acme/platform-handbook");
    expect(c.getState().failure).toBeUndefined();
  });

  it("says unreachable when GitHub cannot be reached, and a second try is possible", async () => {
    const { controller: c } = harness(server);
    c.paste("acme/some-other-repo");
    await settle(c);
    expect(c.getState().failure).toMatchObject({ kind: "unreachable" });
    c.advance();
    await settle(c);
    expect(c.getState().failure).toMatchObject({ kind: "unreachable" });
  });

  it("does not start a second lookup while one is running", async () => {
    const find = vi.fn(async () => findLibrary(EXAMPLE, offline));
    const { controller: c } = harness(server, { find });
    c.use(EXAMPLE);
    c.use(EXAMPLE);
    c.advance();
    await settle(c);
    expect(find).toHaveBeenCalledTimes(1);
  });
});

describe("a repo with several folders", () => {
  const choices: RootChoice[] = [
    { root: "docs", pages: 42, media: 0, by: "folder" },
    { root: "wiki", pages: 8, media: 0, by: "folder" },
  ];
  const found = {
    repo: { owner: "acme", repo: "monorepo", commit: "9f8e7d6c5b4a", paths: [] },
    manifest: { order: [], owners: [] },
    choices,
  } as unknown as Found;
  const previews: RootChoice[] = [];
  const several = () =>
    harness(server, {
      find: async () => ({ ok: true, value: found }),
      preview: async (_f, choice) => {
        previews.push(choice);
        return { name: "Monorepo", pages: choice.pages, media: 0, others: 0 };
      },
    });

  it("asks which folder, with the first as the default", async () => {
    const { controller: c } = several();
    c.paste("acme/monorepo");
    await settle(c);
    expect(c.getState()).toMatchObject({ screen: "root", picked: "docs" });
    expect(c.getState().preview).toBeUndefined();
  });

  it("picks with a number key, goes on with Enter, and goes back with Backspace", async () => {
    previews.length = 0;
    const { controller: c } = several();
    c.paste("acme/monorepo");
    await settle(c);
    press(c, "2");
    expect(c.getState().picked).toBe("wiki");
    press(c, "9");
    expect(c.getState().picked).toBe("wiki");
    press(c, "Enter");
    await settle(c);
    expect(c.getState()).toMatchObject({
      screen: "preview",
      choice: { root: "wiki" },
      preview: { pages: 8 },
    });
    expect(previews.map((p) => p.root)).toEqual(["wiki"]);
    press(c, "Backspace");
    expect(c.getState()).toMatchObject({ screen: "root", picked: "wiki", preview: undefined });
    press(c, "1");
    press(c, "Enter");
    await settle(c);
    expect(c.getState().choice?.root).toBe("docs");
    press(c, "ArrowLeft");
    press(c, "ArrowLeft");
    expect(c.getState()).toMatchObject({ screen: "link", found: undefined, raw: "acme/monorepo" });
    press(c, "Backspace");
    expect(c.getState().screen).toBe("link");
  });

  it("leaves the number keys to the field while the person types", async () => {
    const { controller: c } = several();
    c.paste("acme/monorepo");
    await settle(c);
    press(c, "2", { typing: true });
    expect(c.getState().picked).toBe("docs");
  });

  it("goes on at once when an answer is clicked", async () => {
    const { controller: c } = several();
    c.paste("acme/monorepo");
    await settle(c);
    void c.choose(choices[1] as RootChoice);
    await settle(c);
    expect(c.getState()).toMatchObject({ screen: "preview", choice: { root: "wiki" } });
  });

  it("ignores a preview that arrives after the person went back", async () => {
    let release: (() => void) | undefined;
    const { controller: c } = harness(server, {
      find: async () => ({ ok: true, value: found }),
      preview: (_f, choice) =>
        new Promise((resolve) => {
          release = () => resolve({ name: "Late", pages: choice.pages, media: 0, others: 0 });
        }),
    });
    c.paste("acme/monorepo");
    await settle(c);
    void c.choose(choices[0] as RootChoice);
    expect(c.getState()).toMatchObject({ screen: "preview", busy: "previewing" });
    c.back();
    expect(c.getState()).toMatchObject({ screen: "root", busy: "idle" });
    release?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(c.getState()).toMatchObject({ screen: "root", preview: undefined });
  });
});

describe("adding the library", () => {
  it("reads it, registers it, remembers its commit, shows it and closes", async () => {
    const h = harness(server);
    const { controller: c } = h;
    c.paste(EXAMPLE);
    await settle(c);
    press(c, "Enter");
    expect(c.getState().busy).toBe("adding");
    await vi.waitFor(() => expect(h.closed()).toBe(1));

    expect(h.added).toHaveLength(1);
    expect(h.added[0]).toMatchObject({
      info: { alias: "platform-handbook", pages: 11 },
      skipped: 0,
    });
    expect(h.added[0]?.page).toBeUndefined();

    // The library is listed, in the workspace, personal, team order, and reads as a library.
    const list = await server.libraries();
    expect(list.map((l) => l.alias)).toEqual(["wf", "me", "platform-handbook"]);
    expect(list[2]).toMatchObject({
      kind: "team",
      name: "Platform handbook",
      url: EXAMPLE,
      ref: "main",
      root: "docs",
      commit: "a1b2c3d",
      access: "public",
      pages: 11,
      media: 2,
      others: 1,
      home: "README.md",
      loaded: true,
      editable: false,
    });
    const page = await server.libraryPage("platform-handbook", "runbooks/rotate-signing-keys.md");
    expect(page).toMatchObject({
      title: "Rotate signing keys",
      github: `${EXAMPLE}/blob/main/docs/runbooks/rotate-signing-keys.md`,
    });

    // libraries.toml has its block (spec 4.4): alias, url, ref, root, access, added.
    const entries = server.libraryRegistry.teamEntries();
    expect(entries).toEqual([
      {
        alias: "platform-handbook",
        url: EXAMPLE,
        ref: "main",
        root: "docs",
        access: "public",
        added: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    ]);

    // The footer's facts.
    expect(commitFacts("platform-handbook")).toMatchObject({
      commit: expect.stringMatching(/^a1b2c3d/),
      message: "Add the signing key rotation runbook",
      author: "li",
    });
  });

  it("opens the page a blob link named", async () => {
    const h = harness(server);
    h.controller.paste(`${EXAMPLE}/blob/main/docs/runbooks/rotate-signing-keys.md`);
    await settle(h.controller);
    h.controller.advance();
    await vi.waitFor(() => expect(h.closed()).toBe(1));
    expect(h.added[0]).toMatchObject({ page: "runbooks/rotate-signing-keys.md" });
  });

  it("adds a library whose folder is named in the link, and writes that folder as its root", async () => {
    const h = harness(server);
    h.controller.paste(`${EXAMPLE}/tree/main/docs/runbooks`);
    await settle(h.controller);
    expect(h.controller.getState().choice).toMatchObject({
      root: "docs/runbooks",
      by: "link",
      pages: 3,
    });
    h.controller.advance();
    await vi.waitFor(() => expect(h.closed()).toBe(1));
    expect(server.libraryRegistry.teamEntries()[0]).toMatchObject({ root: "docs/runbooks" });
    expect(h.added[0]?.page).toBeUndefined();
  });

  it("takes the alias the person typed, in lower case", async () => {
    const h = harness(server);
    h.controller.paste(EXAMPLE);
    await settle(h.controller);
    h.controller.editAlias(true);
    h.controller.setAlias("  Platform ");
    expect(h.controller.getState().aliasError).toBeUndefined();
    h.controller.advance();
    await vi.waitFor(() => expect(h.closed()).toBe(1));
    expect(h.added[0]?.info.alias).toBe("platform");
    expect(server.libraryRegistry.teamEntries().map((e) => e.alias)).toEqual(["platform"]);
  });

  it("does not add while the alias has a problem, and shows it", async () => {
    const read = vi.fn();
    const h = harness(server, { read });
    h.controller.paste(EXAMPLE);
    await settle(h.controller);
    h.controller.setAlias("wf");
    expect(h.controller.getState().aliasError).toBe("wf is taken. Pick another.");
    h.controller.advance();
    expect(h.controller.getState()).toMatchObject({ editingAlias: true, busy: "idle" });
    expect(read).not.toHaveBeenCalled();
    h.controller.setAlias("handbook");
    expect(h.controller.getState().aliasError).toBeUndefined();
    h.controller.editAlias(false);
    expect(h.controller.getState().editingAlias).toBe(false);
  });

  it("puts a refusal of the alias beside the field and keeps the preview", async () => {
    const register = vi.fn(async (_s: LibrarySource): Promise<LibraryInfo> => {
      throw new ApiError(422, {
        diagnostics: [],
        gaps: ["The alias platform-handbook is taken. Pick another."],
      });
    });
    const h = harness(server, { register });
    h.controller.paste(EXAMPLE);
    await settle(h.controller);
    h.controller.advance();
    await settle(h.controller);
    expect(h.controller.getState()).toMatchObject({
      screen: "preview",
      editingAlias: true,
      aliasError: "The alias platform-handbook is taken. Pick another.",
      busy: "idle",
    });
    expect(h.controller.getState().preview).toBeDefined();
    expect(h.closed()).toBe(0);
  });

  it("says so when GitHub stops answering while the pages are read, and Add can be tried again", async () => {
    const fail: Outcome<LibraryRead> = {
      ok: false,
      failure: { kind: "unreachable", message: "Could not reach GitHub from this page." },
    };
    let calls = 0;
    const h = harness(server, {
      read: async (...args) => (++calls === 1 ? fail : readLibrary(...args)),
    });
    h.controller.paste(EXAMPLE);
    await settle(h.controller);
    h.controller.advance();
    await settle(h.controller);
    expect(h.controller.getState()).toMatchObject({
      screen: "preview",
      failure: { kind: "unreachable" },
      progress: undefined,
    });
    expect(h.closed()).toBe(0);
    h.controller.advance();
    await vi.waitFor(() => expect(h.closed()).toBe(1));
  });

  it("reports the pages that were not read", async () => {
    const h = harness(server, {
      read: async (found, choice, alias) => {
        const read = await readLibrary(found, choice, alias);
        return read.ok ? { ok: true, value: { ...read.value, skipped: 3 } } : read;
      },
    });
    h.controller.paste(EXAMPLE);
    await settle(h.controller);
    h.controller.advance();
    await vi.waitFor(() => expect(h.closed()).toBe(1));
    expect(h.added[0]?.skipped).toBe(3);
  });

  it("shows the count of pages read, and does not close while it is adding", async () => {
    let finish: (() => void) | undefined;
    const h = harness(server, {
      read: (found, choice, alias, progress) =>
        new Promise((resolve) => {
          progress(4, 10);
          finish = async () => resolve(await readLibrary(found, choice, alias));
        }),
    });
    h.controller.paste(EXAMPLE);
    await settle(h.controller);
    h.controller.advance();
    expect(h.controller.getState()).toMatchObject({
      busy: "adding",
      progress: { done: 4, total: 10 },
    });
    // Esc, the × and a click on the scrim do nothing now; Back and a second Add neither.
    h.controller.close();
    h.controller.back();
    h.controller.advance();
    expect(h.closed()).toBe(0);
    expect(h.controller.getState()).toMatchObject({ screen: "preview", busy: "adding" });
    finish?.();
    await vi.waitFor(() => expect(h.closed()).toBe(1));
    expect(h.added).toHaveLength(1);
  });
});

describe("closing", () => {
  it("closes on Esc at every screen, since nothing is lost", async () => {
    const h = harness(server);
    h.controller.close();
    h.controller.paste(EXAMPLE);
    await settle(h.controller);
    h.controller.close();
    expect(h.closed()).toBe(2);
  });
});

describe("a private repo", () => {
  it("offers an agent: with none connected it says so, with one it opens it", async () => {
    const { controller: c } = harness(server, {
      find: async () => ({
        ok: false,
        failure: { kind: "private", message: "acme/secret is private, or the name is wrong." },
      }),
    });
    c.paste("acme/secret");
    await settle(c);
    expect(c.getState().failure).toMatchObject({ kind: "private" });

    c.connectAgent();
    expect(c.getState().note).toContain("No agent is connected");

    const open = vi.fn();
    const off = setConnectAgentHandler(open);
    c.setRaw("acme/secret");
    c.connectAgent();
    expect(open).toHaveBeenCalledTimes(1);
    expect(c.getState().note).toBeUndefined();
    off();
  });
});
