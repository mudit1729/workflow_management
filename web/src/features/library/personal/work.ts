// What the Work section of the personal library is made of (spec 3): one target for each group
// and each issue of the workspace, and whether a summary exists for it and still matches. Pure,
// no React: the mock's generator (`mock/libraries/work-summaries.ts`) builds the list and the
// Personal home draws it.
//
// A summary is a markdown page, `work/<workspace>/<group path>/<issue-id>.md` or `_group.md`. It
// carries the `rev` of its folder when it was written; the target carries the rev of the folder
// now. They differ exactly when something in the folder changed after the summary: it is stale.
import type { IssueStatus, Priority } from "@/gen/types";

/** The folder of the personal library that holds the work summaries. */
export const WORK_ROOT = "work";

/**
 * The order of the issues of a group (spec 3): what moves first. Blocked sits after in progress,
 * cancelled last; the spec names the other five.
 */
export const WORK_STATUS_ORDER: IssueStatus[] = [
  "in_progress",
  "blocked",
  "review",
  "planned",
  "backlog",
  "done",
  "cancelled",
];

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** What a summary page says about itself, read from its frontmatter. */
export interface SummaryMeta {
  /** The rev of the folder when the page was written. */
  rev: string;
  summarizedAt?: string;
  summarizedBy?: string;
}

/** A group or an issue that can have a summary. */
export interface WorkTarget {
  kind: "issue" | "group";
  /** The group path (`wf/web`) or the issue id (`wf-3k9x2`). */
  key: string;
  title: string;
  /** Page path in the personal library: `work/wf/wf/web/wf-3k9x2.md` or `…/_group.md`. */
  path: string;
  /** The group that holds it, as a group path; "" for a top-level group or an issue outside any group. */
  parent: string;
  /** An issue: its status now, as the board shows it. */
  status?: IssueStatus;
  priority?: Priority;
  /** A group: the issues in it and below it. */
  issues?: number;
  /** The rev of its folder now. */
  rev: string;
  /** The summary page, when there is one. */
  summary?: SummaryMeta;
}

export interface WorkList {
  /** The alias of the workspace library, also the folder under `work/`. */
  workspace: string;
  /** Groups and issues in tree order: a group, then its issues by status, then its subgroups. */
  targets: WorkTarget[];
}

export type SummaryState = "current" | "stale" | "none";

export function summaryState(t: WorkTarget): SummaryState {
  if (!t.summary) return "none";
  return t.summary.rev === t.rev ? "current" : "stale";
}

/** A group of the Work section with what is inside it. */
export interface WorkGroup {
  target: WorkTarget;
  /** Its issues, grouped by status in `WORK_STATUS_ORDER`; empty statuses are left out. */
  byStatus: { status: IssueStatus; issues: WorkTarget[] }[];
  groups: WorkGroup[];
  /** Summaries below it (itself included) that are stale or missing. */
  stale: number;
  missing: number;
}

export interface WorkTree {
  groups: WorkGroup[];
  /** Issues that sit in no group. */
  loose: WorkTarget[];
}

/** Arrange a flat list of targets as the group tree, with counts of what needs a summary. */
export function workTree(list: WorkList): WorkTree {
  const issues = list.targets.filter((t) => t.kind === "issue");
  const nodes = new Map<string, WorkGroup>();
  for (const t of list.targets) {
    if (t.kind !== "group") continue;
    nodes.set(t.key, { target: t, byStatus: [], groups: [], stale: 0, missing: 0 });
  }
  const tree: WorkTree = { groups: [], loose: [] };
  for (const node of nodes.values()) {
    const parent = nodes.get(node.target.parent);
    (parent ? parent.groups : tree.groups).push(node);
  }
  for (const issue of issues) {
    const holder = nodes.get(issue.parent);
    if (!holder) {
      tree.loose.push(issue);
      continue;
    }
    const status = issue.status ?? "backlog";
    let bucket = holder.byStatus.find((b) => b.status === status);
    if (!bucket) {
      bucket = { status, issues: [] };
      holder.byStatus.push(bucket);
    }
    bucket.issues.push(issue);
  }
  const rank = (s: IssueStatus) => WORK_STATUS_ORDER.indexOf(s);
  const count = (node: WorkGroup): void => {
    node.byStatus.sort((a, b) => rank(a.status) - rank(b.status));
    node.stale = 0;
    node.missing = 0;
    const note = (t: WorkTarget) => {
      const state = summaryState(t);
      if (state === "stale") node.stale += 1;
      else if (state === "none") node.missing += 1;
    };
    note(node.target);
    for (const bucket of node.byStatus) for (const i of bucket.issues) note(i);
    for (const child of node.groups) {
      count(child);
      node.stale += child.stale;
      node.missing += child.missing;
    }
  };
  for (const node of tree.groups) count(node);
  return tree;
}

/** Every target at or below a group: the group, its issues and its subgroups, deepest group first. */
export function targetsBelow(group: WorkGroup): WorkTarget[] {
  const out: WorkTarget[] = [];
  const walk = (g: WorkGroup) => {
    for (const child of g.groups) walk(child);
    for (const bucket of g.byStatus) out.push(...bucket.issues);
    out.push(g.target);
  };
  walk(group);
  return out;
}

/** The targets a run for the group `key` writes: the group, its issues and the groups below it. */
export function targetsUnder(list: WorkList, key: string): WorkTarget[] {
  const find = (groups: WorkGroup[]): WorkGroup | undefined => {
    for (const g of groups) {
      if (g.target.key === key) return g;
      const hit = find(g.groups);
      if (hit) return hit;
    }
    return undefined;
  };
  const node = find(workTree(list).groups);
  return node ? targetsBelow(node) : [];
}

/** "1 stale", "2 stale · 1 not summarized", or nothing. */
export function needsLine(stale: number, missing: number): string {
  return [stale > 0 && `${stale} stale`, missing > 0 && `${missing} not summarized`]
    .filter(Boolean)
    .join(" · ");
}
