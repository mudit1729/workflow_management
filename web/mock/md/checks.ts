// Format checks that need more than one file: dangling references (F009), unknown or cyclic
// dependencies (F013) and overlapping `owns` inside one plan (F014).
import type { IssueId } from "@/gen/types";
import type { IssueSrc, WorldSrc } from "../source";
import { type RefMatch, refsByLine } from "./refs";
import type { Anchor, FileCtx } from "./types";

export interface CheckInput {
  world: WorldSrc;
  issueDirs: Record<IssueId, string>;
  libraryPaths: Record<string, string>;
  ctx(path: string): FileCtx | undefined;
  anchors(path: string): Record<string, Anchor> | undefined;
}

const tasksOf = (s: IssueSrc) => s.plan?.phases.flatMap((p) => p.tasks) ?? [];

/** IDs that a `#anchor` can name inside one issue. */
function anchorSet(s: IssueSrc): Set<string> {
  const a = new Set<string>();
  s.criteria.forEach((_, i) => {
    a.add(`SC-${i + 1}`);
  });
  for (const t of tasksOf(s)) {
    a.add(t.id);
    t.steps?.forEach((_, k) => {
      a.add(`${t.id}.${k + 1}`);
    });
  }
  for (const e of [...s.changes, ...s.decisions, ...s.learnings]) a.add(e.id);
  for (const r of s.state?.needs_you ?? []) a.add(r.id);
  return a;
}

/** Literal prefix of a glob: the part before the first wildcard. */
const globPrefix = (g: string) => {
  const i = g.search(/[*?[{]/);
  return i < 0 ? g : g.slice(0, i);
};
export function globsOverlap(a: string[], b: string[]): boolean {
  return a.some((x) =>
    b.some((y) => {
      const px = globPrefix(x);
      const py = globPrefix(y);
      return px.startsWith(py) || py.startsWith(px);
    }),
  );
}

export function checkWorkspace(c: CheckInput): void {
  const { world } = c;
  const issues = new Map<IssueId, IssueSrc>(world.issues.map((i) => [i.goal.id, i]));
  const anchors = new Map<IssueId, Set<string>>(world.issues.map((i) => [i.goal.id, anchorSet(i)]));
  const libs = new Set(world.library.map((l) => l.id));

  const resolves = (m: RefMatch, from?: IssueId): boolean => {
    if (m.lib) return libs.has(m.lib);
    const id = m.issue ?? from;
    if (!id || !issues.has(id)) return false;
    return !m.anchor || (anchors.get(id)?.has(m.anchor) ?? false);
  };

  // ---- F009 in the issue files
  for (const src of world.issues) {
    const id = src.goal.id;
    const dir = c.issueDirs[id];
    for (const name of [
      "goal.md",
      "plan.md",
      "current_state.md",
      "changes.md",
      "decisions.md",
      "learnings.md",
    ]) {
      const ctx = c.ctx(`${dir}/${name}`);
      if (!ctx) continue;
      for (const r of refsByLine(ctx.L, { skipCode: true })) {
        if (resolves(r, id)) continue;
        ctx.report(
          "F009",
          "warn",
          r.line,
          `[[${r.target}]] does not resolve to an issue, entry or library item.`,
          undefined,
          r.col,
          r.col + r.target.length + 4,
        );
      }
    }
    checkDependencies(src, dir, c, issues, anchors);
  }

  // ---- F009 in library items (the `source` list and the body)
  for (const lib of world.library) {
    const ctx = c.ctx(c.libraryPaths[lib.id]);
    if (!ctx) continue;
    for (const r of refsByLine(ctx.L, { skipCode: true })) {
      if (resolves(r)) continue;
      ctx.report(
        "F009",
        "warn",
        r.line,
        `[[${r.target}]] does not resolve to an issue, entry or library item.`,
        undefined,
        r.col,
        r.col + r.target.length + 4,
      );
    }
  }
}

function checkDependencies(
  src: IssueSrc,
  dir: string,
  c: CheckInput,
  issues: Map<IssueId, IssueSrc>,
  anchors: Map<IssueId, Set<string>>,
): void {
  const ctx = c.ctx(`${dir}/plan.md`);
  const tasks = tasksOf(src);
  if (!ctx || tasks.length === 0) return;
  const at = c.anchors(`${dir}/plan.md`) ?? {};
  const ids = new Set(tasks.map((t) => t.id));
  const lineOf = (t: string, key: string): number => {
    const a = at[t];
    if (!a) return 0;
    for (let i = a.line - 1; i < a.end; i++)
      if (new RegExp(`^- ${key}:`).test(ctx.L.lines[i] ?? "")) return i;
    return a.line - 1;
  };

  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      const [issue, task] = dep.includes("#") ? dep.split("#") : [undefined, dep];
      const known = issue
        ? issues.has(issue) && (anchors.get(issue)?.has(task) ?? false)
        : ids.has(task);
      if (!known)
        ctx.report(
          "F013",
          "error",
          lineOf(t.id, "depends_on"),
          `${t.id} depends on ${dep}, which is not a task of this plan.`,
          "Fix the id in `depends_on`, or add the task.",
        );
    }
  }

  // Cycles among the tasks of this plan.
  const deps = new Map(tasks.map((t) => [t.id, (t.depends_on ?? []).filter((d) => ids.has(d))]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      if (state.get(d) === 1) {
        const cycle = [...stack.slice(stack.indexOf(d)), d];
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          ctx.report(
            "F013",
            "error",
            lineOf(d, "depends_on"),
            `Dependency cycle: ${cycle.join(" → ")}.`,
            "Remove one `depends_on` link to break the cycle.",
          );
        }
      } else if (!state.get(d)) visit(d);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const t of tasks) if (!state.get(t.id)) visit(t.id);

  // Overlapping `owns` between tasks that can run at the same time (F014).
  const reach = new Map<string, Set<string>>();
  const reachOf = (id: string, seen = new Set<string>()): Set<string> => {
    const known = reach.get(id);
    if (known) return known;
    const out = new Set<string>();
    for (const d of deps.get(id) ?? []) {
      if (seen.has(d)) continue;
      out.add(d);
      for (const x of reachOf(d, new Set([...seen, id]))) out.add(x);
    }
    reach.set(id, out);
    return out;
  };
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i];
      const b = tasks[j];
      if (!a.owns?.length || !b.owns?.length) continue;
      if (a.status === "done" || a.status === "cancelled") continue;
      if (b.status === "done" || b.status === "cancelled") continue;
      if (reachOf(a.id).has(b.id) || reachOf(b.id).has(a.id)) continue;
      if (globsOverlap(a.owns, b.owns))
        ctx.report(
          "F014",
          "warn",
          lineOf(b.id, "owns"),
          `${b.id} owns paths that overlap ${a.id}. Parallel tasks need disjoint \`owns\` globs.`,
          "Narrow the globs, or make one task depend on the other.",
        );
    }
  }
}
