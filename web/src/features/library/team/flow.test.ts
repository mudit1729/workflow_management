// Add team library, the rules: which screens there are, what a failure says and offers, the alias,
// the number keys of the folder screen, and the first page as a small excerpt.
import type { Failure, Found, RootChoice } from "@mock/libraries/github";
import { describe, expect, it } from "vitest";
import {
  aliasProblem,
  excerptOf,
  explain,
  keyAction,
  pagesLabel,
  repoName,
  rootLabel,
  rootOptions,
  screensFor,
  suggestAlias,
  suggestionsFor,
} from "./flow";
import { repoHref } from "./TeamLibraryMenu";
import { readLink } from "./useTeamUpdate";

const choice = (root: string, pages: number): RootChoice => ({
  root,
  pages,
  media: 0,
  by: "folder",
});
const found = (...choices: RootChoice[]) => ({ choices }) as unknown as Found;

describe("screensFor", () => {
  it("asks the link, then the preview", () => {
    expect(screensFor(undefined)).toEqual(["link", "preview"]);
    expect(screensFor(found(choice("docs", 4)))).toEqual(["link", "preview"]);
  });

  it("asks which folder only when the repo has several", () => {
    expect(screensFor(found(choice("docs", 4), choice("wiki", 1)))).toEqual([
      "link",
      "root",
      "preview",
    ]);
  });
});

describe("explain", () => {
  const failure = (kind: Failure["kind"], message = "A sentence."): Failure => ({ kind, message });

  it("offers an agent for a private repo, with the sentence GitHub gave", () => {
    expect(explain(failure("private", "acme/x is private, or the name is wrong."))).toEqual({
      message: "acme/x is private, or the name is wrong.",
      hint: "An agent reads private repos with your own git credentials.",
      actions: ["connect"],
    });
  });

  it("offers to try again, or to use the example library, when GitHub cannot be reached", () => {
    const out = explain(failure("unreachable", "Could not reach GitHub from this page."));
    expect(out.actions).toEqual(["retry", "example"]);
    expect(out.hint).toContain("example library needs no network");
  });

  it("offers an agent or the example when GitHub is limiting the page", () => {
    expect(explain(failure("rate-limited")).actions).toEqual(["connect", "example"]);
  });

  it.each(["not-github", "bad-link", "no-ref", "empty"] as const)(
    "says only the sentence for %s",
    (kind) => {
      expect(explain(failure(kind))).toEqual({ message: "A sentence.", actions: [] });
    },
  );
});

describe("aliasProblem", () => {
  const taken = ["wf", "platform"];

  it("accepts a short lower-case name, whatever its case as typed", () => {
    expect(aliasProblem("handbook", taken)).toBeUndefined();
    expect(aliasProblem("  Handbook-2 ", taken)).toBeUndefined();
    expect(aliasProblem("a_b-c", taken)).toBeUndefined();
  });

  it("says what is wrong, in one sentence", () => {
    expect(aliasProblem("", taken)).toBe("Give the library a short name.");
    expect(aliasProblem("two words", taken)).toContain("lower-case letters, digits");
    expect(aliasProblem("-dash", taken)).toContain("lower-case letters, digits");
    expect(aliasProblem("a".repeat(33), taken)).toBe("Keep it to 32 characters or fewer.");
    expect(aliasProblem("me", taken)).toBe("me is used in page addresses. Pick another.");
    expect(aliasProblem("t", taken)).toBe("t is used in page addresses. Pick another.");
    expect(aliasProblem("WF", taken)).toBe("wf is taken. Pick another.");
  });
});

describe("suggestAlias", () => {
  it("is the repo name made safe", () => {
    expect(suggestAlias("Platform Handbook!")).toBe("platform-handbook");
    expect(suggestAlias(".github")).toBe("github");
    expect(suggestAlias("___")).toBe("library");
    expect(aliasProblem(suggestAlias("My.Docs v2"), [])).toBeUndefined();
  });

  it("steps past an alias that is taken, or that the routes use", () => {
    expect(suggestAlias("handbook", ["handbook"])).toBe("handbook-2");
    expect(suggestAlias("handbook", ["handbook", "handbook-2"])).toBe("handbook-3");
    expect(suggestAlias("me")).toBe("me-2");
    expect(suggestAlias("t")).toBe("t-2");
  });

  it("keeps a long repo name within the limit", () => {
    const alias = suggestAlias("a-very-long-repository-name-for-the-platform-team-handbook");
    expect(alias.length).toBeLessThanOrEqual(32);
    expect(aliasProblem(alias, [])).toBeUndefined();
  });
});

describe("the folder screen", () => {
  const choices = [choice("docs", 42), choice("wiki", 1), choice("", 9)];

  it("labels a folder with its slash, and the repo root as the whole repo", () => {
    expect(choices.map(rootLabel)).toEqual(["docs/", "wiki/", "Whole repo"]);
    expect(pagesLabel(1)).toBe("1 page");
    expect(pagesLabel(42)).toBe("42 pages");
  });

  it("lists the answers in the order of the number keys, the first marked as the default", () => {
    const options = rootOptions(choices);
    expect(options.map((o) => o.value)).toEqual(["docs", "wiki", ""]);
    expect(options.map((o) => o.trail)).toEqual(["42 pages", "1 page", "9 pages"]);
    expect(options[0]?.hint).toBe("The first folder that holds pages");
    expect(options[1]?.hint).toBeUndefined();
    expect(options[0]?.name).toBe("docs/, 42 pages");
  });
});

describe("keyAction", () => {
  const key = (k: string, over: Partial<Parameters<typeof keyAction>[0]> = {}) => ({
    key: k,
    typing: false,
    onControl: false,
    modified: false,
    composing: false,
    ...over,
  });

  it("sends the number keys to the folder screen, and nowhere else", () => {
    expect(keyAction(key("2"), "root")).toEqual({ do: "digit", n: 2 });
    expect(keyAction(key("2"), "preview")).toBeUndefined();
    expect(keyAction(key("2"), "link")).toBeUndefined();
    expect(keyAction(key("0"), "root")).toBeUndefined();
  });

  it("goes back with Backspace or ←, except on the first screen", () => {
    expect(keyAction(key("Backspace"), "preview")).toEqual({ do: "back" });
    expect(keyAction(key("ArrowLeft"), "root")).toEqual({ do: "back" });
    expect(keyAction(key("Backspace"), "link")).toBeUndefined();
  });

  it("goes on with Enter, unless a button or an answer has focus (it handles Enter itself)", () => {
    expect(keyAction(key("Enter"), "preview")).toEqual({ do: "advance" });
    expect(keyAction(key("Enter", { onControl: true }), "preview")).toBeUndefined();
  });

  it("leaves every key to the person while they type, and to a shortcut or a composition", () => {
    for (const k of ["1", "Backspace", "ArrowLeft", "Enter"])
      expect(keyAction(key(k, { typing: true }), "root")).toBeUndefined();
    expect(keyAction(key("Enter", { modified: true }), "link")).toBeUndefined();
    expect(keyAction(key("1", { composing: true }), "root")).toBeUndefined();
  });
});

describe("excerptOf", () => {
  it("drops the frontmatter and the title heading, and keeps what follows", () => {
    expect(
      excerptOf("---\ntitle: Handbook\n---\n\n# Handbook\n\nHow we work.\n\n## Part\n\nMore.\n"),
    ).toBe("How we work.\n\n## Part\n\nMore.");
  });

  it("drops pictures and bare video links, which the preview does not load", () => {
    const text = "Intro.\n\n![Flow](media/flow.gif)\n\nhttps://youtu.be/dQw4w9WgXcQ\n\nOutro.\n";
    expect(excerptOf(text)).toBe("Intro.\n\nOutro.");
  });

  it("turns links to other pages into plain words, since the library is not added yet", () => {
    const out = excerptOf(
      "Read [[getting-started]], [[runbooks/rotate-keys#why|the key runbook]], [setup](../a/setup.md) and [GitHub](https://github.com).\n",
    );
    expect(out).toBe(
      "Read Getting started, the key runbook, setup and [GitHub](https://github.com).",
    );
  });

  it("turns a link to a heading into plain words, and a picture inside a line into its alt text", () => {
    expect(
      excerptOf(
        "- [Deprecated](#deprecated)\n- [Build ![ci](https://x.dev/badge.svg)](https://x.dev)\n",
      ),
    ).toBe("- Deprecated\n- [Build ci](https://x.dev)");
  });

  it("keeps an issue id as it is, without the brackets", () => {
    expect(excerptOf("See [[wf-y4bz7]].")).toBe("See wf-y4bz7.");
  });

  it("cuts a long page at a paragraph", () => {
    const para = "Word ".repeat(40).trim();
    const text = Array.from({ length: 12 }, () => para).join("\n\n");
    const out = excerptOf(text, 700);
    expect(out.length).toBeLessThanOrEqual(700);
    expect(out.endsWith("Word")).toBe(true);
    expect(out.split("\n\n").every((p) => p === para)).toBe(true);
  });
});

describe("repo links", () => {
  it("shortens a GitHub address to owner/repo", () => {
    expect(repoName("https://github.com/acme/handbook")).toBe("acme/handbook");
    expect(repoName("https://www.github.com/acme/handbook/")).toBe("acme/handbook");
  });

  it("builds the page of the folder a library is read from", () => {
    expect(repoHref({ url: "https://github.com/acme/handbook", ref: "main", root: "docs" })).toBe(
      "https://github.com/acme/handbook/tree/main/docs",
    );
    expect(repoHref({ url: "https://github.com/acme/handbook", ref: "v2" })).toBe(
      "https://github.com/acme/handbook/tree/v2",
    );
    expect(repoHref({})).toBeUndefined();
  });

  it("builds the link that reads the library again", () => {
    expect(readLink({ url: "https://github.com/acme/handbook", ref: "main", root: "docs" })).toBe(
      "https://github.com/acme/handbook/tree/main/docs",
    );
    expect(readLink({ url: "https://github.com/acme/handbook", ref: "main" })).toBe(
      "https://github.com/acme/handbook/tree/main",
    );
  });
});

describe("suggestionsFor", () => {
  const lib = (over: object) => ({ kind: "team", loaded: true, name: "L", ...over });

  it("offers the example library when nothing is added", () => {
    expect(suggestionsFor(undefined).map((s) => s.repo)).toEqual(["acme/platform-handbook"]);
    expect(suggestionsFor([lib({ kind: "workspace", url: undefined })]).map((s) => s.repo)).toEqual(
      ["acme/platform-handbook"],
    );
  });

  it("offers a library of libraries.toml that was not read, before the example", () => {
    const out = suggestionsFor([
      lib({ loaded: false, url: "https://github.com/acme/handbook", name: "Handbook" }),
    ]);
    expect(out).toEqual([
      {
        url: "https://github.com/acme/handbook",
        repo: "acme/handbook",
        name: "Handbook",
        hint: "In your libraries.toml",
      },
      expect.objectContaining({ repo: "acme/platform-handbook" }),
    ]);
  });

  it("leaves the example out once it is added, and a library that is already read", () => {
    const out = suggestionsFor([
      lib({ url: "https://github.com/acme/platform-handbook" }),
      lib({ url: "https://github.com/acme/other" }),
    ]);
    expect(out).toEqual([]);
  });
});
