// Add team library (spec 4.1): the flow as plain data. Which screens there are, what a failure
// says and offers, the alias rules and what a key does. No React, so the rules are easy to test.
import type { Failure, Found, RootChoice } from "@mock/libraries/github";
import { PERSONAL_ALIAS } from "../address";
import { splitFrontmatter } from "../markdown";

/** One question per screen: the link, the folder (only when there are several), the preview. */
export type Screen = "link" | "root" | "preview";

export const SCREEN_LABEL: Record<Screen, string> = {
  link: "GitHub link",
  root: "Folder",
  preview: "Preview",
};

/** The screens a link goes through. The folder question comes up only when the repo has several. */
export function screensFor(found: Found | undefined): Screen[] {
  return found && found.choices.length > 1 ? ["link", "root", "preview"] : ["link", "preview"];
}

/**
 * The example library: a fixture repo the link resolver knows (mock/teams), so the prototype can
 * add a team library with no network.
 */
export const EXAMPLE = {
  url: "https://github.com/acme/platform-handbook",
  repo: "acme/platform-handbook",
  name: "Platform handbook",
  hint: "An example with a video and a GIF",
};

/** `https://github.com/acme/handbook` → `acme/handbook`. */
export const repoName = (url: string) =>
  url.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/+$/, "");

/** A repo offered as a button on the first screen. */
export interface Suggestion {
  url: string;
  repo: string;
  name: string;
  hint: string;
}

/**
 * The repos offered on the first screen: libraries listed in `libraries.toml` that this session has
 * not read (one click reads them), then the example library unless it is already added.
 */
export function suggestionsFor(
  libraries: readonly { kind: string; loaded: boolean; url?: string; name: string }[] | undefined,
): Suggestion[] {
  const listed: Suggestion[] = (libraries ?? [])
    .filter((l) => l.kind === "team" && !l.loaded && l.url)
    .map((l) => ({
      url: l.url as string,
      repo: repoName(l.url as string),
      name: l.name,
      hint: "In your libraries.toml",
    }));
  const have = (libraries ?? []).some((l) => l.loaded && l.url === EXAMPLE.url);
  return [...listed, ...(have ? [] : [EXAMPLE])];
}

/** What a failure tells the person and what it offers to do next. */
export interface Explained {
  message: string;
  hint?: string;
  /** `connect`: read it through an agent. `example`: use the example library. `retry`: ask again. */
  actions: ("connect" | "example" | "retry")[];
}

/** One plain sentence per failure, and a way forward (spec L2). */
export function explain(failure: Failure): Explained {
  switch (failure.kind) {
    case "private":
      return {
        message: failure.message,
        hint: "An agent reads private repos with your own git credentials.",
        actions: ["connect"],
      };
    case "unreachable":
      return {
        message: failure.message,
        hint: "You may be offline, or this page may be blocked from GitHub. The example library needs no network.",
        actions: ["retry", "example"],
      };
    case "rate-limited":
      return {
        message: failure.message,
        hint: "An agent is not held to that limit. The example library needs no network.",
        actions: ["connect", "example"],
      };
    default:
      return { message: failure.message, actions: [] };
  }
}

// ---------------------------------------------------------------- the alias

export const ALIAS_MAX = 32;

/** What is wrong with an alias, in one sentence, or `undefined` when it will do. */
export function aliasProblem(raw: string, taken: readonly string[]): string | undefined {
  const alias = raw.trim().toLowerCase();
  if (!alias) return "Give the library a short name.";
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(alias))
    return "Use lower-case letters, digits, - and _, starting with a letter or digit.";
  if (alias.length > ALIAS_MAX) return `Keep it to ${ALIAS_MAX} characters or fewer.`;
  if (alias === PERSONAL_ALIAS || alias === "t")
    return `${alias} is used in page addresses. Pick another.`;
  if (taken.includes(alias)) return `${alias} is taken. Pick another.`;
  return undefined;
}

/** The alias a library gets unless the person changes it: the repo name, made safe and free. */
export function suggestAlias(repo: string, taken: readonly string[] = []): string {
  const used = new Set([...taken, PERSONAL_ALIAS, "t"]);
  const base =
    repo
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^[^a-z0-9]+|-+$/g, "")
      .slice(0, ALIAS_MAX - 3) || "library";
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

// ---------------------------------------------------------------- the folder question

export const pagesLabel = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

/** `docs/`, or the whole repo. */
export const rootLabel = (c: RootChoice) => (c.root ? `${c.root}/` : "Whole repo");

/** The answers of the folder screen, in the order of the number keys: key n picks choice n. */
export function rootOptions(choices: RootChoice[]) {
  return choices.map((c, i) => ({
    value: c.root,
    label: rootLabel(c),
    hint: i === 0 ? "The first folder that holds pages" : undefined,
    trail: pagesLabel(c.pages),
    name: `${rootLabel(c)}, ${pagesLabel(c.pages)}`,
  }));
}

// ---------------------------------------------------------------- keys

export type KeyAction =
  /** Enter outside a button: go on with the screen. */
  | { do: "advance" }
  /** Backspace and ←: the screen before. */
  | { do: "back" }
  /** 1 to 9 on the folder screen: the screen's answers take it. */
  | { do: "digit"; n: number };

export interface KeyInput {
  key: string;
  /** Focus is in a field: the keys are the person's. */
  typing: boolean;
  /** Focus is on a button, a link or an answer: Enter belongs to it. */
  onControl: boolean;
  /** Ctrl, Alt or Meta is down. */
  modified: boolean;
  composing: boolean;
}

/** What the panel does for a key. The folder screen's number keys pick; Enter goes on. */
export function keyAction(input: KeyInput, screen: Screen): KeyAction | undefined {
  if (input.modified || input.composing || input.typing) return undefined;
  if (/^[1-9]$/.test(input.key))
    return screen === "root" ? { do: "digit", n: Number(input.key) } : undefined;
  if (input.key === "Backspace" || input.key === "ArrowLeft")
    return screen === "link" ? undefined : { do: "back" };
  if (input.key === "Enter") return input.onControl ? undefined : { do: "advance" };
  return undefined;
}

// ---------------------------------------------------------------- the first page, small

/** `runbooks/rotate-keys#why` → `Rotate keys`: a link target read as words. */
function wordsOf(target: string): string {
  const name = (target.split("#")[0] ?? "").split("/").filter(Boolean).at(-1) ?? target;
  const words = name
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? (words[0] ?? "").toUpperCase() + words.slice(1) : target;
}

/**
 * The start of a page for the preview: no frontmatter, no title heading, no pictures (a repo's
 * page must not load images from anywhere before it is added), and links to other pages and to
 * headings as plain words (the library is not added yet, so they would lead nowhere).
 * Cut at a paragraph, a few hundred characters in.
 */
export function excerptOf(text: string, max = 700): string {
  const lines = splitFrontmatter(text).body.split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  const body = (/^ {0,3}#[ \t]/.test(lines[first] ?? "") ? lines.slice(first + 1) : lines)
    .filter((l) => !/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(l))
    .filter((l) => !/^\s*https?:\/\/\S+\s*$/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, (_, target: string) =>
      /^[a-z][a-z0-9]*-[0-9a-z]{5}$/i.test(target) ? target : wordsOf(target),
    )
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((?![a-z][a-z0-9+.-]*:)[^)]*\)/gi, "$1")
    .trim();
  if (body.length <= max) return body;
  const cut = body.slice(0, max);
  const para = cut.lastIndexOf("\n\n");
  return (para > max / 3 ? cut.slice(0, para) : cut).trimEnd();
}
