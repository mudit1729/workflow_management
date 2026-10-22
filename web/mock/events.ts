// The scripted live loop: eight events that other authors cause while you watch. Each one is
// a text edit of the workspace files through the store (an entry appended to changes.md, a
// line of goal.md flipped), so the board, the drawer and the inbox change for real.
// An event whose target no longer allows it (you already moved the issue, the request is
// answered) is skipped, and the player moves on to the next one that applies.
import type { Handle, IssueId } from "@/gen/types";
import {
  addRequest,
  answerRequest,
  appendChange,
  appendDecision,
  expireLease,
  markBlocked,
  overwriteState,
  setIssueStatus,
  toggleStep,
} from "./md/edit";
import type { ChangeSrc, DecisionSrc, IssueSrc, RequestSrc, TaskSrc } from "./source";
import type { ActivityDraft, Draft, Store, Touch } from "./store";
import { toTs, tsMs } from "./time";

export const EVENT_INTERVAL_MS = 20_000;

/**
 * Targets of the scripted live events. The IDs are fixed by UI_BUILD.md: the event loop and
 * the DevPanel depend on them, and the workspace files hold the matching issues.
 */
export const EVENT_TARGETS = {
  appendChange: { issue: "wf-3k9x2", task: "T-3" },
  rewriteState: "wf-3k9x2",
  newBlockingQuestion: "wf-x5hd3",
  leaseExpires: { issue: "wf-skf01", task: "T-2" },
  moveToReview: "wf-h2tb7",
  markBlocked: { issue: "wf-t3jp5", by: "wf-w8vz4" },
  appendDecision: "wf-skf01",
  answerFyi: { issue: "wf-y4bz7", request: "Q-5ys8j" },
} as const;

interface Ctx {
  store: Store;
  /** How many times this event has already applied (picks the wording). */
  n: number;
}

interface ScriptedEvent {
  name: string;
  /** Applies the event. Returns false when the target no longer allows it. */
  run(ctx: Ctx): boolean;
}

// ---------------------------------------------------------------- helpers

function tasksOf(src: IssueSrc): TaskSrc[] {
  return src.plan?.phases.flatMap((p) => p.tasks) ?? [];
}

const pick = <T>(xs: T[], n: number): T => xs[n % xs.length];

function sha(): string {
  return Math.floor(Math.random() * 0x10000000)
    .toString(16)
    .padStart(7, "0");
}

/** Read a file of the draft; the events only run where the files exist, so a miss is a bug. */
function textOf(w: Draft, path: string): string {
  const text = w.read(path);
  if (text === undefined) throw new Error(`${path} does not exist.`);
  return text;
}

function asked(store: Store, request: RequestSrc, issue: IssueId): ActivityDraft | undefined {
  if (request.to !== store.me || request.urgency !== "blocking") return undefined;
  return {
    issue_id: issue,
    kind: "request",
    author: request.from,
    title: request.question,
    notable: "needs_you",
  };
}

// ---------------------------------------------------------------- 1. codex appends a progress change

const PROGRESS = [
  {
    title: "Answered a lagged client with `resync`",
    files: ["crates/wf-server/src/sse.rs"],
    body: "Added the `resync` event. A client that falls more than 256 events behind gets one `resync` and refetches the snapshot. `cargo test -p wf-server sse` passes 6 of 6.",
  },
  {
    title: "Covered `Last-Event-ID` replay with a test",
    files: ["crates/wf-server/tests/sse_replay.rs"],
    body: "The test drops the stream after event 40, reconnects with `Last-Event-ID: 40` and expects events 41 to 52 in order.",
  },
  {
    title: "Sent a keepalive comment every 15 s",
    files: ["crates/wf-server/src/sse.rs"],
    body: "Proxies close idle streams after 30 s. The route now writes `: keepalive` every 15 s, and the test reads two of them.",
  },
];

const codexProgress: ScriptedEvent = {
  name: "codex appends a change to T-3",
  run({ store, n }) {
    const { issue, task } = EVENT_TARGETS.appendChange;
    const src = store.issueSrc(issue);
    const live = src && tasksOf(src).find((t) => t.id === task);
    if (live?.status !== "in_progress") return false;
    const tick = live.steps?.[1] && !live.steps[1].done;
    const v = pick(PROGRESS, n);
    const author: Handle = "codex";
    const id = store.newId("C-");
    const changesFile = store.filePath(issue, "changes.md");
    const planFile = store.filePath(issue, "plan.md");
    const touches: Touch[] = [{ file: changesFile, anchors: [id] }];
    if (tick) touches.push({ file: planFile, anchors: [`${task}.2`] });
    const entry: ChangeSrc = {
      id,
      ts: store.stamp(),
      author,
      title: v.title,
      kind: "progress",
      task,
      commit: sha(),
      files: v.files,
      model: "gpt-5-codex",
      body: v.body,
    };
    store.mutate(author, issue, (w) => {
      w.write(changesFile, appendChange(w.read(changesFile), entry));
      if (tick) w.write(planFile, toggleStep(textOf(w, planFile), task, 2, true));
      return {
        touches,
        activity: [{ issue_id: issue, kind: "change", author, title: v.title }],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- 2. claude-opus rewrites current_state

const STATES = [
  {
    summary: "The delta stream and resync work end to end; leader-tab election is next.",
    in_flight: [
      "[[#T-3]] SSE delta stream. @codex holds the lease. Both steps are ticked and the `sse` tests are running.",
    ],
    next: [
      "Run `cargo test -p wf-server sse` and move [[#T-3]] to review.",
      "Claim [[#T-4]] once [[#T-3]] lands.",
      "Run `wf verify wf-3k9x2 SC-3`.",
    ],
  },
  {
    summary: "Stream tests pass; the web lane can start the leader tab.",
    in_flight: ["[[#T-3]] SSE delta stream. @codex holds the lease. Tests pass; review is next."],
    next: [
      "Start [[#T-4]] against the mock server.",
      "Review [[#T-3]] when @codex moves it.",
      "Run `wf verify wf-3k9x2 SC-3`.",
    ],
  },
  {
    summary: "Stream work is in review; the board client is the only open lane.",
    in_flight: ["[[#T-4]] Leader tab election. The `wf-live` lock works in one tab."],
    next: [
      "Relay events over `BroadcastChannel` in [[#T-4]].",
      "Start [[#T-5]] when [[#T-4]] lands.",
      "Run `wf verify wf-3k9x2 SC-4`.",
    ],
  },
];

const opusState: ScriptedEvent = {
  name: "claude-opus rewrites current_state",
  run({ store, n }) {
    const issue = EVENT_TARGETS.rewriteState;
    const src = store.issueSrc(issue);
    if (!src?.state) return false;
    const v = pick(STATES, n);
    const author: Handle = "claude-opus";
    const file = store.filePath(issue, "current_state.md");
    store.mutate(author, issue, (w) => {
      w.write(
        file,
        overwriteState(textOf(w, file), {
          summary: v.summary,
          in_flight: v.in_flight,
          next_steps: v.next,
          updated_at: store.stamp(),
          updated_by: author,
        }),
      );
      return {
        touches: [{ file, anchors: "all" }],
        activity: [{ issue_id: issue, kind: "state", author, title: v.summary }],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- 3. claude-sonnet asks a blocking question

const QUESTIONS = [
  "Should a promoted draft keep the learning's author, or the person who promotes it?",
  "Do you want a review request for every promote, or only for gotchas?",
  "May agents read a draft while it waits for review, with a warning?",
];

const sonnetAsks: ScriptedEvent = {
  name: "claude-sonnet asks you a blocking question",
  run({ store, n }) {
    const issue = EVENT_TARGETS.newBlockingQuestion;
    const src = store.issueSrc(issue);
    if (!src) return false;
    const question = pick(QUESTIONS, n);
    if (src.state?.needs_you.some((r) => !r.answered && r.question === question)) return false;
    const author: Handle = "claude-sonnet";
    const id = store.newId("Q-");
    const request: RequestSrc = {
      id,
      question,
      from: author,
      to: store.me,
      kind: "question",
      urgency: "blocking",
      asked: store.stamp(),
    };
    const created = !src.state;
    const file = store.filePath(issue, "current_state.md");
    store.mutate(author, issue, (w) => {
      w.write(
        file,
        addRequest(w.read(file), request, {
          summary: "Waiting for an answer before the next step.",
          updated_at: store.stamp(),
          updated_by: author,
          next_steps: [`Continue once @${store.me} answers [[#${id}]].`],
        }),
      );
      const draft = asked(store, request, issue);
      return {
        touches: [{ file, anchors: created ? "all" : [id] }],
        activity: draft ? [draft] : [],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- 4. a lease expires

const leaseLapses: ScriptedEvent = {
  name: "a task lease expires",
  run({ store }) {
    const { issue, task } = EVENT_TARGETS.leaseExpires;
    const src = store.issueSrc(issue);
    const live = src && tasksOf(src).find((t) => t.id === task);
    if (!live?.claimed_by || !live.lease_until) return false;
    if (live.status === "done" || live.status === "cancelled") return false;
    if (tsMs(live.lease_until) <= store.now()) return false;
    const holder = live.claimed_by;
    const title = `The lease of @${holder} on ${task} expired`;
    const file = store.filePath(issue, "plan.md");
    store.mutate(holder, issue, (w) => {
      // The lease ran out three minutes ago: `lease_until` moves into the past.
      w.write(file, expireLease(textOf(w, file), task, toTs(store.now() - 3 * 60_000)));
      return {
        touches: [{ file, anchors: [task] }],
        activity: [
          { issue_id: issue, kind: "lease", author: holder, title, notable: "lease_expired" },
        ],
        log: [{ issue_id: issue, kind: "lease", author: holder, title }],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- 5. claude-sonnet moves an issue to review

const toReview: ScriptedEvent = {
  name: "claude-sonnet moves an issue to review",
  run({ store }) {
    const issue = EVENT_TARGETS.moveToReview;
    const src = store.issueSrc(issue);
    if (src?.goal.status !== "in_progress") return false;
    const author: Handle = "claude-sonnet";
    const file = store.filePath(issue, "goal.md");
    store.mutate(author, issue, (w) => {
      w.write(file, setIssueStatus(textOf(w, file), "review"));
      return {
        touches: [{ file, anchors: ["status"] }],
        activity: [{ issue_id: issue, kind: "status", author, title: "Moved to Review" }],
        log: [{ issue_id: issue, kind: "status", author, title: "In progress → Review" }],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- 6. codex blocks an issue

const blocksIssue: ScriptedEvent = {
  name: "codex marks an issue blocked",
  run({ store }) {
    const { issue, by } = EVENT_TARGETS.markBlocked;
    const src = store.issueSrc(issue);
    if (src?.goal.status !== "in_progress" || src.goal.blocked_by.includes(by)) return false;
    const blocker = store.issueSrc(by)?.goal.title ?? by;
    const author: Handle = "codex";
    const id = store.newId("C-");
    const title = `Paused: waiting for "${blocker}"`;
    const goalFile = store.filePath(issue, "goal.md");
    const changesFile = store.filePath(issue, "changes.md");
    const entry: ChangeSrc = {
      id,
      ts: store.stamp(),
      author,
      title,
      kind: "progress",
      model: "gpt-5-codex",
      body: `Marked the issue blocked by [[${by}]]. Resume when it moves to review.`,
    };
    store.mutate(author, issue, (w) => {
      w.write(goalFile, markBlocked(textOf(w, goalFile), by));
      w.write(changesFile, appendChange(w.read(changesFile), entry));
      return {
        touches: [
          { file: goalFile, anchors: ["status"] },
          { file: changesFile, anchors: [id] },
        ],
        log: [{ issue_id: issue, kind: "status", author, title: "In progress → Blocked" }],
        activity: [
          {
            issue_id: issue,
            kind: "status",
            author,
            title: `Blocked by ${by}: ${blocker}`,
            notable: "blocked",
          },
        ],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- 7. claude-opus records a decision

const DECISIONS = [
  {
    title: "Lay the flowchart out by plugin, left to right",
    topic: "diagram-layout",
    decision: "Put the skills of each plugin in one column and draw the hand-offs between columns.",
    because:
      "A reader first asks which plugin owns a skill. The edges already show the order, so a time axis adds nothing.",
    rejected: "One row in time order (14 nodes overflow the page); a grid by issue phase.",
    revisit: "A skill belongs to two plugins.",
  },
  {
    title: "Mark the human gates with a dashed outline",
    topic: "diagram-style",
    decision: "Draw each step that waits for a person with a dashed outline.",
    because:
      "Agents stop at those steps. A reader should see where the flow pauses without a legend.",
    rejected: "A second color (color already means the plugin).",
    revisit: "Archify drops support for dashed node outlines.",
  },
  {
    title: "Keep node labels under 24 characters",
    topic: "diagram-style",
    decision: "Name each node after its skill and put the trigger in the edge label.",
    because: "Long labels wrap into three lines at the page width and push the nodes apart.",
    rejected: "Full sentences in nodes.",
    revisit: "The page width grows beyond 1200 px.",
  },
];

const opusDecides: ScriptedEvent = {
  name: "claude-opus records a decision",
  run({ store, n }) {
    const issue = EVENT_TARGETS.appendDecision;
    if (!store.issueSrc(issue) || n >= DECISIONS.length) return false;
    const v = DECISIONS[n];
    const author: Handle = "claude-opus";
    const id = store.newId("D-");
    const file = store.filePath(issue, "decisions.md");
    const entry: DecisionSrc = {
      id,
      ts: store.stamp(),
      author,
      title: v.title,
      status: "accepted",
      topic: v.topic,
      decided_by: [author],
      decision: v.decision,
      because: v.because,
      rejected: v.rejected,
      revisit: v.revisit,
    };
    store.mutate(author, issue, (w) => {
      w.write(file, appendDecision(w.read(file), entry));
      return {
        touches: [{ file, anchors: [id] }],
        activity: [{ issue_id: issue, kind: "decision", author, title: v.title }],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- 8. mudit answers a fyi request

const muditAnswers: ScriptedEvent = {
  name: "mudit answers a fyi request",
  run({ store }) {
    const { issue, request } = EVENT_TARGETS.answerFyi;
    const live = store.issueSrc(issue)?.state?.needs_you.find((r) => r.id === request);
    if (!live || live.answered) return false;
    const author = live.to;
    const answer = live.options?.[0] ?? "Noted. No change needed from me.";
    const file = store.filePath(issue, "current_state.md");
    store.mutate(author, issue, (w) => {
      w.write(
        file,
        answerRequest(textOf(w, file), request, { answer, by: author, at: store.stamp() }),
      );
      return {
        touches: [{ file, anchors: [request] }],
        activity: [{ issue_id: issue, kind: "request", author, title: `Answered ${request}` }],
      };
    });
    return true;
  },
};

// ---------------------------------------------------------------- the player

export const SCRIPT: ScriptedEvent[] = [
  codexProgress,
  opusState,
  sonnetAsks,
  leaseLapses,
  toReview,
  blocksIssue,
  opusDecides,
  muditAnswers,
];

export interface EventPlayer {
  /** Apply the next event that still applies. Returns its name, or undefined when none does. */
  playNext(): string | undefined;
  /** Start again from the first event with fresh wording. */
  reset(): void;
  dispose(): void;
}

export function createEventPlayer(
  store: Store,
  options: { autoplay?: boolean; intervalMs?: number } = {},
): EventPlayer {
  let cursor = 0;
  let counts = SCRIPT.map(() => 0);

  const player: EventPlayer = {
    playNext() {
      for (let step = 0; step < SCRIPT.length; step++) {
        const i = (cursor + step) % SCRIPT.length;
        if (!SCRIPT[i].run({ store, n: counts[i] })) continue;
        counts[i] += 1;
        cursor = (i + 1) % SCRIPT.length;
        return SCRIPT[i].name;
      }
      return undefined;
    },
    reset() {
      cursor = 0;
      counts = SCRIPT.map(() => 0);
    },
    dispose() {
      if (timer) clearInterval(timer);
    },
  };

  const timer = options.autoplay
    ? setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        player.playNext();
      }, options.intervalMs ?? EVENT_INTERVAL_MS)
    : undefined;
  return player;
}
