// Add team library, the screens as markup (the test environment has no DOM, so each screen renders
// to a string): what the first screen offers and says, the folder buttons, and the preview.
import { type Found, findLibrary, type GithubDeps } from "@mock/libraries/github";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui";
import { AddLibraryPanel } from "./AddLibraryPanel";
import { type Controller, createController, type Deps } from "./controller";
import { EXAMPLE, type Suggestion, screensFor } from "./flow";
import { LinkScreen, PreviewScreen, RootScreen } from "./screens";
import type { AddLibraryFlow } from "./useAddLibraryFlow";

// RelativeTime reads the clock once, when it loads: pin it to the deps' `now` before any import, so
// "2 days ago" does not turn into "3 days ago" as the calendar moves.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-10-30T12:00:00Z"));
});

const offline: Partial<GithubDeps> = {
  fetch: () => Promise.reject(new TypeError("Failed to fetch")),
  cache: new Map(),
  now: () => Date.parse("2026-10-30T12:00:00Z"),
};

const deps = (over: Partial<Deps> = {}): Deps => ({
  find: (raw) => findLibrary(raw, offline),
  preview: async (found, choice) =>
    (await import("@mock/libraries/github")).previewLibrary(found, choice),
  read: async (...a) => (await import("@mock/libraries/github")).readLibrary(...a),
  register: vi.fn(),
  taken: () => ["wf", "me"],
  added: vi.fn(),
  close: vi.fn(),
  ...over,
});

const suggestion: Suggestion = EXAMPLE;

/** The flow a screen reads, over a real controller. */
function flowOf(c: Controller, suggestions: Suggestion[] = [suggestion]): AddLibraryFlow {
  const state = c.getState();
  const screens = screensFor(state.found);
  const index = Math.max(0, screens.indexOf(state.screen));
  return {
    state,
    controller: c,
    screens,
    index,
    suggestions,
    ready: state.screen === "preview" ? state.preview !== undefined : state.raw.trim() !== "",
    goTo: () => {},
    requestClose: () => {},
    onKeyDown: () => {},
    digits: { current: undefined },
  };
}

const html = (node: React.ReactElement) =>
  renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const settle = (c: Controller) => vi.waitFor(() => expect(c.getState().busy).toBe("idle"));

describe("the first screen", () => {
  it("asks for one link, in a field that takes focus, with the example to start from", () => {
    const out = html(<LinkScreen flow={flowOf(createController(deps()))} />);
    expect(out).toContain('data-wf="AddLibraryStep"');
    expect(out).toContain('data-step="link"');
    expect(out).toContain("1 of 2");
    expect(out).toContain("Paste a GitHub link");
    expect(out).toContain('aria-label="GitHub link"');
    expect(out).toContain('placeholder="github.com/acme/handbook"');
    expect(out).toContain('data-autofocus=""');
    expect(out).toContain("Press Enter to continue.");
    expect(out).toContain('data-wf="SuggestedRepo"');
    expect(out).toContain("Platform handbook");
    expect(out).toContain("acme/platform-handbook");
    expect(out).toContain("An example with a video and a GIF");
  });

  it("leaves out the suggestions when there are none", () => {
    const out = html(<LinkScreen flow={flowOf(createController(deps()), [])} />);
    expect(out).not.toContain("SuggestedRepo");
    expect(out).not.toContain("Or start from");
  });

  it("says why a link is refused, as one sentence and nothing else to press", async () => {
    const c = createController(deps());
    c.paste("https://gitlab.com/acme/handbook");
    await settle(c);
    const out = html(<LinkScreen flow={flowOf(c)} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("That link is on gitlab.com. Only GitHub links work for now.");
    expect(out).toContain('aria-invalid="true"');
    expect(out).not.toContain("Connect an agent");
    expect(out).not.toContain("Press Enter to continue.");
  });

  it("offers an agent for a private repo", async () => {
    const c = createController(
      deps({
        find: async () => ({
          ok: false,
          failure: { kind: "private", message: "acme/secret is private, or the name is wrong." },
        }),
      }),
    );
    c.paste("acme/secret");
    await settle(c);
    const out = html(<LinkScreen flow={flowOf(c)} />);
    expect(out).toContain("acme/secret is private, or the name is wrong.");
    expect(out).toContain("An agent reads private repos with your own git credentials.");
    expect(out).toContain("Connect an agent to read private repos");
    expect(out).not.toContain("Use the example library");
  });

  it("offers to try again or to use the example when GitHub cannot be reached", async () => {
    const c = createController(deps());
    c.paste("acme/anything");
    await settle(c);
    const out = html(<LinkScreen flow={flowOf(c)} />);
    expect(out).toContain("Could not reach GitHub from this page.");
    expect(out).toContain("Try again");
    expect(out).toContain("Use the example library");
    expect(out).not.toContain("Connect an agent");
  });

  it("shows that it is reading, and keeps the field as it is", () => {
    const c = createController(deps({ find: () => new Promise(() => {}) }));
    c.paste("acme/platform-handbook");
    const out = html(<LinkScreen flow={flowOf(c)} />);
    expect(out).toContain("Reading GitHub…");
    expect(out).toContain('role="status"');
    expect(out).toContain(`readOnly=""`);
  });
});

describe("the folder screen", () => {
  it("lists the folders as numbered answers with their pages", async () => {
    const found = {
      repo: { owner: "acme", repo: "monorepo", commit: "9f8e7d6c5b4a", paths: [] },
      manifest: { order: [], owners: [] },
      choices: [
        { root: "docs", pages: 42, media: 0, by: "folder" },
        { root: "wiki", pages: 8, media: 0, by: "folder" },
      ],
    } as unknown as Found;
    const c = createController(deps({ find: async () => ({ ok: true, value: found }) }));
    c.paste("acme/monorepo");
    await settle(c);
    const out = html(<RootScreen flow={flowOf(c)} />);
    expect(out).toContain('data-step="root"');
    expect(out).toContain("2 of 3");
    expect(out).toContain("Which folder is the library?");
    expect(out).toContain("acme/monorepo has more than one folder of pages.");
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('aria-label="docs/, 42 pages"');
    expect(out).toContain('aria-label="wiki/, 8 pages"');
    expect(out).toContain("The first folder that holds pages");
    expect(out).toContain("Press 1 to 2 to pick, Enter to continue.");
    // The first folder is the pick.
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out.indexOf('aria-checked="true"')).toBeLessThan(out.indexOf("wiki/"));
  });
});

describe("the preview", () => {
  async function previewOf(): Promise<Controller> {
    const c = createController(deps());
    c.paste("https://github.com/acme/platform-handbook");
    await settle(c);
    return c;
  }

  it("shows what will be added: its name, counts, commit, alias and first page", async () => {
    const out = html(<PreviewScreen flow={flowOf(await previewOf())} />);
    expect(out).toContain('data-step="preview"');
    expect(out).toContain("2 of 2");
    expect(out).toContain("Add this library?");
    expect(out).toContain("Platform handbook");
    expect(out).toContain("How the platform team builds, ships and runs things.");
    expect(out).toContain("Public");
    expect(out).toContain("10 pages · 2 media files · 1 other file");
    expect(out).toContain("acme/platform-handbook · main · docs/");
    expect(out).toContain("Last commit");
    expect(out).toContain("a1b2c3d");
    expect(out).toContain("Add the signing key rotation runbook");
    expect(out).toContain("by li");
    expect(out).toContain("2 days ago");
    expect(out).toContain("Alias");
    expect(out).toContain("platform-handbook");
    expect(out).toContain(">Edit<");
    expect(out).toContain("Used in links, like [[platform-handbook:runbooks/rotate]].");
    expect(out).toContain("First page · README.md");
  });

  it("renders the first page small, without the links that would lead nowhere", async () => {
    const out = html(<PreviewScreen flow={flowOf(await previewOf())} />);
    expect(out).toContain('data-wf="PreviewExcerpt"');
    expect(out).toContain("It lives next to the services");
    expect(out).toContain("New here? Read Getting started first.");
    expect(out).not.toContain("[[getting-started]]");
    expect(out).not.toContain("title: Platform handbook");
  });

  it("says so when the repo is already one of the libraries", async () => {
    const c = await previewOf();
    const none = html(<PreviewScreen flow={flowOf(c)} />);
    expect(none).not.toContain("already in your libraries");
    const out = html(<PreviewScreen flow={{ ...flowOf(c), already: "platform" }} />);
    expect(out).toContain("This repo is already in your libraries as");
    expect(out).toContain("platform");
    expect(out).toContain("Adding it again makes a second copy.");
  });

  it("opens the alias as a field, with the problem beside it", async () => {
    const c = await previewOf();
    c.editAlias(true);
    c.setAlias("wf");
    const out = html(<PreviewScreen flow={flowOf(c)} />);
    expect(out).toContain('aria-label="Alias"');
    expect(out).toContain('value="wf"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain("wf is taken. Pick another.");
    expect(out).toContain(">Done<");
  });

  it("shows skeletons while the first page loads", () => {
    const c = createController(deps({ preview: () => new Promise(() => {}) }));
    c.paste("https://github.com/acme/platform-handbook");
    return vi
      .waitFor(() => expect(c.getState().screen).toBe("preview"))
      .then(() => {
        const out = html(<PreviewScreen flow={flowOf(c)} />);
        expect(out).toContain('aria-label="Reading the first page"');
        expect(out).not.toContain("PreviewExcerpt");
      });
  });

  it("says what went wrong while adding, on the preview", async () => {
    const c = createController(
      deps({
        read: async () => ({
          ok: false,
          failure: { kind: "unreachable", message: "Could not reach GitHub from this page." },
        }),
      }),
    );
    c.paste("https://github.com/acme/platform-handbook");
    await settle(c);
    c.advance();
    await settle(c);
    const out = html(<PreviewScreen flow={flowOf(c)} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("Could not reach GitHub from this page.");
  });
});

describe("the panel", () => {
  it("has Continue off for an empty field and on for a link, and says Add library on the preview", async () => {
    const c = createController(deps());
    const empty = html(<AddLibraryPanel flow={{ ...flowOf(c), ready: false }} autoFocus={false} />);
    expect(empty).toContain('data-wf="AddLibraryPanel"');
    expect(empty).toContain('aria-label="Question 1 of 2"');
    expect(empty).toMatch(/<button[^>]*disabled[^>]*>.*Continue/);
    expect(empty).toContain("Continue");

    c.paste("https://github.com/acme/platform-handbook");
    await settle(c);
    const preview = html(<AddLibraryPanel flow={flowOf(c)} autoFocus={false} />);
    expect(preview).toContain("Add library");
    expect(preview).toContain('aria-label="Question 2 of 2"');
    expect(preview).toContain('aria-label="Back to GitHub link"');
  });

  it("counts the pages while it adds", () => {
    const c = createController(deps({ read: () => new Promise(() => {}) }));
    c.paste("https://github.com/acme/platform-handbook");
    return vi
      .waitFor(() => expect(c.getState().preview).toBeDefined())
      .then(() => {
        c.advance();
        const out = html(<AddLibraryPanel flow={flowOf(c)} autoFocus={false} />);
        expect(out).toContain("Adding…");
      });
  });
});
