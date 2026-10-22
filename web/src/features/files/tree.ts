// The file tree: files grouped into folders, with each folder given a role (group, issue,
// library …) from what the snapshot says lives there. Pure functions over plain data, so the
// shape, the sorting, the filter and the keyboard rows are tested without React.
import type { IssueStatus, LintCounts } from "@/gen/types";
import type { WorkspaceFileInfo } from "@/lib/api";
import { basename, dirname, ISSUE_FILE_NAMES } from "./paths";

/** Path of the synthetic folder that holds the files at the workspace root. */
export const WORKSPACE_FOLDER = "__workspace__";

export type FolderRole = "workspace" | "section" | "group" | "issue" | "library" | "plain";

export interface FileNode {
  type: "file";
  path: string;
  name: string;
  info: WorkspaceFileInfo;
  lint: LintCounts;
}

export interface FolderNode {
  type: "folder";
  path: string;
  name: string;
  role: FolderRole;
  /** Group or issue title; the section name for top-level sections. */
  title?: string;
  issueId?: string;
  status?: IssueStatus;
  color?: number;
  implicit?: boolean;
  order?: number;
  children: TreeNode[];
  /** Findings of every file underneath, so a collapsed folder still shows them. */
  lint: LintCounts;
  fileCount: number;
}

export type TreeNode = FileNode | FolderNode;

export interface IssueMeta {
  id: string;
  title: string;
  status: IssueStatus;
}

export interface GroupMeta {
  id: string;
  title: string;
  color: number;
  implicit: boolean;
  order: number;
}

export interface TreeContext {
  /** By issue folder path. */
  issues: ReadonlyMap<string, IssueMeta>;
  /** By group folder path. */
  groups: ReadonlyMap<string, GroupMeta>;
  issuesDir: string;
  libraryDir: string;
}

const noLint = (): LintCounts => ({ error: 0, warn: 0, info: 0 });

function addLint(into: LintCounts, from: LintCounts) {
  into.error += from.error;
  into.warn += from.warn;
  into.info += from.info;
}

export function totalLint(l: LintCounts): number {
  return l.error + l.warn + l.info;
}

// ---------------------------------------------------------------- build

const ROOT_ORDER = ["workflow.toml", "authors.md", "glossary.md", "AGENTS.md"];
const LIBRARY_KIND_ORDER = ["patterns", "playbooks", "gotchas", "decisions"];

function byName(a: TreeNode, b: TreeNode): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

function fileRank(name: string, order: readonly string[]): number {
  const i = order.indexOf(name);
  return i === -1 ? order.length : i;
}

function label(n: TreeNode): string {
  return n.type === "folder" ? (n.title ?? n.name) : n.name;
}

function sortChildren(folder: FolderNode, ctx: TreeContext) {
  const kids = folder.children;
  // The library section lists its kinds in a fixed order, like the library folders below it.
  const role: FolderRole = folder.path === ctx.libraryDir ? "library" : folder.role;
  switch (role) {
    case "workspace":
      kids.sort(
        (a, b) => fileRank(a.name, ROOT_ORDER) - fileRank(b.name, ROOT_ORDER) || byName(a, b),
      );
      break;
    case "issue":
      // The six issue files first, in reading order; then other files; then folders.
      kids.sort((a, b) => {
        const fa = a.type === "file" ? 0 : 1;
        const fb = b.type === "file" ? 0 : 1;
        return (
          fa - fb ||
          fileRank(a.name, ISSUE_FILE_NAMES) - fileRank(b.name, ISSUE_FILE_NAMES) ||
          byName(a, b)
        );
      });
      break;
    case "group":
    case "section":
      // _group.md, then sub-groups, then issues, then anything else.
      kids.sort((a, b) => {
        const rank = (n: TreeNode) =>
          n.type === "file"
            ? n.name === "_group.md"
              ? 0
              : 4
            : n.role === "group"
              ? 1
              : n.role === "issue"
                ? 2
                : 3;
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const oa = a.type === "folder" ? (a.order ?? 0) : 0;
        const ob = b.type === "folder" ? (b.order ?? 0) : 0;
        return oa - ob || label(a).localeCompare(label(b), undefined, { numeric: true });
      });
      break;
    case "library":
      kids.sort((a, b) => {
        const fa = a.type === "folder" ? 0 : 1;
        const fb = b.type === "folder" ? 0 : 1;
        return (
          fa - fb ||
          fileRank(a.name, LIBRARY_KIND_ORDER) - fileRank(b.name, LIBRARY_KIND_ORDER) ||
          byName(a, b)
        );
      });
      break;
    default:
      kids.sort((a, b) => {
        const fa = a.type === "folder" ? 0 : 1;
        const fb = b.type === "folder" ? 0 : 1;
        return fa - fb || byName(a, b);
      });
  }
}

function annotate(node: FolderNode, ctx: TreeContext, depth: number) {
  for (const child of node.children) {
    if (child.type === "folder") {
      annotate(child, ctx, depth + 1);
      addLint(node.lint, child.lint);
      node.fileCount += child.fileCount;
    } else {
      addLint(node.lint, child.lint);
      node.fileCount += 1;
    }
  }

  const hasFile = (name: string) => node.children.some((c) => c.type === "file" && c.name === name);
  const hasRole = (role: FolderRole) =>
    node.children.some((c) => c.type === "folder" && c.role === role);

  if (depth === 0) {
    if (node.path === WORKSPACE_FOLDER) {
      node.role = "workspace";
      node.title = "Workspace";
    } else if (node.path === ctx.issuesDir) {
      node.role = "section";
      node.title = "Issues";
    } else if (node.path === ctx.libraryDir) {
      node.role = "section";
      node.title = "Library";
    }
  } else {
    const issue = ctx.issues.get(node.path);
    const group = ctx.groups.get(node.path);
    if (issue || hasFile("goal.md")) {
      node.role = "issue";
      node.title = issue?.title;
      node.issueId = issue?.id;
      node.status = issue?.status;
    } else if (group || hasFile("_group.md") || hasRole("issue") || hasRole("group")) {
      node.role = "group";
      node.title = group?.title;
      node.color = group?.color;
      node.implicit = group ? group.implicit : !hasFile("_group.md");
      node.order = group?.order;
    } else if (
      node.path.startsWith(`${ctx.libraryDir}/`) ||
      dirname(node.path) === ctx.libraryDir
    ) {
      node.role = "library";
    }
  }
  sortChildren(node, ctx);
}

/**
 * Group the files into folders. Root files go into a synthetic "Workspace" folder, which comes
 * first; then the issues section, the library, and any other top-level folder.
 */
export function buildTree(files: readonly WorkspaceFileInfo[], ctx: TreeContext): FolderNode[] {
  const folders = new Map<string, FolderNode>();
  const top: FolderNode[] = [];

  const folder = (path: string): FolderNode => {
    const found = folders.get(path);
    if (found) return found;
    const created: FolderNode = {
      type: "folder",
      path,
      name: path === WORKSPACE_FOLDER ? "Workspace" : basename(path),
      role: "plain",
      children: [],
      lint: noLint(),
      fileCount: 0,
    };
    folders.set(path, created);
    const parent = dirname(path);
    if (path === WORKSPACE_FOLDER || parent === "") top.push(created);
    else folder(parent).children.push(created);
    return created;
  };

  for (const info of files) {
    const dir = dirname(info.path);
    folder(dir === "" ? WORKSPACE_FOLDER : dir).children.push({
      type: "file",
      path: info.path,
      name: basename(info.path),
      info,
      lint: { error: info.errors, warn: info.warnings, info: info.infos },
    });
  }

  for (const t of top) annotate(t, ctx, 0);
  const rank = (f: FolderNode) =>
    f.path === WORKSPACE_FOLDER
      ? 0
      : f.path === ctx.issuesDir
        ? 1
        : f.path === ctx.libraryDir
          ? 2
          : 3;
  return top.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- rows

export interface TreeRow {
  node: TreeNode;
  depth: number;
  /** Path of the parent folder row, undefined at the top. */
  parent?: string;
  posinset: number;
  setsize: number;
  open: boolean;
}

/** Folders other than issues open by default; what is inside an issue stays folded. */
export function defaultOpen(folder: FolderNode, insideIssue: boolean): boolean {
  return folder.role !== "issue" && !insideIssue;
}

/** The rows a tree shows: depth-first, descending only into open folders. */
export function flattenTree(
  nodes: readonly TreeNode[],
  isOpen: (folder: FolderNode, insideIssue: boolean) => boolean,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (
    list: readonly TreeNode[],
    depth: number,
    parent: string | undefined,
    inside: boolean,
  ) => {
    list.forEach((node, i) => {
      const open = node.type === "folder" && isOpen(node, inside);
      rows.push({ node, depth, parent, posinset: i + 1, setsize: list.length, open });
      if (node.type === "folder" && open) {
        walk(node.children, depth + 1, node.path, inside || node.role === "issue");
      }
    });
  };
  walk(nodes, 0, undefined, false);
  return rows;
}

// ---------------------------------------------------------------- filter

/**
 * Keep the files whose path matches `query` and their folders. A folder that matches by title,
 * name or issue id keeps everything under it, so typing an issue's name shows its files.
 */
export function filterTree(nodes: readonly TreeNode[], query: string): TreeNode[] {
  const term = query.trim().toLowerCase();
  if (term === "") return [...nodes];
  const out: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.path.toLowerCase().includes(term)) out.push(node);
      continue;
    }
    const self = [
      node.title,
      node.name,
      node.issueId,
      node.path === WORKSPACE_FOLDER ? "" : node.path,
    ]
      .filter(Boolean)
      .some((s) => (s as string).toLowerCase().includes(term));
    if (self) {
      out.push(node);
      continue;
    }
    const children = filterTree(node.children, term);
    if (children.length > 0) out.push({ ...node, children });
  }
  return out;
}

/** Folder paths to open so that `path` is visible: its ancestors, outermost first. */
export function revealPaths(path: string): string[] {
  const dir = dirname(path);
  if (dir === "") return [WORKSPACE_FOLDER];
  const parts = dir.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function findFile(nodes: readonly TreeNode[], path: string): FileNode | undefined {
  for (const n of nodes) {
    if (n.type === "file") {
      if (n.path === path) return n;
    } else {
      const hit = findFile(n.children, path);
      if (hit) return hit;
    }
  }
  return undefined;
}
