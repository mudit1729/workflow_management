// The "Do next step" run (plan D4). Real: the daemon runs `codex exec` with the `doing-next-step`
// skill on the next ready task. Prototype: a simulated background run whose phases are real
// markdown edits through the store, about two seconds apart, so the board, the Files view and
// the file watcher see each one:
//
//   claim   plan.md       the task is `in_progress`, `claimed_by: @codex`, with a lease
//   log     changes.md    a change entry by @codex, in the past tense
//   verify  plan.md       the task goes to `review`; a CI run starts, then passes
//   done    plan.md       the steps are ticked and the task is `done` (its lease ends);
//                         current_state.md moves on;
//                         a commit with the trailer `Issue: <id>` joins the delivery data
//
// Git, PR and CI data are not files (plan D2): the commit and the CI run go to `store.delivery`.
// One run is active per issue. `cancel` stops it and puts the task back in the queue.
import type { Handle, IssueId, TaskId } from "@/gen/types";
import { ApiError, NotFoundError } from "@/lib/api/error";
import type {
  CodexPhase,
  CodexPhaseId,
  CodexRun,
  CodexRunKind,
  PipelineRun,
} from "@/lib/api/types";
import { commitSha, toTsSec } from "./delivery";
import {
  appendChange,
  claimTask,
  createState,
  moveTask,
  overwriteState,
  setTaskStatus,
  toggleStep,
} from "./md/edit";
import type { ChangeSrc, IssueSrc, TaskSrc } from "./source";
import type { Draft, Store, Touch } from "./store";
import { toTs } from "./time";
import { randomId, slugify } from "./util";

export const CODEX_HANDLE: Handle = "codex";

/** Time between two phases. */
export const PHASE_MS = 2000;

/** Runs the list keeps, newest first; older ones drop off. */
const KEEP_RUNS = 30;

const MIN = 60_000;

export const NOTHING_READY = {
  unplanned: "No ready task. Plan the issue first.",
  finished: "Every task is done.",
  waiting: "No ready task. Wait for the tasks in flight.",
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
  /** Stop every run and forget them: the workspace under them was replaced. */
  reset(): void;
  dispose(): void;
}

// ---------------------------------------------------------------- the task a run picks

const tasksOf = (src: IssueSrc): TaskSrc[] => src.plan?.phases.flatMap((p) => p.tasks) ?? [];

type Pick = { task: TaskId } | { reason: string };

/** The first ready task in plan order: the rule of the plan view (`Task.ready`). */
function pickTask(store: Store, issue: IssueId): Pick {
  const tasks = store.derived.details.get(issue)?.plan?.phases.flatMap((p) => p.tasks) ?? [];
  if (tasks.length === 0) return { reason: NOTHING_READY.unplanned };
  const ready = tasks.find((t) => t.ready);
  if (ready) return { task: ready.id };
  if (tasks.every((t) => t.status === "done" || t.status === "cancelled"))
    return { reason: NOTHING_READY.finished };
  return { reason: NOTHING_READY.waiting };
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
  /** The change entry the log phase wrote. */
  entry?: string;
  /** The CI run the verify phase started. */
  pipeline?: { id: string; startedMs: number; jobs: string[] };
  timers: ReturnType<typeof setTimeout>[];
}

const PHASES: CodexPhaseId[] = ["claim", "log", "verify", "done"];

const copy = (r: CodexRun): CodexRun => ({ ...r, phases: r.phases.map((p) => ({ ...p })) });

const reject = (...gaps: string[]): never => {
  throw new ApiError(422, { diagnostics: [], gaps });
};

export function createCodex(store: Store, options: CodexOptions = {}): Codex {
  let phaseMs = options.phaseMs ?? PHASE_MS;
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

  // ---- the phases

  /** claim: the task is `in_progress`, held by @codex, with a lease. */
  function claim(a: Active) {
    const { issue, task = "" } = a.run;
    const file = store.filePath(issue, "plan.md");
    const leaseUntil = toTs(store.now() + store.world.config.leases_minutes * MIN);
    store.mutate(CODEX_HANDLE, issue, (w) => {
      const planned = setTaskStatus(text(w, file), task, "in_progress");
      w.write(file, claimTask(planned, task, CODEX_HANDLE, leaseUntil));
      const title = `Claimed ${task}`;
      return {
        touches: [{ file, anchors: [task] }],
        activity: [{ issue_id: issue, kind: "lease", author: CODEX_HANDLE, title }],
        log: [{ issue_id: issue, kind: "lease", author: CODEX_HANDLE, title }],
      };
    });
  }

  /** log: a change entry in the past tense, with the files the task owns. */
  function log(a: Active) {
    const { issue, task = "" } = a.run;
    const live = taskOf(a);
    if (!live) throw new Error(`${task} is gone.`);
    const file = store.filePath(issue, "changes.md");
    const steps = live.steps?.length ?? 0;
    const files = live.owns ?? [];
    const where = files.length > 0 ? ` in ${files.map((f) => `\`${f}\``).join(", ")}` : "";
    const entry: ChangeSrc = {
      id: store.newId("C-"),
      ts: store.stamp(),
      author: CODEX_HANDLE,
      title: pastTense(live.title),
      kind: "progress",
      task,
      files: files.length > 0 ? files : undefined,
      model: store.world.authors.find((x) => x.handle === CODEX_HANDLE)?.model,
      body:
        steps > 0
          ? `Worked through ${steps} step${steps === 1 ? "" : "s"} of ${task}${where}.`
          : `Worked on ${task}${where}.`,
    };
    store.mutate(CODEX_HANDLE, issue, (w) => {
      w.write(file, appendChange(w.read(file), entry));
      return {
        touches: [{ file, anchors: [entry.id] }],
        activity: [{ issue_id: issue, kind: "change", author: CODEX_HANDLE, title: entry.title }],
      };
    });
    a.entry = entry.id;
  }

  /** verify: the task goes to `review` and a CI run starts. */
  function verify(a: Active) {
    const { issue, task = "" } = a.run;
    const live = taskOf(a);
    if (!live) throw new Error(`${task} is gone.`);
    const file = store.filePath(issue, "plan.md");
    store.mutate(CODEX_HANDLE, issue, (w) => {
      w.write(file, setTaskStatus(text(w, file), task, "review"));
      const title = `Moved ${task} to review`;
      return {
        touches: [{ file, anchors: [task] }],
        activity: [{ issue_id: issue, kind: "state", author: CODEX_HANDLE, title }],
        log: [{ issue_id: issue, kind: "state", author: CODEX_HANDLE, title }],
      };
    });
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

  /** The `current_state.md` after the task is done: what moved, and what comes next. */
  function stateAfter(a: Active, src: IssueSrc, finished: TaskSrc, w: Draft): string | undefined {
    const file = store.filePath(a.run.issue, "current_state.md");
    const current = src.state;
    const exists = w.read(file) !== undefined;
    // A file that does not read (broken frontmatter) is the person's to fix, not ours to replace.
    if (exists && !current) return undefined;

    const next = nextAfter(src, finished);
    const others = tasksOf(src).filter(
      (t) => t.id !== finished.id && t.status !== "done" && t.status !== "cancelled",
    );
    const summary = next
      ? `${finished.id} is done; ${next.id} is next.`
      : others.length === 0
        ? "Every task is done; the criteria wait for checks."
        : `${finished.id} is done; no task is ready yet.`;
    const first = next
      ? `Start [[#${next.id}]] ${next.title}.`
      : others.length === 0
        ? "Check the criteria and close the issue."
        : "Wait for the tasks in flight.";
    const mentions = (line: string) => line.includes(`[[#${finished.id}]]`);
    const done = `[[#${finished.id}]] ${finished.title}.${a.entry ? ` See [[#${a.entry}]].` : ""}`;
    const nextSteps = [
      first,
      ...(current?.next_steps ?? []).filter((l) => !mentions(l) && l !== first),
    ];

    if (!current || !exists)
      return createState({
        summary,
        updated_at: store.stamp(),
        updated_by: CODEX_HANDLE,
        needs_you: [],
        done: [done],
        next_steps: nextSteps.slice(0, 4),
      });
    return overwriteState(text(w, file), {
      summary,
      updated_at: store.stamp(),
      updated_by: CODEX_HANDLE,
      done: [...(current.done ?? []), done],
      in_flight: (current.in_flight ?? []).filter((l) => !mentions(l)),
      next_steps: nextSteps.slice(0, 4),
    });
  }

  /** done: the steps are ticked, the task is `done`, the state moves on, a commit lands. */
  function finish(a: Active) {
    const { issue, task = "" } = a.run;
    const src = store.issueSrc(issue);
    const live = taskOf(a);
    if (!src || !live) throw new Error(`${task} is gone.`);
    const planFile = store.filePath(issue, "plan.md");
    const stateFile = store.filePath(issue, "current_state.md");
    store.mutate(CODEX_HANDLE, issue, (w) => {
      let plan = text(w, planFile);
      const touched: string[] = [task];
      (live.steps ?? []).forEach((step, i) => {
        if (step.done) return;
        plan = toggleStep(plan, task, i + 1, true);
        touched.push(`${task}.${i + 1}`);
      });
      w.write(planFile, dropLease(setTaskStatus(plan, task, "done"), task));
      const touches: Touch[] = [{ file: planFile, anchors: touched }];
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

  const STEPS: Record<CodexPhaseId, (a: Active) => void> = {
    claim,
    log,
    verify,
    done: finish,
  };

  // ---- running

  const stop = (a: Active) => {
    for (const t of a.timers) clearTimeout(t);
    a.timers = [];
    active.delete(a.run.id);
  };

  /** Put the task back in the queue when this run still holds it. */
  function release(a: Active) {
    const { issue, task = "" } = a.run;
    const live = taskOf(a);
    if (!live || live.claimed_by !== CODEX_HANDLE) return;
    if (live.status !== "in_progress" && live.status !== "review") return;
    const file = store.filePath(issue, "plan.md");
    store.mutate(CODEX_HANDLE, issue, (w) => {
      w.write(file, moveTask(text(w, file), task, "todo"));
      const title = `Released ${task}`;
      return {
        touches: [{ file, anchors: [task] }],
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
    const open = live.status === "in_progress" || live.status === "review";
    return mine && open ? undefined : `${task} changed while Codex worked on it.`;
  }

  function step(a: Active, id: CodexPhaseId) {
    if (a.run.status !== "running") return;
    if (id !== "claim") {
      const why = drifted(a);
      if (why) return fail(a, why);
    }
    const at = PHASES.indexOf(id);
    a.run.phase = id;
    a.run.phases = a.run.phases.map((p, i) => ({
      ...p,
      state: i < at ? "done" : i === at ? "running" : "pending",
    }));
    try {
      STEPS[id](a);
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

  const labels = (task: TaskId): Record<CodexPhaseId, string> => ({
    claim: `Claim ${task}`,
    log: "Log the change",
    verify: "Run CI",
    done: `Finish ${task}`,
  });

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
    const task = src && tasksOf(src).find((t) => t.id === picked.task);
    if (!task) reject(`Task ${picked.task} does not exist.`);
    const names = labels(picked.task);
    const run: CodexRun = {
      ...base,
      task: picked.task,
      task_title: task?.title,
      phase: "claim",
      phases: PHASES.map<CodexPhase>((p) => ({ id: p, label: names[p], state: "pending" })),
    };
    const a: Active = {
      run,
      sha: commitSha(`${issue}:${picked.task}:${id}`),
      branch: `${issue}/${slugify(task?.title ?? picked.task)}`,
      timers: [],
    };
    runs = [run, ...runs].slice(0, KEEP_RUNS);
    active.set(id, a);

    // The claim lands now, so the click is answered; the other phases follow.
    step(a, "claim");
    if (a.run.status === "running") {
      const later = (ms: number, fn: () => void) => a.timers.push(setTimeout(fn, ms));
      later(phaseMs, () => step(a, "log"));
      later(2 * phaseMs, () => step(a, "verify"));
      later(2.5 * phaseMs, () => ciPasses(a));
      later(3 * phaseMs, () => step(a, "done"));
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
    finishRun(a, "cancelled", "Stopped before the task finished.");
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
    reset() {
      for (const a of [...active.values()]) stop(a);
      runs = [];
    },
    dispose() {
      for (const a of [...active.values()]) stop(a);
      listeners.clear();
    },
  };
}
