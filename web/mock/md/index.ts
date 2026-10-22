// The markdown layer: `loadWorkspace` reads a wf workspace (a map of path → text) the way the
// daemon does and returns the sources `derive()` needs, plus the texts, the F and S lint
// findings, the anchors and the diagrams. It never throws: bad input becomes findings.
import type { Diagnostic, Diagram, IssueId, LibId, Severity } from "@/gen/types";
import type {
  DocSrc,
  GroupSrc,
  IssueSrc,
  LibrarySrc,
  PlanSrc,
  StateSrc,
  WorldSrc,
} from "../source";
import { toDate, toTs } from "../time";
import { hashId } from "../util";
import { checkWorkspace } from "./checks";
import { lintCommon, lintIssueFile, lintLibraryFile } from "./lint";
import { type GoalParse, parseGoal } from "./parse-goal";
import { parseChanges, parseDecisions, parseLearnings } from "./parse-log";
import {
  kindFolder,
  LIBRARY_KINDS,
  parseAuthors,
  parseConfig,
  parseGlossary,
  parseGroupFile,
  parseLibraryItem,
} from "./parse-misc";
import { parsePlan } from "./parse-plan";
import { parseState } from "./parse-state";
import { baseName as base, isIgnored, normPath as norm, parentDir as parentOf } from "./paths";
import { toLines } from "./text";
import {
  F_SEVERITY,
  FileCtx,
  ISSUE_FILES,
  type IssueFileName,
  type IssueTexts,
  type LoadedWorkspace,
  type LoadOptions,
} from "./types";

export { isIgnored } from "./paths";
export { RECORDED_AT } from "./recorded-at";
export type {
  Anchor,
  Finding,
  IssueFileName,
  IssueTexts,
  LoadedWorkspace,
  LoadOptions,
} from "./types";
export { ISSUE_FILES } from "./types";

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function unreadableGoal(ctx: FileCtx, folder: string, id: string, now: number): GoalParse {
  return {
    front: {
      id,
      title: folder,
      status: "backlog",
      priority: "none",
      size: "m",
      labels: [],
      blocked_by: [],
      created: toTs(now),
    },
    context: ctx.L.text,
    criteria: [],
    blocks: [],
  };
}

function safe<T>(ctx: FileCtx, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    ctx.report(
      "F005",
      "warn",
      0,
      `Could not read this file: ${err instanceof Error ? err.message : String(err)}`,
    );
    return fallback;
  }
}

// ---------------------------------------------------------------- the loader

/**
 * Read a workspace: `files` maps workspace-relative paths to text. Never throws. A file that
 * cannot be read becomes a finding on that file; a failure in the loader itself returns an
 * empty workspace with one finding on `workflow.toml`.
 */
export function loadWorkspace(
  input: Record<string, string>,
  opts: LoadOptions = {},
): LoadedWorkspace {
  try {
    return load(input, opts);
  } catch (err) {
    const message = `Could not read the workspace: ${err instanceof Error ? err.message : String(err)}`;
    const ctx = new FileCtx("workflow.toml", toLines(input["workflow.toml"] ?? ""));
    ctx.report("F005", "warn", 0, message);
    const cfg = parseConfig(undefined, undefined);
    return {
      world: { config: cfg.config, authors: [], groups: [], issues: [], library: [], glossary: [] },
      texts: {},
      libraryTexts: {},
      issueDirs: {},
      groupDirs: {},
      libraryPaths: {},
      diagnostics: {
        "workflow.toml": ctx.findings.map((f) => ({ ...f, file: "workflow.toml" })),
      },
      anchors: {},
      diagrams: {},
      frontmatter: {},
      assets: {},
      lint: cfg.lint,
      recognised: [],
      ignored: Object.keys(input),
    };
  }
}

function load(input: Record<string, string>, opts: LoadOptions): LoadedWorkspace {
  const now = opts.now ?? Date.now();
  const text: Record<string, string> = {};
  const ignored: string[] = [];
  for (const [p, t] of Object.entries(input)) {
    const path = norm(p);
    if (isIgnored(path)) ignored.push(path);
    else text[path] = t;
  }
  const binary: Record<string, { url: string; bytes: number }> = {};
  for (const [p, b] of Object.entries(opts.binary ?? {})) {
    const path = norm(p);
    if (!isIgnored(path)) binary[path] = b;
  }

  const ctxs = new Map<string, FileCtx>();
  const ctxOf = (path: string): FileCtx => {
    let c = ctxs.get(path);
    if (!c) {
      c = new FileCtx(path, toLines(text[path] ?? ""));
      ctxs.set(path, c);
    }
    return c;
  };
  const recognised = new Set<string>();

  // ---- config, authors, glossary
  const cfgCtx = "workflow.toml" in text ? ctxOf("workflow.toml") : undefined;
  if (cfgCtx) recognised.add("workflow.toml");
  const cfg = parseConfig(cfgCtx, text["workflow.toml"]);
  const issuesDir = cfg.config.issues_dir.replace(/\/+$/, "");
  const libraryDir = cfg.config.library_dir.replace(/\/+$/, "");

  let authors: ReturnType<typeof parseAuthors> = [];
  if ("authors.md" in text) {
    const c = ctxOf("authors.md");
    recognised.add("authors.md");
    authors = safe(c, () => parseAuthors(c), []);
  }
  let glossary: ReturnType<typeof parseGlossary> = [];
  if ("glossary.md" in text) {
    const c = ctxOf("glossary.md");
    recognised.add("glossary.md");
    glossary = safe(c, () => parseGlossary(c), []);
  }
  if (cfg.authorMissing) {
    cfg.config.author =
      authors.find((a) => a.kind === "human")?.handle ?? authors[0]?.handle ?? "me";
  }

  // ---- folder structure
  const allPaths = [...Object.keys(text), ...Object.keys(binary)];
  const underIssues = (p: string) => p.startsWith(`${issuesDir}/`);
  const issueDirSet = new Set(
    Object.keys(text)
      .filter((p) => underIssues(p) && base(p) === "goal.md")
      .map(parentOf)
      .filter((d) => d !== issuesDir),
  );
  // Issues are leaves: a folder inside an issue folder is never scanned.
  const insideIssue = (dir: string) => {
    for (let d = parentOf(dir); d.startsWith(`${issuesDir}/`); d = parentOf(d))
      if (issueDirSet.has(d)) return true;
    return false;
  };
  const issueDirs = [...issueDirSet].filter((d) => !insideIssue(d)).sort();

  const groupDirSet = new Set<string>([issuesDir]);
  const addWithAncestors = (dir: string) => {
    for (let d = dir; d.startsWith(`${issuesDir}/`); d = parentOf(d)) groupDirSet.add(d);
  };
  for (const d of issueDirs) addWithAncestors(parentOf(d));
  for (const p of Object.keys(text)) {
    if (!underIssues(p) && p !== `${issuesDir}/_group.md`) continue;
    if (base(p) !== "_group.md") continue;
    const dir = parentOf(p);
    if (issueDirSet.has(dir) || insideIssue(dir)) continue;
    addWithAncestors(dir);
  }
  const groupDirs = [...groupDirSet].sort();

  // ---- groups
  const groups: GroupSrc[] = [];
  const groupIdOfDir = new Map<string, string>();
  const takenGroupIds = new Set<string>();
  for (const dir of groupDirs) {
    const slug = base(dir);
    const gpath = `${dir}/_group.md`;
    const fallbackId = `g-${hashId(dir)}`;
    const isRoot = dir === issuesDir;
    let g: GroupSrc;
    if (gpath in text) {
      const c = ctxOf(gpath);
      recognised.add(gpath);
      const parsed = safe(c, () => parseGroupFile(c, slug, fallbackId), {
        id: fallbackId,
        title: slug,
        order: 0,
      });
      g = {
        ...parsed,
        slug,
        parent: isRoot ? undefined : groupIdOfDir.get(parentOf(dir)),
        implicit: false,
      };
    } else {
      g = {
        id: fallbackId,
        title: isRoot ? capitalize(slug) : slug,
        slug,
        parent: isRoot ? undefined : groupIdOfDir.get(parentOf(dir)),
        order: 0,
        implicit: true,
      };
    }
    if (takenGroupIds.has(g.id)) {
      if (gpath in text)
        ctxOf(gpath).report(
          "F004",
          "error",
          ctxOf(gpath).anchors.id ? ctxOf(gpath).anchors.id.line - 1 : 0,
          `Duplicate group id ${g.id}.`,
          "Give the group a new id.",
        );
      g.id = fallbackId;
    }
    takenGroupIds.add(g.id);
    groupIdOfDir.set(dir, g.id);
    groups.push(g);
  }
  // Implicit groups have no `order` in a file: they sort after the explicit siblings.
  const byParent = new Map<string | undefined, GroupSrc[]>();
  for (const g of groups) byParent.set(g.parent, [...(byParent.get(g.parent) ?? []), g]);
  for (const sibs of byParent.values()) {
    let next = Math.max(0, ...sibs.filter((g) => !g.implicit).map((g) => g.order));
    for (const g of sibs
      .filter((x) => x.implicit && x.parent)
      .sort((a, b) => a.slug.localeCompare(b.slug)))
      g.order = ++next;
  }

  // ---- issues
  const takenDiagrams = new Set<string>();
  const diagrams: Record<string, Diagram> = {};
  const texts: Record<IssueId, IssueTexts> = {};
  const issueDirOf: Record<IssueId, string> = {};
  const frontmatter: LoadedWorkspace["frontmatter"] = {};
  const issues: IssueSrc[] = [];
  const parsed = new Map<
    IssueId,
    {
      dir: string;
      goal: { ctx: FileCtx; parse: GoalParse };
      plan?: { ctx: FileCtx; plan: PlanSrc };
      state?: { ctx: FileCtx; state: StateSrc };
      src: IssueSrc;
    }
  >();
  const takenIssueIds = new Set<string>();

  for (const dir of issueDirs) {
    const slug = base(dir);
    const goalPath = `${dir}/goal.md`;
    recognised.add(goalPath);
    const gctx = ctxOf(goalPath);
    const fallbackId = `${cfg.config.id_prefix}-${hashId(dir)}`;
    // A goal.md that cannot be parsed still shows: the issue holds the raw text as its context.
    const goal = safe(
      gctx,
      () => parseGoal(gctx, { folder: slug, fallbackId, now, takenDiagrams }),
      unreadableGoal(gctx, slug, fallbackId, now),
    );
    if (takenIssueIds.has(goal.front.id)) {
      gctx.report(
        "F004",
        "error",
        gctx.anchors.id ? gctx.anchors.id.line - 1 : 0,
        `Duplicate issue id ${goal.front.id}.`,
        "Give the issue a new id.",
      );
      goal.front.id = fallbackId;
    }
    takenIssueIds.add(goal.front.id);
    const id = goal.front.id;
    if (`${dir}/_group.md` in text) {
      gctx.report(
        "F008",
        "error",
        0,
        "This folder has both `goal.md` and `_group.md`. wf treats it as an issue and ignores the group file.",
        "Move the group file out, or split the issue into a group (`wf split-issue`).",
      );
    }
    issueDirOf[id] = dir;
    const t: IssueTexts = { "goal.md": text[goalPath] };

    const src: IssueSrc = {
      slug,
      group: groupIdOfDir.get(parentOf(dir)) as string,
      goal: goal.front,
      context: goal.context,
      criteria_heading: goal.criteria_heading,
      criteria: goal.criteria,
      out_of_scope: goal.out_of_scope,
      links: goal.links,
      yaml_error: goal.yaml_error,
      changes: [],
      decisions: [],
      learnings: [],
    };
    for (const b of goal.blocks) diagrams[b.id] = b.diagram;
    frontmatter[id] = { ok: !goal.problem, line: goal.problem?.line };

    const entry: NonNullable<ReturnType<typeof parsed.get>> = {
      dir,
      goal: { ctx: gctx, parse: goal },
      src,
    };

    const author = cfg.config.author;
    const planPath = `${dir}/plan.md`;
    if (planPath in text) {
      recognised.add(planPath);
      t["plan.md"] = text[planPath];
      const c = ctxOf(planPath);
      const r = safe(
        c,
        () =>
          parsePlan(c, {
            now,
            fallbackAuthor: goal.front.claimed_by ?? goal.front.owner ?? author,
            takenDiagrams,
          }),
        undefined,
      );
      if (r) {
        src.plan = r.plan;
        for (const b of r.blocks) diagrams[b.id] = b.diagram;
        entry.plan = { ctx: c, plan: r.plan };
      }
    }
    const statePath = `${dir}/current_state.md`;
    if (statePath in text) {
      recognised.add(statePath);
      t["current_state.md"] = text[statePath];
      const c = ctxOf(statePath);
      const s = safe(c, () => parseState(c, { now, author }), undefined);
      if (s) {
        src.state = s;
        entry.state = { ctx: c, state: s };
      }
    }
    const logs = [
      ["changes.md", parseChanges, "changes"],
      ["decisions.md", parseDecisions, "decisions"],
      ["learnings.md", parseLearnings, "learnings"],
    ] as const;
    for (const [name, parse, field] of logs) {
      const p = `${dir}/${name}`;
      if (!(p in text)) continue;
      recognised.add(p);
      t[name] = text[p];
      const c = ctxOf(p);
      const entries = safe(c, () => parse(c, { now }) as never[], []);
      (src[field] as unknown[]) = entries;
    }

    // Docs: every other file in the folder.
    const docs: DocSrc[] = [];
    const prefix = `${dir}/`;
    for (const p of Object.keys(text)) {
      if (!p.startsWith(prefix)) continue;
      const rel = p.slice(prefix.length);
      if (!rel.includes("/") && (ISSUE_FILES as readonly string[]).includes(rel)) continue;
      if (base(rel) === "_group.md" && !rel.includes("/")) continue;
      const body = text[p];
      const h1 = /^# +(.+?)\s*$/m.exec(body)?.[1];
      docs.push({ path: rel, ...(h1 && rel.endsWith(".md") ? { title: h1 } : {}), body });
      recognised.add(p);
    }
    for (const [p, b] of Object.entries(binary)) {
      if (p.startsWith(prefix)) docs.push({ path: p.slice(prefix.length), bytes: b.bytes });
    }
    docs.sort((a, b) => {
      const rank = (d: DocSrc) => (d.path.endsWith(".md") ? 0 : d.body !== undefined ? 1 : 2);
      return rank(a) - rank(b) || a.path.localeCompare(b.path);
    });
    if (docs.length) src.docs = docs;

    texts[id] = t;
    issues.push(src);
    parsed.set(id, entry);
  }

  // ---- library
  const library: LibrarySrc[] = [];
  const libraryTexts: Record<LibId, string> = {};
  const libraryPaths: Record<LibId, string> = {};
  const libParses: { ctx: FileCtx; lib: LibrarySrc }[] = [];
  const takenLib = new Set<string>();
  const today = toDate(now);
  for (const p of Object.keys(text).sort()) {
    if (!p.startsWith(`${libraryDir}/`) || !p.endsWith(".md")) continue;
    const rel = p.slice(libraryDir.length + 1).split("/");
    if (rel.length > 2) continue;
    const folder = rel.length === 2 ? rel[0] : undefined;
    const folderKind = LIBRARY_KINDS.find((k) => kindFolder(k) === folder);
    const slug = rel[rel.length - 1].replace(/\.md$/, "");
    const c = ctxOf(p);
    recognised.add(p);
    const fallbackId = `lib-${hashId(p)}`;
    const lib = safe(c, () => parseLibraryItem(c, slug, folderKind, fallbackId, today), undefined);
    if (!lib) continue;
    if (takenLib.has(lib.id)) {
      c.report(
        "F004",
        "error",
        c.anchors.id ? c.anchors.id.line - 1 : 0,
        `Duplicate library id ${lib.id}.`,
      );
      lib.id = fallbackId;
    }
    takenLib.add(lib.id);
    library.push(lib);
    libraryTexts[lib.id] = text[p];
    libraryPaths[lib.id] = p;
    libParses.push({ ctx: c, lib });
  }

  const world: WorldSrc = {
    config: cfg.config,
    authors,
    groups,
    issues,
    library,
    glossary,
  };

  // ---- lint: text rules per file, then the checks that need the whole workspace
  const lintDeps = { glossary, disabled: new Set(cfg.lint.disable) };
  for (const e of parsed.values()) {
    const files: Record<string, FileCtx | undefined> = {
      "goal.md": e.goal.ctx,
      "plan.md": e.plan?.ctx,
      "current_state.md": e.state?.ctx,
      "changes.md": ctxs.get(`${e.dir}/changes.md`),
      "decisions.md": ctxs.get(`${e.dir}/decisions.md`),
      "learnings.md": ctxs.get(`${e.dir}/learnings.md`),
    };
    for (const name of ISSUE_FILES) {
      const c = files[name];
      if (c) safe(c, () => lintIssueFile(name as IssueFileName, c, e.src, lintDeps), undefined);
    }
  }
  for (const { ctx, lib } of libParses)
    safe(ctx, () => lintLibraryFile(ctx, lib, lintDeps), undefined);
  try {
    checkWorkspace({
      world,
      issueDirs: issueDirOf,
      libraryPaths,
      ctx: (path) => ctxs.get(path),
      anchors: (path) => ctxs.get(path)?.anchors,
    });
  } catch (err) {
    ctxOf("workflow.toml").report(
      "F005",
      "warn",
      0,
      `A cross-file check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  for (const c of ctxs.values()) safe(c, () => lintCommon(c), undefined);

  // ---- results
  const diagnostics: Record<string, Diagnostic[]> = {};
  const anchors: LoadedWorkspace["anchors"] = {};
  const off = new Set(cfg.lint.disable);
  for (const [path, c] of ctxs) {
    const list: Diagnostic[] = [];
    for (const f of c.findings) {
      if (off.has(f.rule)) continue;
      const severity: Severity = cfg.lint.severity[f.rule] ?? f.severity ?? F_SEVERITY[f.rule];
      list.push({
        rule: f.rule,
        severity,
        file: path,
        line: f.line,
        col: f.col,
        span: f.span,
        message: f.message,
        fix: f.fix,
      });
    }
    list.sort((a, b) => a.line - b.line);
    diagnostics[path] = list;
    anchors[path] = c.anchors;
  }

  // Assets: the binary files of the workspace.
  const assets: LoadedWorkspace["assets"] = {};
  for (const [p, b] of Object.entries(binary)) {
    assets[p] = b;
    recognised.add(p);
  }

  return {
    world,
    texts,
    libraryTexts,
    issueDirs: issueDirOf,
    groupDirs: Object.fromEntries([...groupIdOfDir].map(([dir, id]) => [id, dir])),
    libraryPaths,
    diagnostics,
    anchors,
    diagrams,
    frontmatter,
    assets,
    lint: cfg.lint,
    recognised: [...recognised].sort(),
    ignored: [...ignored, ...allPaths.filter((p) => !recognised.has(p) && !isIgnored(p))].sort(),
  };
}
