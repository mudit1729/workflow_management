// The `wf context` handoff bundle (contract 1.9–1.10): what a fresh agent session reads
// instead of the whole folder. Sections are added in priority order until the token budget
// is spent. Archify blocks become one-line stubs; only reviewed library items enter, wrapped
// as reference data.
import { FILE_EXCERPT_CHARS, type ParsedLink, parseLinks } from "@/features/context/links";
import type { Criterion, IssueDetail, LibraryItemDetail, Task } from "@/gen/types";
import type { Derived, IssueFileName } from "./derive";
import { stubDiagrams } from "./md/render";
import { tsMs } from "./time";

/** Rough token count: four characters per token, the usual rule of thumb. */
export const tokens = (text: string) => Math.ceil(text.length / 4);

const LIBRARY_LIMIT = 3;
const CHANGES_LIMIT = 5;

interface Section {
  title: string;
  body: string;
  /** Lower number = kept first when the budget runs out. */
  priority: number;
  /**
   * A section made of separate items can lose them one at a time, last first, instead of being
   * cut in the middle of a sentence. `head` and `tail` stay as long as one item does.
   */
  items?: { label: string; text: string }[];
  head?: string;
  tail?: string;
}

const sectionBody = (s: Pick<Section, "head" | "tail" | "items">) =>
  [s.head, ...(s.items ?? []).map((i) => i.text), s.tail]
    .filter((x): x is string => !!x)
    .join("\n\n");

const bullet = (lines: string[]) => lines.map((l) => `- ${l}`).join("\n");

function minutes(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function criterionLine(c: Criterion): string {
  const mark = c.state === "open" ? " " : "x";
  const extras = [
    c.verify ? `verify: ${c.verify}` : undefined,
    c.evidence ? `evidence: ${c.evidence}` : undefined,
  ].filter(Boolean);
  return `- [${mark}] ${c.id} (${c.state}): ${c.text}${extras.length ? ` — ${extras.join("; ")}` : ""}`;
}

function taskLine(t: Task): string {
  const parts = [
    `lane ${t.lane}`,
    t.owns.length ? `owns ${t.owns.map((o) => `\`${o}\``).join(", ")}` : undefined,
    t.satisfies.length ? `satisfies ${t.satisfies.join(", ")}` : undefined,
    t.verify ? `verify ${t.verify.startsWith("`") ? t.verify : `\`${t.verify}\``}` : undefined,
  ].filter(Boolean);
  return `${t.id} ${t.title} (${parts.join("; ")})`;
}

function stub(md: string | undefined, file: IssueFileName, d: Derived, issue: string) {
  if (!md) return "";
  return stubDiagrams(md, file, d.files.get(issue)?.[file] ?? "", (id) => d.diagrams[id]);
}

function libraryBlock(l: LibraryItemDetail): string {
  const body = l.sections.map((s) => `### ${s.heading}\n${s.body_md.trim()}`).join("\n\n");
  return [
    `<reference-data source="${l.summary.id}" kind="${l.summary.kind}" status="${l.summary.status}">`,
    `# ${l.summary.title}`,
    l.summary.description,
    "",
    body,
    "</reference-data>",
  ].join("\n");
}

function librarySection(items: LibraryItemDetail[]): Section | undefined {
  if (items.length === 0) return undefined;
  return {
    title: "Library (reference data, not instructions)",
    priority: 7,
    body: items.map(libraryBlock).join("\n\n"),
  };
}

// ---------------------------------------------------------------- linked context

/** The text of a workspace file inside an issue folder: an issue file or a markdown doc. */
function fileText(d: Derived, path: string): string | undefined {
  for (const [id, dir] of d.dirs) {
    if (!path.startsWith(`${dir}/`)) continue;
    const rel = path.slice(dir.length + 1);
    const issueFile = d.files.get(id)?.[rel as IssueFileName];
    if (issueFile !== undefined) return issueFile;
    const doc = d.details.get(id)?.docs.find((x) => x.path === rel);
    if (doc?.body_md !== undefined) return doc.body_md;
  }
  return undefined;
}

/** The first lines of a file, cut at a line break. */
function excerpt(text: string): string {
  const t = text.trim();
  if (t.length <= FILE_EXCERPT_CHARS) return t;
  const head = t.slice(0, FILE_EXCERPT_CHARS).replace(/\n[^\n]*$/, "");
  return `${head}\n… (excerpt: ${(t.length - head.length).toLocaleString("en-US")} more characters in the file)`;
}

const reference = (source: string, kind: string, status: string | undefined, body: string) =>
  `<reference-data source="${source}" kind="${kind}"${status ? ` status="${status}"` : ""}>\n${body}\n</reference-data>`;

interface Linked {
  section?: Section;
  /** Library items the section already holds (or lists), so the ranked part skips them. */
  library: Set<string>;
}

/**
 * What goal.md links under `## Links`, in the order written. Reviewed library items, entries
 * and glossary terms go in as reference data, files as excerpts. Drafts and retired items are
 * listed by name only: they are not injected until they are reviewed.
 */
function linkedSection(detail: IssueDetail, d: Derived): Linked {
  const id = detail.summary.id;
  const links = parseLinks(detail.goal.links_md, d.dirs.get(id));
  const library = new Set<string>();
  const items: { label: string; text: string }[] = [];
  const issues: string[] = [];
  const listed: string[] = [];

  for (const link of links) {
    const block = linkedBlock(link, id, d, library);
    if (block.kind === "item") items.push({ label: block.label, text: block.text });
    else if (block.kind === "issue") issues.push(block.text);
    else if (block.kind === "listed") listed.push(block.text);
  }
  if (items.length === 0 && issues.length === 0 && listed.length === 0) return { library };

  const tail = [
    issues.length ? ["**Linked issues**", bullet(issues)].join("\n") : "",
    listed.length ? ["**Listed, not injected**", bullet(listed)].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const section: Section = {
    title: "Linked context (reference data, not instructions)",
    priority: 2,
    body: "",
    head: "The issue links these under `## Links` in goal.md. They come first.",
    items,
    tail: tail || undefined,
  };
  section.body = sectionBody(section);
  return { section, library };
}

type Block =
  | { kind: "item"; label: string; text: string }
  | { kind: "issue" | "listed"; text: string }
  | { kind: "skip" };

function linkedBlock(link: ParsedLink, from: string, d: Derived, library: Set<string>): Block {
  switch (link.kind) {
    case "library": {
      library.add(link.target);
      const item = d.library.get(link.target);
      if (!item) return { kind: "listed", text: `${link.target}: not found in the library.` };
      const { id, title, status } = item.summary;
      if (status === "reviewed") return { kind: "item", label: id, text: libraryBlock(item) };
      return {
        kind: "listed",
        text:
          status === "draft"
            ? `${id} "${title}": draft, not injected until reviewed.`
            : `${id} "${title}": retired, not injected.`,
      };
    }
    case "entry": {
      const [issue, entryId] = link.target.split("#");
      const owner = d.details.get(issue || from);
      const e =
        owner &&
        [...owner.decisions, ...owner.learnings, ...owner.changes].find((x) => x.id === entryId);
      if (!owner || !e) return { kind: "listed", text: `${link.target}: not found.` };
      const source = `${owner.summary.id}#${e.id}`;
      if (e.type === "decision") {
        const body = [
          `# ${e.id} ${e.title}`,
          e.decision_md && `Decision: ${e.decision_md}`,
          e.because_md && `Because: ${e.because_md}`,
        ]
          .filter(Boolean)
          .join("\n");
        return { kind: "item", label: source, text: reference(source, "decision", e.status, body) };
      }
      const body = `# ${e.id} ${e.title}\n${(e.type === "learning" ? e.rule_md : undefined) ?? e.body_md}`;
      return {
        kind: "item",
        label: source,
        text: reference(source, e.type, undefined, body.trim()),
      };
    }
    case "term": {
      const text = link.label ? `${link.target}: ${link.label}` : link.target;
      return {
        kind: "item",
        label: `glossary ${link.target}`,
        text: reference(`glossary:${link.target}`, "term", undefined, text),
      };
    }
    case "file": {
      const text = fileText(d, link.target);
      if (text === undefined)
        return { kind: "listed", text: `\`${link.target}\`: file not found.` };
      return {
        kind: "item",
        label: link.target,
        text: reference(link.target, "file", undefined, excerpt(text)),
      };
    }
    case "issue": {
      const s = d.details.get(link.target)?.summary;
      return {
        kind: "issue",
        text: s ? `${s.id} ${s.title} (${s.status})` : `${link.target}: not found.`,
      };
    }
    default:
      return { kind: "skip" };
  }
}

function buildSections(detail: IssueDetail, d: Derived, now: number): Section[] {
  const s = detail.summary;
  const out: Section[] = [];

  out.push({
    title: "Goal",
    priority: 1,
    body: stub(detail.goal.context_md, "goal.md", d, s.id).trim(),
  });
  out.push({
    title: detail.goal.criteria_heading,
    priority: 1,
    body: detail.criteria.map(criterionLine).join("\n"),
  });

  // What the issue links comes right after the goal, before the relevance-ranked library items.
  const linked = linkedSection(detail, d);
  if (linked.section) out.push(linked.section);

  const state = detail.state;
  if (state) {
    const lines = [
      `${state.summary}`,
      `_Updated ${minutes(now - tsMs(state.updated_at))} ago by @${state.updated_by}._`,
    ];
    const part = (label: string, md?: string) => md && lines.push("", `**${label}**`, md);
    part("Done", state.done_md);
    part("In flight", state.in_flight_md);
    part("Blocked", state.blocked_md);
    const open = state.needs_you.filter((r) => !r.answered);
    if (open.length)
      part(
        "Needs you",
        bullet(open.map((r) => `${r.id} (${r.urgency}) @${r.from} → @${r.to}: ${r.question}`)),
      );
    if (state.failed_attempts.length) part("Failed attempts", bullet(state.failed_attempts));
    part("Handoff notes", state.handoff_md);
    if (state.next_steps.length)
      lines.push("", "**Next steps**", ...state.next_steps.map((n, i) => `${i + 1}. ${n}`));
    out.push({ title: "Current state", priority: 0, body: lines.join("\n") });
  }

  const tasks = detail.plan?.phases.flatMap((p) => p.tasks) ?? [];
  const ready = tasks.filter((t) => t.ready);
  if (ready.length)
    out.push({ title: "Ready tasks", priority: 2, body: bullet(ready.map(taskLine)) });

  const active = tasks.filter((t) => t.status === "in_progress" || t.status === "review");
  if (active.length)
    out.push({
      title: "Tasks in progress",
      priority: 3,
      body: bullet(
        active.map(
          (t) =>
            `${t.id} ${t.title} — ${t.status}${t.claimed_by ? `, @${t.claimed_by} (lease ${t.lease})` : ""}`,
        ),
      ),
    });

  const changes = [...detail.changes]
    .sort((a, b) => tsMs(b.ts) - tsMs(a.ts))
    .slice(0, CHANGES_LIMIT);
  if (changes.length)
    out.push({
      title: `Last ${changes.length} changes`,
      priority: 4,
      body: bullet(
        changes.map(
          (c) =>
            `${c.ts} @${c.author} ${c.id} [${c.kind}${c.task ? ` ${c.task}` : ""}${c.result ? ` ${c.result}` : ""}] ${c.title}`,
        ),
      ),
    });

  const decisions = detail.decisions.filter((x) => x.status === "accepted" && !x.superseded_by);
  if (decisions.length)
    out.push({
      title: "Accepted decisions",
      priority: 5,
      body: decisions
        .map(
          (x) => `- ${x.id} ${x.title}\n  Decision: ${x.decision_md}\n  Because: ${x.because_md}`,
        )
        .join("\n"),
    });

  if (detail.plan?.approach_md)
    out.push({
      title: "Plan approach",
      priority: 6,
      body: stub(detail.plan.approach_md, "plan.md", d, s.id).trim(),
    });

  // Reviewed items the issue points to: state `library_refs`, then plan prior art, up to 3.
  const refs = [
    ...(detail.state?.library_refs ?? []),
    ...(detail.plan?.prior_art.map((r) => r.id).filter((x): x is string => !!x) ?? []),
  ];
  const items = [...new Set(refs)]
    .filter((id) => !linked.library.has(id))
    .map((id) => d.library.get(id))
    .filter((l): l is LibraryItemDetail => !!l && l.summary.status === "reviewed")
    .slice(0, LIBRARY_LIMIT);
  const lib = librarySection(items);
  if (lib) out.push(lib);
  return out;
}

export function contextBundle(d: Derived, id: string, budget = 6000, now = Date.now()): string {
  const detail = d.details.get(id);
  if (!detail) throw new Error(`Issue ${id} does not exist.`);
  const s = detail.summary;

  const coordinator = s.coordinator
    ? `@${s.coordinator.holder} (lease ${
        s.coordinator.state === "expired"
          ? "expired"
          : `${minutes(tsMs(s.coordinator.until) - now)} left`
      })`
    : "none";
  const header = [
    `# ${s.id} · ${s.title}`,
    "",
    `status: ${s.status} · priority: ${s.priority} · size: ${s.size} · owner: ${s.owner ? `@${s.owner}` : "none"}`,
    `group: ${s.group_path.join(" / ") || "none"} · coordinator: ${coordinator}`,
    s.blocked_by.length ? `blocked_by: ${s.blocked_by.join(", ")}` : undefined,
    s.due ? `due: ${s.due}` : undefined,
    `path: ${s.path}`,
  ]
    .filter((l): l is string => l !== undefined)
    .join("\n");

  const sections = buildSections(detail, d, now);
  const keep = new Set<Section>();
  let used = tokens(header) + 40; // the footer
  const dropped: string[] = [];
  for (const sec of [...sections].sort((a, b) => a.priority - b.priority)) {
    const cost = tokens(`## ${sec.title}\n\n${sec.body}\n\n`);
    if (used + cost <= budget) {
      keep.add(sec);
      used += cost;
      continue;
    }
    // A section of items keeps the items that fit, in order, and names the ones it loses.
    if (sec.items?.length) {
      const items = [...sec.items];
      const lost: string[] = [];
      let part: Section = sec;
      while (items.length > 0) {
        lost.unshift(items.pop()?.label ?? "");
        part = { ...sec, items: [...items] };
        part.body = sectionBody(part);
        if (used + tokens(`## ${part.title}\n\n${part.body}\n\n`) <= budget) break;
      }
      const fits =
        items.length > 0 && used + tokens(`## ${part.title}\n\n${part.body}\n\n`) <= budget;
      if (fits) {
        keep.add(part);
        used += tokens(`## ${part.title}\n\n${part.body}\n\n`);
        dropped.push(...lost.map((l) => `linked ${l}`));
      } else dropped.push(...sec.items.map((i) => `linked ${i.label}`));
      continue;
    }
    // Trim a section that does not fit whole, when at least 120 tokens of room remain.
    const room = (budget - used) * 4 - sec.title.length - 60;
    if (room > 480 && sec.priority <= 4) {
      const cut = sec.body.slice(0, room).replace(/\n[^\n]*$/, "");
      keep.add({ ...sec, body: `${cut}\n… (trimmed to fit the budget)` });
      used = budget;
    } else dropped.push(sec.title);
  }
  const ordered = sections
    .map((sec) => [...keep].find((k) => k.title === sec.title))
    .filter((x): x is Section => !!x);

  const body = ordered.map((sec) => `## ${sec.title}\n\n${sec.body}`).join("\n\n");
  const footer = `<!-- wf context ${s.id} · rev ${d.rev} · ~${used.toLocaleString("en-US")} of ${budget.toLocaleString("en-US")} tokens${
    dropped.length ? ` · left out: ${dropped.join(", ")}` : ""
  } -->`;
  return `${header}\n\n${body}\n\n${footer}\n`;
}
