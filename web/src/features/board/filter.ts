// Board filtering, ordering and lane building. Pure functions over the snapshot,
// so the board, the keyboard model and the toolbar summary agree on one view.
import type { GroupNode, IssueStatus, IssueSummary, NeedsYouItem, Priority } from "@/gen/types";
import { issuesInGroup } from "@/lib/api";
import { parseTs } from "@/lib/format";
import type { BoardSearch } from "@/lib/nav";
import { BOARD_COLUMNS, STATUS_ORDER } from "@/lib/status";

// ---------------------------------------------------------------- ordering

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** Milliseconds of the last activity, falling back to creation. */
export function activityTime(issue: IssueSummary): number {
  return parseTs(issue.last_activity?.ts ?? issue.created);
}

/** Card order inside a column: priority (urgent first), then the most recent activity. */
export function compareCards(a: IssueSummary, b: IssueSummary): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    activityTime(b) - activityTime(a) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Where a dropped card will land in a sorted column. A move writes fresh activity,
 * so the card goes to the top of its priority band.
 */
export function landingIndex(column: IssueSummary[], priority: Priority): number {
  const rank = PRIORITY_RANK[priority];
  const i = column.findIndex((c) => PRIORITY_RANK[c.priority] >= rank);
  return i === -1 ? column.length : i;
}

// ---------------------------------------------------------------- filters

export interface BoardFilter {
  authors: string[]; // handles without "@"
  q: string;
  showCancelled: boolean;
  /** Only issues with an open request for the acting person (`?needs=me`). */
  needsMe: boolean;
}

/** `author` travels as a comma-separated list of handles: "shruti,codex". */
export function parseAuthorParam(param?: string): string[] {
  if (!param) return [];
  const out: string[] = [];
  for (const raw of param.split(",")) {
    const h = raw.trim().replace(/^@/, "");
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

export function formatAuthorParam(handles: string[]): string | undefined {
  return handles.length ? handles.join(",") : undefined;
}

export function filterFromSearch(search: BoardSearch): BoardFilter {
  return {
    authors: parseAuthorParam(search.author),
    q: (search.q ?? "").trim(),
    showCancelled: search.show === "cancelled",
    needsMe: search.needs === "me",
  };
}

export function hasActiveFilter(f: BoardFilter): boolean {
  return f.authors.length > 0 || f.q !== "" || f.needsMe;
}

// ---------------------------------------------------------------- needs you

/** Requests that wait on `me`: addressed to them and not yet answered. */
export function openRequestsFor(inbox: readonly NeedsYouItem[], me: string): NeedsYouItem[] {
  return inbox.filter((r) => r.to === me && !r.answered);
}

export interface NeedsYou {
  /** Open requests for the person, across the workspace. */
  requests: number;
  /** The issues those requests sit in. */
  issues: ReadonlySet<string>;
  /** Open requests for the person, per issue. */
  byIssue: ReadonlyMap<string, number>;
}

export function needsYou(inbox: readonly NeedsYouItem[], me: string): NeedsYou {
  const open = openRequestsFor(inbox, me);
  const byIssue = new Map<string, number>();
  for (const r of open) byIssue.set(r.issue, (byIssue.get(r.issue) ?? 0) + 1);
  return { requests: open.length, issues: new Set(byIssue.keys()), byIssue };
}

/** Everyone attached to an issue: owner, coordinator, lease holders, last actor. */
export function issueAuthors(issue: IssueSummary): string[] {
  const set = new Set<string>();
  if (issue.owner) set.add(issue.owner);
  if (issue.coordinator) set.add(issue.coordinator.holder);
  for (const h of issue.lease_holders) set.add(h);
  if (issue.last_activity) set.add(issue.last_activity.author);
  return [...set];
}

/** Every whitespace-separated term must appear in the id, title or labels. */
export function matchesQuery(issue: IssueSummary, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = [issue.id, issue.title, ...issue.labels].join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t.replace(/^#/, "")));
}

/**
 * `needs` is the set of issue ids that have an open request for the person; the filter's
 * `needsMe` keeps only those. Without the set the flag has nothing to match and keeps nothing.
 */
export function applyFilter(
  issues: IssueSummary[],
  f: BoardFilter,
  needs?: ReadonlySet<string>,
): IssueSummary[] {
  return issues.filter((issue) => {
    if (issue.status === "cancelled" && !f.showCancelled) return false;
    if (f.needsMe && !needs?.has(issue.id)) return false;
    if (f.authors.length > 0) {
      const people = issueAuthors(issue);
      if (!f.authors.some((h) => people.includes(h))) return false;
    }
    return matchesQuery(issue, f.q);
  });
}

export function boardColumns(showCancelled: boolean): IssueStatus[] {
  return showCancelled ? [...BOARD_COLUMNS, "cancelled"] : BOARD_COLUMNS;
}

export function emptyBuckets(): Record<IssueStatus, IssueSummary[]> {
  const out = {} as Record<IssueStatus, IssueSummary[]>;
  for (const s of STATUS_ORDER) out[s] = [];
  return out;
}

/** Issues per status, each column sorted with `compareCards`. */
export function bucketByStatus(issues: IssueSummary[]): Record<IssueStatus, IssueSummary[]> {
  const out = emptyBuckets();
  for (const issue of issues) out[issue.status].push(issue);
  for (const s of STATUS_ORDER) out[s].sort(compareCards);
  return out;
}

// ---------------------------------------------------------------- summary

export interface BoardSummary {
  total: number;
  /**
   * Open requests that wait on the acting person, in these issues. With `mine` this is the number
   * the toolbar's "Needs you" toggle shows (at the whole workspace); without it, the open
   * requests addressed to anyone.
   */
  needsYou: number;
  blocking: number; // issues with a blocking request
  stale: number;
}

/**
 * The counts of the line under the board's name. Pass `mine` (the acting person's requests) so
 * the line and the "Needs you" toggle count the same thing: the toggle says 4 requests, the line
 * says 4 requests for you, however many other people's requests the issues hold.
 */
export function summarize(issues: IssueSummary[], mine?: NeedsYou): BoardSummary {
  let needsYou = 0;
  let blocking = 0;
  let stale = 0;
  for (const i of issues) {
    needsYou += mine ? (mine.byIssue.get(i.id) ?? 0) : i.signals.needs_you;
    if (i.signals.needs_you_blocking > 0) blocking++;
    if (i.signals.stale) stale++;
  }
  return { total: issues.length, needsYou, blocking, stale };
}

// ---------------------------------------------------------------- groups

export function findGroup(root: GroupNode, id: string): GroupNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const hit = findGroup(child, id);
    if (hit) return hit;
  }
  return undefined;
}

/** The chain of groups from the root (inclusive) down to `id`, or [] when absent. */
export function groupChain(root: GroupNode, id: string): GroupNode[] {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const tail = groupChain(child, id);
    if (tail.length) return [root, ...tail];
  }
  return [];
}

/** Titles of the selected group below the root, comparable with `IssueSummary.group_path`. */
export function basePathOf(chain: GroupNode[]): string[] {
  return chain.slice(1).map((g) => g.title);
}

/** An issue's group path relative to the board's selected group. */
export function relativeGroupPath(path: string[], base: string[]): string[] {
  if (base.length === 0 || base.length > path.length) return path;
  for (let i = 0; i < base.length; i++) if (path[i] !== base[i]) return path;
  return path.slice(base.length);
}

// ---------------------------------------------------------------- lanes

export const DIRECT_LANE = "__direct";
export const ALL_LANE = "__all";

export interface BoardLane {
  id: string; // group id, DIRECT_LANE or ALL_LANE
  title: string;
  group?: GroupNode;
  issues: IssueSummary[];
  byStatus: Record<IssueStatus, IssueSummary[]>;
}

export function singleLane(issues: IssueSummary[]): BoardLane {
  return { id: ALL_LANE, title: "All issues", issues, byStatus: bucketByStatus(issues) };
}

/**
 * One lane per direct child group, plus "No subgroup" for issues filed directly
 * in the selected group (only when it has any). Empty child lanes are dropped
 * while a filter is active, so a filtered board stays short.
 */
export function buildLanes(
  selected: GroupNode,
  issues: IssueSummary[],
  opts: { hideEmpty: boolean },
): BoardLane[] {
  const lanes: BoardLane[] = [];
  const children = [...selected.children].sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  );
  for (const child of children) {
    const own = issuesInGroup(child, issues);
    if (own.length === 0 && opts.hideEmpty) continue;
    lanes.push({
      id: child.id,
      title: child.title,
      group: child,
      issues: own,
      byStatus: bucketByStatus(own),
    });
  }
  const direct = issues.filter((i) => i.group === selected.id);
  if (direct.length > 0) {
    lanes.push({
      id: DIRECT_LANE,
      title: "No subgroup",
      issues: direct,
      byStatus: bucketByStatus(direct),
    });
  }
  return lanes;
}

/**
 * "8 issues · 3 in progress · 1 blocked · 2 need you" for a collapsed lane. Pass `mine` so the
 * last part counts the issues with a request for the acting person, as the "Needs you" filter
 * does; without it, the issues with an open request addressed to anyone.
 */
export function laneSummary(issues: IssueSummary[], mine?: NeedsYou): string {
  if (issues.length === 0) return "No issues";
  const parts = [`${issues.length} issue${issues.length === 1 ? "" : "s"}`];
  const count = (s: IssueStatus) => issues.filter((i) => i.status === s).length;
  const inProgress = count("in_progress");
  const blocked = count("blocked");
  const review = count("review");
  const needsYou = issues.filter((i) =>
    mine ? mine.issues.has(i.id) : i.signals.needs_you > 0,
  ).length;
  if (inProgress) parts.push(`${inProgress} in progress`);
  if (review) parts.push(`${review} in review`);
  if (blocked) parts.push(`${blocked} blocked`);
  if (needsYou) parts.push(`${needsYou} need${needsYou === 1 ? "s" : ""} you`);
  return parts.join(" · ");
}
