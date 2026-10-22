// `POST /api/ops` for the mock: every Op of `@/gen/types`, applied to the sources.
// Order inside each op: find the target → 409 if the client's rev is stale → 422 if the
// move or value is not allowed → change a copy of the world through `store.mutate`.
import type { Handle, IssueId, LibraryKind, LibrarySection, OpResult } from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import type { NewIssueOp, WfOp } from "@/lib/api/types";
import {
  doneGaps,
  illegalReason,
  isLegalTransition,
  STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/status";
import { libraryPath } from "./serialize";
import {
  addActivity,
  type IssueSrc,
  type LibrarySrc,
  type RequestSrc,
  type TaskSrc,
  type WorldSrc,
} from "./source";
import type { Applied, Mutation, Store } from "./store";
import { dateIn, toTs } from "./time";
import { hashColor, slugify } from "./util";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------- errors

function reject(...gaps: string[]): never {
  throw new ApiError(422, { diagnostics: [], gaps });
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) reject(`${what} does not exist.`);
  return value;
}

// ---------------------------------------------------------------- lookups

function issueIn(w: WorldSrc, id: IssueId): IssueSrc {
  return need(
    w.issues.find((i) => i.goal.id === id),
    `Issue ${id}`,
  );
}

function allTasks(src: IssueSrc): TaskSrc[] {
  return src.plan?.phases.flatMap((p) => p.tasks) ?? [];
}

function taskIn(src: IssueSrc, id: string): TaskSrc {
  return need(
    allTasks(src).find((t) => t.id === id),
    `Task ${id}`,
  );
}

function criterionIndex(src: IssueSrc, id: string): number {
  const n = /^SC-(\d+)$/.exec(id)?.[1];
  const index = n ? Number(n) - 1 : -1;
  if (index < 0 || index >= src.criteria.length) reject(`Criterion ${id} does not exist.`);
  return index;
}

function requestIn(src: IssueSrc, id: string): RequestSrc {
  return need(
    src.state?.needs_you.find((r) => r.id === id),
    `Request ${id}`,
  );
}

function logActivity(
  src: IssueSrc,
  store: Store,
  by: Handle,
  kind: "status" | "state",
  title: string,
) {
  addActivity(src, { ts: store.stamp(), author: by, kind, title });
}

// ---------------------------------------------------------------- the dispatcher

export function applyOp(store: Store, op: WfOp): OpResult {
  switch (op.op) {
    case "set_status":
      return setStatus(store, op);
    case "toggle_criterion":
      return toggleCriterion(store, op);
    case "set_task_status":
      return setTaskStatus(store, op);
    case "toggle_step":
      return toggleStep(store, op);
    case "answer_request":
      return answerRequest(store, op);
    case "promote":
      return promote(store, op);
    case "new_issue":
      return newIssue(store, op);
    case "new_group":
      return newGroup(store, op);
    case "approve_library":
      return approveLibrary(store, op);
  }
}

function result(store: Store, m: Mutation, issue?: IssueId): OpResult {
  const id = issue ?? m.created;
  return {
    rev: m.rev,
    file_rev: m.file_rev,
    issue: (id ? store.summary(id) : undefined) ?? m.issue,
    created: m.created,
  };
}

type Of<N extends WfOp["op"]> = Extract<WfOp, { op: N }>;

// ---------------------------------------------------------------- status

function setStatus(store: Store, op: Of<"set_status">): OpResult {
  const summary = need(store.summary(op.issue), `Issue ${op.issue}`);
  const file = store.filePath(op.issue, "goal.md");
  store.guard(file, "status", op.base_rev, () => ({ status: summary.status }));
  if (summary.status === op.status) return result(store, store.unchanged(file, op.issue), op.issue);

  if (!op.force) {
    if (!isLegalTransition(summary.status, op.status))
      reject(illegalReason(summary.status, op.status));
    if (op.status === "done") {
      const gaps = doneGaps(summary);
      if (gaps.length > 0) reject(...gaps);
    }
  }
  const by = store.me;
  const from = summary.status;
  const m = store.mutate(by, op.issue, (w) => {
    const src = issueIn(w, op.issue);
    src.goal.status = op.status;
    const title = `${STATUS_LABEL[from]} → ${STATUS_LABEL[op.status]}`;
    logActivity(src, store, by, "status", title);
    return {
      touches: [{ file, anchors: ["status"] }],
      activity: [
        {
          issue_id: op.issue,
          kind: "status",
          author: by,
          title: `Moved to ${STATUS_LABEL[op.status]}`,
        },
      ],
    };
  });
  return result(store, m, op.issue);
}

// ---------------------------------------------------------------- criteria

function toggleCriterion(store: Store, op: Of<"toggle_criterion">): OpResult {
  const live = issueIn(store.world, op.issue);
  const index = criterionIndex(live, op.id);
  const file = store.filePath(op.issue, "goal.md");
  store.guard(file, op.id, op.base_rev, () => ({ checked: live.criteria[index].checked }));
  if (live.criteria[index].checked === op.checked)
    return result(store, store.unchanged(file, op.issue), op.issue);

  const by = store.me;
  const m = store.mutate(by, op.issue, (w) => {
    const src = issueIn(w, op.issue);
    const c = src.criteria[index];
    c.checked = op.checked;
    // Unticking drops the evidence: a criterion is verified only while it is ticked with proof.
    if (!op.checked) {
      c.evidence = undefined;
      c.verified_by = undefined;
    }
    logActivity(src, store, by, "state", `${op.checked ? "Ticked" : "Unticked"} ${op.id}`);
    return {
      touches: [{ file, anchors: [op.id] }],
      activity: [
        {
          issue_id: op.issue,
          kind: "state",
          author: by,
          title: `${op.checked ? "Ticked" : "Unticked"} ${op.id}`,
        },
      ],
    };
  });
  return result(store, m, op.issue);
}

// ---------------------------------------------------------------- plan

function setTaskStatus(store: Store, op: Of<"set_task_status">): OpResult {
  const live = taskIn(issueIn(store.world, op.issue), op.task);
  const file = store.filePath(op.issue, "plan.md");
  store.guard(file, op.task, op.base_rev, () => ({ status: live.status }));
  if (live.status === op.status) return result(store, store.unchanged(file, op.issue), op.issue);

  const by = store.me;
  const leaseMs = store.world.config.leases_minutes * 60_000;
  const m = store.mutate(by, op.issue, (w) => {
    const src = issueIn(w, op.issue);
    const task = taskIn(src, op.task);
    task.status = op.status;
    if (op.status === "todo") {
      // Back to the queue: release the claim.
      task.claimed_by = undefined;
      task.lease_until = undefined;
    } else if (op.status === "in_progress" && !task.claimed_by) {
      task.claimed_by = by;
      task.lease_until = toTs(store.now() + leaseMs);
    }
    const title = `${op.task} → ${TASK_STATUS_LABEL[op.status]}`;
    logActivity(src, store, by, "state", title);
    return {
      touches: [{ file, anchors: [op.task] }],
      activity: [{ issue_id: op.issue, kind: "state", author: by, title }],
    };
  });
  return result(store, m, op.issue);
}

function toggleStep(store: Store, op: Of<"toggle_step">): OpResult {
  const live = taskIn(issueIn(store.world, op.issue), op.task);
  const step = live.steps?.[op.index - 1];
  if (!step) reject(`Step ${op.task}.${op.index} does not exist.`);
  const file = store.filePath(op.issue, "plan.md");
  const anchor = `${op.task}.${op.index}`;
  store.guard(file, anchor, op.base_rev, () => ({ checked: step.done }));
  if (step.done === op.checked) return result(store, store.unchanged(file, op.issue), op.issue);

  const by = store.me;
  const m = store.mutate(by, op.issue, (w) => {
    const src = issueIn(w, op.issue);
    const target = taskIn(src, op.task).steps?.[op.index - 1];
    if (target) target.done = op.checked;
    const title = `${op.checked ? "Ticked" : "Unticked"} step ${op.index} of ${op.task}`;
    logActivity(src, store, by, "state", title);
    return {
      touches: [{ file, anchors: [anchor] }],
      activity: [{ issue_id: op.issue, kind: "state", author: by, title }],
    };
  });
  return result(store, m, op.issue);
}

// ---------------------------------------------------------------- requests

function answerRequest(store: Store, op: Of<"answer_request">): OpResult {
  const live = requestIn(issueIn(store.world, op.issue), op.id);
  const file = store.filePath(op.issue, "current_state.md");
  store.guard(file, op.id, op.base_rev, () => ({ answered: !!live.answered }));
  const answer = op.answer.trim();
  if (!answer) reject("Write an answer first.");
  if (live.answered)
    throw new ApiError(409, {
      reason: `${op.id} was already answered${live.answered_by ? ` by @${live.answered_by}` : ""}`,
      file,
      by: live.answered_by,
      current: { answered: true, answer: live.answer },
    });

  const by = store.me;
  const m = store.mutate(by, op.issue, (w) => {
    const src = issueIn(w, op.issue);
    const r = requestIn(src, op.id);
    r.answered = true;
    r.answer = answer;
    r.answered_by = by;
    r.answered_at = store.stamp();
    logActivity(src, store, by, "state", `Answered ${op.id}`);
    return {
      touches: [{ file, anchors: [op.id] }],
      activity: [{ issue_id: op.issue, kind: "request", author: by, title: `Answered ${op.id}` }],
    };
  });
  return result(store, m, op.issue);
}

// ---------------------------------------------------------------- library

const SECTION_HEADINGS: Record<LibraryKind, string[]> = {
  pattern: ["Rule", "When to use", "Example", "Evidence"],
  gotcha: ["Symptom", "Cause", "Fix", "Evidence"],
  playbook: ["Overview", "Procedure", "Done when", "Forbidden"],
  decision: ["Decision", "Because", "Rejected", "Revisit when"],
};

/** Markdown reduced to one line of plain text. */
const plainText = (md: string) =>
  md
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const firstSentence = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  return end < 0 ? flat : flat.slice(0, end + 1);
};

/** The draft sections for a promoted entry. Content comes from the entry; gaps say what review adds. */
function draftSections(
  kind: LibraryKind,
  entry: { title: string; text: LearningEntryText },
  backlink: string,
): LibrarySection[] {
  const { rule, evidence, because, rejected, revisit, applies } = entry.text;
  const body: Record<LibraryKind, string[]> = {
    pattern: [
      rule,
      applies.length > 0
        ? `Use when work touches ${applies.join(", ")}.`
        : "Use when the situation in the evidence comes up again.",
      "Add a short example during review.",
      `${evidence ? `${evidence}\n\n` : ""}- ${backlink}`,
    ],
    gotcha: [
      `${entry.title}.`,
      evidence || "Add the root cause during review.",
      rule,
      `- ${backlink}`,
    ],
    playbook: [
      rule,
      `1. ${firstSentence(rule)}`,
      "The behavior in the overview holds and the evidence still passes.",
      "Do not skip the checks named in the evidence.",
    ],
    decision: [
      rule,
      because || "Add the reason during review.",
      rejected || "Add the options that lost during review.",
      revisit || "Add the trigger for a second look during review.",
    ],
  };
  return SECTION_HEADINGS[kind].map((heading, i) => ({ heading, body_md: body[kind][i] }));
}

interface LearningEntryText {
  rule: string;
  evidence?: string;
  because?: string;
  rejected?: string;
  revisit?: string;
  applies: string[];
}

function promote(store: Store, op: Of<"promote">): OpResult {
  const live = issueIn(store.world, op.issue);
  const learning = live.learnings.find((l) => l.id === op.entry);
  const decision = live.decisions.find((d) => d.id === op.entry);
  const entry = learning ?? decision;
  if (!entry) reject(`Entry ${op.entry} does not exist in ${op.issue}.`);

  const source = `[[${op.issue}#${op.entry}]]`;
  const already = store.world.library.find((l) => l.source.includes(source));
  if (already) reject(`${op.entry} is already in the library as ${already.id}.`);

  const by = store.me;
  const group = store.world.groups.find((g) => g.id === live.group);
  const owner = group?.owner ?? live.goal.owner ?? by;
  const libId = store.newId("lib-");
  const reqId = store.newId("Q-");
  const today = toTs(store.now()).slice(0, 10);

  const text: LearningEntryText = learning
    ? {
        rule: learning.rule,
        evidence: learning.evidence,
        applies: learning.applies_to ?? [],
      }
    : {
        rule: decision?.decision ?? "",
        because: decision?.because,
        rejected: decision?.rejected,
        revisit: decision?.revisit,
        applies: [],
      };

  const slugBase = op.slug && SLUG.test(op.slug) ? op.slug : slugify(entry.title);
  const taken = new Set(store.world.library.map((l) => libraryPath(l)));
  let slug = slugBase || "untitled";
  for (let n = 2; taken.has(libraryPath({ kind: op.kind, slug })); n++) slug = `${slugBase}-${n}`;

  // The "Use when…" line the promote dialog previews: where the rule applies, then the rule.
  const lead = decision
    ? decision.topic
      ? `Use when you work on ${decision.topic.replace(/[-_]+/g, " ")}.`
      : "Use when you face the same choice."
    : text.applies.length > 0
      ? `Use when you work on ${text.applies
          .slice(0, 2)
          .map((a) => `\`${a}\``)
          .join(" or ")}.`
      : (learning?.tags?.length ?? 0) > 0
        ? `Use when you work with ${learning?.tags?.slice(0, 3).join(", ")}.`
        : "Use when you hit the same problem.";
  const rule = firstSentence(plainText(text.rule).replace(/^(decision|rule):\s*/i, ""));
  const full = rule ? `${lead} ${rule}` : lead;
  const description = full.length <= 300 ? full : `${full.slice(0, 297).trimEnd()}…`;

  const item: LibrarySrc = {
    id: libId,
    slug,
    title: entry.title,
    kind: op.kind,
    description,
    status: "draft",
    tags: learning?.tags ?? [],
    applies_to: text.applies,
    source: [source],
    authors: [...new Set([entry.author, by])],
    created: today,
    review_after: dateIn(180),
    sections: draftSections(op.kind, { title: entry.title, text }, source),
  };

  const stateFile = store.filePath(op.issue, "current_state.md");
  const m = store.mutate(by, op.issue, (w) => {
    w.library.push(item);
    const src = issueIn(w, op.issue);
    const request: RequestSrc = {
      id: reqId,
      question: `Review the draft "${item.title}" before it enters agent context?`,
      from: by,
      to: owner,
      kind: "approval",
      urgency: "fyi",
      asked: store.stamp(),
      options: ["approve", "reject"],
      ref: `[[${libId}]]`,
    };
    const createdState = !src.state;
    if (src.state) src.state.needs_you.push(request);
    else
      src.state = {
        summary: "A library draft waits for review.",
        updated_at: store.stamp(),
        updated_by: by,
        needs_you: [request],
        next_steps: [`Review the draft [[${libId}]].`],
      };
    logActivity(src, store, by, "state", `Promoted ${op.entry} to ${libId}`);
    return {
      touches: [
        { file: libraryPath(item), anchors: "all" },
        { file: stateFile, anchors: createdState ? "all" : [reqId] },
      ],
      activity: [
        {
          issue_id: op.issue,
          kind: learning ? "learning" : "decision",
          author: by,
          title: `Promoted "${entry.title}" to the library as a draft`,
        },
      ],
      created: libId,
    };
  });
  return result(store, m, op.issue);
}

function approveLibrary(store: Store, op: Of<"approve_library">): OpResult {
  const live = need(
    store.world.library.find((l) => l.id === op.id),
    `Library item ${op.id}`,
  );
  const file = libraryPath(live);
  store.guard(file, "status", op.base_rev, () => ({ status: live.status }));
  if (live.status === "retired") reject(`${op.id} is retired. Retired items cannot be approved.`);
  if (live.status === "reviewed") return result(store, store.unchanged(file));

  const by = store.me;
  const today = toTs(store.now()).slice(0, 10);
  const issueRef = new RegExp(`^\\[\\[(${store.world.config.id_prefix}-[0-9a-z]{5})`);
  const sourceIssue = live.source.map((s) => issueRef.exec(s)?.[1]).find(Boolean);
  const m = store.mutate(by, sourceIssue, (w) => {
    const item = need(
      w.library.find((l) => l.id === op.id),
      `Library item ${op.id}`,
    );
    item.status = "reviewed";
    item.reviewed_by = by;
    item.last_reviewed = today;
    item.review_after = dateIn(180);
    // Close the review request that asked for this approval.
    const touches: Applied["touches"] = [{ file, anchors: ["status"] }];
    for (const src of w.issues) {
      for (const r of src.state?.needs_you ?? []) {
        if (r.answered || !r.ref?.includes(op.id)) continue;
        r.answered = true;
        r.answer = "approve";
        r.answered_by = by;
        r.answered_at = store.stamp();
        touches.push({ file: store.filePath(src.goal.id, "current_state.md"), anchors: [r.id] });
      }
    }
    return {
      touches,
      activity: [
        {
          issue_id: sourceIssue ?? "",
          kind: "learning",
          author: by,
          title: `Approved "${item.title}"`,
        },
      ],
    };
  });
  return result(store, m, sourceIssue);
}

// ---------------------------------------------------------------- creation

interface Scaffold {
  context: string;
  criterion: string;
  extra?: string;
  labels: string[];
}

const SCAFFOLDS: Record<NewIssueOp["template"], Scaffold> = {
  default: {
    context:
      "Why this matters, who feels the problem today and what changes when it is done.\n\nRun the `write-goal` skill to fill in this section.",
    criterion: "When the work is complete, the system shall behave as the context describes.",
    labels: [],
  },
  bug: {
    context:
      "What happens today, what should happen and the steps to reproduce it.\n\nRun the `write-goal` skill to fill in this section.",
    criterion: "When the failing step runs, the system shall behave as the context describes.",
    extra: "A regression test shall cover the failing step.",
    labels: ["bug"],
  },
  research: {
    context:
      "The question to answer, why it matters and who decides.\n\nRun the `write-goal` skill to fill in this section.",
    criterion:
      "The research note shall answer the question with a recommendation and its trade-offs.",
    labels: ["research"],
  },
  doc: {
    context:
      "Who reads this document and what they can do once they have read it.\n\nRun the `write-goal` skill to fill in this section.",
    criterion: "The document shall explain each step a new reader needs to finish the task.",
    labels: ["docs"],
  },
};

function newIssue(store: Store, op: NewIssueOp): OpResult {
  const group = need(
    store.world.groups.find((g) => g.id === op.group),
    `Group ${op.group}`,
  );
  const title = op.title.trim();
  if (!title) reject("Give the issue a title.");
  if (!SLUG.test(op.slug)) reject("Use lowercase letters, digits and single hyphens in the slug.");
  const siblingIssue = store.world.issues.some((i) => i.group === group.id && i.slug === op.slug);
  const siblingGroup = store.world.groups.some((g) => g.parent === group.id && g.slug === op.slug);
  if (siblingIssue || siblingGroup)
    reject(`A folder named "${op.slug}" already exists in ${group.title}. Pick another slug.`);

  const by = store.me;
  const id = store.newId(`${store.world.config.id_prefix}-`);
  const scaffold = SCAFFOLDS[op.template];
  const dir = store.derived.groupDirs.get(group.id) ?? group.slug;
  const file = `${dir}/${op.slug}/goal.md`;
  const m = store.mutate(by, undefined, (w) => {
    w.issues.push({
      slug: op.slug,
      group: group.id,
      goal: {
        id,
        title,
        status: "backlog",
        priority: "none",
        size: op.size ?? "m",
        owner: by,
        labels: [...scaffold.labels],
        blocked_by: [],
        created: store.stamp(),
      },
      context: scaffold.context,
      criteria: [scaffold.criterion, scaffold.extra]
        .filter((c): c is string => !!c)
        .map((text) => ({ text, checked: false, verify: "manual" })),
      changes: [],
      decisions: [],
      learnings: [],
      activity: [{ ts: store.stamp(), author: by, kind: "status", title: "Created" }],
    });
    return {
      touches: [{ file, anchors: "all" }],
      activity: [{ issue_id: id, kind: "status", author: by, title: `Created ${id}: ${title}` }],
      created: id,
    };
  });
  return result(store, m, id);
}

function newGroup(store: Store, op: Of<"new_group">): OpResult {
  const parent = need(
    store.world.groups.find((g) => g.id === op.parent),
    `Group ${op.parent}`,
  );
  const title = op.title.trim();
  if (!title) reject("Give the group a title.");
  if (!SLUG.test(op.slug)) reject("Use lowercase letters, digits and single hyphens in the slug.");
  const siblingIssue = store.world.issues.some((i) => i.group === parent.id && i.slug === op.slug);
  const siblingGroup = store.world.groups.some((g) => g.parent === parent.id && g.slug === op.slug);
  if (siblingIssue || siblingGroup)
    reject(`A folder named "${op.slug}" already exists in ${parent.title}. Pick another slug.`);
  if (op.color !== undefined && (op.color < 1 || op.color > 8)) reject("Pick a color from 1 to 8.");

  const by = store.me;
  const id = store.newId("g-");
  const dir = `${store.derived.groupDirs.get(parent.id) ?? parent.slug}/${op.slug}`;
  const m = store.mutate(by, undefined, (w) => {
    const siblings = w.groups.filter((g) => g.parent === parent.id);
    w.groups.push({
      id,
      title,
      slug: op.slug,
      parent: parent.id,
      owner: by,
      color: op.color ?? hashColor(id),
      order: siblings.reduce((max, g) => Math.max(max, g.order), 0) + 1,
      implicit: false,
    });
    return {
      touches: [{ file: `${dir}/_group.md`, anchors: "all" }],
      activity: [],
      created: id,
    };
  });
  return { rev: m.rev, file_rev: m.file_rev, created: m.created };
}
