// The "Do next step" run (plan D4). Real: the daemon runs `codex exec` with the `doing-next-step`
// skill on the next ready task. Prototype: a simulated background run whose phases are real
// markdown edits through the store, about two seconds apart, so the board, the Files view and
// the file watcher see each one. The skill is the spec; each phase does the steps it names:
//
//   claim   plan.md       an issue without a plan is planned first (`planning-issues`: plan.md
//                         from the criteria, status `planned`); then the task is `in_progress`,
//                         `claimed_by: @codex`, with a lease. goal.md: status `in_progress` and,
//                         unless another author's coordinator lease is live, `claimed_by` and
//                         `lease_until` (steps 3 and 4)
//   log     plan.md       the work, verified (steps 5 to 9): the steps are ticked and the task is
//           goal.md       `done` (`review` when its verify is `manual`); each criterion whose
//           changes.md    tasks are all done and whose verify is a command is ticked with
//                         `evidence:` and `verified_by:`; a commit with the trailer
//                         `Issue: <id>` joins the delivery data; one change entry carries the
//                         task, criteria, result, evidence, commit and files
//   verify  (CI)          a CI run starts on the commit, then passes
//   custom  changes.md    one phase for each custom step after Do next step that runs
//                         (skills-flow-spec 4.2): it passes, unless `failCustomStep(id)` made it
//                         fail
//   done    current_state  the state moves on (never under another author's live coordinator
//           goal.md       lease); goal.md releases the claim and, when every task is done, goes
//                         to `review` (steps 10 and 11)
//
// The run follows the skills flow in effect when it starts (`CodexOptions.flow`). The Plan step's
// skill is named in the claim phase of a run that plans first; `finish = review` sends the task to
// `review` for a person; `commit = none` records no commit, so there is no CI phase; each custom
// step after Do next step is a phase between the last of those and `done`. A required one that
// fails stops the run: a `kind: failure` change and a request that needs you (using-wf, section 3).
// `phases[].skill` carries the skill that ran each phase.
//
// Git, PR and CI data are not files (plan D2): the commit and the CI run go to `store.delivery`.
// One run is active per issue. `cancel` stops it and puts the task back in the queue.
import type {
  CriterionId,
  Handle,
  IssueId,
  IssueStatus,
  TaskId,
  TaskStatus,
  Ts,
} from "@/gen/types";
import { ApiError, NotFoundError } from "@/lib/api/error";
import { customAfter, type ResolvedCustom, type ResolvedFlow, resolveFlow } from "@/lib/api/flow";
import type {
  CodexPhase,
  CodexPhaseId,
  CodexRun,
  CodexRunKind,
  PipelineRun,
} from "@/lib/api/types";
import { draftPlan, taskTitle } from "./codex-plan";
import { commitSha, toTsSec } from "./delivery";
import { stripTicks } from "./derive";
import {
  addRequest,
  appendChange,
  claimIssue,
  claimTask,
  createState,
  moveTask,
  overwriteState,
  releaseIssue,
  setIssueStatus,
  setTaskStatus,
  toggleStep,
  verifyCriterion,
} from "./md/edit";
import { renderPlan } from "./md/render";
import type { ChangeSrc, IssueSrc, RequestSrc, StateSrc, TaskSrc } from "./source";
import type { Draft, Store, Touch } from "./store";
import { toTs, tsMs } from "./time";
import { randomId, slugify } from "./util";

export const CODEX_HANDLE: Handle = "codex";

/** Time between two phases. */
export const PHASE_MS = 2000;

/** Runs the list keeps, newest first; older ones drop off. */
const KEEP_RUNS = 30;

const MIN = 60_000;

/** Why a run did not start a task. The text is shown as written. */
export const NOTHING_READY = {
  finished: "Every task is done.",
  waiting: "No ready task. Wait for the tasks in flight.",
  noCriteria: "The issue has no criteria to plan from. Add one to goal.md first.",
  closed: (status: IssueStatus) => `The issue is ${status}.`,
  blockedBy: (issue: IssueId) => `Waiting on ${issue}: it is not done.`,
  request: (id: string, question: string) => `Waiting on ${id}: ${question}`,
  coordinator: (holder: Handle) =>
    `@${holder} holds the lease on this issue and has not planned it. Ask them to plan it.`,
} as const;

/** A run started, moved to its next phase or ended. */
export interface CodexRunEvent {
  event: "run";
  issue: IssueId;
  run: CodexRun;
}

/**
 * What the live stream tells a client: a run moved, or an issue's git and CI data changed. The
 * server adds the second kind from `store.onDelivery`; the engine only reports runs.
 */
export type CodexEvent = CodexRunEvent | { event: "delivery"; issue: IssueId };

export interface CodexOptions {
  /** Time between two phases. Default `PHASE_MS`. */
  phaseMs?: number;
  /**
   * The skills flow in effect for the person who starts a run: the team's flow with their
   * override, and what exists. Default: the team's flow in `workflow.toml`.
   */
  flow?: () => ResolvedFlow;
}

export interface Codex {
  /** Runs of one issue, or of all, newest first. */
  runs(issue?: IssueId): CodexRun[];
  /** Start a run. A 422 when the issue already has an active run. */
  start(issue: IssueId, kind: CodexRunKind): CodexRun;
  /** Stop an active run and release its claim. */
  cancel(id: string): CodexRun;
  subscribe(fn: (e: CodexRunEvent) => void): () => void;
  /** The time between phases of the runs that start from now on. */
  setPhaseMs(ms: number): void;
  /**
   * Make the custom step `id` fail (or pass again) in the runs that reach it. A required step that
   * fails stops the run; an optional one is logged and the run goes on. For scripts and tests
   * (`window.__wf.failCustomStep`).
   */
  failCustomStep(id: string, fail?: boolean): void;
  /** Every custom step passes again. */
  resetFailures(): void;
  /** Stop every run and forget them: the workspace under them was replaced. */
  reset(): void;
  dispose(): void;
}

// ---------------------------------------------------------------- the task a run picks

const tasksOf = (src: IssueSrc): TaskSrc[] => src.plan?.phases.flatMap((p) => p.tasks) ?? [];

/** What `pickTask` found: a task (to plan first when the issue has no plan), or why there is none. */
type Pick = { task: TaskId; plan: boolean } | { reason: string };

/** Another author holds a live coordinator lease on the issue. */
function foreignCoordinator(src: IssueSrc, now: number): Handle | undefined {
  const { claimed_by: holder, lease_until: until } = src.goal;
  return holder && holder !== CODEX_HANDLE && until && tsMs(until) > now ? holder : undefined;
}

/**
 * The next step, by the rules of `doing-next-step` step 3: nothing on a finished issue, nothing
 * while `blocked_by` names an issue that is not done, nothing while a blocking request touches the
 * next task; an issue without a plan is planned first, and then T-1 is next; otherwise the first
 * ready task in plan order (the rule of the plan view, `Task.ready`).
 */
function pickTask(store: Store, issue: IssueId): Pick {
  const detail = store.derived.details.get(issue);
  const src = store.issueSrc(issue);
  if (!detail || !src) return { reason: NOTHING_READY.finished };
  const { status } = detail.summary;
  if (status === "done" || status === "cancelled") return { reason: NOTHING_READY.closed(status) };
  for (const blocker of detail.summary.blocked_by) {
    const other = store.derived.details.get(blocker);
    if (other && other.summary.status !== "done")
      return { reason: NOTHING_READY.blockedBy(blocker) };
  }

  const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
  let next: { id: TaskId; satisfies: string[] };
  const plan = tasks.length === 0;
  if (plan) {
    if (src.criteria.length === 0) return { reason: NOTHING_READY.noCriteria };
    const holder = foreignCoordinator(src, store.now());
    if (holder) return { reason: NOTHING_READY.coordinator(holder) };
    next = { id: "T-1", satisfies: ["SC-1"] };
  } else {
    const ready = tasks.find((t) => t.ready);
    if (!ready) {
      const closed = tasks.every((t) => t.status === "done" || t.status === "cancelled");
      return { reason: closed ? NOTHING_READY.finished : NOTHING_READY.waiting };
    }
    next = ready;
  }

  // A blocking request that touches the task: it names the task, or its ref is a decision that
  // affects a criterion the task satisfies.
  const decisionOf = (ref: string | undefined) =>
    detail.decisions.find((d) => ref?.includes(`#${d.id}]]`));
  const blocking = (detail.state?.needs_you ?? []).find((r) => {
    if (r.answered || r.urgency !== "blocking") return false;
    const names = new RegExp(`\\b${next.id}\\b`).test(`${r.question} ${r.ref ?? ""}`);
    return names || (decisionOf(r.ref)?.affects ?? []).some((c) => next.satisfies.includes(c));
  });
  if (blocking) return { reason: NOTHING_READY.request(blocking.id, blocking.question) };
  return { task: next.id, plan };
}

/** The task to start once `finished` is done: the first `todo` whose dependencies are done. */
function nextAfter(src: IssueSrc, finished: TaskSrc): TaskSrc | undefined {
  const tasks = tasksOf(src);
  const done = (id: string) =>
    id === finished.id || tasks.find((t) => t.id === id)?.status === "done";
  return tasks.find(
    (t) => t.id !== finished.id && t.status === "todo" && (t.depends_on ?? []).every(done),
  );
}

/**
 * Take `lease_until` out of a task's meta list: a finished task holds no lease, and keeps
 * `claimed_by` to say who did it (the sample's done tasks read the same). `md/edit.ts` has no
 * remover for one key, so the line goes here.
 */
function dropLease(text: string, task: TaskId): string {
  const lines = text.split("\n");
  const head = lines.findIndex((l) => l.startsWith(`### ${task}:`));
  for (let i = head + 1; head >= 0 && i < lines.length && /^- [a-z_]+:(\s|$)/.test(lines[i]); i++) {
    if (!lines[i].startsWith("- lease_until:")) continue;
    lines.splice(i, 1);
    break;
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- words

const IRREGULAR: Record<string, string> = {
  build: "built",
  rebuild: "rebuilt",
  write: "wrote",
  rewrite: "rewrote",
  run: "ran",
  make: "made",
  send: "sent",
  keep: "kept",
  find: "found",
  get: "got",
  take: "took",
  give: "gave",
  draw: "drew",
  hold: "held",
  bring: "brought",
  choose: "chose",
  begin: "began",
  break: "broke",
  catch: "caught",
  lose: "lost",
  leave: "left",
  pay: "paid",
  say: "said",
  see: "saw",
  sell: "sold",
  spend: "spent",
  think: "thought",
  throw: "threw",
  undo: "undid",
  redo: "redid",
  bind: "bound",
  hide: "hid",
  lead: "led",
  feed: "fed",
  speak: "spoke",
  read: "read",
  set: "set",
  reset: "reset",
  split: "split",
  put: "put",
  cut: "cut",
  let: "let",
  shut: "shut",
};

/** Verbs that double their last letter: `dropped`, `shipped`. */
const DOUBLING = new Set(
  (
    "drop ship plan map log trim scan wrap skip stop tag pin strip flag zip plot chop slot " +
    "commit submit refer prefer transfer defer control permit admit pad embed fit plug drag stub hit"
  ).split(" "),
);

/** The past tense of an imperative verb: `build` → `built`, `drop` → `dropped`. */
function pastVerb(verb: string): string {
  const w = verb.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (DOUBLING.has(w)) return `${w}${w.at(-1)}ed`;
  if (w.endsWith("e")) return `${w}d`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ied`;
  return `${w}ed`;
}

/**
 * A task title as a change entry title: the imperative verb moves to the past tense
 * (`Build the SSE delta stream` → `Built the SSE delta stream`). A title that does not open
 * with a plain verb (an acronym, a number) becomes `Worked on …`.
 */
export function pastTense(title: string): string {
  const clean = title.trim().replace(/\s+/g, " ");
  const [first = "", ...rest] = clean.split(" ");
  if (/^[A-Z][a-z]+$/.test(first)) {
    const past = pastVerb(first);
    return [past.charAt(0).toUpperCase() + past.slice(1), ...rest].join(" ");
  }
  const lowered = /[A-Z].*[A-Z]|\d|[_./`]/.test(first)
    ? clean
    : clean.charAt(0).toLowerCase() + clean.slice(1);
  return `Worked on ${lowered}`;
}

// ---------------------------------------------------------------- CI

/** The jobs of the CI run for a task: Rust checks, web checks or a plain build and test. */
function jobsFor(task: TaskSrc): string[] {
  const verify = task.verify ?? "";
  if (/\bcargo\b/.test(verify)) return ["fmt", "clippy", "test"];
  if (task.lane === "web" || /\b(pnpm|npm|vitest|biome)\b/.test(verify))
    return ["typecheck", "biome", "vitest", "build"];
  return ["build", "test"];
}

/** Seconds each job takes, by position: the same task always takes the same time. */
const JOB_SECONDS = [6, 41, 73, 25];

// ---------------------------------------------------------------- the engine

interface Active {
  run: CodexRun;
  sha: string;
  branch: string;
  /** The run writes the plan first: the issue had none. */
  plans: boolean;
  /**
   * The run is the coordinator of the issue (it holds `claimed_by` in goal.md). False for a worker
   * under another author's live coordinator lease: it claims the task and appends log entries,
   * and never rewrites goal.md's claim or current_state.md.
   */
  coordinator: boolean;
  /** The status goal.md had before the claim moved it, so a cancel puts it back. */
  statusBefore?: IssueStatus;
  /** The flow the run follows: what it was when the run started. */
  flow: ResolvedFlow;
  /** The commit option of Do next step is `task`: the work commits and CI runs on the commit. */
  commits: boolean;
  /** The finish option of Do next step is `review`: every task waits for a person. */
  reviews: boolean;
  /** The task status the work phase left: `done`, or `review` when the verify is `manual`. */
  after?: TaskStatus;
  /** The criteria the work phase ticked. */
  ticked: CriterionId[];
  /** Criteria whose tasks are all done but whose verify is `manual`: a person checks them. */
  manual: CriterionId[];
  /** The change entry the work phase wrote. */
  entry?: string;
  /** The CI run the verify phase started. */
  pipeline?: { id: string; startedMs: number; jobs: string[] };
  timers: ReturnType<typeof setTimeout>[];
}

/** The phases that run the same in every flow; a custom phase is `custom:<id>`. */
type FixedPhase = "claim" | "log" | "verify" | "done";

const optionOf = (flow: ResolvedFlow, key: string): string | number | undefined =>
  flow.steps.do.options[key]?.value;

const copy = (r: CodexRun): CodexRun => ({ ...r, phases: r.phases.map((p) => ({ ...p })) });

const reject = (...gaps: string[]): never => {
  throw new ApiError(422, { diagnostics: [], gaps });
};

/** `@a`, `@a and @b`: handles as words. */
const words = (xs: string[]) => xs.join(", ");

export function createCodex(store: Store, options: CodexOptions = {}): Codex {
  let phaseMs = options.phaseMs ?? PHASE_MS;
  const flowNow = () => options.flow?.() ?? resolveFlow({ team: store.world.config.flow });
  /** Custom steps that fail when a run reaches them. */
  const failing = new Set<string>();
  let runs: CodexRun[] = [];
  const active = new Map<string, Active>();
  const listeners = new Set<(e: CodexRunEvent) => void>();
  let ciSeq = 0;

  const emit = (e: CodexRunEvent) => {
    for (const l of [...listeners]) {
      try {
        l(e);
      } catch (err) {
        console.error("codex listener failed", err);
      }
    }
  };
  const announce = (a: Active) => emit({ event: "run", issue: a.run.issue, run: copy(a.run) });

  const text = (w: Draft, path: string): string => {
    const found = w.read(path);
    if (found === undefined) throw new Error(`${path} does not exist.`);
    return found;
  };
  const taskOf = (a: Active): TaskSrc | undefined => {
    const src = store.issueSrc(a.run.issue);
    return src && tasksOf(src).find((t) => t.id === a.run.task);
  };
  const leaseUntil = (): Ts => toTs(store.now() + store.world.config.leases_minutes * MIN);
  const authorModel = () => store.world.authors.find((x) => x.handle === CODEX_HANDLE)?.model;

  // ---- the phases

  /** The plan, the state and the entry of planning an issue (`planning-issues`, steps 6 to 8). */
  function planIssue(a: Active, src: IssueSrc, w: Draft): { touches: Touch[]; title: string } {
    const { issue } = a.run;
    const planFile = store.filePath(issue, "plan.md");
    const changesFile = store.filePath(issue, "changes.md");
    const stateFile = store.filePath(issue, "current_state.md");
    const group = store.summary(issue)?.group_path.at(-1) ?? "main";
    const draft = draftPlan(src, {
      at: store.stamp(),
      by: CODEX_HANDLE,
      lane: slugify(group) || "main",
      maxTasks: Number(a.flow.steps.plan.options.max_tasks?.value),
    });
    const tasks = draft.phases.flatMap((p) => p.tasks);
    const lanes = new Set(tasks.map((t) => t.lane));
    w.write(planFile, renderPlan(draft));

    const entry: ChangeSrc = {
      id: store.newId("C-"),
      ts: store.stamp(),
      author: CODEX_HANDLE,
      title: `Wrote the plan with ${tasks.length} task${tasks.length === 1 ? "" : "s"} in ${lanes.size} lane${lanes.size === 1 ? "" : "s"}`,
      kind: "docs",
      files: ["plan.md"],
      model: authorModel(),
      body: `Turned the ${src.criteria.length} criteri${src.criteria.length === 1 ? "on" : "a"} of goal.md into ${tasks.length} task${tasks.length === 1 ? "" : "s"}, one per criterion, in order.`,
    };
    w.write(changesFile, appendChange(w.read(changesFile), entry));

    const touches: Touch[] = [
      { file: planFile, anchors: "all" },
      { file: changesFile, anchors: [entry.id] },
    ];
    // A worker under another author's lease never rewrites the state; a coordinator creates it, or
    // changes only the summary, the stamp and the next steps (planning-issues, step 8).
    if (a.coordinator) {
      const summary = `Planned: ${tasks.length} task${tasks.length === 1 ? "" : "s"} in ${lanes.size} lane${lanes.size === 1 ? "" : "s"}; T-1 is ready.`;
      const existing = w.read(stateFile);
      const current = src.state;
      if (existing === undefined || !current)
        w.write(
          stateFile,
          createState({
            summary,
            updated_at: store.stamp(),
            updated_by: CODEX_HANDLE,
            phase: draft.phases[0].name,
            needs_you: [],
            next_steps: ["Claim [[#T-1]] and start the first step."],
          }),
        );
      else
        w.write(
          stateFile,
          overwriteState(existing, {
            summary,
            updated_at: store.stamp(),
            updated_by: CODEX_HANDLE,
            next_steps: ["Claim [[#T-1]] and start the first step."],
          }),
        );
      touches.push({ file: stateFile, anchors: "all" });
    }
    return { touches, title: entry.title };
  }

  /** claim: [plan], then the task is `in_progress`, held by @codex, with a lease; so is the issue. */
  function claim(a: Active) {
    const { issue, task = "" } = a.run;
    const src = store.issueSrc(issue);
    if (!src) throw new Error(`${issue} is gone.`);
    const planFile = store.filePath(issue, "plan.md");
    const goalFile = store.filePath(issue, "goal.md");
    a.coordinator = !foreignCoordinator(src, store.now());
    store.mutate(CODEX_HANDLE, issue, (w) => {
      const touches: Touch[] = [];
      const activity: {
        issue_id: IssueId;
        kind: "change" | "lease";
        author: Handle;
        title: string;
      }[] = [];
      let status = src.goal.status;
      if (a.plans) {
        const planned = planIssue(a, src, w);
        touches.push(...planned.touches);
        activity.push({
          issue_id: issue,
          kind: "change",
          author: CODEX_HANDLE,
          title: planned.title,
        });
        // planning-issues step 7: only the `status:` line, `backlog` to `planned`.
        if (status === "backlog") {
          w.write(goalFile, setIssueStatus(text(w, goalFile), "planned"));
          touches.push({ file: goalFile, anchors: ["status"] });
          status = "planned";
        }
      }

      w.write(
        planFile,
        claimTask(
          setTaskStatus(text(w, planFile), task, "in_progress"),
          task,
          CODEX_HANDLE,
          leaseUntil(),
        ),
      );
      touches.push({ file: planFile, anchors: [task] });

      // doing-next-step step 4: the coordinator lease and the status. A worker claims the task only.
      if (a.coordinator) {
        let goal = text(w, goalFile);
        if (status === "backlog" || status === "planned") {
          a.statusBefore = status;
          goal = setIssueStatus(goal, "in_progress");
        }
        w.write(goalFile, claimIssue(goal, CODEX_HANDLE, leaseUntil()));
        if (!touches.some((t) => t.file === goalFile))
          touches.push({ file: goalFile, anchors: ["status", "lease_until"] });
      }
      if (a.coordinator && !a.plans) {
        const resolved = resolveAnswered(src, w);
        touches.push(...resolved.touches);
        for (const title of resolved.titles)
          activity.push({ issue_id: issue, kind: "change", author: CODEX_HANDLE, title });
      }
      const title = `Claimed ${task}`;
      activity.push({ issue_id: issue, kind: "lease", author: CODEX_HANDLE, title });
      return {
        touches,
        activity,
        log: [{ issue_id: issue, kind: "lease", author: CODEX_HANDLE, title }],
      };
    });
  }

  /**
   * doing-next-step, step 2: a request a person answered (`[x]` with an `answer:`) is resolved
   * before the work starts. Its item leaves `## Needs you`, and a `kind: answer` entry holds the
   * question and the answer (`logging-work`).
   */
  function resolveAnswered(src: IssueSrc, w: Draft): { touches: Touch[]; titles: string[] } {
    const answered = (src.state?.needs_you ?? []).filter((r) => r.answered);
    if (!src.state || answered.length === 0) return { touches: [], titles: [] };
    const changesFile = store.filePath(src.goal.id, "changes.md");
    const stateFile = store.filePath(src.goal.id, "current_state.md");
    const entries = answered.map<ChangeSrc>((r) => ({
      id: store.newId("C-"),
      ts: store.stamp(),
      author: CODEX_HANDLE,
      title: `Resolved ${r.id}`,
      kind: "answer",
      model: authorModel(),
      body: `**Q:** ${r.question}\n**A:** ${r.answer ?? ""} (@${r.answered_by ?? r.to})`,
    }));
    w.write(
      changesFile,
      entries.reduce<string | undefined>((log, e) => appendChange(log, e), w.read(changesFile)) ??
        "",
    );
    w.write(
      stateFile,
      overwriteState(text(w, stateFile), {
        needs_you: src.state.needs_you.filter((r) => !r.answered),
      }),
    );
    return {
      touches: [
        { file: changesFile, anchors: entries.map((e) => e.id) },
        { file: stateFile, anchors: answered.map((r) => r.id) },
      ],
      titles: entries.map((e) => e.title),
    };
  }

  /**
   * log (steps 5 to 9): the work is done and verified. The steps are ticked, the task is `done`
   * (or `review` when its verify is `manual`, for a person to check), each criterion whose tasks
   * are all done is ticked with evidence when its verify is a command, the commit lands, and ONE
   * change entry names the task, criteria, result, evidence, commit and files.
   */
  function work(a: Active) {
    const { issue, task = "" } = a.run;
    const src = store.issueSrc(issue);
    const live = taskOf(a);
    if (!src || !live) throw new Error(`${task} is gone.`);
    const planFile = store.filePath(issue, "plan.md");
    const goalFile = store.filePath(issue, "goal.md");
    const changesFile = store.filePath(issue, "changes.md");

    const command = stripTicks(live.verify)?.trim();
    const byHand = !command || command === "manual";
    // A task goes to review when only a person can check it, or when the flow sends every task
    // there (Do next step, finish = review).
    const toReview = byHand || a.reviews;
    const tasks = tasksOf(src);
    // Step 7: a criterion is ticked when every task that satisfies it is done and its own verify
    // is a command. A `manual` criterion is never ticked by an agent: a person checks it. A task
    // that waits in review is not done, so nothing it satisfies is ticked yet.
    const ticks: { id: CriterionId; command: string }[] = [];
    const manual: CriterionId[] = [];
    if (!toReview)
      for (const id of live.satisfies ?? []) {
        const criterion = src.criteria[Number(/^SC-(\d+)$/.exec(id)?.[1]) - 1];
        if (!criterion || criterion.checked) continue;
        const others = tasks.filter(
          (t) => t.id !== live.id && t.status !== "cancelled" && t.satisfies?.includes(id),
        );
        if (!others.every((t) => t.status === "done")) continue;
        const own = stripTicks(criterion.verify)?.trim();
        if (own && own !== "manual") ticks.push({ id, command: own });
        else manual.push(id);
      }

    const steps = live.steps?.length ?? 0;
    const files = live.owns ?? [];
    const where = files.length > 0 ? ` in ${files.map((f) => `\`${f}\``).join(", ")}` : "";
    const owner = src.goal.owner ?? store.me;
    const sentences = [
      steps > 0
        ? `Worked through ${steps} step${steps === 1 ? "" : "s"} of ${task}${where}.`
        : `Worked on ${task}${where}.`,
    ];
    if (ticks.length > 0)
      sentences.push(`Ticked ${words(ticks.map((t) => t.id))} with the passing verify command.`);
    if (byHand) sentences.push(`${task} waits for a manual check by @${owner}.`);
    else if (a.reviews)
      sentences.push(
        `The flow sends every task to review, so ${task} waits for a check by @${owner}.`,
      );
    else if (manual.length > 0)
      sentences.push(`${words(manual)} waits for a manual check by @${owner}.`);
    if (!a.coordinator)
      sentences.push(
        "Ran as a worker under another lease, so goal.md and current_state.md stay as they were.",
      );

    const entry: ChangeSrc = {
      id: store.newId("C-"),
      ts: store.stamp(),
      author: CODEX_HANDLE,
      title: pastTense(live.title),
      kind: "progress",
      task,
      criteria: ticks.length > 0 ? ticks.map((t) => t.id) : undefined,
      result: byHand ? undefined : "pass",
      evidence: byHand
        ? undefined
        : a.commits
          ? `\`${command}\` passed at \`${a.sha}\``
          : `\`${command}\` passed`,
      commit: a.commits ? a.sha : undefined,
      files: files.length > 0 ? files : undefined,
      model: authorModel(),
      body: sentences.join(" "),
    };

    store.mutate(CODEX_HANDLE, issue, (w) => {
      let plan = text(w, planFile);
      const touched: string[] = [task];
      (live.steps ?? []).forEach((step, i) => {
        if (step.done) return;
        plan = toggleStep(plan, task, i + 1, true);
        touched.push(`${task}.${i + 1}`);
      });
      const after: TaskStatus = toReview ? "review" : "done";
      w.write(planFile, dropLease(setTaskStatus(plan, task, after), task));
      const touches: Touch[] = [{ file: planFile, anchors: touched }];

      if (ticks.length > 0) {
        let goal = text(w, goalFile);
        for (const t of ticks)
          goal = verifyCriterion(goal, t.id, {
            evidence: `\`${t.command}\` passed${a.commits ? ` at \`${a.sha}\`` : ""}, see [[#${entry.id}]]`,
            by: CODEX_HANDLE,
          });
        w.write(goalFile, goal);
        touches.push({ file: goalFile, anchors: ticks.map((t) => t.id) });
      }

      w.write(changesFile, appendChange(w.read(changesFile), entry));
      touches.push({ file: changesFile, anchors: [entry.id] });
      a.after = after;
      a.run.review = toReview || undefined;
      return {
        touches,
        activity: [{ issue_id: issue, kind: "change", author: CODEX_HANDLE, title: entry.title }],
      };
    });
    a.entry = entry.id;
    a.ticked = ticks.map((t) => t.id);
    a.manual = manual;

    // Step 8: the commit, with the trailer, on the branch of the issue. With commit = none the
    // changes are left for a person and nothing is recorded.
    if (!a.commits) return;
    store.updateDelivery(issue, (d) => ({
      ...d,
      commits: [
        {
          sha: a.sha,
          subject: live.title,
          author: CODEX_HANDLE,
          at: toTsSec(store.now()),
          branch: a.branch,
          task,
          files_changed: Math.max(1, live.owns?.length ?? 0),
          trailer: `Issue: ${issue}`,
        },
        ...d.commits,
      ],
    }));
    a.run.commit = a.sha;
  }

  /** verify: a CI run starts on the commit. It is not a markdown edit. */
  function verify(a: Active) {
    const { issue } = a.run;
    const live = taskOf(a);
    if (!live) throw new Error(`${a.run.task} is gone.`);
    ciSeq += 1;
    const jobs = jobsFor(live);
    const pipeline: PipelineRun = {
      id: `ci-${4000 + ciSeq}`,
      workflow: "CI",
      trigger: "push",
      branch: a.branch,
      sha: a.sha,
      status: "in_progress",
      started_at: toTsSec(store.now()),
      jobs: jobs.map((name) => ({ name })),
    };
    a.pipeline = { id: pipeline.id, startedMs: store.now(), jobs };
    a.run.pipeline = pipeline.id;
    store.updateDelivery(issue, (d) => ({ ...d, pipelines: [pipeline, ...d.pipelines] }));
  }

  /** The CI run passes. Part of the verify phase, half a phase after it starts. */
  function ciPasses(a: Active) {
    const ci = a.pipeline;
    if (!ci || a.run.status !== "running") return;
    const seconds = ci.jobs.map((_, i) => JOB_SECONDS[i % JOB_SECONDS.length]);
    store.updateDelivery(a.run.issue, (d) => ({
      ...d,
      pipelines: d.pipelines.map((p) =>
        p.id === ci.id
          ? {
              ...p,
              status: "completed",
              conclusion: "success",
              duration_s: seconds.reduce((sum, s) => sum + s, 0),
              jobs: ci.jobs.map((name, i) => ({
                name,
                conclusion: "success",
                duration_s: seconds[i],
              })),
            }
          : p,
      ),
    }));
  }

  /** The request that asks a person to check a task whose verify is `manual`. */
  function checkRequest(src: IssueSrc, finished: TaskSrc): RequestSrc {
    const blocks = tasksOf(src).some((t) => t.depends_on?.includes(finished.id));
    return {
      id: store.newId("Q-"),
      question: `Check ${finished.id} by hand: ${finished.title}?`,
      from: CODEX_HANDLE,
      to: src.goal.owner ?? store.me,
      kind: "approval",
      urgency: blocks ? "blocking" : "fyi",
      asked: store.stamp(),
      options: ["approve", "reject"],
      ref: `[[#${finished.id}]]`,
    };
  }

  /** The `current_state.md` after the task: what moved, what a person must check, what is next. */
  function stateAfter(a: Active, src: IssueSrc, finished: TaskSrc, w: Draft): string | undefined {
    const file = store.filePath(a.run.issue, "current_state.md");
    const current = src.state;
    const exists = w.read(file) !== undefined;
    // A file that does not read (broken frontmatter) is the person's to fix, not ours to replace.
    if (exists && !current) return undefined;

    const owner = src.goal.owner ?? store.me;
    const inReview = finished.status === "review";
    const next = nextAfter(src, finished);
    const others = tasksOf(src).filter(
      (t) => t.id !== finished.id && t.status !== "done" && t.status !== "cancelled",
    );
    const verified = a.ticked.length
      ? ` and ${words(a.ticked)} ${a.ticked.length === 1 ? "is" : "are"} verified`
      : "";
    const summary = inReview
      ? `${finished.id} is in review; it waits for a manual check.`
      : next
        ? `${finished.id} is done${verified}; ${next.id} is next.`
        : others.length === 0
          ? `Every task is done${verified}; the criteria wait for checks.`
          : `${finished.id} is done${verified}; no task is ready yet.`;
    // Gaps first (a manual check), then the next task, then the older next steps.
    const asks = [
      ...(inReview ? [`Ask @${owner} to verify [[#${finished.id}]] by hand.`] : []),
      ...a.manual.map((id) => `Ask @${owner} to verify ${id} by hand.`),
    ];
    const first =
      asks[0] ??
      (next
        ? `Start [[#${next.id}]] ${next.title}.`
        : others.length === 0
          ? "Check the criteria and close the issue."
          : "Wait for the tasks in flight.");
    const mentions = (line: string) => line.includes(`[[#${finished.id}]]`);
    // A task in review is not done: it waits for a person, so it sits under Blocked.
    const pointer = `[[#${finished.id}]] ${finished.title}.${a.entry ? ` See [[#${a.entry}]].` : ""}`;
    const done = inReview
      ? []
      : [
          pointer,
          ...a.ticked.map(
            (id) =>
              `[[#${id}]] has evidence${a.commits ? ` at ${a.sha}` : ""}.${a.entry ? ` See [[#${a.entry}]].` : ""}`,
          ),
        ];
    const blocked = inReview
      ? [`[[#${finished.id}]] waits for @${owner} to check it by hand. See [[#${a.entry}]].`]
      : [];
    const nextSteps = [
      ...new Set([first, ...asks, ...(current?.next_steps ?? []).filter((l) => !mentions(l))]),
    ].slice(0, 4);
    const requests = inReview ? [checkRequest(src, finished)] : [];

    if (!current || !exists)
      return createState({
        summary,
        updated_at: store.stamp(),
        updated_by: CODEX_HANDLE,
        needs_you: requests,
        done: done.length ? done : undefined,
        blocked: blocked.length ? blocked : undefined,
        next_steps: nextSteps,
      });
    const patch: Partial<StateSrc> = {
      summary,
      updated_at: store.stamp(),
      updated_by: CODEX_HANDLE,
      done: [...(current.done ?? []), ...done],
      in_flight: (current.in_flight ?? []).filter((l) => !mentions(l)),
      blocked: [...(current.blocked ?? []).filter((l) => !mentions(l)), ...blocked],
      next_steps: nextSteps,
    };
    return overwriteState(text(w, file), {
      ...patch,
      needs_you: [...current.needs_you, ...requests],
    });
  }

  /**
   * done (steps 10 and 11): the state moves on, the issue gives up its claim and, when every task
   * is done, goes to `review`. Under another author's live coordinator lease neither file is
   * rewritten; the change entry already says so.
   */
  function finish(a: Active) {
    const { issue, task = "" } = a.run;
    const src = store.issueSrc(issue);
    const live = taskOf(a);
    if (!src || !live) throw new Error(`${task} is gone.`);
    if (!a.coordinator) return;
    const goalFile = store.filePath(issue, "goal.md");
    const stateFile = store.filePath(issue, "current_state.md");
    store.mutate(CODEX_HANDLE, issue, (w) => {
      const touches: Touch[] = [];
      let goal = text(w, goalFile);
      if (src.goal.claimed_by === CODEX_HANDLE) goal = releaseIssue(goal);
      const closed = tasksOf(src).every((t) => t.status === "done" || t.status === "cancelled");
      if (closed && src.goal.status === "in_progress") goal = setIssueStatus(goal, "review");
      w.write(goalFile, goal);
      touches.push({ file: goalFile, anchors: ["status", "lease_until"] });

      const state = stateAfter(a, src, live, w);
      if (state !== undefined) {
        w.write(stateFile, state);
        touches.push({ file: stateFile, anchors: "all" });
      }
      const title = `Finished ${task}`;
      return {
        touches,
        activity: [{ issue_id: issue, kind: "state", author: CODEX_HANDLE, title }],
        log: [{ issue_id: issue, kind: "state", author: CODEX_HANDLE, title }],
      };
    });
  }

  /**
   * A custom step after Do next step. It passes, unless a script made it fail
   * (`failCustomStep`). A failure is a `kind: failure` change (`result: fail`, the reason in
   * `evidence`); a required step also asks for a person in `Needs you` and stops the run, an
   * optional one is logged and the run goes on (using-wf, section 3).
   */
  function customStep(a: Active, c: ResolvedCustom) {
    if (!failing.has(c.id)) return;
    const { issue, task = "" } = a.run;
    const src = store.issueSrc(issue);
    if (!src) throw new Error(`${issue} is gone.`);
    const changesFile = store.filePath(issue, "changes.md");
    const stateFile = store.filePath(issue, "current_state.md");
    const owner = src.goal.owner ?? store.me;
    const entry: ChangeSrc = {
      id: store.newId("C-"),
      ts: store.stamp(),
      author: CODEX_HANDLE,
      title: `${c.label} failed`,
      kind: "failure",
      task,
      result: "fail",
      evidence: `${c.skill} reported a failure for ${task}.`,
      model: authorModel(),
      body: `The custom step ${c.id} (${c.skill}) failed after ${task}.${
        c.required ? " It must pass, so the run stopped." : " It is optional, so the run went on."
      }`,
    };
    store.mutate(CODEX_HANDLE, issue, (w) => {
      w.write(changesFile, appendChange(w.read(changesFile), entry));
      const touches: Touch[] = [{ file: changesFile, anchors: [entry.id] }];
      if (c.required) {
        const request: RequestSrc = {
          id: store.newId("Q-"),
          question: `${c.label} failed on ${task}. Fix it, or tell Codex how to go on.`,
          from: CODEX_HANDLE,
          to: owner,
          kind: "input",
          urgency: "blocking",
          asked: store.stamp(),
          ref: `[[#${entry.id}]]`,
        };
        w.write(
          stateFile,
          addRequest(w.read(stateFile), request, {
            summary: `${c.label} failed on ${task}.`,
            updated_at: store.stamp(),
            updated_by: CODEX_HANDLE,
            next_steps: [`Fix what ${c.label} found, then press Do next step.`],
          }),
        );
        touches.push({ file: stateFile, anchors: "all" });
      }
      return {
        touches,
        activity: [{ issue_id: issue, kind: "change", author: CODEX_HANDLE, title: entry.title }],
      };
    });
    if (c.required) throw new Error(`${c.label} failed on ${task}: it must pass.`);
  }

  const STEPS: Record<FixedPhase, (a: Active) => void> = {
    claim,
    log: work,
    verify,
    done: finish,
  };

  /** The code of one phase: a fixed one, or the custom step the id names. */
  function execute(a: Active, id: CodexPhaseId): void {
    if (id.startsWith("custom:")) {
      const c = customAfter(a.flow, "do").find((x) => `custom:${x.id}` === id);
      if (c) customStep(a, c);
      return;
    }
    STEPS[id as FixedPhase](a);
  }

  // ---- running

  const stop = (a: Active) => {
    for (const t of a.timers) clearTimeout(t);
    a.timers = [];
    active.delete(a.run.id);
  };

  /**
   * Give back what the run holds: the task goes back in the queue when it is still in flight, and
   * the issue loses the claim and the status the claim moved (doing-next-step, step 11).
   */
  function release(a: Active) {
    const { issue, task = "" } = a.run;
    const src = store.issueSrc(issue);
    const live = taskOf(a);
    const holdsTask =
      !a.after &&
      live?.claimed_by === CODEX_HANDLE &&
      (live.status === "in_progress" || live.status === "review");
    const holdsIssue = a.coordinator && src?.goal.claimed_by === CODEX_HANDLE;
    if (!holdsTask && !holdsIssue) return;
    store.mutate(CODEX_HANDLE, issue, (w) => {
      const touches: Touch[] = [];
      if (holdsTask) {
        const file = store.filePath(issue, "plan.md");
        w.write(file, moveTask(text(w, file), task, "todo"));
        touches.push({ file, anchors: [task] });
      }
      if (holdsIssue && src) {
        const file = store.filePath(issue, "goal.md");
        let goal = releaseIssue(text(w, file));
        if (a.statusBefore && !a.after && src.goal.status === "in_progress")
          goal = setIssueStatus(goal, a.statusBefore);
        w.write(file, goal);
        touches.push({ file, anchors: ["status", "lease_until"] });
      }
      const title = `Released ${task}`;
      return {
        touches,
        activity: [{ issue_id: issue, kind: "lease", author: CODEX_HANDLE, title }],
        log: [{ issue_id: issue, kind: "lease", author: CODEX_HANDLE, title }],
      };
    });
  }

  /** A CI run that is still going ends as cancelled. */
  function stopPipeline(a: Active) {
    const ci = a.pipeline;
    if (!ci) return;
    const elapsed = Math.max(1, Math.round((store.now() - ci.startedMs) / 1000));
    store.updateDelivery(a.run.issue, (d) => ({
      ...d,
      pipelines: d.pipelines.map((p) =>
        p.id === ci.id && p.status !== "completed"
          ? {
              ...p,
              status: "completed",
              conclusion: "cancelled",
              duration_s: elapsed,
              jobs: p.jobs.map((j) => (j.conclusion ? j : { ...j, conclusion: "cancelled" })),
            }
          : p,
      ),
    }));
  }

  const finishRun = (a: Active, status: CodexRun["status"], reason?: string) => {
    stop(a);
    // `running` belongs to a run that is going: a phase that was cut short goes back to `pending`,
    // and `phase` keeps saying where the run stopped.
    if (status !== "done")
      a.run.phases = a.run.phases.map((p) =>
        p.state === "running" ? { ...p, state: "pending" } : p,
      );
    a.run.status = status;
    a.run.finished_at = toTsSec(store.now());
    if (reason) a.run.reason = reason;
    announce(a);
  };

  /** The run cannot go on: say why, put the task back and end the run. */
  function fail(a: Active, reason: string) {
    stop(a);
    try {
      release(a);
    } catch {
      // The workspace changed under the run; there is nothing left to release.
    }
    try {
      stopPipeline(a);
    } catch {
      // Same: the issue may be gone.
    }
    finishRun(a, "failed", reason);
  }

  /** Why the run cannot go on: someone else changed or removed the task it holds. */
  function drifted(a: Active): string | undefined {
    const live = taskOf(a);
    const task = a.run.task;
    if (!live) return `${task} is gone.`;
    const mine = live.claimed_by === CODEX_HANDLE;
    // Before the work phase the task is in flight; after it, it stays as the run left it.
    const expected = a.after
      ? live.status === a.after
      : live.status === "in_progress" || live.status === "review";
    return mine && expected ? undefined : `${task} changed while Codex worked on it.`;
  }

  function step(a: Active, id: CodexPhaseId) {
    if (a.run.status !== "running") return;
    if (id !== "claim") {
      const why = drifted(a);
      if (why) return fail(a, why);
    }
    const at = a.run.phases.findIndex((p) => p.id === id);
    a.run.phase = id;
    a.run.phases = a.run.phases.map((p, i) => ({
      ...p,
      state: i < at ? "done" : i === at ? "running" : "pending",
    }));
    try {
      execute(a, id);
    } catch (err) {
      return fail(a, err instanceof Error ? err.message : String(err));
    }
    if (id === "done") {
      a.run.phases = a.run.phases.map((p) => ({ ...p, state: "done" }));
      return finishRun(a, "done");
    }
    announce(a);
  }

  // ---- the public side

  /**
   * The phases of a run under a flow, each with the skill that runs it: the claim plans first with
   * the Plan step's skill (named in the label unless it is the built-in one), the change is
   * logged with the Log step's, CI runs only when the flow commits, every custom step after Do next
   * step is a phase of its own, and the rest is the Do next step's.
   */
  function phasesOf(flow: ResolvedFlow, task: TaskId, plans: boolean, commits: boolean) {
    const plan = flow.steps.plan;
    const planNote = plan.origin === "built-in" ? "" : ` (${plan.skill})`;
    const doSkill = flow.steps.do.skill;
    const list: { id: CodexPhaseId; label: string; skill: string }[] = [
      plans
        ? { id: "claim", label: `Plan the issue${planNote}, claim ${task}`, skill: plan.skill }
        : { id: "claim", label: `Claim ${task}`, skill: doSkill },
      { id: "log", label: "Log the change", skill: flow.steps.log.skill },
      ...(commits ? [{ id: "verify" as const, label: "Run CI", skill: doSkill }] : []),
      ...customAfter(flow, "do").map((c) => ({
        id: `custom:${c.id}` as const,
        label: c.label,
        skill: c.skill,
      })),
      { id: "done", label: `Finish ${task}`, skill: doSkill },
    ];
    return list.map<CodexPhase>((p) => ({ ...p, state: "pending" }));
  }

  function start(issue: IssueId, kind: CodexRunKind): CodexRun {
    if (kind !== "next_step") reject(`Codex does not know the run "${kind}".`);
    if (!store.derived.details.has(issue)) throw new NotFoundError(`Issue ${issue}`);
    if ([...active.values()].some((a) => a.run.issue === issue))
      reject(`Codex is already working on ${issue}.`);

    const picked = pickTask(store, issue);
    const startedAt = toTsSec(store.now());
    const id = randomId((x) => runs.some((r) => r.id === x), "run-");
    const base: CodexRun = {
      id,
      issue,
      kind,
      status: "running",
      by: CODEX_HANDLE,
      phases: [],
      started_at: startedAt,
    };

    if ("reason" in picked) {
      const run: CodexRun = {
        ...base,
        status: "nothing_ready",
        reason: picked.reason,
        finished_at: startedAt,
      };
      runs = [run, ...runs].slice(0, KEEP_RUNS);
      emit({ event: "run", issue, run: copy(run) });
      return copy(run);
    }

    const src = store.issueSrc(issue);
    // The title of a task that does not exist yet comes from the criterion it will satisfy.
    const title = picked.plan
      ? taskTitle(src?.criteria[0]?.text ?? "", 1)
      : src && tasksOf(src).find((t) => t.id === picked.task)?.title;
    if (!src || title === undefined) reject(`Task ${picked.task} does not exist.`);
    const flow = flowNow();
    const commits = optionOf(flow, "commit") !== "none";
    const run: CodexRun = {
      ...base,
      task: picked.task,
      task_title: title,
      phase: "claim",
      phases: phasesOf(flow, picked.task, picked.plan, commits),
      ...(picked.plan ? { plans: true } : {}),
    };
    const a: Active = {
      run,
      sha: commitSha(`${issue}:${picked.task}:${id}`),
      branch: `${issue}/${slugify(title ?? picked.task)}`,
      plans: picked.plan,
      coordinator: true,
      flow,
      commits,
      reviews: optionOf(flow, "finish") === "review",
      ticked: [],
      manual: [],
      timers: [],
    };
    runs = [run, ...runs].slice(0, KEEP_RUNS);
    active.set(id, a);

    // The claim lands now, so the click is answered; the other phases follow, one phase apart.
    step(a, "claim");
    if (a.run.status === "running") {
      const later = (ms: number, fn: () => void) => a.timers.push(setTimeout(fn, ms));
      a.run.phases.forEach((p, i) => {
        if (i === 0) return;
        later(i * phaseMs, () => step(a, p.id));
        // CI passes half a phase after it starts.
        if (p.id === "verify") later((i + 0.5) * phaseMs, () => ciPasses(a));
      });
    }
    return copy(run);
  }

  function cancel(id: string): CodexRun {
    const a = active.get(id);
    if (!a) {
      const done = runs.find((r) => r.id === id);
      if (!done) throw new NotFoundError(`Run ${id}`);
      return reject(`Run ${id} already finished.`);
    }
    stop(a);
    try {
      release(a);
    } catch {
      // The task is gone or changed: the run still ends.
    }
    stopPipeline(a);
    finishRun(
      a,
      "cancelled",
      a.after
        ? "Stopped after the task was done; the state was not updated."
        : "Stopped before the task finished.",
    );
    return copy(a.run);
  }

  return {
    runs: (issue) => runs.filter((r) => !issue || r.issue === issue).map(copy),
    start,
    cancel,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    setPhaseMs(ms) {
      phaseMs = Math.max(0, ms);
    },
    failCustomStep(id, fail = true) {
      if (fail) failing.add(id);
      else failing.delete(id);
    },
    resetFailures() {
      failing.clear();
    },
    reset() {
      for (const a of [...active.values()]) stop(a);
      runs = [];
      failing.clear();
    },
    dispose() {
      for (const a of [...active.values()]) stop(a);
      listeners.clear();
    },
  };
}
