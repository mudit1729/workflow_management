// Workspace-relative path helpers: names, validation for a new file, and what each well-known
// file drives in the UI. Pure, so the dialog, the tree and the tests share one set of rules.
import type { IssueTab, LogView } from "@/lib/nav";

export const ISSUE_FILE_NAMES = [
  "goal.md",
  "plan.md",
  "current_state.md",
  "changes.md",
  "decisions.md",
  "learnings.md",
] as const;
export type IssueFileName = (typeof ISSUE_FILE_NAMES)[number];

export function isIssueFileName(name: string): name is IssueFileName {
  return (ISSUE_FILE_NAMES as readonly string[]).includes(name);
}

/** Where each issue file shows up in the issue view. */
export const ISSUE_FILE_TARGET: Record<IssueFileName, { tab: IssueTab; log?: LogView }> = {
  "goal.md": { tab: "goal" },
  "plan.md": { tab: "plan" },
  "current_state.md": { tab: "now" },
  "changes.md": { tab: "log", log: "changes" },
  "decisions.md": { tab: "log", log: "decisions" },
  "learnings.md": { tab: "log", log: "learnings" },
};

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** "" for a file at the workspace root. */
export function dirname(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

export function extension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/");
}

/** Every ancestor folder of a path, outermost first: "a/b/c.md" → ["a", "a/b"]. */
export function ancestors(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

// ---------------------------------------------------------------- validation

/** Names the scanner ignores (contract 1.2). A new file cannot live under them. */
const IGNORED = new Set([".git", ".wf", "node_modules", ".DS_Store"]);
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_PATH = 180;

/**
 * Why `raw` cannot be a new file path, or null when it can. The messages are written to be shown
 * as they are, one problem at a time.
 */
export function validateNewPath(
  raw: string,
  existing: ReadonlySet<string>,
  opts: { allowExisting?: boolean } = {},
): string | null {
  const path = raw;
  if (path.trim() === "") return "Enter a path.";
  if (path !== path.trim()) return "Remove the spaces around the path.";
  if (path.startsWith("/")) return "Use a path inside the workspace, without a leading slash.";
  if (path.includes("\\")) return "Use forward slashes.";
  if (path.length > MAX_PATH) return "The path is too long.";
  if (path.endsWith("/")) return "The path must end in a file name.";
  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "") return "Remove the empty segment between two slashes.";
    if (seg === "." || seg === "..") return "A path cannot contain . or .. segments.";
    if (IGNORED.has(seg)) return `${seg} is ignored by the workspace scanner.`;
    if (!SEGMENT.test(seg)) return "Use letters, numbers, dots, dashes and underscores.";
  }
  const name = basename(path);
  if (name === ".md" || name === ".toml") return `Give the file a name before ${name}.`;
  const ext = extension(path);
  if (ext !== ".md" && ext !== ".toml") return "Use a .md or .toml file.";
  if (!opts.allowExisting && existing.has(path)) return "A file already exists at that path.";
  return null;
}

/** A quiet note about what a path will mean, or null. Not an error. */
export function pathHint(path: string, issuesDir = "issues"): string | null {
  if (!path.endsWith(".md") && !path.endsWith(".toml")) return null;
  const name = basename(path);
  const dir = dirname(path);
  if (name === "goal.md") return "A folder with a goal.md is an issue. It shows in Backlog.";
  if (name === "_group.md") return "A _group.md turns its folder into a group.";
  if (isIssueFileName(name)) return `${name} only counts next to a goal.md in the same folder.`;
  if (dir === issuesDir) return `Files directly in ${issuesDir}/ do not belong to an issue.`;
  return null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** Valid issue or group folder name: lowercase words joined by dashes. */
export function validateSlug(slug: string): string | null {
  if (slug === "") return "Enter a folder name for the issue.";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return "Use lowercase letters, numbers and dashes.";
  if (slug.endsWith("-")) return "Do not end the name with a dash.";
  return null;
}

// ---------------------------------------------------------------- what a file drives

const ROLE: Record<string, string> = {
  "goal.md": "Drives the card, its status and the Goal tab.",
  "plan.md": "Drives the Plan tab and the task lanes.",
  "current_state.md": "Drives the Now tab and what needs you.",
  "changes.md": "Each entry shows in the Log tab.",
  "decisions.md": "Each entry shows as a decision card in the Log tab.",
  "learnings.md": "Each entry shows as a learning card in the Log tab.",
  "_group.md": "Defines a group: its title, color and owner.",
  "workflow.toml": "Workspace settings: name, leases and staleness.",
  "authors.md": "The roster behind every @handle.",
  "glossary.md": "One term, one meaning. The S09 rule reads it.",
};

export function roleHint(path: string, libraryDir = "library"): string | undefined {
  const name = basename(path);
  if (ROLE[name]) return ROLE[name];
  if (path.startsWith(`${libraryDir}/`) && extension(path) === ".md") {
    return "A library item. Reviewed items reach agent context.";
  }
  return undefined;
}

/** The skill of the workflow plugin that writes each issue file (a hint next to "Create"). */
export const ISSUE_FILE_SKILL: Record<IssueFileName, string> = {
  "goal.md": "adding-work",
  "plan.md": "planning-issues",
  "current_state.md": "handing-off",
  "changes.md": "logging-work",
  "decisions.md": "logging-work",
  "learnings.md": "logging-work",
};
