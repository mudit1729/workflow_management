// Status vocabulary and the transition table (contract 1.6).
import type { IssueStatus, IssueSummary, TaskStatus } from "@/gen/types";

export const STATUS_ORDER: IssueStatus[] = [
  "backlog",
  "planned",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
];

/** Board columns. Cancelled is hidden unless `show=cancelled`. */
export const BOARD_COLUMNS: IssueStatus[] = [
  "backlog",
  "planned",
  "in_progress",
  "blocked",
  "review",
  "done",
];

/** Columns that fold to a 36 px rail. */
export const FOLDABLE_COLUMNS: IssueStatus[] = ["backlog", "done"];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  backlog: "Backlog",
  planned: "Planned",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};

/** CSS color for a status (issue or task). Tasks map todo → planned gray. */
export function statusColor(s: IssueStatus | TaskStatus): string {
  const key = s === "todo" ? "planned" : s;
  return `var(--wf-status-${key})`;
}

export const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  backlog: ["planned", "in_progress", "cancelled"],
  planned: ["in_progress", "backlog", "cancelled"],
  in_progress: ["blocked", "review", "done", "planned"],
  blocked: ["in_progress", "cancelled"],
  review: ["in_progress", "done"],
  done: ["in_progress"],
  cancelled: ["backlog"],
};

export function isLegalTransition(from: IssueStatus, to: IssueStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Steering text for an illegal move, e.g. "backlog → done is not allowed; allowed: planned, in progress, cancelled". */
export function illegalReason(from: IssueStatus, to: IssueStatus): string {
  const allowed = TRANSITIONS[from].map((s) => STATUS_LABEL[s].toLowerCase()).join(", ");
  return `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]} is not an allowed move. From ${STATUS_LABEL[from].toLowerCase()} you can go to: ${allowed}.`;
}

/** Soft done gate (contract 1.6): the gaps to list before a move to done. Empty = no gate. */
export function doneGaps(issue: IssueSummary): string[] {
  const gaps: string[] = [];
  const c = issue.progress.criteria;
  const unverified = c.total - c.verified;
  if (unverified > 0) {
    const open = c.total - c.verified - c.claimed;
    const parts: string[] = [];
    if (open > 0) parts.push(`${open} open`);
    if (c.claimed > 0) parts.push(`${c.claimed} claimed without evidence`);
    gaps.push(`${unverified} of ${c.total} criteria not verified (${parts.join(", ")})`);
  }
  const t = issue.progress.tasks;
  const unfinished = t.total - t.done;
  if (t.total > 0 && unfinished > 0) gaps.push(`${unfinished} of ${t.total} tasks not done`);
  const leases = issue.lease_holders.length;
  if (leases > 0)
    gaps.push(
      `${leases} open lease${leases > 1 ? "s" : ""} (${issue.lease_holders.map((h) => `@${h}`).join(", ")})`,
    );
  if (issue.signals.needs_you > 0)
    gaps.push(
      `${issue.signals.needs_you} open needs-you request${issue.signals.needs_you > 1 ? "s" : ""}`,
    );
  return gaps;
}
