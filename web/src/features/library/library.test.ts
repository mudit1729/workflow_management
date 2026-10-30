// The library feature without a browser: the old addresses and where they land (run through a
// small router with the app's own redirect functions), page addresses as URLs, the text helpers
// of the page view, the link written into an issue, search grouping and the recent pages.
import { isRedirect } from "@tanstack/react-router";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  redirectGlossary,
  redirectLibraryItem,
  redirectLibraryTab,
  redirectTeams,
} from "@/app/library-redirects";
import { loadMock } from "@/lib/api/mock-bridge";
import { libraryHref, libraryPath } from "@/lib/nav";
import { githubFile } from "./address";
import { openAsk, setAskHandler } from "./ask-hook";
import { Highlighted } from "./Highlighted";
import { pageLinkLine, withPageLink } from "./link-to-issue";
import { asTimestamp, isDateOnly, outlineOf, withoutTitleHeading } from "./page-text";
import { RECENT_LIMIT, type RecentPage, withVisit } from "./recent";
import { glossaryTarget, itemTarget, workspaceLibrary } from "./redirects";
import { groupByLibrary } from "./SearchResults";
import { foldersOf } from "./tree-paths";

/** What a redirect function sends the visitor to: the route, its params and the heading. */
async function redirectOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (isRedirect(error)) {
      const { to, params, hash } = error.options as {
        to?: string;
        params?: Record<string, string>;
        hash?: string;
      };
      return { to, params, hash };
    }
    throw error;
  }
  return undefined;
}

const PLAYBOOK = {
  to: "/lib/t/$alias/$",
  params: { alias: "wf", _splat: "playbooks/write-criteria-as-ears.md" },
  hash: undefined,
};

describe("the old addresses (spec 2)", () => {
  it("sends /lib/<lib-id> to that item's page in the workspace library", async () => {
    expect(await redirectOf(() => redirectLibraryItem("lib-k2s7b"))).toEqual(PLAYBOOK);
    expect(await redirectOf(() => redirectLibraryItem("lib-3fz8t"))).toMatchObject({
      to: "/lib/t/$alias/$",
      params: { alias: "wf", _splat: "decisions/push-live-updates-over-sse.md" },
    });
  });

  it("sends an id that the workspace does not have, or a word that is not an id, to the Library home", async () => {
    expect(await redirectOf(() => redirectLibraryItem("lib-00000"))).toMatchObject({ to: "/lib" });
    expect(await redirectOf(() => redirectLibraryItem("anything"))).toMatchObject({ to: "/lib" });
    expect(await redirectOf(() => redirectLibraryItem("wf-3k9x2"))).toMatchObject({ to: "/lib" });
  });

  it("sends /glossary to the Glossary page, and a term in ?q= to its heading", async () => {
    expect(await redirectOf(() => redirectGlossary())).toEqual({
      to: "/lib/t/$alias/$",
      params: { alias: "wf", _splat: "glossary.md" },
      hash: undefined,
    });
    expect(await redirectOf(() => redirectGlossary("work in motion"))).toMatchObject({
      params: { alias: "wf", _splat: "glossary.md" },
      hash: "work-in-motion",
    });
    expect(await redirectOf(() => redirectGlossary("Lease"))).toMatchObject({ hash: "lease" });
  });

  it("sends /lib?tab=glossary the same way, and leaves /lib alone", async () => {
    expect(
      await redirectOf(() => redirectLibraryTab({ tab: "glossary", q: "lease" })),
    ).toMatchObject({
      params: { alias: "wf", _splat: "glossary.md" },
      hash: "lease",
    });
    expect(await redirectOf(() => redirectLibraryTab({}))).toBeUndefined();
    expect(await redirectOf(() => redirectLibraryTab({ q: "x" }))).toBeUndefined();
  });

  it("opens the team libraries on the workspace's", async () => {
    expect(await redirectOf(() => redirectTeams())).toEqual({
      to: "/lib/t/$alias",
      params: { alias: "wf" },
      hash: undefined,
    });
  });

  it("lands on pages that exist", async () => {
    const mock = await loadMock();
    const tree = await mock.libraryTree("wf");
    expect(tree.pages).toContain(PLAYBOOK.params._splat);
    expect(tree.pages).toContain("glossary.md");
    expect(await workspaceLibrary()).toBe("wf");
    expect(await itemTarget("lib-k2s7b")).toEqual({
      alias: "wf",
      path: "playbooks/write-criteria-as-ears.md",
    });
    expect(await itemTarget("wf-3k9x2")).toBeUndefined();
    expect(await glossaryTarget("Lease")).toEqual({
      alias: "wf",
      path: "glossary.md",
      anchor: "lease",
    });
  });
});

describe("where a page lives", () => {
  it("puts the personal library at /lib/me and the others at /lib/t/<alias>", () => {
    expect(libraryPath("me")).toBe("/lib/me");
    expect(libraryPath("me", "topics/a/index.md")).toBe("/lib/me/topics/a/index.md");
    expect(libraryPath("platform")).toBe("/lib/t/platform");
    expect(libraryPath("platform", "runbooks/rotate keys.md")).toBe(
      "/lib/t/platform/runbooks/rotate%20keys.md",
    );
  });

  it("adds the heading as the hash", () => {
    expect(libraryHref("wf", "glossary.md", "lease")).toBe("/lib/t/wf/glossary.md#lease");
  });

  it("names a file on GitHub, with the ref and the library root", () => {
    const lib = { url: "https://github.com/acme/handbook/", ref: "main", root: "docs" };
    expect(githubFile(lib, "runbooks/rotate.md")).toBe(
      "https://github.com/acme/handbook/blob/main/docs/runbooks/rotate.md",
    );
    expect(githubFile({ url: "https://github.com/acme/handbook" }, "a.md")).toBe(
      "https://github.com/acme/handbook/blob/HEAD/a.md",
    );
    expect(githubFile({}, "a.md")).toBeUndefined();
    expect(githubFile({ url: "https://example.com/acme/handbook" }, "a.md")).toBeUndefined();
  });

  it("walks the folders of a path", () => {
    expect(foldersOf("a/b/c.md")).toEqual(["a", "a/b"]);
    expect(foldersOf("c.md")).toEqual([]);
    expect(foldersOf("")).toEqual([]);
  });
});

describe("the text of a page", () => {
  it("drops a first heading that only repeats the title", () => {
    expect(withoutTitleHeading("\n# Rotate keys\n\nBody.\n", "Rotate keys")).toBe("Body.\n");
    expect(withoutTitleHeading("# rotate KEYS\nBody", "Rotate keys")).toBe("Body");
    expect(withoutTitleHeading("# Another\n\nBody", "Rotate keys")).toBe("# Another\n\nBody");
    expect(withoutTitleHeading("Body\n\n# Rotate keys\n", "Rotate keys")).toBe(
      "Body\n\n# Rotate keys\n",
    );
  });

  it("lists levels 2 and 3 in On this page", () => {
    const hs = [1, 2, 3, 4].map((depth) => ({
      depth,
      text: `h${depth}`,
      anchor: `h${depth}`,
      line: depth,
    }));
    expect(outlineOf(hs).map((h) => h.depth)).toEqual([2, 3]);
  });

  it("reads a date without a time as noon that day", () => {
    expect(isDateOnly("2026-10-20")).toBe(true);
    expect(isDateOnly("2026-10-20T10:00+05:30")).toBe(false);
    expect(asTimestamp("2026-10-20")).toBe("2026-10-20T12:00:00");
    expect(asTimestamp("2026-10-20T10:00+05:30")).toBe("2026-10-20T10:00+05:30");
  });

  it("marks the matches of a search in a snippet", () => {
    const out = renderToStaticMarkup(
      createElement(Highlighted, {
        text: "Revoke the old key",
        marks: [
          [0, 6],
          [11, 14],
        ],
      }),
    );
    expect(out).toBe(
      '<mark class="rounded-sm bg-accent-subtle px-px text-fg">Revoke</mark> the <mark class="rounded-sm bg-accent-subtle px-px text-fg">old</mark> key',
    );
    // Overlapping or empty ranges are skipped, not doubled.
    expect(
      renderToStaticMarkup(
        createElement(Highlighted, {
          text: "abcdef",
          marks: [
            [0, 3],
            [2, 4],
            [5, 5],
          ],
        }),
      ),
    ).toContain("abc</mark>def");
  });
});

describe("linking a page to an issue", () => {
  const goal = [
    "---",
    "id: wf-3k9x2",
    "---",
    "",
    "## Context",
    "",
    "Why.",
    "",
    "## Success criteria",
    "",
    "- [ ] SC-1: When x, the system shall y.",
    "",
    "## Out of scope",
    "",
    "Nothing.",
    "",
  ].join("\n");

  it("writes the page address and its title as a bullet", () => {
    expect(pageLinkLine("platform:runbooks/rotate.md", "Rotate  keys")).toBe(
      "- [[platform:runbooks/rotate.md]] Rotate keys",
    );
    expect(pageLinkLine("lib-4tz7c", "")).toBe("- [[lib-4tz7c]]");
  });

  it("makes the Links section after Out of scope when there is none, and moves nothing else", () => {
    const next = withPageLink(goal, "- [[wf:playbooks/x.md]] X") ?? "";
    expect(next.startsWith(goal.trimEnd())).toBe(true);
    expect(next.trimEnd().endsWith("## Links\n\n- [[wf:playbooks/x.md]] X")).toBe(true);
  });

  it("adds to the end of an existing Links section, and not twice", () => {
    const withLinks = `${goal}\n## Links\n\n- [[lib-4tz7c]] One\n`;
    const next = withPageLink(withLinks, "- [[wf:playbooks/x.md]] X") ?? "";
    expect(next).toContain("- [[lib-4tz7c]] One\n- [[wf:playbooks/x.md]] X");
    expect(withPageLink(next, "- [[wf:playbooks/x.md]] Again")).toBeUndefined();
  });

  it("puts the section after the success criteria when there is no Out of scope", () => {
    const short = goal.split("## Out of scope")[0] ?? "";
    const next = withPageLink(short, "- [[me:topics/a.md]] A") ?? "";
    expect(next.indexOf("## Links")).toBeGreaterThan(next.indexOf("## Success criteria"));
  });
});

describe("search results", () => {
  const hit = (alias: string, path: string) =>
    ({ address: `${alias}:${path}`, alias, path, library: alias.toUpperCase() }) as never;

  it("groups passages by library in the order of the libraries, a library with none left out", () => {
    const groups = groupByLibrary(
      [hit("b", "1.md"), hit("a", "2.md"), hit("b", "3.md")],
      ["a", "b", "c"],
    );
    expect(groups.map((g) => [g.alias, g.passages.length])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(groupByLibrary([hit("z", "1.md")], ["a"]).map((g) => g.alias)).toEqual(["z"]);
  });
});

describe("recent pages", () => {
  const page = (n: number, at = n): RecentPage => ({
    address: `me:${n}.md`,
    alias: "me",
    path: `${n}.md`,
    title: `Page ${n}`,
    library: "Personal library",
    at,
  });

  it("puts the page opened last first, once, and keeps eight", () => {
    let list: RecentPage[] = [];
    for (let i = 0; i < 12; i++) list = withVisit(list, page(i));
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]?.path).toBe("11.md");
    list = withVisit(list, page(8, 99));
    expect(list.map((p) => p.path).slice(0, 3)).toEqual(["8.md", "11.md", "10.md"]);
    expect(list.filter((p) => p.path === "8.md")).toHaveLength(1);
  });
});

describe("Ask about this page", () => {
  it("hands the address to whoever takes the hook over", () => {
    const heard: string[] = [];
    const off = setAskHandler((a) => heard.push(a));
    openAsk("platform:runbooks/rotate.md#why");
    off();
    expect(heard).toEqual(["platform:runbooks/rotate.md#why"]);
  });
});
