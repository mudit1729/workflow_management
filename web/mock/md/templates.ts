// What kind of file a workspace path is, and what a new file of that kind starts with.
// The "Workspace files" view uses both: the kind decides how to label and check a file, and
// the template fills the editor when someone creates a file.
import type { LibraryKind } from "@/gen/types";
import { newGroupFile, newIssueGoal } from "./edit";
import { kindFolder, LIBRARY_KINDS } from "./parse-misc";
import { baseName as base, isIgnored, parentDir as parent } from "./paths";
import {
  renderAuthors,
  renderGlossary,
  renderLibraryItem,
  renderPlan,
  renderState,
  renderWorkflowToml,
} from "./render";
import { ISSUE_FILES, type IssueFileName } from "./types";

export type FileKind =
  | "workflow"
  | "authors"
  | "glossary"
  | "group"
  | "goal"
  | "plan"
  | "state"
  | "changes"
  | "decisions"
  | "learnings"
  | "doc"
  | "asset"
  | "library"
  | "other"
  | "ignored";

export interface PathInfo {
  kind: FileKind;
  /** The issue folder the file belongs to, for the six issue files, docs and assets. */
  issueDir?: string;
  /** An issue file in a folder that has no `goal.md` (yet): the loader will not show it. */
  orphan?: boolean;
}

const ISSUE_KIND: Record<IssueFileName, FileKind> = {
  "goal.md": "goal",
  "plan.md": "plan",
  "current_state.md": "state",
  "changes.md": "changes",
  "decisions.md": "decisions",
  "learnings.md": "learnings",
};

const TEXT_DOC = /\.(md|markdown|txt|json|toml|ya?ml|csv|svg)$/i;

/**
 * Classify a workspace-relative path. `known` is every path of the workspace, so the issue
 * folder of a doc or an asset can be found by the nearest `goal.md` above it.
 */
export function describePath(
  path: string,
  known: Iterable<string> = [],
  cfg: { issuesDir?: string; libraryDir?: string } = {},
): PathInfo {
  const issuesDir = cfg.issuesDir ?? "issues";
  const libraryDir = cfg.libraryDir ?? "library";
  if (isIgnored(path)) return { kind: "ignored" };
  if (path === "workflow.toml") return { kind: "workflow" };
  if (path === "authors.md") return { kind: "authors" };
  if (path === "glossary.md") return { kind: "glossary" };
  if (path.startsWith(`${libraryDir}/`))
    return { kind: path.endsWith(".md") ? "library" : "other" };
  if (!path.startsWith(`${issuesDir}/`)) return { kind: "other" };

  const set = new Set(known);
  const name = base(path);
  const dir = parent(path);
  // Issues are leaves: the shallowest folder above the file that holds a goal.md is the issue.
  // Without one, the file's own folder is an issue when the file is its goal.md.
  const chain: string[] = [];
  for (let d = dir; d.startsWith(`${issuesDir}/`); d = parent(d)) chain.unshift(d);
  let issueDir = chain.find((d) => set.has(`${d}/goal.md`));
  if (!issueDir && name === "goal.md" && chain.length > 0) issueDir = dir;
  if (name === "_group.md" && !issueDir) return { kind: "group" };
  if (issueDir && dir === issueDir && (ISSUE_FILES as readonly string[]).includes(name))
    return { kind: ISSUE_KIND[name as IssueFileName], issueDir };
  if (issueDir) return { kind: TEXT_DOC.test(name) ? "doc" : "asset", issueDir };
  if ((ISSUE_FILES as readonly string[]).includes(name))
    return { kind: ISSUE_KIND[name as IssueFileName], issueDir: dir, orphan: true };
  return { kind: path.endsWith(".md") ? "doc" : "asset" };
}

// ---------------------------------------------------------------- templates

export interface TemplateContext {
  /** The current instant as an RFC 3339 timestamp, and today as a date. */
  now: string;
  today: string;
  /** The acting author, without `@`. */
  author: string;
  /** A fresh id with the prefix (`wf-`, `g-`, `lib-`) that no existing id uses. */
  newId(prefix: string): string;
  /** Config of the workspace, for `workflow.toml`. */
  config?: Parameters<typeof renderWorkflowToml>[0];
}

const humanize = (slug: string) => {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
};

const LIBRARY_SECTIONS: Record<LibraryKind, string[]> = {
  pattern: ["Rule", "When to use", "Example", "Evidence"],
  gotcha: ["Symptom", "Cause", "Fix", "Evidence"],
  playbook: ["Overview", "Procedure", "Done when", "Forbidden"],
  decision: ["Decision", "Because", "Rejected", "Revisit when"],
};

/**
 * The starting text of a new file at `path`, or `undefined` when the kind has no template
 * (docs and assets start empty). Every template loads without an error finding.
 */
export function fileTemplate(
  path: string,
  ctx: TemplateContext,
  known: Iterable<string> = [],
  cfg: { issuesDir?: string; libraryDir?: string } = {},
): string | undefined {
  const info = describePath(path, known, cfg);
  const dir = parent(path);
  const slug = base(dir);
  switch (info.kind) {
    case "goal":
      return newIssueGoal({
        id: ctx.newId("wf-"),
        title: humanize(slug),
        owner: ctx.author,
        created: ctx.now,
      });
    case "plan":
      return renderPlan({
        updated_at: ctx.now,
        updated_by: ctx.author,
        revision: 1,
        approach: "How the work gets done, in a few short sentences.",
        assumptions: [],
        prior_art: [],
        phases: [
          {
            index: 1,
            name: "First phase",
            tasks: [
              {
                id: "T-1",
                title: "Name the first task",
                status: "todo",
                lane: "main",
                satisfies: ["SC-1"],
                steps: [{ text: "Write the first step.", done: false }],
              },
            ],
          },
        ],
      });
    case "state":
      return renderState({
        summary: "Not started.",
        updated_at: ctx.now,
        updated_by: ctx.author,
        needs_you: [],
        next_steps: ["Write the plan."],
      });
    case "changes":
      return "# Changes\n";
    case "decisions":
      return "# Decisions\n";
    case "learnings":
      return "# Learnings\n";
    case "group":
      return newGroupFile({
        id: ctx.newId("g-"),
        title: humanize(slug),
        slug,
        owner: ctx.author,
        order: 0,
        implicit: false,
      });
    case "library": {
      const folder = base(dir);
      const kind = LIBRARY_KINDS.find((k) => kindFolder(k) === folder) ?? "pattern";
      const name = base(path).replace(/\.md$/, "");
      return renderLibraryItem({
        id: ctx.newId("lib-"),
        slug: name,
        title: humanize(name),
        kind,
        description: "Use when …",
        status: "draft",
        tags: [],
        applies_to: [],
        source: [],
        authors: [ctx.author],
        created: ctx.today,
        sections: LIBRARY_SECTIONS[kind].map((heading) => ({ heading, body_md: "…" })),
      });
    }
    case "authors":
      return renderAuthors([
        { handle: ctx.author, kind: "human", color: 1, lanes: [], max_leases: 3 },
      ]);
    case "glossary":
      return renderGlossary([]);
    case "workflow":
      return ctx.config ? renderWorkflowToml(ctx.config) : undefined;
    case "doc":
      return `# ${humanize(base(path).replace(/\.[^.]+$/, ""))}\n\n`;
    default:
      return undefined;
  }
}
