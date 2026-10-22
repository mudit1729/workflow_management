// Apply a `delta` event to the cached snapshot (contract 1.10). Pure: returns a new snapshot.
import type { DeltaEvent, IssueSummary, LintCounts, WorkspaceSnapshot } from "@/gen/types";

function upsert<T extends { id: string }>(list: T[], upserted: T[], removed: string[]): T[] {
  const drop = new Set(removed);
  const next = new Map(upserted.map((x) => [x.id, x]));
  const out = list.filter((x) => !drop.has(x.id)).map((x) => next.get(x.id) ?? x);
  const known = new Set(out.map((x) => x.id));
  for (const x of upserted) if (!known.has(x.id)) out.push(x);
  return out;
}

function lintOf(issues: IssueSummary[]): LintCounts {
  return issues.reduce<LintCounts>(
    (sum, i) => ({
      error: sum.error + i.lint.error,
      warn: sum.warn + i.lint.warn,
      info: sum.info + i.lint.info,
    }),
    { error: 0, warn: 0, info: 0 },
  );
}

export function applyDelta(s: WorkspaceSnapshot, d: DeltaEvent): WorkspaceSnapshot {
  const touched = new Set([...d.issues_removed, ...d.issues_upserted.map((i) => i.id)]);
  const before = lintOf(s.issues.filter((i) => touched.has(i.id)));
  const issues = upsert(s.issues, d.issues_upserted, d.issues_removed);
  const after = lintOf(issues.filter((i) => touched.has(i.id)));
  return {
    ...s,
    rev: d.rev,
    groups: d.groups ?? s.groups,
    issues,
    inbox: d.inbox ?? s.inbox,
    library: upsert(s.library, d.library_upserted, d.library_removed),
    diagnostics_count: {
      error: s.diagnostics_count.error - before.error + after.error,
      warn: s.diagnostics_count.warn - before.warn + after.warn,
      info: s.diagnostics_count.info - before.info + after.info,
    },
  };
}
