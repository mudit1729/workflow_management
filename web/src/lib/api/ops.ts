// Write hooks. Every write goes through `api.ops`:
//  - optimistic where the result is predictable (status, ticks, answers), rolled back on error;
//  - 409 → a toast "goal.md changed by @codex — reapply?" whose action re-reads the file and retries;
//  - 422 → a toast with the first gap or diagnostic;
//  - success → the issue detail and the snapshot are refreshed.
// The hooks return plain async functions: `(args) => Promise<OpResult | undefined>`.
// They resolve to `undefined` after showing the toast, so callers never need a try/catch.
import { useCallback } from "react";
import { toast } from "sonner";
import type {
  ContextLink,
  Criterion,
  CriterionId,
  EntryId,
  GroupId,
  IssueDetail,
  IssueId,
  IssueStatus,
  IssueSummary,
  LibId,
  LibraryItemDetail,
  LibraryKind,
  NeedsYouItem,
  OpResult,
  RequestId,
  Size,
  Task,
  TaskId,
  TaskStatus,
  WorkspaceSnapshot,
} from "@/gen/types";
import { api } from "./client";
import { firstProblem, isConflictError, isUnprocessableError } from "./error";
import { qk } from "./keys";
import { queryClient } from "./query-client";
import type { NewIssueOp, WfOp } from "./types";

type Rollback = () => void;
const noop: Rollback = () => undefined;

// ---------------------------------------------------------------- cache helpers

function snapshotRev(): string {
  return queryClient.getQueryData<WorkspaceSnapshot>(qk.snapshot())?.rev ?? "";
}

/** The rev of a file as the cache last saw it, for ops whose caller passed no `base_rev`. */
function cachedFileRev(issue: IssueId, file: string): string {
  const detail = queryClient.getQueryData<IssueDetail>(qk.issue(issue));
  return detail?.files_rev[file] ?? snapshotRev();
}

function patchSnapshot(fn: (s: WorkspaceSnapshot) => WorkspaceSnapshot): Rollback {
  const prev = queryClient.getQueryData<WorkspaceSnapshot>(qk.snapshot());
  if (!prev) return noop;
  queryClient.setQueryData(qk.snapshot(), fn(prev));
  return () => queryClient.setQueryData(qk.snapshot(), prev);
}

function patchDetail(id: IssueId, fn: (d: IssueDetail) => IssueDetail): Rollback {
  const prev = queryClient.getQueryData<IssueDetail>(qk.issue(id));
  if (!prev) return noop;
  queryClient.setQueryData(qk.issue(id), fn(prev));
  return () => queryClient.setQueryData(qk.issue(id), prev);
}

/** Patch the summary of one issue in the snapshot and in its cached detail. */
function patchSummary(id: IssueId, fn: (s: IssueSummary) => IssueSummary): Rollback {
  const a = patchSnapshot((s) => ({
    ...s,
    issues: s.issues.map((i) => (i.id === id ? fn(i) : i)),
  }));
  const b = patchDetail(id, (d) => ({ ...d, summary: fn(d.summary) }));
  return () => {
    a();
    b();
  };
}

function chain(...rollbacks: Rollback[]): Rollback {
  return () => {
    for (const r of rollbacks) r();
  };
}

async function settleFetches(issue?: IssueId): Promise<void> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: qk.snapshot() }),
    issue ? queryClient.cancelQueries({ queryKey: qk.issue(issue) }) : undefined,
  ]);
}

function refresh(issue?: IssueId) {
  void queryClient.invalidateQueries({ queryKey: qk.snapshot() });
  if (issue) void queryClient.invalidateQueries({ queryKey: qk.issue(issue) });
}

// ---------------------------------------------------------------- the runner

interface Run<O extends WfOp> {
  op: O;
  issue?: IssueId;
  /** Paint the expected result now; returns the undo. */
  optimistic?: () => Rollback;
  /** Re-read what the op's `base_rev` depends on, for "Reapply". */
  rebase?: (op: O) => Promise<O>;
  /** Fix the cache with facts only the server knows (the new file rev). */
  settle?: (result: OpResult) => void;
}

async function run<O extends WfOp>(r: Run<O>): Promise<OpResult | undefined> {
  await settleFetches(r.issue);
  const undo = r.optimistic?.() ?? noop;
  try {
    const result = await api.ops(r.op);
    r.settle?.(result);
    refresh(r.issue);
    return result;
  } catch (err) {
    undo();
    refresh(r.issue);
    explain(err, r);
    return undefined;
  }
}

function explain<O extends WfOp>(err: unknown, r: Run<O>) {
  if (isConflictError(err)) {
    toast.warning(`${err.body.reason} — reapply?`, {
      description: "Your change was not saved.",
      duration: 10_000,
      action: {
        label: "Reapply",
        onClick: () => {
          void (async () => {
            const op = r.rebase ? await r.rebase(r.op).catch(() => r.op) : r.op;
            await run({ ...r, op });
          })();
        },
      },
    });
    return;
  }
  if (isUnprocessableError(err)) {
    const { message, hint } = firstProblem(err);
    toast.error(message, hint ? { description: hint } : undefined);
    return;
  }
  toast.error("Could not save the change", {
    description: err instanceof Error ? err.message : "Try again in a moment.",
  });
}

async function freshRev(issue: IssueId, file: string): Promise<string> {
  const detail = await queryClient.fetchQuery({
    queryKey: qk.issue(issue),
    queryFn: () => api.issue(issue),
    staleTime: 0,
  });
  return detail.files_rev[file] ?? "";
}

// ---------------------------------------------------------------- status

/** Write a status. `force` skips the transition table and the done gate ("Move anyway"). */
export function performMove(
  issue: IssueSummary,
  to: IssueStatus,
  force = false,
): Promise<OpResult | undefined> {
  const op: WfOp = {
    op: "set_status",
    base_rev: issue.status_ref.rev,
    issue: issue.id,
    status: to,
    ...(force ? { force: true } : {}),
  };
  return run({
    op,
    issue: issue.id,
    optimistic: () => patchSummary(issue.id, (s) => ({ ...s, status: to })),
    rebase: async (o) => ({ ...o, base_rev: await freshRev(issue.id, "goal.md") }),
    settle: (res) =>
      patchSummary(issue.id, (s) => ({
        ...s,
        status_ref: { ...s.status_ref, rev: res.file_rev },
      })),
  });
}

// ---------------------------------------------------------------- criteria

function recount(criteria: Criterion[]): { claimed: number; verified: number } {
  return {
    claimed: criteria.filter((c) => c.state === "claimed").length,
    verified: criteria.filter((c) => c.state === "verified").length,
  };
}

function tickCriterion(issue: IssueId, id: CriterionId, checked: boolean): Rollback {
  const detail = queryClient.getQueryData<IssueDetail>(qk.issue(issue));
  const criteria = detail?.criteria.map((c) =>
    c.id === id
      ? {
          ...c,
          checked,
          state: !checked
            ? ("open" as const)
            : c.evidence
              ? ("verified" as const)
              : ("claimed" as const),
          evidence: checked ? c.evidence : undefined,
          verified_by: checked ? c.verified_by : undefined,
        }
      : c,
  );
  const counts = criteria ? recount(criteria) : undefined;
  const withCounts = (s: IssueSummary): IssueSummary =>
    counts
      ? { ...s, progress: { ...s.progress, criteria: { ...s.progress.criteria, ...counts } } }
      : s;
  return chain(
    patchSummary(issue, withCounts),
    patchDetail(issue, (d) => (criteria ? { ...d, criteria } : d)),
  );
}

export function useToggleCriterion(issueId: IssueId) {
  return useCallback(
    (args: { id: CriterionId; checked: boolean; base_rev?: string }) =>
      run({
        op: {
          op: "toggle_criterion",
          base_rev: args.base_rev ?? cachedFileRev(issueId, "goal.md"),
          issue: issueId,
          id: args.id,
          checked: args.checked,
        },
        issue: issueId,
        optimistic: () => tickCriterion(issueId, args.id, args.checked),
        rebase: async (o) => ({ ...o, base_rev: await freshRev(issueId, "goal.md") }),
      }),
    [issueId],
  );
}

// ---------------------------------------------------------------- plan

function patchTask(issue: IssueId, task: TaskId, fn: (t: Task) => Task): Rollback {
  return patchDetail(issue, (d) =>
    d.plan
      ? {
          ...d,
          plan: {
            ...d.plan,
            phases: d.plan.phases.map((p) => ({
              ...p,
              tasks: p.tasks.map((t) => (t.id === task ? fn(t) : t)),
            })),
          },
        }
      : d,
  );
}

export function useToggleStep(issueId: IssueId) {
  return useCallback(
    (args: { task: TaskId; index: number; checked: boolean; base_rev?: string }) =>
      run({
        op: {
          op: "toggle_step",
          base_rev: args.base_rev ?? cachedFileRev(issueId, "plan.md"),
          issue: issueId,
          task: args.task,
          index: args.index,
          checked: args.checked,
        },
        issue: issueId,
        optimistic: () =>
          patchTask(issueId, args.task, (t) => ({
            ...t,
            steps: t.steps.map((s) =>
              s.index === args.index ? { ...s, checked: args.checked } : s,
            ),
          })),
        rebase: async (o) => ({ ...o, base_rev: await freshRev(issueId, "plan.md") }),
      }),
    [issueId],
  );
}

export function useSetTaskStatus(issueId: IssueId) {
  return useCallback(
    (args: { task: TaskId; status: TaskStatus; base_rev?: string }) =>
      run({
        op: {
          op: "set_task_status",
          base_rev: args.base_rev ?? cachedFileRev(issueId, "plan.md"),
          issue: issueId,
          task: args.task,
          status: args.status,
        },
        issue: issueId,
        optimistic: () => patchTask(issueId, args.task, (t) => ({ ...t, status: args.status })),
        rebase: async (o) => ({ ...o, base_rev: await freshRev(issueId, "plan.md") }),
      }),
    [issueId],
  );
}

// ---------------------------------------------------------------- requests

export function useAnswerRequest() {
  return useCallback(
    (args: { issue: IssueId; id: RequestId; answer: string; base_rev?: string }) => {
      const snap = queryClient.getQueryData<WorkspaceSnapshot>(qk.snapshot());
      const me = snap?.config.author;
      const open = snap?.inbox.find(
        (i) => i.issue === args.issue && i.id === args.id && !i.answered,
      );
      const answered = (i: NeedsYouItem): NeedsYouItem =>
        i.id === args.id && i.issue === args.issue
          ? {
              ...i,
              answered: true,
              answer: args.answer,
              answered_by: me,
              answered_at: new Date().toISOString(),
            }
          : i;
      return run({
        op: {
          op: "answer_request",
          base_rev: args.base_rev ?? cachedFileRev(args.issue, "current_state.md"),
          issue: args.issue,
          id: args.id,
          answer: args.answer,
        },
        issue: args.issue,
        optimistic: () =>
          chain(
            patchSnapshot((s) => ({ ...s, inbox: s.inbox.map(answered) })),
            patchDetail(args.issue, (d) =>
              d.state
                ? { ...d, state: { ...d.state, needs_you: d.state.needs_you.map(answered) } }
                : d,
            ),
            patchSummary(args.issue, (s) =>
              open
                ? {
                    ...s,
                    signals: {
                      ...s.signals,
                      needs_you: Math.max(0, s.signals.needs_you - 1),
                      needs_you_blocking: Math.max(
                        0,
                        s.signals.needs_you_blocking - (open.urgency === "blocking" ? 1 : 0),
                      ),
                    },
                  }
                : s,
            ),
          ),
        rebase: async (o) => ({ ...o, base_rev: await freshRev(args.issue, "current_state.md") }),
      });
    },
    [],
  );
}

// ---------------------------------------------------------------- library and creation

export function usePromote() {
  return useCallback(
    (args: {
      issue: IssueId;
      entry: EntryId;
      kind: LibraryKind;
      slug?: string;
      base_rev?: string;
    }) =>
      run({
        op: {
          op: "promote",
          base_rev: args.base_rev ?? snapshotRev(),
          issue: args.issue,
          entry: args.entry,
          kind: args.kind,
          slug: args.slug,
        },
        issue: args.issue,
        settle: () => void queryClient.invalidateQueries({ queryKey: ["library"] }),
      }),
    [],
  );
}

export function useApproveLibrary() {
  return useCallback(
    (args: { id: LibId; base_rev?: string }) =>
      run({
        op: {
          op: "approve_library",
          base_rev:
            args.base_rev ??
            queryClient.getQueryData<LibraryItemDetail>(qk.library(args.id))?.edit.rev ??
            snapshotRev(),
          id: args.id,
        },
        rebase: async (o) => {
          const item = await queryClient.fetchQuery({
            queryKey: qk.library(args.id),
            queryFn: () => api.libraryItem(args.id),
            staleTime: 0,
          });
          return { ...o, base_rev: item.edit.rev };
        },
        settle: () => void queryClient.invalidateQueries({ queryKey: qk.library(args.id) }),
      }),
    [],
  );
}

/** The caches that show who links what: library items (used by) and the issues that hold an entry. */
function refreshLinked(links: ContextLink[] | undefined): void {
  for (const link of links ?? []) {
    if (link.kind === "library")
      void queryClient.invalidateQueries({ queryKey: qk.library(link.target) });
    if (link.kind === "entry") {
      const issue = link.target.split("#")[0];
      if (issue) void queryClient.invalidateQueries({ queryKey: qk.issue(issue) });
    }
  }
}

export function useNewIssue() {
  return useCallback(
    (args: {
      group: GroupId;
      slug: string;
      title: string;
      template: NewIssueOp["template"];
      size?: Size;
      /** Prose for `## Context`. Empty keeps the template's own text. */
      context_md?: string;
      /** Workdatabase items to link under `## Links`, in order. */
      links?: ContextLink[];
      base_rev?: string;
    }) =>
      run<NewIssueOp>({
        op: {
          op: "new_issue",
          base_rev: args.base_rev ?? snapshotRev(),
          group: args.group,
          slug: args.slug,
          title: args.title,
          template: args.template,
          size: args.size,
          ...(args.context_md?.trim() ? { context_md: args.context_md } : {}),
          ...(args.links?.length ? { links: args.links } : {}),
        },
        settle: () => refreshLinked(args.links),
      }),
    [],
  );
}

/** Link Workdatabase items under `## Links` of an issue's goal.md. Items already there are skipped. */
export function useAddLinks(issueId: IssueId) {
  return useCallback(
    (args: { links: ContextLink[]; base_rev?: string }) =>
      run({
        op: {
          op: "add_links",
          base_rev: args.base_rev ?? cachedFileRev(issueId, "goal.md"),
          issue: issueId,
          links: args.links,
        },
        issue: issueId,
        rebase: async (o) => ({ ...o, base_rev: await freshRev(issueId, "goal.md") }),
        settle: () => refreshLinked(args.links),
      }),
    [issueId],
  );
}

export function useNewGroup() {
  return useCallback(
    (args: { parent: GroupId; slug: string; title: string; color?: number; base_rev?: string }) =>
      run({
        op: {
          op: "new_group",
          base_rev: args.base_rev ?? snapshotRev(),
          parent: args.parent,
          slug: args.slug,
          title: args.title,
          color: args.color,
        },
      }),
    [],
  );
}
