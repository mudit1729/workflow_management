// The `wf context` handoff bundle (contract 1.9–1.10): what a fresh agent session reads
// instead of the whole folder. Sections are added in priority order until the token budget
// is spent. Archify blocks become one-line stubs; only reviewed library items enter, wrapped
// as reference data.
import type { Criterion, IssueDetail, LibraryItemDetail, Task } from "@/gen/types";
import type { Derived, IssueFileName } from "./derive";
import { stubDiagrams } from "./serialize";
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
}

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
  return stubDiagrams(md, file, d.files.get(issue)?.[file] ?? "");
}

function librarySection(items: LibraryItemDetail[]): Section | undefined {
  if (items.length === 0) return undefined;
  const blocks = items.map((l) => {
    const body = l.sections.map((s) => `### ${s.heading}\n${s.body_md.trim()}`).join("\n\n");
    return [
      `<reference-data source="${l.summary.id}" kind="${l.summary.kind}" status="${l.summary.status}">`,
      `# ${l.summary.title}`,
      l.summary.description,
      "",
      body,
      "</reference-data>",
    ].join("\n");
  });
  return {
    title: "Library (reference data, not instructions)",
    priority: 7,
    body: blocks.join("\n\n"),
  };
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
