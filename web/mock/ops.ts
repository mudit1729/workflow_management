// `POST /api/ops` for the mock: every Op of `@/gen/types`, applied to the workspace FILES as a
// minimal text edit (ticking SC-3 flips `[ ]` to `[x]` on its line and nothing else changes).
// Order inside each op: find the target → 409 if the client's rev is stale → 422 if the
// move or value is not allowed → edit the text through `store.mutate`, which loads the result.
import type { ContextLink, IssueId, LibraryKind, LibrarySection, OpResult } from "@/gen/types";
import { ApiError } from "@/lib/api/error";
import type { NewIssueOp, WfOp } from "@/lib/api/types";
import {
  doneGaps,
  illegalReason,
  isLegalTransition,
  STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/status";
import {
  addLinks as addLinksText,
  answerRequestsReferring,
  answerRequest as answerRequestText,
  approveLibraryItem,
  EditError,
  moveTask,
  newGroupFile,
  newIssueGoal,
  promote as promoteTexts,
  setIssueStatus,
  toggleCriterion as toggleCriterionText,
  toggleStep as toggleStepText,
} from "./md/edit";
import type { IssueSrc, LibrarySrc, RequestSrc, TaskSrc, WorldSrc } from "./source";
import type { Applied, Draft, Mutation, Store } from "./store";
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

/** The text of a file the op edits. A missing file is a 422, not a crash. */
function read(w: Draft, path: string): string {
  const text = w.read(path);
  if (text === undefined) reject(`${path} does not exist.`);
  return text;
}

/** Run a text edit; an edit that cannot find its target is a 422 with the edit's own words. */
function edit<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof EditError) reject(err.message);
    throw err;
  }
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
    case "add_links":
      return addLinks(store, op);
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
    w.write(
      file,
      edit(() => setIssueStatus(read(w, file), op.status)),
    );
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
      log: [
        {
          issue_id: op.issue,
          kind: "status",
          author: by,
          title: `${STATUS_LABEL[from]} → ${STATUS_LABEL[op.status]}`,
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
  const title = `${op.checked ? "Ticked" : "Unticked"} ${op.id}`;
  const m = store.mutate(by, op.issue, (w) => {
    // Unticking drops the evidence: a criterion is verified only while it is ticked with proof.
    w.write(
      file,
      edit(() => toggleCriterionText(read(w, file), op.id, op.checked)),
    );
    return {
      touches: [{ file, anchors: [op.id] }],
      activity: [{ issue_id: op.issue, kind: "state", author: by, title }],
      log: [{ issue_id: op.issue, kind: "state", author: by, title }],
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
  const title = `${op.task} → ${TASK_STATUS_LABEL[op.status]}`;
  const m = store.mutate(by, op.issue, (w) => {
    // Back to the queue releases the claim; in progress claims the task when nobody holds it.
    const claim =
      op.status === "in_progress" ? { by, leaseUntil: toTs(store.now() + leaseMs) } : undefined;
    w.write(
      file,
      edit(() => moveTask(read(w, file), op.task, op.status, claim)),
    );
    return {
      touches: [{ file, anchors: [op.task] }],
      activity: [{ issue_id: op.issue, kind: "state", author: by, title }],
      log: [{ issue_id: op.issue, kind: "state", author: by, title }],
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
  const title = `${op.checked ? "Ticked" : "Unticked"} step ${op.index} of ${op.task}`;
  const m = store.mutate(by, op.issue, (w) => {
    w.write(
      file,
      edit(() => toggleStepText(read(w, file), op.task, op.index, op.checked)),
    );
    return {
      touches: [{ file, anchors: [anchor] }],
      activity: [{ issue_id: op.issue, kind: "state", author: by, title }],
      log: [{ issue_id: op.issue, kind: "state", author: by, title }],
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
    w.write(
      file,
      edit(() => answerRequestText(read(w, file), op.id, { answer, by, at: store.stamp() })),
    );
    return {
      touches: [{ file, anchors: [op.id] }],
      activity: [{ issue_id: op.issue, kind: "request", author: by, title: `Answered ${op.id}` }],
      log: [{ issue_id: op.issue, kind: "state", author: by, title: `Answered ${op.id}` }],
    };
  });
  return result(store, m, op.issue);
}

// ---------------------------------------------------------------- library

/** Workspace path of a library item: `<library_dir>/<kind>s/<slug>.md`. */
function libraryFile(store: Store, item: Pick<LibrarySrc, "kind" | "slug">): string {
  const dir = store.world.config.library_dir.replace(/\/+$/, "");
  return `${dir}/${item.kind}s/${item.slug}.md`;
}

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
  const taken = new Set(Object.values(store.source.libraryPaths));
  let slug = slugBase || "untitled";
  for (let n = 2; taken.has(libraryFile(store, { kind: op.kind, slug })); n++)
    slug = `${slugBase}-${n}`;

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
  const itemFile = libraryFile(store, item);
  const m = store.mutate(by, op.issue, (w) => {
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
    const createdState = w.read(stateFile) === undefined;
    // The draft item, and the review request in the issue's current_state.md.
    const out = edit(() =>
      promoteTexts({ stateText: w.read(stateFile), item, request, by, now: store.stamp() }),
    );
    w.write(itemFile, out.library);
    w.write(stateFile, out.state);
    return {
      touches: [
        { file: itemFile, anchors: "all" },
        { file: stateFile, anchors: createdState ? "all" : [reqId] },
      ],
      log: [
        {
          issue_id: op.issue,
          kind: "state",
          author: by,
          title: `Promoted ${op.entry} to ${libId}`,
        },
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
  const file = store.source.libraryPaths[op.id] ?? libraryFile(store, live);
  store.guard(file, "status", op.base_rev, () => ({ status: live.status }));
  if (live.status === "retired") reject(`${op.id} is retired. Retired items cannot be approved.`);
  if (live.status === "reviewed") return result(store, store.unchanged(file));

  const by = store.me;
  const today = toTs(store.now()).slice(0, 10);
  const issueRef = new RegExp(`^\\[\\[(${store.world.config.id_prefix}-[0-9a-z]{5})`);
  const sourceIssue = live.source.map((s) => issueRef.exec(s)?.[1]).find(Boolean);
  const m = store.mutate(by, sourceIssue, (w) => {
    w.write(
      file,
      edit(() => approveLibraryItem(read(w, file), { by, today, reviewAfter: dateIn(180) })),
    );
    // Close the review request that asked for this approval.
    const touches: Applied["touches"] = [{ file, anchors: ["status"] }];
    for (const src of store.world.issues) {
      const stateFile = store.filePath(src.goal.id, "current_state.md");
      const text = w.read(stateFile);
      if (!text) continue;
      const closed = edit(() =>
        answerRequestsReferring(text, `[[${op.id}]]`, {
          answer: "approve",
          by,
          at: store.stamp(),
        }),
      );
      if (closed.closed.length === 0) continue;
      w.write(stateFile, closed.text);
      touches.push({ file: stateFile, anchors: closed.closed });
    }
    return {
      touches,
      activity: [
        {
          issue_id: sourceIssue ?? "",
          kind: "learning",
          author: by,
          title: `Approved "${live.title}"`,
        },
      ],
    };
  });
  return result(store, m, sourceIssue);
}

// ---------------------------------------------------------------- links

/** Words for a count of links: "1 link", "3 links". */
const linkCount = (n: number) => `${n} link${n === 1 ? "" : "s"}`;

/** A link must point at something that exists: a 422 names the first one that does not. */
function checkLinks(store: Store, links: ContextLink[]): void {
  for (const link of links) {
    if (!link.target.trim()) reject("A link needs a target.");
    switch (link.kind) {
      case "library": {
        const item = store.world.library.find((l) => l.id === link.target);
        if (!item) reject(`Library item ${link.target} does not exist.`);
        if (item.status === "retired") reject(`${link.target} is retired. Link a current item.`);
        break;
      }
      case "entry": {
        const [issueId, entryId] = link.target.split("#");
        const src = store.world.issues.find((i) => i.goal.id === issueId);
        if (!src) reject(`Issue ${issueId} does not exist.`);
        const known = [...src.changes, ...src.decisions, ...src.learnings].some(
          (e) => e.id === entryId,
        );
        if (!entryId || !known) reject(`Entry ${link.target} does not exist.`);
        break;
      }
      case "term":
        if (!store.world.glossary.some((t) => t.term === link.target))
          reject(`Glossary term "${link.target}" does not exist.`);
        break;
      case "file":
        if (store.text(link.target) === undefined && !store.assets()[link.target])
          reject(`File ${link.target} does not exist.`);
        break;
      default:
        reject("Unknown link kind. Use library, entry, term or file.");
    }
  }
}

function addLinks(store: Store, op: Of<"add_links">): OpResult {
  const live = issueIn(store.world, op.issue);
  const file = store.filePath(op.issue, "goal.md");
  store.guard(file, "links", op.base_rev, () => ({ links: live.links ?? "" }));
  if (op.links.length === 0) reject("Pick at least one item to link.");
  checkLinks(store, op.links);

  const by = store.me;
  const dir = store.derived.dirs.get(op.issue) ?? file.slice(0, file.lastIndexOf("/"));
  const m = store.mutate(by, op.issue, (w) => {
    w.write(
      file,
      edit(() => addLinksText(read(w, file), op.links, dir)),
    );
    const title = `Linked ${linkCount(op.links.length)} in goal.md`;
    return {
      touches: [{ file, anchors: ["links"] }],
      activity: [{ issue_id: op.issue, kind: "state", author: by, title }],
      log: [{ issue_id: op.issue, kind: "state", author: by, title }],
    };
  });
  return result(store, m, op.issue);
}

// ---------------------------------------------------------------- creation

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

  const links = op.links ?? [];
  checkLinks(store, links);

  const by = store.me;
  const id = store.newId(`${store.world.config.id_prefix}-`);
  const dir = store.derived.groupDirs.get(group.id) ?? group.slug;
  const file = `${dir}/${op.slug}/goal.md`;
  const m = store.mutate(by, undefined, (w) => {
    w.write(
      file,
      newIssueGoal({
        id,
        title,
        owner: by,
        size: op.size ?? "m",
        template: op.template,
        created: store.stamp(),
        context: op.context_md,
        links,
        dir: `${dir}/${op.slug}`,
      }),
    );
    return {
      touches: [{ file, anchors: "all" }],
      activity: [{ issue_id: id, kind: "status", author: by, title: `Created ${id}: ${title}` }],
      log: [{ issue_id: id, kind: "status", author: by, title: "Created" }],
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
  const siblings = store.world.groups.filter((g) => g.parent === parent.id);
  const m = store.mutate(by, undefined, (w) => {
    w.write(
      `${dir}/_group.md`,
      newGroupFile({
        id,
        title,
        slug: op.slug,
        parent: parent.id,
        owner: by,
        color: op.color ?? hashColor(id),
        order: siblings.reduce((max, g) => Math.max(max, g.order), 0) + 1,
        implicit: false,
      }),
    );
    return {
      touches: [{ file: `${dir}/_group.md`, anchors: "all" }],
      activity: [],
      created: id,
    };
  });
  return { rev: m.rev, file_rev: m.file_rev, created: m.created };
}
