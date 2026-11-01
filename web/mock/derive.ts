// Pure derivation: sources → the API shapes (contract 1.5, 1.6, 1.10).
// Everything the index computes lives here: EARS, criterion states, task
// readiness, dependency levels, staleness, leases, progress, signals, lint,
// supersession, promotion backlinks, roll-ups and the inbox.
import type {
  ChangeEntry,
  Criterion,
  CurrentState,
  DecisionEntry,
  Diagnostic,
  Diagram,
  DocFile,
  EditRef,
  GroupId,
  GroupNode,
  GroupRollup,
  IssueDetail,
  IssueId,
  IssueStatus,
  IssueSummary,
  LastActivity,
  LearningEntry,
  Lease,
  LeaseState,
  LibId,
  LibraryItemDetail,
  LibrarySummary,
  LintCounts,
  NeedsYouItem,
  Phase,
  Plan,
  Progress,
  Ref,
  Severity,
  Signals,
  Task,
  TaskStatus,
  WorkspaceSnapshot,
} from "@/gen/types";
import { resolveFlow } from "@/lib/api/flow";
import { classifyEars } from "./ears";
import { diagramIds, libraryPath, stateBody } from "./md/render";
import { ISSUE_FILES, type IssueFileName, type LoadedWorkspace } from "./md/types";
import type { GroupSrc, IssueSrc, LibrarySrc, RequestSrc, TaskSrc, WorldSrc } from "./source";
import { toDate, tsMs } from "./time";
import { byteLength, countWords, posOf, rev, uniq } from "./util";

const HOUR = 3_600_000;
const MIN = 60_000;

export type { IssueFileName };

export interface DeriveOptions {
  rev: string;
  now: number;
  archify: boolean;
  /** Ids of the diagrams that have a stand-in preview page (`public/diagrams/<id>.html`). */
  previews?: ReadonlySet<string>;
  /** Where "Open raw" of a markdown doc points to: `(workspace path, text) => url`. */
  rawUrl?: (path: string, text: string) => string;
}

export interface Derived {
  rev: string;
  at: number;
  snapshot: WorkspaceSnapshot;
  details: Map<IssueId, IssueDetail>;
  library: Map<LibId, LibraryItemDetail>;
  /** File text per issue, keyed by file name: the text of the workspace files, as read. */
  files: Map<IssueId, Partial<Record<IssueFileName, string>>>;
  /** The diagrams the archify blocks of the workspace hold, by id (for `wf context` stubs). */
  diagrams: Record<string, Diagram>;
  /** Workspace-relative folder per issue. */
  dirs: Map<IssueId, string>;
  /** Workspace-relative folder per group. */
  groupDirs: Map<GroupId, string>;
}

// ---------------------------------------------------------------- small helpers

/** Strip backticks around a meta value that is one code span (contract 1.3). */
export function stripTicks(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return /^`[^`]*`$/.test(v) ? v.slice(1, -1) : v;
}

const REF_RE =
  /\[\[(lib-[0-9a-hjkmnp-tv-z]{5}|[a-z]+-[0-9a-z]{5})?(?:#((?:SC|T)-\d+(?:\.\d+)?|[CDLQ]-[0-9a-z]{5}))?\]\]/g;

export interface RefMatch {
  target: string; // as written, without brackets
  issue?: string;
  lib?: string;
  anchor?: string;
  index: number;
}

export function findRefs(text: string): RefMatch[] {
  const out: RefMatch[] = [];
  for (const m of text.matchAll(REF_RE)) {
    if (!m[1] && !m[2]) continue;
    const head = m[1];
    out.push({
      target: m[0].slice(2, -2),
      issue: head && !head.startsWith("lib-") ? head : undefined,
      lib: head?.startsWith("lib-") ? head : undefined,
      anchor: m[2],
      index: m.index ?? 0,
    });
  }
  return out;
}

/** Literal prefix of a glob: the part before the first wildcard. */
function globPrefix(glob: string): string {
  const i = glob.search(/[*?[{]/);
  return i < 0 ? glob : glob.slice(0, i);
}

export function globsOverlap(a: string[], b: string[]): boolean {
  return a.some((x) =>
    b.some((y) => {
      const px = globPrefix(x);
      const py = globPrefix(y);
      return px.startsWith(py) || py.startsWith(px);
    }),
  );
}

function leaseState(
  holder: string | undefined,
  until: string | undefined,
  now: number,
): LeaseState {
  if (!holder || !until) return "none";
  return tsMs(until) > now ? "live" : "expired";
}

function counts(diags: Diagnostic[]): LintCounts {
  const c: LintCounts = { error: 0, warn: 0, info: 0 };
  for (const d of diags) c[d.severity]++;
  return c;
}

const latest = (xs: (string | undefined)[]): string | undefined =>
  xs.filter((x): x is string => !!x).sort((a, b) => tsMs(b) - tsMs(a))[0];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ago(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 60) return plural(m, "minute");
  const h = Math.round(m / 60);
  return h < 48 ? plural(h, "hour") : plural(Math.round(h / 24), "day");
}

// ---------------------------------------------------------------- world-wide indexes

interface WorldIndex {
  groups: Map<GroupId, GroupSrc>;
  groupDirs: Map<GroupId, string>;
  groupTitles: Map<GroupId, string[]>;
  issues: Map<IssueId, IssueSrc>;
  dirs: Map<IssueId, string>;
  libs: Map<LibId, LibrarySrc>;
  /** "wf-3k9x2#T-3" → status */
  taskStatus: Map<string, TaskStatus>;
  liveLeases: { key: string; owns: string[] }[];
  /** IDs addressable inside each issue (SC-n, T-n, C-, D-, L-, Q-). */
  anchors: Map<IssueId, Map<string, string>>;
  authors: Set<string>;
  libraryText: Map<LibId, string>;
  libraryPaths: Map<LibId, string>;
}

function allTasks(src: IssueSrc): TaskSrc[] {
  return src.plan?.phases.flatMap((p) => p.tasks) ?? [];
}

function buildIndex(source: LoadedWorkspace, now: number): WorldIndex {
  const world = source.world;
  const groups = new Map(world.groups.map((g) => [g.id, g]));
  const groupDirs = new Map<GroupId, string>();
  const groupTitles = new Map<GroupId, string[]>();
  const walk = (g: GroupSrc): [string, string[]] => {
    const known = groupDirs.get(g.id);
    if (known) return [known, groupTitles.get(g.id) ?? []];
    const parent = g.parent ? groups.get(g.parent) : undefined;
    const [pdir, ptitles] = parent ? walk(parent) : ["", []];
    const dir = pdir ? `${pdir}/${g.slug}` : g.slug;
    const titles = parent ? [...ptitles, g.title] : [];
    groupDirs.set(g.id, dir);
    groupTitles.set(g.id, titles);
    return [dir, titles];
  };
  for (const g of world.groups) walk(g);

  const issues = new Map(world.issues.map((i) => [i.goal.id, i]));
  const dirs = new Map<IssueId, string>();
  const taskStatus = new Map<string, TaskStatus>();
  const liveLeases: WorldIndex["liveLeases"] = [];
  const anchors = new Map<IssueId, Map<string, string>>();

  for (const src of world.issues) {
    const id = src.goal.id;
    dirs.set(id, source.issueDirs[id] ?? `${groupDirs.get(src.group) ?? "issues"}/${src.slug}`);
    const a = new Map<string, string>();
    src.criteria.forEach((c, i) => {
      a.set(`SC-${i + 1}`, c.text);
    });
    for (const t of allTasks(src)) {
      a.set(t.id, t.title);
      t.steps?.forEach((s, k) => {
        a.set(`${t.id}.${k + 1}`, s.text);
      });
      taskStatus.set(`${id}#${t.id}`, t.status);
      if (
        t.status !== "done" &&
        t.status !== "cancelled" &&
        leaseState(t.claimed_by, t.lease_until, now) === "live"
      ) {
        liveLeases.push({ key: `${id}#${t.id}`, owns: t.owns ?? [] });
      }
    }
    for (const e of [...src.changes, ...src.decisions, ...src.learnings]) a.set(e.id, e.title);
    for (const r of src.state?.needs_you ?? []) a.set(r.id, r.question);
    anchors.set(id, a);
  }

  const libraryText = new Map(world.library.map((l) => [l.id, source.libraryTexts[l.id] ?? ""]));
  const libraryPaths = new Map(
    world.library.map((l) => [l.id, source.libraryPaths[l.id] ?? libraryPath(l)]),
  );
  return {
    groups,
    groupDirs,
    groupTitles,
    issues,
    dirs,
    libs: new Map(world.library.map((l) => [l.id, l])),
    taskStatus,
    liveLeases,
    anchors,
    authors: new Set(world.authors.map((a) => a.handle)),
    libraryText,
    libraryPaths,
  };
}

/** Resolve a reference written inside `fromIssue` (for `[[#…]]`). */
function resolveRef(ix: WorldIndex, m: RefMatch, fromIssue?: IssueId): Ref | undefined {
  if (m.lib) {
    const l = ix.libs.get(m.lib);
    if (!l) return undefined;
    return {
      kind: "library",
      target: m.target,
      id: l.id,
      title: l.title,
      path: ix.libraryPaths.get(l.id) ?? libraryPath(l),
    };
  }
  const issueId = m.issue ?? fromIssue;
  if (!issueId) return undefined;
  const src = ix.issues.get(issueId);
  if (!src) return undefined;
  const dir = ix.dirs.get(issueId);
  if (!m.anchor) {
    return { kind: "issue", target: m.target, issue: issueId, title: src.goal.title, path: dir };
  }
  const title = ix.anchors.get(issueId)?.get(m.anchor);
  if (title === undefined) return undefined;
  const kind = m.anchor.startsWith("SC-")
    ? "criterion"
    : m.anchor.startsWith("T-")
      ? "task"
      : "entry";
  return { kind, target: m.target, issue: issueId, id: m.anchor, title, path: dir };
}

// ---------------------------------------------------------------- per issue

interface IssueBuild {
  summary: IssueSummary;
  detail: IssueDetail;
  files: Partial<Record<IssueFileName, string>>;
}

/** A place in a file: where the Q rules point. */
interface Place {
  line: number;
  col: number;
  span: [number, number];
}

/** Char index of the start of 1-based `line`. */
function lineStart(text: string, line: number): number {
  let at = 0;
  for (let n = 1; n < line; n++) {
    const next = text.indexOf("\n", at);
    if (next < 0) return text.length;
    at = next + 1;
  }
  return at;
}

function buildIssue(
  src: IssueSrc,
  source: LoadedWorkspace,
  ix: WorldIndex,
  opts: DeriveOptions,
  promotedTo: Map<string, LibId>,
): IssueBuild {
  const world = source.world;
  const now = opts.now;
  const cfg = world.config;
  // The "Fix:" hints name the skills the team's flow runs (a person's own override is not known here).
  const steps = resolveFlow({ team: cfg.flow }).steps;
  const g = src.goal;
  const id = g.id;
  const dir = ix.dirs.get(id) ?? src.slug;
  const files: Partial<Record<IssueFileName, string>> = { ...(source.texts[id] ?? {}) };
  const fileRev: Record<string, string> = {};
  for (const [name, text] of Object.entries(files)) fileRev[name] = rev(text ?? "");
  const goalText = files["goal.md"] ?? "";
  const path = (name: string) => `${dir}/${name}`;
  const ref = (name: IssueFileName, anchor: string): EditRef => ({
    file: path(name),
    rev: fileRev[name] ?? rev(""),
    anchor,
  });

  // F and S findings come from the text (`loadWorkspace`); Q findings are computed here.
  const diagnostics: Diagnostic[] = ISSUE_FILES.flatMap((name) =>
    (source.diagnostics[path(name)] ?? []).map((d) => ({ ...d })),
  );
  const quiet = new Set(source.lint.disable);
  /** Where `anchor` sits in `file` (the parsed position), else the first `needle`. */
  const where = (file: IssueFileName, anchor: string | undefined, needle: string): Place => {
    const a = anchor ? source.anchors[path(file)]?.[anchor] : undefined;
    if (a) return { line: a.line, col: 1, span: a.span };
    return posOf(files[file] ?? "", needle);
  };
  const diag = (
    rule: string,
    severity: Severity,
    file: IssueFileName,
    p: Place,
    message: string,
    fix?: string,
  ) => {
    if (quiet.has(rule)) return;
    diagnostics.push({
      rule,
      severity: source.lint.severity[rule] ?? severity,
      file: path(file),
      line: p.line,
      col: p.col,
      span: p.span,
      message,
      fix,
    });
  };

  // ---------------- tasks
  const srcTasks = allTasks(src);
  const levels = new Map<string, number>();
  const levelOf = (t: TaskSrc, seen: Set<string>): number => {
    const known = levels.get(t.id);
    if (known !== undefined) return known;
    if (seen.has(t.id)) return 0; // cycle: F013 territory, keep the plan drawable
    seen.add(t.id);
    let lv = 0;
    for (const dep of t.depends_on ?? []) {
      const d = srcTasks.find((x) => x.id === dep);
      if (d) lv = Math.max(lv, levelOf(d, seen) + 1);
    }
    levels.set(t.id, lv);
    return lv;
  };

  const depDone = (dep: string): boolean => {
    const key = dep.includes("#") ? dep : `${id}#${dep}`;
    return ix.taskStatus.get(key) === "done";
  };

  const taskOf = (t: TaskSrc, phaseName: string): Task => {
    const key = `${id}#${t.id}`;
    const lease =
      t.status === "done" || t.status === "cancelled"
        ? "none"
        : leaseState(t.claimed_by, t.lease_until, now);
    const lastChange = latest(src.changes.filter((c) => c.task === t.id).map((c) => c.ts));
    const renewal = t.lease_until ? tsMs(t.lease_until) - cfg.leases_minutes * MIN : 0;
    const fresh = Math.max(lastChange ? tsMs(lastChange) : 0, renewal);
    const stale = t.status === "in_progress" && now - fresh > cfg.staleness.task_hours * HOUR;
    const owns = (t.owns ?? []).map((o) => stripTicks(o) ?? o);
    const ready =
      t.status === "todo" &&
      (t.depends_on ?? []).every(depDone) &&
      lease !== "live" &&
      !ix.liveLeases.some((l) => l.key !== key && globsOverlap(owns, l.owns));
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      lane: t.lane ?? "main",
      phase: phaseName,
      depends_on: t.depends_on ?? [],
      owns,
      satisfies: t.satisfies ?? [],
      assignee: t.assignee,
      claimed_by: t.claimed_by,
      lease_until: t.lease_until,
      lease,
      verify: stripTicks(t.verify),
      brief_md: t.brief,
      steps: (t.steps ?? []).map((s, k) => ({
        index: k + 1,
        text: s.text,
        checked: s.done,
        edit: ref("plan.md", `${t.id}.${k + 1}`),
      })),
      ready,
      stale,
      level: levelOf(t, new Set()),
      edit: ref("plan.md", t.id),
    };
  };

  let plan: Plan | null = null;
  const tasks: Task[] = [];
  if (src.plan) {
    const p = src.plan;
    const phases: Phase[] = p.phases.map((ph) => {
      const name = ph.index === 0 ? "Unphased" : ph.name;
      const ts = ph.tasks.map((t) => taskOf(t, name));
      tasks.push(...ts);
      return { name, index: ph.index, tasks: ts };
    });
    plan = {
      updated_at: p.updated_at,
      updated_by: p.updated_by,
      revision: p.revision,
      approach_md: p.approach,
      assumptions: p.assumptions.map((a) => ({ ...a })),
      prior_art: p.prior_art
        .map((r) => resolveRef(ix, { target: r.ref, lib: r.ref, index: 0 }, id))
        .filter((r): r is Ref => !!r),
      phases,
      edit: ref("plan.md", "plan"),
    };
  }

  // ---------------- criteria
  const criteria: Criterion[] = src.criteria.map((c, i) => {
    const cid = `SC-${i + 1}`;
    const verify = stripTicks(c.verify);
    return {
      id: cid,
      text: c.text,
      checked: c.checked,
      state: !c.checked ? "open" : c.evidence ? "verified" : "claimed",
      ears: classifyEars(c.text, !!verify),
      verify,
      evidence: stripTicks(c.evidence),
      verified_by: c.verified_by,
      scenario: c.scenario,
      satisfied_by: tasks.filter((t) => t.satisfies.includes(cid)).map((t) => t.id),
      edit: ref("goal.md", cid),
    };
  });

  // ---------------- requests and state
  const requestItem = (r: RequestSrc): NeedsYouItem => ({
    issue: id,
    issue_title: g.title,
    id: r.id,
    question: r.question,
    from: r.from,
    to: r.to,
    kind: r.kind,
    urgency: r.urgency,
    asked: r.asked,
    options: r.options ?? [],
    ref: r.ref,
    answered: !!r.answered,
    answer: r.answer || undefined,
    answered_by: r.answered_by,
    answered_at: r.answered_at,
    edit: ref("current_state.md", r.id),
  });

  let state: CurrentState | null = null;
  if (src.state) {
    const s = src.state;
    const list = (xs?: string[]) => (xs?.length ? xs.map((x) => `- ${x}`).join("\n") : undefined);
    const inFlightTasks = uniq(
      (s.in_flight ?? []).flatMap((l) =>
        findRefs(l)
          .filter((m) => !m.issue && m.anchor?.startsWith("T-"))
          .map((m) => m.anchor as string),
      ),
    );
    state = {
      summary: s.summary,
      updated_at: s.updated_at,
      updated_by: s.updated_by,
      phase: s.phase,
      library_refs: s.library_refs ?? [],
      session: s.session,
      done_md: list(s.done),
      in_flight_md: list(s.in_flight),
      in_flight_tasks: inFlightTasks,
      blocked_md: list(s.blocked),
      needs_you: s.needs_you.map(requestItem),
      failed_attempts: s.failed_attempts ?? [],
      handoff_md: list(s.handoff),
      next_steps: s.next_steps,
      word_count: countWords(stateBody(files["current_state.md"] ?? "")),
      edit: ref("current_state.md", "state"),
    };
  }

  // ---------------- entries
  const metaOf = (lines: string[]): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const l of lines) {
      const hit = l.match(/^- ([a-z_]+): (.*)$/);
      if (hit) m[hit[1]] = hit[2];
    }
    return m;
  };
  const metaLines = (file: IssueFileName, entryId: string): string[] => {
    const text = files[file] ?? "";
    const start = text.indexOf(`{#${entryId}}`);
    if (start < 0) return [];
    const rest = text.slice(text.indexOf("\n", start) + 1).split("\n");
    const out: string[] = [];
    for (const l of rest) {
      if (!l.startsWith("- ")) break;
      out.push(l);
    }
    return out;
  };
  const entryLine = (file: IssueFileName, entryId: string) =>
    source.anchors[path(file)]?.[entryId]?.line ?? posOf(files[file] ?? "", `{#${entryId}}`).line;

  const changes: ChangeEntry[] = src.changes.map((c) => ({
    type: "change",
    id: c.id,
    ts: c.ts,
    author: c.author,
    title: c.title,
    body_md: c.body,
    meta: metaOf(metaLines("changes.md", c.id)),
    line: entryLine("changes.md", c.id),
    edit: ref("changes.md", c.id),
    kind: c.kind ?? "progress",
    task: c.task,
    criteria: c.criteria ?? [],
    result: c.result,
    evidence: stripTicks(c.evidence),
    commit: c.commit,
    pr: c.pr,
    files: c.files ?? [],
    session: c.session,
    model: c.model,
  }));

  const decisions: DecisionEntry[] = src.decisions.map((d) => {
    const body = [
      `**Decision:** ${d.decision}`,
      `**Because:** ${d.because}`,
      d.rejected && `**Rejected:** ${d.rejected}`,
      d.consequences && `**Consequences:** ${d.consequences}`,
      d.revisit && `**Revisit when:** ${d.revisit}`,
    ]
      .filter(Boolean)
      .join("\n");
    const successor = src.decisions.find((x) => x.supersedes === d.id && tsMs(x.ts) >= tsMs(d.ts));
    return {
      type: "decision",
      id: d.id,
      ts: d.ts,
      author: d.author,
      title: d.title,
      body_md: body,
      meta: metaOf(metaLines("decisions.md", d.id)),
      line: entryLine("decisions.md", d.id),
      edit: ref("decisions.md", d.id),
      status: d.status,
      topic: d.topic,
      supersedes: d.supersedes,
      superseded_by: successor?.id,
      affects: d.affects ?? [],
      decided_by: d.decided_by ?? [d.author],
      decision_md: d.decision,
      because_md: d.because,
      rejected_md: d.rejected,
      consequences_md: d.consequences,
      revisit_md: d.revisit,
    };
  });

  const learnings: LearningEntry[] = src.learnings.map((l) => ({
    type: "learning",
    id: l.id,
    ts: l.ts,
    author: l.author,
    title: l.title,
    body_md: l.evidence ? `${l.rule}\n\nEvidence: ${l.evidence}` : l.rule,
    meta: metaOf(metaLines("learnings.md", l.id)),
    line: entryLine("learnings.md", l.id),
    edit: ref("learnings.md", l.id),
    kind: l.kind,
    tags: l.tags ?? [],
    applies_to: l.applies_to ?? [],
    promote: l.promote ?? "no",
    promoted_to: promotedTo.get(`${id}#${l.id}`),
    rule_md: l.rule,
    evidence_md: l.evidence,
  }));

  // ---------------- docs and diagrams
  const docs: DocFile[] = (src.docs ?? []).map((d) => {
    const ext = d.path.split(".").pop()?.toLowerCase() ?? "";
    const kind: DocFile["kind"] =
      ext === "md"
        ? "markdown"
        : ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)
          ? "image"
          : "other";
    const full = `${dir}/${d.path}`;
    return {
      path: d.path,
      kind,
      size: d.bytes ?? byteLength(d.body ?? ""),
      rev: rev(d.body ?? `${d.path}:${d.bytes ?? 0}`),
      title: d.title,
      body_md: kind === "markdown" ? d.body : undefined,
      // Images are served by the bundler; text is handed over as a blob in the browser.
      url: source.assets[full]?.url ?? opts.rawUrl?.(full, d.body ?? "") ?? "",
    };
  });

  const diagrams: Diagram[] = [];
  const addDiagrams = (md: (string | undefined)[]) => {
    for (const did of md.flatMap(diagramIds)) {
      const base = source.diagrams[did];
      if (!base || diagrams.some((x) => x.id === did)) continue;
      // The block is read from the text (file, line, hash, errors). Invalid blocks stay
      // invalid. A valid block renders only when archify is available and its stand-in preview
      // page exists; the page URL is known whenever the page exists.
      const preview = opts.previews?.has(did) ?? false;
      const url = preview ? `${import.meta.env.BASE_URL}diagrams/${did}.html` : "";
      diagrams.push(
        base.status === "invalid"
          ? { ...base, errors: base.errors.map((e) => ({ ...e })), url: "" }
          : { ...base, errors: [], url, status: opts.archify && preview ? "ready" : "unavailable" },
      );
    }
  };
  addDiagrams([src.context, src.out_of_scope, src.links]);
  if (src.plan) addDiagrams([src.plan.approach]);

  // ---------------- progress and signals
  const progress: Progress = {
    criteria: {
      total: criteria.length,
      claimed: criteria.filter((c) => c.state === "claimed").length,
      verified: criteria.filter((c) => c.state === "verified").length,
    },
    tasks: {
      total: tasks.length,
      todo: tasks.filter((t) => t.status === "todo").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      blocked: tasks.filter((t) => t.status === "blocked").length,
      review: tasks.filter((t) => t.status === "review").length,
      done: tasks.filter((t) => t.status === "done").length,
      ready: tasks.filter((t) => t.ready).length,
    },
    percent: 0,
  };
  const denom = progress.criteria.total + progress.tasks.total;
  progress.percent = denom
    ? (progress.criteria.claimed + progress.criteria.verified + progress.tasks.done) / denom
    : 0;

  const active = g.status !== "done" && g.status !== "cancelled";
  const coordState = active ? leaseState(g.claimed_by, g.lease_until, now) : "none";
  const coordinator: Lease | undefined =
    g.claimed_by && g.lease_until
      ? { holder: g.claimed_by, until: g.lease_until, state: coordState }
      : undefined;
  const expiredTasks = tasks.filter((t) => t.lease === "expired");
  const lastChangeTs = latest(src.changes.map((c) => c.ts));
  const freshest = latest([lastChangeTs, src.state?.updated_at]) ?? g.created;
  const openRequests = (src.state?.needs_you ?? []).filter((r) => !r.answered);

  const signals: Signals = {
    done_unmet: g.status === "done" && progress.criteria.verified < progress.criteria.total,
    in_progress_no_plan:
      g.status === "in_progress" && !src.plan && g.size !== "xs" && g.size !== "s",
    stale: g.status === "in_progress" && now - tsMs(freshest) > cfg.staleness.issue_hours * HOUR,
    lease_expired: active && (coordState === "expired" || expiredTasks.length > 0),
    state_behind_changes:
      !!src.state && !!lastChangeTs && tsMs(lastChangeTs) > tsMs(src.state.updated_at),
    needs_you: openRequests.length,
    needs_you_blocking: openRequests.filter((r) => r.urgency === "blocking").length,
  };

  // ---------------- diagnostics (the Q rules; F and S came from the text above)
  const statusAt = where("goal.md", "status", "\nstatus:");
  if (signals.done_unmet) {
    const open = progress.criteria.total - progress.criteria.verified;
    diag(
      "Q001",
      "warn",
      "goal.md",
      statusAt,
      `The issue is done, but ${open} of ${progress.criteria.total} criteria ${open === 1 ? "is" : "are"} not verified.`,
      "Reopen the issue, or add an `evidence:` line under each open criterion.",
    );
  }
  if (signals.in_progress_no_plan)
    diag(
      "Q002",
      "warn",
      "goal.md",
      statusAt,
      "The issue is in progress without plan.md.",
      `Press Do next step, or run the \`${steps.plan.skill}\` skill.`,
    );
  if (signals.stale)
    diag(
      "Q003",
      "warn",
      "goal.md",
      statusAt,
      `No change entry or state update for ${ago(now - tsMs(freshest))} (limit ${cfg.staleness.issue_hours} h).`,
      `Append a change with the \`${steps.log.skill}\` skill, or run the \`${steps.handoff.skill}\` skill.`,
    );
  if (active && coordState === "expired" && g.lease_until)
    diag(
      "Q004",
      "warn",
      "goal.md",
      where("goal.md", "lease_until", "\nlease_until:"),
      `The coordinator lease of @${g.claimed_by} expired ${ago(now - tsMs(g.lease_until))} ago.`,
      `Renew it with the \`${steps.do.skill}\` skill, or take it over there and say so in the change entry.`,
    );
  for (const t of expiredTasks) {
    // The `lease_until:` line inside the task's block.
    const text = files["plan.md"] ?? "";
    const heading = source.anchors[path("plan.md")]?.[t.id];
    const from = heading
      ? lineStart(text, heading.line)
      : Math.max(0, text.indexOf(`### ${t.id}:`));
    diag(
      "Q004",
      "warn",
      "plan.md",
      posOf(text, "- lease_until:", from),
      `The lease of @${t.claimed_by} on ${t.id} expired ${ago(now - tsMs(t.lease_until ?? ""))} ago.`,
      `Renew it with the \`${steps.do.skill}\` skill, or take ${t.id} over there and say so in the change entry.`,
    );
  }
  if (signals.state_behind_changes && src.state) {
    const behind = src.changes.filter((c) => tsMs(c.ts) > tsMs(src.state?.updated_at ?? "")).length;
    diag(
      "Q005",
      "warn",
      "current_state.md",
      where("current_state.md", "updated_at", "updated_at:"),
      `current_state.md is older than the latest ${plural(behind, "change")}.`,
      `Run the \`${steps.handoff.skill}\` skill.`,
    );
  }
  if (state) {
    const summaryAt = where("current_state.md", "summary", "summary:");
    if (state.word_count > 400)
      diag(
        "Q008",
        "warn",
        "current_state.md",
        summaryAt,
        `current_state.md has ${state.word_count} words (limit 400).`,
      );
    if (!state.next_steps.length)
      diag(
        "Q008",
        "warn",
        "current_state.md",
        summaryAt,
        "current_state.md has no Next steps.",
        "Add a numbered `## Next steps` list.",
      );
  }
  for (const c of criteria) {
    const at = where("goal.md", c.id, `${c.id}: `);
    if (c.state === "claimed")
      diag(
        "Q010",
        "info",
        "goal.md",
        at,
        `${c.id} is ticked without evidence.`,
        `Verify ${c.id} with the \`${steps.do.skill}\` skill, or add \`evidence:\`.`,
      );
    if (src.plan && c.satisfied_by.length === 0)
      diag("Q006", "info", "goal.md", at, `${c.id} is not covered by any task's \`satisfies\`.`);
  }
  for (const t of tasks)
    if (t.satisfies.length === 0)
      diag(
        "Q007",
        "info",
        "plan.md",
        where("plan.md", t.id, `### ${t.id}:`),
        `${t.id} satisfies no criterion.`,
        "Add `satisfies:` or drop the task.",
      );

  // Authors not in authors.md (Q012).
  const handles = uniq([
    ...src.changes.map((c) => c.author),
    ...src.decisions.map((d) => d.author),
    ...src.learnings.map((l) => l.author),
  ]);
  for (const h of handles)
    if (!ix.authors.has(h)) {
      const file: IssueFileName = src.changes.some((c) => c.author === h)
        ? "changes.md"
        : src.decisions.some((d) => d.author === h)
          ? "decisions.md"
          : "learnings.md";
      diag(
        "Q012",
        "warn",
        file,
        posOf(files[file] ?? "", `@${h} `),
        `@${h} is not in authors.md.`,
        `Add \`## @${h}\` to authors.md.`,
      );
    }

  diagnostics.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));

  // ---------------- last activity
  const acts: LastActivity[] = [
    ...src.changes.map((c) => ({
      ts: c.ts,
      author: c.author,
      kind: "change" as const,
      title: c.title,
    })),
    ...src.decisions.map((d) => ({
      ts: d.ts,
      author: d.author,
      kind: "decision" as const,
      title: d.title,
    })),
    ...src.learnings.map((l) => ({
      ts: l.ts,
      author: l.author,
      kind: "learning" as const,
      title: l.title,
    })),
    ...(src.state
      ? [
          {
            ts: src.state.updated_at,
            author: src.state.updated_by,
            kind: "state" as const,
            title: src.state.summary,
          },
        ]
      : []),
    ...(src.activity ?? []),
  ];
  const last_activity = acts.sort((a, b) => tsMs(b.ts) - tsMs(a.ts))[0];

  const summary: IssueSummary = {
    id,
    title: g.title,
    status: g.status,
    priority: g.priority,
    size: g.size,
    owner: g.owner,
    labels: g.labels,
    group: src.group,
    group_path: ix.groupTitles.get(src.group) ?? [],
    path: dir,
    coordinator,
    lease_holders: uniq([
      ...(coordState === "live" && g.claimed_by ? [g.claimed_by] : []),
      ...tasks.filter((t) => t.lease === "live" && t.claimed_by).map((t) => t.claimed_by as string),
    ]),
    blocked_by: g.blocked_by,
    due: g.due,
    created: g.created,
    last_activity,
    state_summary: src.state?.summary,
    state_updated_at: src.state?.updated_at,
    has_plan: !!src.plan,
    progress,
    signals,
    lint: counts(diagnostics),
    status_ref: ref("goal.md", "status"),
  };

  const frontmatterOk = source.frontmatter[id]?.ok ?? true;
  const goal = {
    context_md: src.context,
    criteria_heading: src.criteria_heading ?? "Success criteria",
    out_of_scope_md: src.out_of_scope,
    links_md: src.links,
    extra: { ...(g.extra ?? {}) },
    frontmatter_ok: frontmatterOk,
    raw: frontmatterOk ? undefined : goalText,
    edit: ref("goal.md", "goal"),
  };

  const detail: IssueDetail = {
    summary,
    goal,
    criteria,
    plan,
    state,
    changes,
    decisions,
    learnings,
    docs,
    diagrams,
    diagnostics,
    backlinks: [],
    files_rev: fileRev,
  };
  return { summary, detail, files };
}

// ---------------------------------------------------------------- groups

const EMPTY_BY_STATUS = (): Record<IssueStatus, number> => ({
  backlog: 0,
  planned: 0,
  in_progress: 0,
  blocked: 0,
  review: 0,
  done: 0,
  cancelled: 0,
});

function buildGroups(
  world: WorldSrc,
  ix: WorldIndex,
  summaries: Map<IssueId, IssueSummary>,
): GroupNode {
  const childrenOf = (gid: GroupId | undefined) =>
    world.groups
      .filter((g) => g.parent === gid)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const build = (g: GroupSrc): GroupNode => {
    const children = childrenOf(g.id).map(build);
    const issue_ids = world.issues.filter((i) => i.group === g.id).map((i) => i.goal.id);
    const own = issue_ids.map((i) => summaries.get(i)).filter((s): s is IssueSummary => !!s);
    const by_status = EMPTY_BY_STATUS();
    let num = 0;
    let den = 0;
    let needs_you = 0;
    let stale = 0;
    let blocked = 0;
    let issues = 0;
    for (const s of own) {
      issues++;
      by_status[s.status]++;
      needs_you += s.signals.needs_you;
      if (s.signals.stale) stale++;
      if (s.status === "blocked") blocked++;
      if (s.status === "cancelled") continue;
      const p = s.progress;
      num += p.criteria.claimed + p.criteria.verified + p.tasks.done;
      den += p.criteria.total + p.tasks.total;
    }
    const rollNum = { num, den };
    for (const c of children) {
      issues += c.rollup.issues;
      for (const k of Object.keys(by_status) as IssueStatus[])
        by_status[k] += c.rollup.by_status[k];
      needs_you += c.rollup.needs_you;
      stale += c.rollup.stale;
      blocked += c.rollup.blocked;
      const cw = weights.get(c.id) ?? { num: 0, den: 0 };
      rollNum.num += cw.num;
      rollNum.den += cw.den;
    }
    weights.set(g.id, rollNum);
    const rollup: GroupRollup = {
      issues,
      by_status,
      percent: rollNum.den ? rollNum.num / rollNum.den : 0,
      needs_you,
      stale,
      blocked,
    };
    return {
      id: g.id,
      title: g.title,
      slug: g.slug,
      path: ix.groupDirs.get(g.id) ?? g.slug,
      goal: g.goal,
      owner: g.owner,
      color: g.color ?? (Number.parseInt(rev(g.id), 16) % 8) + 1,
      order: g.order,
      implicit: g.implicit,
      definition_of_done: g.definition_of_done ?? [],
      rollup,
      children,
      issue_ids,
    };
  };
  const weights = new Map<GroupId, { num: number; den: number }>();
  const root = world.groups.find((g) => !g.parent);
  if (!root) throw new Error("mock world has no root group");
  return build(root);
}

// ---------------------------------------------------------------- library

function buildLibrary(
  source: LoadedWorkspace,
  ix: WorldIndex,
  files: Map<IssueId, Partial<Record<IssueFileName, string>>>,
  now: number,
): { summaries: LibrarySummary[]; details: Map<LibId, LibraryItemDetail> } {
  const world = source.world;
  const quiet = new Set(source.lint.disable);
  const today = toDate(now);
  const summaries: LibrarySummary[] = [];
  const details = new Map<LibId, LibraryItemDetail>();
  const issueText = new Map(
    world.issues.map((src) => [
      src.goal.id,
      Object.values(files.get(src.goal.id) ?? {}).join("\n"),
    ]),
  );
  for (const l of world.library) {
    const citing: Ref[] = [];
    for (const src of world.issues) {
      const id = src.goal.id;
      const texts = issueText.get(id) ?? "";
      const cites = texts.includes(`[[${l.id}]]`) || (src.state?.library_refs ?? []).includes(l.id);
      if (cites)
        citing.push({
          kind: "issue",
          target: id,
          issue: id,
          title: src.goal.title,
          path: ix.dirs.get(id),
        });
    }
    const overdue = l.status !== "retired" && !!l.review_after && l.review_after < today;
    const path = ix.libraryPaths.get(l.id) ?? libraryPath(l);
    const text = ix.libraryText.get(l.id) ?? "";
    const summary: LibrarySummary = {
      id: l.id,
      title: l.title,
      kind: l.kind,
      description: l.description,
      status: l.status,
      tags: l.tags,
      applies_to: l.applies_to,
      authors: l.authors,
      created: l.created,
      last_reviewed: l.last_reviewed,
      review_after: l.review_after,
      review_overdue: overdue,
      used_by: citing.length,
      path,
    };
    // F and S findings come from the text; Q013 is computed here.
    const diagnostics: Diagnostic[] = (source.diagnostics[path] ?? []).map((d) => ({ ...d }));
    if (overdue && !quiet.has("Q013")) {
      const a = source.anchors[path]?.review_after;
      const p = a ? { line: a.line, col: 1, span: a.span } : posOf(text, "review_after:");
      diagnostics.push({
        rule: "Q013",
        severity: source.lint.severity.Q013 ?? "info",
        file: path,
        line: p.line,
        col: p.col,
        span: p.span,
        message: `Review is overdue since ${l.review_after}.`,
        fix: `Review ${l.id}, then press Approve in the Library or retire it.`,
      });
      diagnostics.sort((x, y) => x.line - y.line);
    }
    const sources: Ref[] = [];
    for (const s of l.source) {
      for (const m of findRefs(s)) {
        const r = resolveRef(ix, m);
        if (r) sources.push(r);
      }
    }
    summaries.push(summary);
    details.set(l.id, {
      summary,
      source: sources,
      reviewed_by: l.reviewed_by,
      superseded_by: l.superseded_by,
      sections: l.sections.map((s) => ({ ...s })),
      backlinks: citing,
      diagnostics,
      edit: { file: path, rev: rev(text), anchor: "status" },
    });
  }
  return { summaries, details };
}

// ---------------------------------------------------------------- the world

/** Turn a parsed workspace into the API shapes. The text of the files is the only input. */
export function derive(source: LoadedWorkspace, opts: DeriveOptions): Derived {
  const world = source.world;
  const ix = buildIndex(source, opts.now);

  const promotedTo = new Map<string, LibId>();
  for (const l of world.library)
    for (const m of l.source.flatMap(findRefs))
      if (m.issue && m.anchor) promotedTo.set(`${m.issue}#${m.anchor}`, l.id);

  const summaries = new Map<IssueId, IssueSummary>();
  const details = new Map<IssueId, IssueDetail>();
  const files = new Map<IssueId, Partial<Record<IssueFileName, string>>>();
  for (const src of world.issues) {
    const b = buildIssue(src, source, ix, opts, promotedTo);
    summaries.set(src.goal.id, b.summary);
    details.set(src.goal.id, b.detail);
    files.set(src.goal.id, b.files);
  }

  // Issue backlinks: other issues and library items that reference this issue. Each file is
  // scanned once; an issue that cites another in several files counts once, via its first file.
  const citedBy = new Map<IssueId, Ref[]>();
  for (const [other, f] of files) {
    const seen = new Set<IssueId>();
    for (const [name, text] of Object.entries(f)) {
      for (const m of findRefs(text ?? "")) {
        if (!m.issue || m.issue === other || seen.has(m.issue)) continue;
        seen.add(m.issue);
        const list = citedBy.get(m.issue) ?? [];
        list.push({
          kind: "issue",
          target: m.target,
          issue: other,
          title: summaries.get(other)?.title ?? other,
          path: `${ix.dirs.get(other)}/${name}`,
        });
        citedBy.set(m.issue, list);
      }
    }
  }
  for (const [id, detail] of details) {
    const back: Ref[] = [...(citedBy.get(id) ?? [])];
    for (const l of world.library) {
      const hit = l.source.flatMap(findRefs).find((m) => m.issue === id);
      if (hit)
        back.push({
          kind: "library",
          target: l.id,
          id: l.id,
          title: l.title,
          path: ix.libraryPaths.get(l.id) ?? libraryPath(l),
        });
    }
    detail.backlinks = back;
  }

  const lib = buildLibrary(source, ix, files, opts.now);
  const groups = buildGroups(world, ix, summaries);

  const inbox = [...details.values()]
    .flatMap((d) => d.state?.needs_you ?? [])
    .sort(
      (a, b) =>
        Number(a.answered) - Number(b.answered) ||
        Number(b.urgency === "blocking") - Number(a.urgency === "blocking") ||
        tsMs(b.asked) - tsMs(a.asked),
    );

  const issues = [...summaries.values()];
  const diagnostics_count: LintCounts = { error: 0, warn: 0, info: 0 };
  for (const s of issues) {
    diagnostics_count.error += s.lint.error;
    diagnostics_count.warn += s.lint.warn;
    diagnostics_count.info += s.lint.info;
  }
  for (const d of lib.details.values())
    for (const x of d.diagnostics) diagnostics_count[x.severity]++;

  const snapshot: WorkspaceSnapshot = {
    wf_format: 1,
    rev: opts.rev,
    config: { ...world.config, archify: opts.archify ? "available" : "unavailable" },
    groups,
    issues,
    inbox,
    library: lib.summaries,
    authors: world.authors.map((a) => ({ ...a, lanes: [...a.lanes] })),
    diagnostics_count,
  };

  return {
    rev: opts.rev,
    at: opts.now,
    snapshot,
    details,
    library: lib.details,
    files,
    diagrams: source.diagrams,
    dirs: ix.dirs,
    groupDirs: ix.groupDirs,
  };
}
