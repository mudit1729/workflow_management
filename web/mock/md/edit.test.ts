// (e) Text edits: each Op and each scripted live event is a minimal change to the markdown.
// Every test asserts the line diff, then checks that the edited file is still in canonical
// form (parse and render give the same text). `mock/ops.test.ts` runs the same edits through
// the store and checks the API results.
import { describe, expect, test } from "vitest";
import format from "../../../plugins/workflow/skills/using-wf/references/format.md?raw";
import type { LibrarySrc } from "../source";
import { toTs } from "../time";
import {
  addRequest,
  answerRequest,
  answerRequestsReferring,
  appendChange,
  appendDecision,
  appendLearning,
  approveLibraryItem,
  claimIssue,
  claimTask,
  createState,
  EditError,
  expireLease,
  markBlocked,
  moveTask,
  newGroupFile,
  newIssueGoal,
  newLibraryItem,
  overwriteState,
  promote,
  releaseIssue,
  releaseTask,
  renewLease,
  setDecisionStatus,
  setIssueLease,
  setIssueStatus,
  setTaskLease,
  setTaskStatus,
  toggleCriterion,
  toggleStep,
  verifyCriterion,
} from "./edit";
import { loadWorkspace } from "./index";
import { rebaseWorkspace } from "./rebase";
import { RECORDED_AT } from "./recorded-at";
import { libraryPath } from "./render";
import { diskFiles, lineDiff, rerender } from "./test-support";

const DAY = 86_400_000;
const MIN = 60_000;
const RECORDED = Date.parse(RECORDED_AT);
const NOW = RECORDED + 3 * DAY;
const STAMP = toTs(NOW);

// The workspace as it reads three days after the recording, and as text.
const files = rebaseWorkspace(diskFiles(), NOW - RECORDED);
const SC2 = "issues/wf/web/live-board-updates/evidence/sc2.png";
const BINARY = { [SC2]: { url: `/files/${SC2}`, bytes: 95362 } };
const loaded0 = loadWorkspace(files, { now: NOW, binary: BINARY });

const path = (issue: string, name: string) => `${loaded0.issueDirs[issue]}/${name}`;
const text = (issue: string, name: string): string => {
  const t = files[path(issue, name)];
  if (t === undefined) throw new Error(`${issue} has no ${name}`);
  return t;
};

function canonical(p: string, next: string): void {
  const loaded = loadWorkspace({ ...files, [p]: next }, { now: NOW });
  expect(rerender(loaded, p), `${p} is in canonical form`).toBe(next);
}

const diff = (a: string, b: string) => lineDiff(a, b);

// ---------------------------------------------------------------- goal.md

describe("goal.md", () => {
  const goal = text("wf-3k9x2", "goal.md");

  test("set status changes one line of the frontmatter", () => {
    const next = setIssueStatus(goal, "review");
    expect(diff(goal, next)).toEqual({
      removed: ["status: in_progress"],
      added: ["status: review"],
    });
    canonical(path("wf-3k9x2", "goal.md"), next);
  });

  test("set status adds the key when the file has none", () => {
    const bare = "---\nid: wf-aaaaa\ntitle: A\npriority: low\n---\n\n## Context\n\nx\n";
    expect(setIssueStatus(bare, "done")).toBe(
      "---\nid: wf-aaaaa\ntitle: A\nstatus: done\npriority: low\n---\n\n## Context\n\nx\n",
    );
  });

  test("setting the same status again changes nothing", () => {
    expect(setIssueStatus(goal, "in_progress")).toBe(goal);
  });

  test("ticking SC-4 flips the checkbox of that line and nothing else", () => {
    const next = toggleCriterion(goal, "SC-4", true);
    const [removed] = diff(goal, next).removed;
    expect(diff(goal, next)).toEqual({
      removed: [removed],
      added: [removed.replace("- [ ]", "- [x]")],
    });
    expect(removed).toMatch(/^- \[ \] SC-4: /);
    canonical(path("wf-3k9x2", "goal.md"), next);
    expect(toggleCriterion(next, "SC-4", true)).toBe(next);
  });

  test("verifying SC-5 ticks it and writes evidence and verified_by under its verify line", () => {
    const next = verifyCriterion(goal, "SC-5", {
      evidence: "`cargo test -p wf-index echo_suppression` passed at `4e7a1c2`, see [[#C-6b3nx]]",
      by: "codex",
    });
    const d = diff(goal, next);
    expect(d.removed).toEqual([
      "- [ ] SC-5: The daemon shall ignore the watcher echo of its own writes.",
    ]);
    expect(d.added).toEqual([
      "- [x] SC-5: The daemon shall ignore the watcher echo of its own writes.",
      "  - evidence: `cargo test -p wf-index echo_suppression` passed at `4e7a1c2`, see [[#C-6b3nx]]",
      "  - verified_by: @codex",
    ]);
    // The keys sit after `verify:` (format.md section 4), and the file is still canonical.
    const lines = next.split("\n");
    const at = lines.findIndex((l) => l.startsWith("- [x] SC-5:"));
    expect(lines.slice(at + 1, at + 4).map((l) => l.trim().split(":")[0])).toEqual([
      "- verify",
      "- evidence",
      "- verified_by",
    ]);
    canonical(path("wf-3k9x2", "goal.md"), next);
    // Unticking takes the proof away again.
    expect(toggleCriterion(next, "SC-5", false)).toBe(goal);
    expect(() => verifyCriterion(goal, "SC-9", { evidence: "x", by: "codex" })).toThrow(EditError);
  });

  test("unticking a verified criterion also removes its evidence and verified_by", () => {
    const next = toggleCriterion(goal, "SC-1", false);
    const d = diff(goal, next);
    expect(d.added).toHaveLength(1);
    expect(d.added[0]).toMatch(/^- \[ \] SC-1: /);
    expect(d.removed).toHaveLength(3);
    expect(d.removed.some((l) => l.startsWith("  - evidence:"))).toBe(true);
    expect(d.removed.some((l) => l.startsWith("  - verified_by:"))).toBe(true);
    canonical(path("wf-3k9x2", "goal.md"), next);
  });

  test("a criterion that does not exist is an error", () => {
    expect(() => toggleCriterion(goal, "SC-9", true)).toThrow(EditError);
  });

  test("mark blocked sets status and blocked_by", () => {
    const g = text("wf-t3jp5", "goal.md");
    const next = markBlocked(g, "wf-w8vz4");
    expect(diff(g, next)).toEqual({
      removed: ["status: in_progress", "blocked_by: []"],
      added: ["status: blocked", "blocked_by: [wf-w8vz4]"],
    });
    canonical(path("wf-t3jp5", "goal.md"), next);
    expect(markBlocked(next, "wf-w8vz4")).toBe(next);
    expect(markBlocked(next, "wf-aaaaa")).toContain("blocked_by: [wf-w8vz4, wf-aaaaa]");
  });

  test("renew and expire the coordinator lease change one line", () => {
    const until = toTs(NOW + 55 * MIN);
    const next = setIssueLease(goal, until);
    const d = diff(goal, next);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0]).toMatch(/^lease_until: /);
    expect(d.added).toEqual([`lease_until: ${until}`]);
    canonical(path("wf-3k9x2", "goal.md"), next);
  });

  test("claim and release the issue", () => {
    const g = text("wf-k8dv6", "goal.md");
    const claimed = claimIssue(g, "codex", toTs(NOW + 60 * MIN));
    expect(diff(g, claimed).removed).toEqual([]);
    expect(diff(g, claimed).added).toEqual([
      'claimed_by: "@codex"',
      `lease_until: ${toTs(NOW + 60 * MIN)}`,
    ]);
    canonical(path("wf-k8dv6", "goal.md"), claimed);
    expect(releaseIssue(claimed)).toBe(g);
  });

  test("Windows line endings survive an edit", () => {
    const crlf = goal.replace(/\n/g, "\r\n");
    const next = setIssueStatus(crlf, "review");
    expect(next.split("\r\n").length).toBe(crlf.split("\r\n").length);
    expect(next).toContain("status: review\r\n");
    expect(next.replace(/\r\n/g, "\n")).toBe(setIssueStatus(goal, "review"));
  });
});

// ---------------------------------------------------------------- plan.md

describe("plan.md", () => {
  const plan = text("wf-3k9x2", "plan.md");
  const p = path("wf-3k9x2", "plan.md");

  test("set task status changes the status line of that task", () => {
    const next = setTaskStatus(plan, "T-4", "in_progress");
    expect(diff(plan, next)).toEqual({
      removed: ["- status: todo"],
      added: ["- status: in_progress"],
    });
    canonical(p, next);
  });

  test("claim adds claimed_by and lease_until in their place, release removes them", () => {
    const claimed = claimTask(plan, "T-4", "shruti", toTs(NOW + 60 * MIN));
    expect(diff(plan, claimed)).toEqual({
      removed: [],
      added: ["- claimed_by: @shruti", `- lease_until: ${toTs(NOW + 60 * MIN)}`],
    });
    canonical(p, claimed);
    expect(releaseTask(claimed, "T-4")).toBe(plan);
  });

  test("move task: in_progress claims once, todo releases, other moves keep the claim", () => {
    const claim = { by: "shruti", leaseUntil: toTs(NOW + 60 * MIN) };
    const started = moveTask(plan, "T-4", "in_progress", claim);
    expect(diff(plan, started).added).toEqual([
      "- status: in_progress",
      "- claimed_by: @shruti",
      `- lease_until: ${claim.leaseUntil}`,
    ]);
    // T-3 is held by @codex already: the claim stays with @codex
    const held = moveTask(plan, "T-3", "review", claim);
    expect(diff(plan, held)).toEqual({
      removed: ["- status: in_progress"],
      added: ["- status: review"],
    });
    expect(moveTask(plan, "T-3", "in_progress", claim)).toBe(plan);
    expect(diff(plan, moveTask(plan, "T-3", "todo")).removed).toHaveLength(3);
    expect(moveTask(started, "T-4", "todo")).toBe(plan);
  });

  test("toggle step flips one checkbox", () => {
    const next = toggleStep(plan, "T-3", 2, true);
    expect(diff(plan, next)).toEqual({
      removed: ["- [ ] Answer a lagged client with `resync`."],
      added: ["- [x] Answer a lagged client with `resync`."],
    });
    canonical(p, next);
    expect(() => toggleStep(plan, "T-3", 3, true)).toThrow(EditError);
    expect(() => toggleStep(plan, "T-9", 1, true)).toThrow(EditError);
  });

  test("renew and expire a lease change one line", () => {
    const g = text("wf-skf01", "plan.md");
    const expired = toTs(NOW - 3 * MIN);
    const next = expireLease(g, "T-2", expired);
    const d = diff(g, next);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0]).toMatch(/^- lease_until: /);
    expect(d.added).toEqual([`- lease_until: ${expired}`]);
    canonical(path("wf-skf01", "plan.md"), next);
    const later = toTs(NOW + 30 * MIN);
    expect(renewLease(next, "T-2", later)).toContain(`- lease_until: ${later}`);
    expect(setTaskLease(g, "T-2", later)).toBe(renewLease(g, "T-2", later));
  });
});

// ---------------------------------------------------------------- current_state.md

describe("current_state.md", () => {
  const state = text("wf-3k9x2", "current_state.md");
  const p = path("wf-3k9x2", "current_state.md");

  test("answer a request: tick, answer, answered_by, answered_at", () => {
    const next = answerRequest(state, "Q-4m2pz", { answer: "approve", by: "shruti", at: STAMP });
    expect(diff(state, next)).toEqual({
      removed: [
        "- [ ] Q-4m2pz: Approve keeping SSE instead of WebSocket for the board?",
        "  - answer:",
      ],
      added: [
        "- [x] Q-4m2pz: Approve keeping SSE instead of WebSocket for the board?",
        "  - answer: approve",
        "  - answered_by: @shruti",
        `  - answered_at: ${STAMP}`,
      ],
    });
    canonical(p, next);
    expect(() => answerRequest(state, "Q-zzzzz", { answer: "x", by: "a", at: STAMP })).toThrow(
      EditError,
    );
  });

  test("the keys of an answer are the ones format.md section 7 documents", () => {
    // The dashboard and the skills write one shape: `answer`, `answered_by`, `answered_at`.
    const section = /## 7\. current_state\.md[\s\S]*?## 8\./.exec(format)?.[0] ?? "";
    expect(section).toContain("`answered_by: @person`");
    expect(section).toContain("`answered_at: <time>`");
    expect(section).toContain("`answer`, `answered_by`, `answered_at`");
    const next = answerRequest(state, "Q-4m2pz", { answer: "approve", by: "shruti", at: STAMP });
    const keys = diff(state, next)
      .added.filter((l) => l.startsWith("  - "))
      .map((l) => l.split(":")[0].replace("  - ", ""));
    expect(keys).toEqual(["answer", "answered_by", "answered_at"]);
  });

  test("answer every open request that refers to a library item", () => {
    const req = (id: string, ref: string) => ({
      id,
      question: "Review it?",
      from: "shruti",
      to: "mudit",
      kind: "approval" as const,
      urgency: "fyi" as const,
      asked: STAMP,
      ref,
    });
    let t = addRequest(state, req("Q-9eee1", "[[lib-9aaaa]]"));
    t = addRequest(t, req("Q-9eee2", "[[lib-9bbbb]]"));
    const done = answerRequestsReferring(t, "[[lib-9aaaa]]", {
      answer: "approve",
      by: "mudit",
      at: STAMP,
    });
    expect(done.closed).toEqual(["Q-9eee1"]);
    expect(done.text).toContain("- [x] Q-9eee1: Review it?");
    expect(done.text).toContain("- [ ] Q-9eee2: Review it?");
    expect(
      answerRequestsReferring(state, "[[lib-9aaaa]]", { answer: "a", by: "b", at: STAMP }).text,
    ).toBe(state);
  });

  test("an answer with line breaks is one line", () => {
    const next = answerRequest(state, "Q-4m2pz", {
      answer: "yes\n\nship it",
      by: "shruti",
      at: STAMP,
    });
    expect(next).toContain("  - answer: yes ship it\n");
  });

  test("add a request to the existing Needs you section", () => {
    const req = {
      id: "Q-9aaaa",
      question: "May I rename the lock file?",
      from: "codex",
      to: "shruti",
      kind: "question" as const,
      urgency: "blocking" as const,
      asked: STAMP,
    };
    const next = addRequest(state, req);
    const d = diff(state, next);
    expect(d.removed).toEqual([]);
    expect(d.added).toEqual([
      "- [ ] Q-9aaaa: May I rename the lock file?",
      "  - from: @codex",
      "  - to: @shruti",
      "  - kind: question",
      "  - urgency: blocking",
      `  - asked: ${STAMP}`,
      "  - answer:",
    ]);
    canonical(p, next);
    // The new request comes after the old one, inside the same section.
    expect(next.indexOf("Q-4m2pz")).toBeLessThan(next.indexOf("Q-9aaaa"));
    expect(next.indexOf("Q-9aaaa")).toBeLessThan(next.indexOf("## Failed attempts"));
  });

  test("add a request when the file has no Needs you section: the section is created in order", () => {
    const x = text("wf-x5hd3", "current_state.md");
    expect(x).not.toContain("## Needs you");
    const req = {
      id: "Q-9bbbb",
      question: "Keep the layout?",
      from: "claude-sonnet",
      to: "shruti",
      kind: "question" as const,
      urgency: "blocking" as const,
      asked: STAMP,
    };
    const next = addRequest(x, req);
    expect(diff(x, next).removed).toEqual([]);
    expect(diff(x, next).added[0]).toBe("## Needs you");
    canonical(path("wf-x5hd3", "current_state.md"), next);
    const headings = next.split("\n").filter((l) => l.startsWith("## "));
    expect(headings.indexOf("## Needs you")).toBeGreaterThan(headings.indexOf("## In flight"));
    expect(headings.indexOf("## Needs you")).toBeLessThan(headings.indexOf("## Next steps"));
  });

  test("add a request when current_state.md does not exist writes a new file", () => {
    const req = {
      id: "Q-9cccc",
      question: "Waiting for an answer.",
      from: "claude-sonnet",
      to: "shruti",
      kind: "question" as const,
      urgency: "fyi" as const,
      asked: STAMP,
    };
    const scaffold = {
      summary: "Waiting for an answer before the next step.",
      updated_at: STAMP,
      updated_by: "claude-sonnet",
      next_steps: ["Continue once @shruti answers [[#Q-9cccc]]."],
    };
    const next = addRequest(undefined, req, scaffold);
    expect(next).toContain("## Needs you\n- [ ] Q-9cccc: Waiting for an answer.");
    expect(() => addRequest(undefined, req)).toThrow(EditError);
    expect(next).toBe(createState({ ...scaffold, needs_you: [req] }));
  });

  test("overwrite replaces the changed fields and keeps the other sections", () => {
    const next = overwriteState(state, {
      summary: "The stream and resync work end to end.",
      updated_at: STAMP,
      updated_by: "claude-opus",
      in_flight: ["[[#T-3]] SSE delta stream. Tests pass; review is next."],
      next_steps: ["Start [[#T-4]] against the mock server.", "Run `wf verify wf-3k9x2 SC-3`."],
    });
    const d = diff(state, next);
    // Only the lines of the summary, the time, In flight and Next steps move.
    expect(d.removed.length).toBeLessThanOrEqual(8);
    expect(d.removed.some((l) => l.startsWith("summary:"))).toBe(true);
    expect(d.removed.some((l) => l.startsWith("updated_at:"))).toBe(true);
    expect(next).toContain("## Done\n");
    expect(next).toContain("## Failed attempts\n");
    expect(next).toContain("  - answer:\n");
    canonical(p, next);
    // A file written by `wf state` twice with the same fields does not change.
    expect(overwriteState(next, {})).toBe(next);
  });
});

// ---------------------------------------------------------------- logs

describe("changes.md, decisions.md, learnings.md", () => {
  const changes = text("wf-3k9x2", "changes.md");
  const entry = {
    id: "C-9zzzz",
    ts: STAMP,
    author: "codex",
    title: "Covered `Last-Event-ID` replay with a test",
    kind: "progress" as const,
    task: "T-3",
    commit: "abc1234",
    files: ["crates/wf-server/tests/sse_replay.rs"],
    model: "gpt-5-codex",
    body: "The test drops the stream after event 40.",
  };

  test("append a change adds the entry at the bottom and removes nothing", () => {
    const next = appendChange(changes, entry);
    const d = diff(changes, next);
    expect(d.removed).toEqual([]);
    expect(d.added.join("\n").trim().split("\n")).toEqual([
      `## ${STAMP} @codex — Covered \`Last-Event-ID\` replay with a test {#C-9zzzz}`,
      "- kind: progress",
      "- task: T-3",
      "- commit: abc1234",
      "- files: `crates/wf-server/tests/sse_replay.rs`",
      "- model: gpt-5-codex",
      "",
      "The test drops the stream after event 40.",
    ]);
    expect(d.added.filter((l) => l === "")).toHaveLength(2); // the gap above the entry and the gap below its meta list
    expect(next.endsWith("\n")).toBe(true);
    expect(next.endsWith("\n\n")).toBe(false);
    canonical(path("wf-3k9x2", "changes.md"), next);
    expect(next.startsWith(changes.trimEnd())).toBe(true);
  });

  test("append to a missing file creates it with the H1", () => {
    const next = appendChange(undefined, entry);
    expect(next.startsWith("# Changes\n\n## ")).toBe(true);
    const loaded = loadWorkspace({
      ...files,
      [path("wf-ss0lo", "changes.md")]: next,
    });
    const src = loaded.world.issues.find((i) => i.goal.id === "wf-ss0lo");
    expect(src?.changes).toEqual([
      expect.objectContaining({ id: "C-9zzzz", author: "codex", task: "T-3", commit: "abc1234" }),
    ]);
  });

  test("append a decision and a learning, and change a decision status", () => {
    const decisions = text("wf-3k9x2", "decisions.md");
    const d = {
      id: "D-9yyyy",
      ts: STAMP,
      author: "claude-opus",
      title: "Keep the ring at 256 events",
      status: "proposed" as const,
      topic: "ring",
      decided_by: ["claude-opus"],
      decision: "Keep the ring at 256 events.",
      because: "One laptop sleep produced 140 events.",
      revisit: "A soak test shows more than 256.",
    };
    const next = appendDecision(decisions, d);
    expect(diff(decisions, next).removed).toEqual([]);
    expect(diff(decisions, next).added).toContain("**Decision:** Keep the ring at 256 events.");
    canonical(path("wf-3k9x2", "decisions.md"), next);
    const accepted = setDecisionStatus(next, "D-9yyyy", "accepted");
    expect(diff(next, accepted)).toEqual({
      removed: ["- status: proposed"],
      added: ["- status: accepted"],
    });

    const learnings = text("wf-3k9x2", "learnings.md");
    const l = {
      id: "L-9xxxx",
      ts: STAMP,
      author: "codex",
      title: "Send a keepalive every 15 s",
      kind: "tip" as const,
      tags: ["sse"],
      promote: "no" as const,
      rule: "Send a keepalive every 15 s.",
      evidence: "Proxies close idle streams after 30 s.",
    };
    const nextL = appendLearning(learnings, l);
    expect(diff(learnings, nextL).removed).toEqual([]);
    expect(
      diff(learnings, nextL)
        .added.filter((l) => l !== "")
        .at(-1),
    ).toBe("Evidence: Proxies close idle streams after 30 s.");
    canonical(path("wf-3k9x2", "learnings.md"), nextL);
  });

  test("a file without a final line break still gets a clean append", () => {
    const next = appendChange(changes.trimEnd(), entry);
    expect(next).toBe(appendChange(changes, entry));
  });
});

// ---------------------------------------------------------------- library

describe("library", () => {
  const draftPath = "library/patterns/review-promoted-items.md";
  const draft = files[draftPath];

  test("the draft exists and is a draft", () => {
    expect(draft).toContain("status: draft");
  });

  test("approve sets status, reviewed_by, last_reviewed and review_after", () => {
    const next = approveLibraryItem(draft, {
      by: "shruti",
      today: "2026-10-25",
      reviewAfter: "2027-05-01",
    });
    const d = diff(draft, next);
    expect(d.removed.filter((l) => l.startsWith("status:"))).toEqual(["status: draft"]);
    expect(d.added).toEqual(
      expect.arrayContaining([
        "status: reviewed",
        'reviewed_by: "@shruti"',
        "last_reviewed: 2026-10-25",
        "review_after: 2027-05-01",
      ]),
    );
    expect(d.added.length - d.removed.length).toBeLessThanOrEqual(2);
    canonical(draftPath, next);
    // The keys sit in contract order: reviewed_by before created.
    const keys = next
      .split("\n")
      .slice(1, next.split("\n").indexOf("---", 1))
      .filter((l) => /^[a-z_]+:/.test(l))
      .map((l) => l.split(":")[0]);
    expect(keys.indexOf("reviewed_by")).toBeLessThan(keys.indexOf("created"));
    expect(keys.indexOf("last_reviewed")).toBeLessThan(keys.indexOf("review_after"));
  });

  test("promote writes the library file and the review request, creating the state if needed", () => {
    const item: LibrarySrc = {
      id: "lib-9aaaa",
      slug: "keep-a-keepalive",
      title: "Send a keepalive every 15 s",
      kind: "pattern",
      description: "Use when a proxy sits between the daemon and the browser.",
      status: "draft",
      tags: ["sse"],
      applies_to: [],
      source: ["[[wf-ss0lo#L-9mz4e]]"],
      authors: ["codex", "shruti"],
      created: "2026-10-25",
      review_after: "2027-04-23",
      sections: [
        { heading: "Rule", body_md: "Send a keepalive every 15 s." },
        { heading: "When to use", body_md: "Use when a proxy sits between." },
        { heading: "Example", body_md: "Add a short example during review." },
        { heading: "Evidence", body_md: "- [[wf-ss0lo#L-9mz4e]]" },
      ],
    };
    const request = {
      id: "Q-9dddd",
      question: 'Review the draft "Send a keepalive every 15 s" before it enters agent context?',
      from: "shruti",
      to: "mudit",
      kind: "approval" as const,
      urgency: "fyi" as const,
      asked: STAMP,
      options: ["approve", "reject"],
      ref: "[[lib-9aaaa]]",
    };
    // wf-ss0lo has no current_state.md: the state is created.
    const made = promote({ stateText: undefined, item, request, by: "shruti", now: STAMP });
    expect(made.library).toBe(newLibraryItem(item));
    expect(made.state).toContain('summary: "A library draft waits for review."');
    expect(made.state).toContain("1. Review the draft [[lib-9aaaa]].");
    expect(made.state).toContain("  - ref: [[lib-9aaaa]]");
    // wf-3k9x2 has one: the request joins its Needs you section.
    const state = text("wf-3k9x2", "current_state.md");
    const joined = promote({ stateText: state, item, request, by: "shruti", now: STAMP });
    expect(diff(state, joined.state).removed).toEqual([]);
    expect(libraryPath(item)).toBe("library/patterns/keep-a-keepalive.md");
  });
});

// ---------------------------------------------------------------- creation

describe("creation", () => {
  test("new issue writes a backlog goal.md and nothing else", () => {
    const goal = newIssueGoal({
      id: "wf-9eeee",
      title: "Add a retry button",
      owner: "shruti",
      size: "s",
      template: "bug",
      created: STAMP,
    });
    const group = loaded0.world.groups.find((g) => g.slug === "web")?.id as string;
    const dir = `${loaded0.groupDirs[group]}/retry-button`;
    const loaded = loadWorkspace({ ...files, [`${dir}/goal.md`]: goal }, { now: NOW });
    const src = loaded.world.issues.find((i) => i.goal.id === "wf-9eeee");
    expect(src).toMatchObject({
      slug: "retry-button",
      group,
      goal: { status: "backlog", priority: "none", size: "s", owner: "shruti", labels: ["bug"] },
    });
    expect(src?.plan).toBeUndefined();
    expect(src?.state).toBeUndefined();
    expect(src?.criteria).toHaveLength(2);
    expect(src?.criteria.every((c) => c.verify === "manual")).toBe(true);
    expect(loaded.texts["wf-9eeee"]).toEqual({ "goal.md": goal });
    expect(loaded.diagnostics[`${dir}/goal.md`].filter((d) => d.severity === "error")).toEqual([]);
    canonical(`${dir}/goal.md`, goal);
  });

  test("new group writes _group.md and the folder becomes a group", () => {
    const parent = loaded0.world.groups.find((g) => g.slug === "web");
    const file = newGroupFile({
      id: "g-9ffff",
      title: "Search",
      slug: "search",
      parent: parent?.id,
      owner: "shruti",
      color: 5,
      order: 4,
      implicit: false,
    });
    const dir = `${loaded0.groupDirs[parent?.id as string]}/search`;
    const loaded = loadWorkspace({ ...files, [`${dir}/_group.md`]: file }, { now: NOW });
    expect(loaded.world.groups.find((g) => g.id === "g-9ffff")).toMatchObject({
      title: "Search",
      slug: "search",
      parent: parent?.id,
      owner: "shruti",
      color: 5,
      order: 4,
      implicit: false,
    });
  });
});
