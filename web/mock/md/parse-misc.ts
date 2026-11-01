// The smaller files: library items, `_group.md`, glossary.md, authors.md, workflow.toml.
import { parse as parseToml, TomlError } from "smol-toml";
import type {
  Author,
  AuthorKind,
  GlossaryTerm,
  LibraryKind,
  LibrarySection,
  LibraryStatus,
  Runtime,
  Severity,
  WorkspaceConfig,
} from "@/gen/types";
import type { GroupSrc, LibrarySrc } from "../source";
import { hashColor } from "../util";
import { blockMeta, h2Sections, oneOf } from "./blocks";
import { anchorKeys, asHandle, asInt, asList, asString, readFrontmatter } from "./frontmatter";
import { flowReporter, parseFlow } from "./parse-flow";
import { bare, fenceMask, joinBlock, splitList } from "./text";
import type { FileCtx } from "./types";

// ---------------------------------------------------------------- library item

export const LIBRARY_KINDS: readonly LibraryKind[] = ["pattern", "playbook", "gotcha", "decision"];
const LIBRARY_STATUSES: readonly LibraryStatus[] = ["draft", "reviewed", "retired"];
const LIBRARY_KEYS = new Set([
  "id",
  "title",
  "kind",
  "description",
  "status",
  "tags",
  "applies_to",
  "source",
  "authors",
  "reviewed_by",
  "created",
  "last_reviewed",
  "review_after",
  "superseded_by",
]);
/** `[[ref]]` list from YAML: a flow list written without quotes parses as nested lists. */
function refList(v: unknown): string[] {
  if (!Array.isArray(v)) return asList(v);
  return v.map((x) => {
    if (Array.isArray(x)) return `[[${x.flat(2).join("")}]]`;
    return asString(x) ?? "";
  });
}

/** The folder name of a library kind: `patterns`, `gotchas`… */
export const kindFolder = (k: LibraryKind) => `${k}s`;

export function parseLibraryItem(
  ctx: FileCtx,
  slug: string,
  folderKind: LibraryKind | undefined,
  fallbackId: string,
  today: string,
): LibrarySrc {
  const L = ctx.L;
  const fm = readFrontmatter(L);
  const mask = fenceMask(L.lines);
  anchorKeys(ctx, fm);
  ctx.anchor("item", 0, L.lines.length - 1);
  if (fm.problem)
    ctx.report(
      "F001",
      "error",
      fm.problem.line - 1,
      fm.problem.message,
      fm.problem.fix,
      fm.problem.col - 1,
    );
  const d = fm.data;
  const line = (k: string) => fm.keyLine[k] ?? 0;
  for (const k of Object.keys(d))
    if (!LIBRARY_KEYS.has(k))
      ctx.report(
        "F006",
        "info",
        line(k),
        `Unknown frontmatter key \`${k}\`. wf keeps it and shows it.`,
      );
  for (const k of ["id", "title", "kind", "description", "source", "authors", "created"])
    if (
      d[k] === undefined ||
      d[k] === null ||
      d[k] === "" ||
      (Array.isArray(d[k]) && (d[k] as unknown[]).length === 0)
    )
      ctx.report(
        "F002",
        "error",
        0,
        `Required frontmatter key \`${k}\` is missing.`,
        `Add \`${k}: …\` to the frontmatter.`,
      );

  let kind = oneOf(
    ctx,
    line("kind"),
    "kind",
    asString(d.kind),
    LIBRARY_KINDS,
    folderKind ?? "pattern",
  );
  if (folderKind && folderKind !== kind) {
    ctx.report(
      "F005",
      "warn",
      line("kind"),
      `\`kind: ${kind}\` does not match the folder \`library/${kindFolder(folderKind)}/\`.`,
      `Move the file to \`library/${kindFolder(kind)}/\`, or change \`kind\`.`,
    );
    kind = folderKind;
  }

  const created = asString(d.created) ?? today;
  const lib: LibrarySrc = {
    id: asString(d.id) ?? fallbackId,
    slug,
    title: asString(d.title) ?? slug,
    kind,
    description: asString(d.description) ?? "",
    status: oneOf(ctx, line("status"), "status", asString(d.status), LIBRARY_STATUSES, "draft"),
    tags: asList(d.tags),
    applies_to: asList(d.applies_to),
    source: refList(d.source),
    authors: asList(d.authors).map(bare),
    created,
    sections: [],
  };
  const reviewedBy = asHandle(d.reviewed_by);
  if (reviewedBy) lib.reviewed_by = reviewedBy;
  const lastReviewed = asString(d.last_reviewed);
  if (lastReviewed) lib.last_reviewed = lastReviewed;
  // A missing `review_after` stays missing: such an item is never reported as overdue (Q013).
  const reviewAfter = asString(d.review_after);
  if (reviewAfter) lib.review_after = reviewAfter;
  const superseded = asString(d.superseded_by);
  if (superseded) lib.superseded_by = superseded;

  const sections: LibrarySection[] = [];
  for (const s of h2Sections(L, mask, fm.bodyStart)) {
    sections.push({ heading: s.title.trim(), body_md: joinBlock(L.lines.slice(s.start, s.end)) });
  }
  lib.sections = sections;
  return lib;
}

// ---------------------------------------------------------------- _group.md

const GROUP_KEYS = new Set([
  "id",
  "title",
  "goal",
  "owner",
  "color",
  "order",
  "definition_of_done",
]);

export function parseGroupFile(
  ctx: FileCtx,
  folder: string,
  fallbackId: string,
): Pick<GroupSrc, "id" | "title" | "goal" | "owner" | "color" | "order" | "definition_of_done"> {
  const fm = readFrontmatter(ctx.L);
  anchorKeys(ctx, fm);
  ctx.anchor("group", 0, ctx.L.lines.length - 1);
  if (fm.problem)
    ctx.report(
      "F001",
      "error",
      fm.problem.line - 1,
      fm.problem.message,
      fm.problem.fix,
      fm.problem.col - 1,
    );
  const d = fm.data;
  for (const k of Object.keys(d))
    if (!GROUP_KEYS.has(k))
      ctx.report(
        "F006",
        "info",
        fm.keyLine[k] ?? 0,
        `Unknown frontmatter key \`${k}\`. wf keeps it and shows it.`,
      );
  if (!asString(d.id))
    ctx.report(
      "F002",
      "error",
      0,
      "Required frontmatter key `id` is missing.",
      "Add `id: g-xxxxx`.",
    );
  const out: ReturnType<typeof parseGroupFile> = {
    id: asString(d.id) ?? fallbackId,
    title: asString(d.title) ?? folder,
    order: asInt(d.order) ?? 0,
  };
  const goal = asString(d.goal);
  if (goal) out.goal = goal;
  const owner = asHandle(d.owner);
  if (owner) out.owner = owner;
  const color = asInt(d.color);
  if (color !== undefined) {
    if (color < 1 || color > 8)
      ctx.report(
        "F003",
        "error",
        fm.keyLine.color ?? 0,
        "`color` must be 1–8.",
        "Pick a color from 1 to 8.",
      );
    else out.color = color;
  }
  const dod = asList(d.definition_of_done);
  if (dod.length) out.definition_of_done = dod;
  return out;
}

// ---------------------------------------------------------------- glossary.md

const TERM_KEYS = new Set(["kind", "means", "avoid", "see"]);
const TERM_KINDS = ["noun", "verb", "adj"] as const;

export function parseGlossary(ctx: FileCtx): GlossaryTerm[] {
  const L = ctx.L;
  const mask = fenceMask(L.lines);
  const out: GlossaryTerm[] = [];
  for (const s of h2Sections(L, mask)) {
    const term = s.title.trim();
    if (out.some((t) => t.term === term))
      ctx.report("F004", "error", s.heading, `Duplicate term \`${term}\`.`);
    const { items } = blockMeta(ctx, s.heading, s.end, TERM_KEYS);
    const m: Record<string, string> = {};
    for (const it of items) {
      if (!TERM_KEYS.has(it.key)) {
        ctx.report(
          "F006",
          "info",
          it.line,
          `Unknown meta key \`${it.key}\` in \`${term}\`. wf keeps it.`,
        );
        continue;
      }
      if (!(it.key in m)) m[it.key] = it.value;
    }
    if (!m.means)
      ctx.report(
        "F002",
        "error",
        s.heading,
        `Term \`${term}\` has no \`means:\` line.`,
        "Add `- means: …`.",
      );
    out.push({
      term,
      kind: oneOf(ctx, s.heading + 1, "kind", m.kind, TERM_KINDS, "noun"),
      means: m.means ?? "",
      avoid: splitList(m.avoid ?? ""),
      see: splitList(m.see ?? ""),
    });
    ctx.anchor(term, s.heading, Math.max(s.heading, s.end - 1));
  }
  return out;
}

// ---------------------------------------------------------------- authors.md

const AUTHOR_KEYS = new Set(["kind", "name", "runtime", "model", "color", "lanes", "max_leases"]);
const AUTHOR_KINDS: readonly AuthorKind[] = ["human", "agent"];
const RUNTIMES: readonly Runtime[] = ["claude-code", "codex", "cursor", "other"];

export function parseAuthors(ctx: FileCtx): Author[] {
  const L = ctx.L;
  const mask = fenceMask(L.lines);
  const out: Author[] = [];
  for (const s of h2Sections(L, mask)) {
    const handle = bare(s.title.trim());
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(handle)) {
      ctx.report(
        "F005",
        "warn",
        s.heading,
        `\`${s.title}\` is not an author heading.`,
        "Write it as `## @handle`.",
      );
      continue;
    }
    if (out.some((a) => a.handle === handle))
      ctx.report("F004", "error", s.heading, `Duplicate author @${handle}.`);
    const { items } = blockMeta(ctx, s.heading, s.end, AUTHOR_KEYS);
    const m: Record<string, string> = {};
    for (const it of items) {
      if (!AUTHOR_KEYS.has(it.key)) {
        ctx.report(
          "F006",
          "info",
          it.line,
          `Unknown meta key \`${it.key}\` in @${handle}. wf keeps it.`,
        );
        continue;
      }
      if (!(it.key in m)) m[it.key] = it.value;
    }
    if (!m.kind)
      ctx.report(
        "F002",
        "error",
        s.heading,
        `Author @${handle} has no \`kind:\` line.`,
        "Add `- kind: human` or `- kind: agent`.",
      );
    const color = Number(m.color);
    const author: Author = {
      handle,
      kind: oneOf(ctx, s.heading + 1, "kind", m.kind, AUTHOR_KINDS, "agent"),
      color: Number.isInteger(color) && color >= 1 && color <= 8 ? color : hashColor(handle),
      lanes: splitList(m.lanes ?? ""),
      max_leases: Number.isInteger(Number(m.max_leases)) && m.max_leases ? Number(m.max_leases) : 3,
    };
    if (m.name) author.name = m.name;
    if (m.runtime)
      author.runtime = oneOf(ctx, s.heading + 1, "runtime", m.runtime, RUNTIMES, "other");
    if (m.model) author.model = m.model;
    out.push(author);
    ctx.anchor(`@${handle}`, s.heading, Math.max(s.heading, s.end - 1));
  }
  return out;
}

// ---------------------------------------------------------------- workflow.toml

type Table = Record<string, unknown>;
const TOML_KEYS: Record<string, readonly string[]> = {
  "": [
    "wf_format",
    "workspace",
    "leases",
    "staleness",
    "context",
    "archify",
    "lint",
    "server",
    "flow",
  ],
  workspace: ["name", "issues_dir", "library_dir", "id_prefix"],
  leases: ["minutes"],
  staleness: ["issue_hours", "task_hours"],
  context: ["budget_tokens", "changes", "library"],
  archify: ["home", "quality", "concurrency", "timeout_s"],
  lint: ["disable", "severity"],
  server: ["port", "author"],
};

export interface ConfigParse {
  config: WorkspaceConfig;
  lint: { disable: string[]; severity: Record<string, Severity> };
  /** `[server] author` was not set. */
  authorMissing: boolean;
}

const asTable = (v: unknown): Table =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Table) : {};
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v !== "" ? v : fallback;

export function parseConfig(ctx: FileCtx | undefined, text: string | undefined): ConfigParse {
  let toml: Table = {};
  if (text !== undefined && ctx) {
    try {
      toml = parseToml(text) as Table;
    } catch (err) {
      const e = err instanceof TomlError ? err : undefined;
      ctx.report(
        "F001",
        "error",
        (e?.line ?? 1) - 1,
        `Invalid TOML at line ${e?.line ?? 1}, column ${e?.column ?? 1}: ${(e?.message ?? String(err)).split("\n")[0]}`,
        "Fix the TOML syntax. wf uses the defaults until then.",
        (e?.column ?? 1) - 1,
      );
    }
    if (typeof toml.wf_format === "number" && toml.wf_format !== 1) {
      ctx.report(
        "F007",
        "warn",
        lineOfKey(ctx, "wf_format"),
        `wf_format is ${toml.wf_format}, but this wf reads format 1.`,
        "Set `wf_format = 1`, or upgrade wf.",
      );
    }
    reportUnknownKeys(ctx, toml);
  }
  // [flow] has its own rules (F018, F019): the steps and options are not a flat list of keys.
  const flow = parseFlow(toml.flow, ctx ? flowReporter(ctx) : undefined, toml);
  const ws = asTable(toml.workspace);
  const leases = asTable(toml.leases);
  const stale = asTable(toml.staleness);
  const lint = asTable(toml.lint);
  const server = asTable(toml.server);
  const sev = asTable(lint.severity);
  const severity: Record<string, Severity> = {};
  for (const [k, v] of Object.entries(sev))
    if (v === "error" || v === "warn" || v === "info") severity[k] = v;
  const config: WorkspaceConfig = {
    name: str(ws.name, "wf"),
    wf_format: 1,
    id_prefix: str(ws.id_prefix, "wf"),
    issues_dir: str(ws.issues_dir, "issues"),
    library_dir: str(ws.library_dir, "library"),
    leases_minutes: num(leases.minutes, 60),
    staleness: { issue_hours: num(stale.issue_hours, 24), task_hours: num(stale.task_hours, 4) },
    author: str(server.author, ""),
    archify: "unavailable",
    flow,
  };
  return {
    config,
    authorMissing: config.author === "",
    lint: {
      disable: Array.isArray(lint.disable) ? lint.disable.filter((x) => typeof x === "string") : [],
      severity,
    },
  };
}

function lineOfKey(ctx: FileCtx, key: string): number {
  const i = ctx.L.lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  return Math.max(i, 0);
}

function reportUnknownKeys(ctx: FileCtx, toml: Table): void {
  for (const [k, v] of Object.entries(toml)) {
    if (!TOML_KEYS[""].includes(k)) {
      ctx.report(
        "F006",
        "info",
        lineOfKey(ctx, k),
        `Unknown key \`${k}\` in workflow.toml. wf keeps it.`,
      );
      continue;
    }
    const allowed = TOML_KEYS[k];
    if (k === "flow" || !allowed || typeof v !== "object" || v === null || Array.isArray(v))
      continue;
    for (const sub of Object.keys(v as Table))
      if (!allowed.includes(sub))
        ctx.report(
          "F006",
          "info",
          lineOfKey(ctx, sub),
          `Unknown key \`${k}.${sub}\` in workflow.toml. wf keeps it.`,
        );
  }
}
