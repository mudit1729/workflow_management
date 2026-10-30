// Starting text for new files. Every template is a valid file under the contract grammar
// (1.3–1.5), so a freshly created file parses and lints clean, and the board shows it.
import { type ContextLink, linkLine } from "@/features/context/links";
import { basename, type IssueFileName, isIssueFileName } from "./paths";

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";
const OFFSET_MIN = 5 * 60 + 30; // +05:30, the workspace offset used across the prototype
const pad = (n: number) => String(n).padStart(2, "0");

/** Five lowercase Crockford base32 characters (contract 1.3). */
export function randomId5(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b % 32];
  return out;
}

/** A fresh id such as "wf-3k9x2" or "C-7k2q9" that is not in `taken`. */
export function newId(prefix: string, taken: ReadonlySet<string> = new Set()): string {
  for (let i = 0; i < 20; i++) {
    const id = `${prefix}-${randomId5()}`;
    if (!taken.has(id)) return id;
  }
  return `${prefix}-${randomId5()}`;
}

/** "2026-10-22T14:05+05:30": RFC 3339 at minute precision in the workspace offset. */
export function nowTs(now = Date.now()): string {
  const d = new Date(Math.floor(now / 60_000) * 60_000 + OFFSET_MIN * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}+05:30`;
}

/** A YAML-safe scalar: quoted when it holds `: `, `#`, or starts with an indicator. */
export function yamlScalar(v: string): string {
  return /: |#|^[@[{*&!|>'"%\-?]|;|\s$/.test(v) ? JSON.stringify(v) : v;
}

/** Handles are quoted in YAML because a bare `@` is reserved. */
const handleScalar = (h: string) => `"@${h}"`;

export interface TemplateOpts {
  /** The acting author, without "@". */
  author: string;
  now?: number;
  /** The workspace's `library_dir`, default "library". */
  libraryDir?: string;
}

// ---------------------------------------------------------------- goal.md

/**
 * A new issue's goal.md. `context` replaces the placeholder under `## Context`; `links` become
 * the bullets of `## Links`, a file link relative to `dir` (the folder of the new issue). The
 * text is the one the `new_issue` op writes.
 */
export function goalTemplate(o: {
  id: string;
  title: string;
  created?: string;
  context?: string;
  links?: ContextLink[];
  dir?: string;
}): string {
  const links = [...new Map((o.links ?? []).map((l) => [`${l.kind}:${l.target}`, l])).values()];
  return `${[
    "---",
    `id: ${o.id}`,
    `title: ${yamlScalar(o.title)}`,
    "status: backlog",
    "priority: none",
    "size: m",
    "labels: []",
    "blocked_by: []",
    `created: ${o.created ?? nowTs()}`,
    "---",
    "",
    "## Context",
    "",
    o.context?.trim() ||
      "Say why this work matters and who it helps, in one or two short paragraphs.",
    "",
    "## Success criteria",
    "",
    "- [ ] SC-1: When the issue is opened, the drawer shall show its goal within 1 s.",
    "  - verify: manual",
    ...(links.length ? ["", "## Links", "", ...links.map((l) => linkLine(l, o.dir ?? ""))] : []),
  ].join("\n")}\n`;
}

// ---------------------------------------------------------------- entries

export const CHANGE_TITLE_PLACEHOLDER = "Describe the change";
export const DECISION_TITLE_PLACEHOLDER = "State the decision";
export const LEARNING_TITLE_PLACEHOLDER = "State the rule";

function entryHeading(o: { ts: string; author: string; title: string; id: string }): string {
  return `## ${o.ts} @${o.author} — ${o.title} {#${o.id}}`;
}

/** One change entry (contract 1.5), ready to append to changes.md. */
export function changeEntry(o: {
  ts?: string;
  author: string;
  id?: string;
  title?: string;
}): string {
  return `${[
    entryHeading({
      ts: o.ts ?? nowTs(),
      author: o.author,
      title: o.title ?? CHANGE_TITLE_PLACEHOLDER,
      id: o.id ?? newId("C"),
    }),
    "- kind: progress",
    "",
    "Say what changed, in the past tense.",
  ].join("\n")}\n`;
}

function decisionEntry(o: { author: string; now?: number }): string {
  return `${[
    entryHeading({
      ts: nowTs(o.now),
      author: o.author,
      title: DECISION_TITLE_PLACEHOLDER,
      id: newId("D"),
    }),
    "- status: proposed",
    "",
    "**Decision:** Say what was decided.",
    "**Because:** Give the reason.",
  ].join("\n")}\n`;
}

function learningEntry(o: { author: string; now?: number }): string {
  return `${[
    entryHeading({
      ts: nowTs(o.now),
      author: o.author,
      title: LEARNING_TITLE_PLACEHOLDER,
      id: newId("L"),
    }),
    "- kind: tip",
    "- promote: no",
    "",
    "Say the rule first. Then give the evidence in up to three lines.",
  ].join("\n")}\n`;
}

/**
 * `entry` added at the bottom of `existing` (entries are append-only), with one blank line
 * between. An empty or missing file starts with the `# Changes`-style H1.
 */
export function appendEntry(
  existing: string | null | undefined,
  entry: string,
  h1 = "# Changes",
): string {
  const text = existing ?? "";
  if (text.trim() === "") return `${h1}\n\n${entry}`;
  return `${text.replace(/\s+$/, "")}\n\n${entry}`;
}

// ---------------------------------------------------------------- other issue files

export function issueFileTemplate(name: IssueFileName, o: TemplateOpts, title = "Issue"): string {
  const ts = nowTs(o.now);
  switch (name) {
    case "goal.md":
      return goalTemplate({ id: newId("wf"), title, created: ts });
    case "plan.md":
      return `${[
        "---",
        `updated_at: ${ts}`,
        `updated_by: ${handleScalar(o.author)}`,
        "revision: 1",
        "---",
        "",
        "## Approach",
        "",
        "Say how the work gets done, in a few short sentences.",
        "",
        "## Phase 1: First steps",
        "",
        "### T-1: Write the first task",
        "- status: todo",
        "- lane: main",
        "- satisfies: SC-1",
        "",
        "Say what to build and how to know it works. Keep it self-contained.",
      ].join("\n")}\n`;
    case "current_state.md":
      return `${[
        "---",
        "summary: Work has not started.",
        `updated_at: ${ts}`,
        `updated_by: ${handleScalar(o.author)}`,
        "---",
        "",
        "## Next steps",
        "",
        "1. Read the goal and write the plan.",
      ].join("\n")}\n`;
    case "changes.md":
      return appendEntry(null, changeEntry({ ts, author: o.author }));
    case "decisions.md":
      return appendEntry(null, decisionEntry(o), "# Decisions");
    case "learnings.md":
      return appendEntry(null, learningEntry(o), "# Learnings");
  }
}

// ---------------------------------------------------------------- library items

/** The description a new library item starts with, selected so the first words replace it. */
export const LIBRARY_DESCRIPTION_PLACEHOLDER = "Use when …";

const LIBRARY_FOLDER_KIND: Record<string, string> = {
  patterns: "pattern",
  playbooks: "playbook",
  gotchas: "gotcha",
  decisions: "decision",
};

/** The first two sections of each kind (contract 1.4), each with a line saying what goes in it. */
const LIBRARY_SECTIONS: Record<string, [string, string][]> = {
  pattern: [
    ["Rule", "Say the rule in one or two sentences."],
    ["When to use", "Say when it applies, and when it does not."],
  ],
  playbook: [
    ["Overview", "Say what the playbook gets done."],
    ["Procedure", "1. Write the first step."],
  ],
  gotcha: [
    ["Symptom", "Say what goes wrong and how it shows."],
    ["Cause", "Say why it happens."],
  ],
  decision: [
    ["Decision", "Say what was decided."],
    ["Because", "Give the reason."],
  ],
};

/**
 * A new library item (contract 1.4): a draft with the keys the grammar requires. `source` points
 * at a placeholder entry, which shows as a dangling reference until the author names the real one.
 */
export function libraryTemplate(o: {
  kind: string;
  title: string;
  author: string;
  now?: number;
}): string {
  const sections = LIBRARY_SECTIONS[o.kind] ?? LIBRARY_SECTIONS.pattern;
  return `${[
    "---",
    `id: ${newId("lib")}`,
    `title: ${yamlScalar(o.title)}`,
    `kind: ${o.kind}`,
    `description: ${LIBRARY_DESCRIPTION_PLACEHOLDER}`,
    "status: draft",
    "tags: []",
    "applies_to: []",
    "source:",
    '  - "[[wf-xxxxx]]"',
    `authors: [${handleScalar(o.author)}]`,
    `created: ${nowTs(o.now).slice(0, 10)}`,
    "---",
    "",
    ...sections.flatMap(([heading, hint]) => [`## ${heading}`, "", hint, ""]),
  ].join("\n")}`.replace(/\n+$/, "\n");
}

/** Title-case a folder slug: "live-board-updates" → "Live board updates". */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Untitled";
}

/** The text a missing file at `path` should start with. Unknown names start empty. */
export function templateForPath(path: string, o: TemplateOpts): string {
  const name = basename(path);
  const folder = basename(path.slice(0, Math.max(0, path.lastIndexOf("/"))));
  if (name === "goal.md") return goalTemplate({ id: newId("wf"), title: titleFromSlug(folder) });
  if (isIssueFileName(name)) return issueFileTemplate(name, o);
  if (name === "_group.md") {
    return `${["---", `id: ${newId("g")}`, `title: ${yamlScalar(titleFromSlug(folder))}`, "---"].join("\n")}\n`;
  }
  const libraryDir = (o.libraryDir ?? "library").replace(/\/+$/, "");
  if (path.startsWith(`${libraryDir}/`) && name.endsWith(".md")) {
    return libraryTemplate({
      kind: LIBRARY_FOLDER_KIND[folder] ?? "pattern",
      title: titleFromSlug(name.replace(/\.md$/, "")),
      author: o.author,
      now: o.now,
    });
  }
  return "";
}

/** Text a title placeholder in a template can be found by, to select it in the editor. */
export function placeholderFor(path: string, libraryDir = "library"): string | undefined {
  const name = basename(path);
  if (path.startsWith(`${libraryDir.replace(/\/+$/, "")}/`) && name.endsWith(".md")) {
    return LIBRARY_DESCRIPTION_PLACEHOLDER;
  }
  if (name === "changes.md") return CHANGE_TITLE_PLACEHOLDER;
  if (name === "decisions.md") return DECISION_TITLE_PLACEHOLDER;
  if (name === "learnings.md") return LEARNING_TITLE_PLACEHOLDER;
  return undefined;
}
