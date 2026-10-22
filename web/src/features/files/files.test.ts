// Pure logic of Workspace files: path rules, starting texts, highlighting, the changed-line
// diff and the tree. No React, no data layer.
import { describe, expect, it } from "vitest";
import type { WorkspaceFileInfo } from "@/lib/api";
import { type HighlightedLine, highlightSource, inlineTokens, splitLines } from "./highlight";
import { pendingIntentFor } from "./intent";
import { changedLines, lineAt } from "./lines";
import {
  ancestors,
  basename,
  dirname,
  extension,
  pathHint,
  roleHint,
  slugify,
  validateNewPath,
  validateSlug,
} from "./paths";
import { savedCopy, savedTarget } from "./saved";
import {
  appendEntry,
  CHANGE_TITLE_PLACEHOLDER,
  changeEntry,
  goalTemplate,
  issueFileTemplate,
  libraryTemplate,
  newId,
  nowTs,
  placeholderFor,
  randomId5,
  templateForPath,
  titleFromSlug,
  yamlScalar,
} from "./templates";
import {
  buildTree,
  defaultOpen,
  type FolderNode,
  filterTree,
  findFile,
  flattenTree,
  revealPaths,
  type TreeContext,
  WORKSPACE_FOLDER,
} from "./tree";

// ---------------------------------------------------------------- paths

describe("paths", () => {
  it("splits names", () => {
    expect(basename("issues/wf/a/goal.md")).toBe("goal.md");
    expect(dirname("issues/wf/a/goal.md")).toBe("issues/wf/a");
    expect(dirname("workflow.toml")).toBe("");
    expect(extension("a/B.MD")).toBe(".md");
    expect(extension("a/.hidden")).toBe("");
    expect(ancestors("a/b/c.md")).toEqual(["a", "a/b"]);
    expect(ancestors("c.md")).toEqual([]);
  });

  const none = new Set<string>();
  it("accepts workspace-relative .md and .toml paths", () => {
    expect(validateNewPath("issues/wf/web/new-one/goal.md", none)).toBeNull();
    expect(validateNewPath("workflow.toml", none)).toBeNull();
    expect(validateNewPath("library/patterns/read-before-write.md", none)).toBeNull();
  });

  it("rejects what is not a path inside the workspace", () => {
    expect(validateNewPath("", none)).toMatch(/Enter a path/);
    expect(validateNewPath("/etc/x.md", none)).toMatch(/leading slash/);
    expect(validateNewPath("a\\b.md", none)).toMatch(/forward slashes/);
    expect(validateNewPath("a/../b.md", none)).toMatch(/\.\./);
    expect(validateNewPath("a//b.md", none)).toMatch(/empty segment/);
    expect(validateNewPath("a/b/", none)).toMatch(/file name/);
    expect(validateNewPath("a/b.txt", none)).toMatch(/\.md or \.toml/);
    expect(validateNewPath("a/b c.md", none)).toMatch(/letters, numbers/);
    expect(validateNewPath("a/.md", none)).toMatch(/name before/);
    expect(validateNewPath(".git/config.toml", none)).toMatch(/ignored/);
    expect(validateNewPath("node_modules/x/readme.md", none)).toMatch(/ignored/);
    expect(validateNewPath(" a.md", none)).toMatch(/spaces/);
  });

  it("refuses an existing path unless asked to allow it", () => {
    const have = new Set(["a/goal.md"]);
    expect(validateNewPath("a/goal.md", have)).toMatch(/already exists/);
    expect(validateNewPath("a/goal.md", have, { allowExisting: true })).toBeNull();
  });

  it("slugifies a title into a folder name", () => {
    expect(slugify("Fix tab-title count!")).toBe("fix-tab-title-count");
    expect(slugify("  --Hello   World--  ")).toBe("hello-world");
    expect(slugify("Ünïcode café")).toBe("unicode-cafe");
    expect(slugify("x".repeat(80)).length).toBeLessThanOrEqual(48);
    expect(slugify("???")).toBe("");
  });

  it("validates a slug", () => {
    expect(validateSlug("")).toMatch(/Enter/);
    expect(validateSlug("Bad Name")).toMatch(/lowercase/);
    expect(validateSlug("ok-name-2")).toBeNull();
    expect(validateSlug("ends-")).toMatch(/dash/);
  });

  it("says what a path will mean", () => {
    expect(pathHint("issues/wf/a/goal.md")).toMatch(/is an issue/);
    expect(pathHint("issues/wf/_group.md")).toMatch(/group/);
    expect(pathHint("issues/wf/a/plan.md")).toMatch(/next to a goal\.md/);
    expect(pathHint("issues/loose.md")).toMatch(/do not belong/);
    expect(pathHint("notes/x.md")).toBeNull();
    expect(roleHint("issues/a/goal.md")).toMatch(/Goal tab/);
    expect(roleHint("library/patterns/x.md")).toMatch(/library item/);
    expect(roleHint("random.md")).toBeUndefined();
  });
});

// ---------------------------------------------------------------- templates

const ENTRY = /^## (\S+) @([a-z0-9][a-z0-9._-]*) (—|-) (.+?) \{#([CDL]-[0-9a-hjkmnp-tv-z]{5})\}$/m;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+05:30$/;

describe("templates", () => {
  it("makes five-character Crockford base32 ids", () => {
    for (let i = 0; i < 50; i++) expect(randomId5()).toMatch(/^[0-9a-hjkmnp-tv-z]{5}$/);
    expect(newId("wf")).toMatch(/^wf-[0-9a-hjkmnp-tv-z]{5}$/);
    expect(newId("C")).toMatch(/^C-[0-9a-hjkmnp-tv-z]{5}$/);
  });

  it("does not reuse a taken id", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newId("wf", taken);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
  });

  it("formats now in the workspace offset at minute precision", () => {
    expect(nowTs(Date.UTC(2026, 9, 22, 8, 35, 59))).toBe("2026-10-22T14:05+05:30");
    expect(nowTs()).toMatch(TS);
  });

  it("quotes YAML scalars that need it", () => {
    expect(yamlScalar("Plain title")).toBe("Plain title");
    expect(yamlScalar("Fix: the thing")).toBe('"Fix: the thing"');
    expect(yamlScalar("#hash")).toBe('"#hash"');
    expect(yamlScalar("@mention")).toBe('"@mention"');
    expect(yamlScalar("- dash")).toBe('"- dash"');
  });

  it("writes a goal.md the grammar accepts", () => {
    const text = goalTemplate({
      id: "wf-3k9x2",
      title: "Fix: tab title",
      created: "2026-10-22T14:05+05:30",
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines.indexOf("---", 1)).toBeGreaterThan(0);
    expect(text).toContain("id: wf-3k9x2\n");
    expect(text).toContain('title: "Fix: tab title"\n');
    expect(text).toContain("status: backlog\n");
    expect(text).toContain("created: 2026-10-22T14:05+05:30\n");
    expect(text).toContain("\n## Context\n");
    expect(text).toContain("\n## Success criteria\n");
    expect(text).toMatch(/^- \[ \] SC-1: When .+, the .+ shall .+\.$/m);
    expect(text).toMatch(/^ {2}- verify: manual$/m);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("writes a change entry that matches the entry heading grammar", () => {
    const entry = changeEntry({ author: "shruti", ts: "2026-10-22T14:05+05:30", id: "C-7k2q9" });
    const m = ENTRY.exec(entry);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("2026-10-22T14:05+05:30");
    expect(m?.[2]).toBe("shruti");
    expect(m?.[4]).toBe(CHANGE_TITLE_PLACEHOLDER);
    expect(m?.[5]).toBe("C-7k2q9");
    expect(entry).toContain("\n- kind: progress\n");
    // The meta list sits directly under the heading, with no blank line (F017).
    expect(entry.split("\n")[1]).toBe("- kind: progress");
  });

  it("appends an entry at the bottom with one blank line between", () => {
    const entry = changeEntry({ author: "shruti" });
    const existing =
      "# Changes\n\n## 2026-10-21T10:00+05:30 @codex — Did a thing {#C-aaaaa}\n- kind: fix\n\nBody.\n";
    const out = appendEntry(existing, entry);
    expect(out.startsWith(existing.trimEnd())).toBe(true);
    expect(out.slice(existing.trimEnd().length, existing.trimEnd().length + 2)).toBe("\n\n");
    expect(out.endsWith(entry)).toBe(true);
    // A missing or empty file starts with the H1.
    expect(appendEntry(null, entry)).toBe(`# Changes\n\n${entry}`);
    expect(appendEntry("  \n", entry)).toBe(`# Changes\n\n${entry}`);
  });

  it("has a valid starting text for every issue file", () => {
    const o = { author: "shruti", now: Date.UTC(2026, 9, 22, 8, 35) };
    const plan = issueFileTemplate("plan.md", o);
    expect(plan).toContain("updated_at: 2026-10-22T14:05+05:30");
    expect(plan).toContain('updated_by: "@shruti"');
    expect(plan).toMatch(/^### T-1: .+$/m);
    expect(plan).toMatch(/^## Phase 1: .+$/m);

    const state = issueFileTemplate("current_state.md", o);
    expect(state).toMatch(/^summary: .{1,120}$/m);
    expect(state).toContain("## Next steps");

    for (const [name, h1, kind] of [
      ["changes.md", "# Changes", "C"],
      ["decisions.md", "# Decisions", "D"],
      ["learnings.md", "# Learnings", "L"],
    ] as const) {
      const text = issueFileTemplate(name, o);
      expect(text.startsWith(`${h1}\n\n`)).toBe(true);
      const m = ENTRY.exec(text);
      expect(m?.[5].startsWith(`${kind}-`)).toBe(true);
    }
  });

  it("picks a template by file name", () => {
    const o = { author: "shruti" };
    expect(templateForPath("issues/wf/web/live-board/goal.md", o)).toContain("title: Live board");
    expect(templateForPath("issues/wf/web/live-board/plan.md", o)).toContain("## Approach");
    expect(templateForPath("issues/wf/web/_group.md", o)).toMatch(/^id: g-[0-9a-hjkmnp-tv-z]{5}$/m);
    expect(templateForPath("notes/idea.md", o)).toBe("");
    expect(titleFromSlug("live-board-updates")).toBe("Live board updates");
  });
});

describe("library item template", () => {
  const o = { author: "shruti", now: Date.UTC(2026, 9, 22, 8, 35) };

  it("starts a draft with every key the grammar requires", () => {
    const text = templateForPath("library/gotchas/quote-the-handle.md", o);
    expect(text).toMatch(/^---\nid: lib-[0-9a-hjkmnp-tv-z]{5}\n/);
    expect(text).toContain("\ntitle: Quote the handle\n");
    expect(text).toContain("\nkind: gotcha\n");
    expect(text).toContain("\ndescription: Use when …\n");
    expect(text).toContain("\nstatus: draft\n");
    expect(text).toContain('\nauthors: ["@shruti"]\n');
    expect(text).toContain("\ncreated: 2026-10-22\n");
    expect(text).toContain("\n## Symptom\n");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("takes the kind from the folder and the sections from the kind", () => {
    expect(templateForPath("library/decisions/x.md", o)).toContain("kind: decision\n");
    expect(templateForPath("library/decisions/x.md", o)).toContain("## Because");
    expect(templateForPath("library/playbooks/x.md", o)).toContain("## Procedure");
    expect(templateForPath("library/patterns/my-new-pattern.md", o)).toContain("## Rule");
    // A folder the grammar does not know is a pattern.
    expect(libraryTemplate({ kind: "other", title: "T", author: "shruti" })).toContain("## Rule");
  });

  it("follows the workspace's library folder", () => {
    expect(templateForPath("lib/patterns/x.md", { ...o, libraryDir: "lib/" })).toContain(
      "id: lib-",
    );
    expect(templateForPath("library/patterns/x.md", { ...o, libraryDir: "lib" })).toBe("");
    expect(placeholderFor("library/patterns/x.md")).toBe("Use when …");
    expect(placeholderFor("lib/patterns/x.md", "lib")).toBe("Use when …");
    expect(placeholderFor("issues/wf/a/changes.md")).toBe(CHANGE_TITLE_PLACEHOLDER);
  });

  it("does not start other markdown files", () => {
    expect(templateForPath("notes/idea.md", o)).toBe("");
    expect(templateForPath("library/README.txt", o)).toBe("");
  });
});

describe("what a save changes", () => {
  const lib = "---\nid: lib-9vk2w\ntitle: T\n---\n\n## Rule\n";

  it("names the screen that read the file again", () => {
    expect(savedTarget("library/gotchas/quote-handles.md", lib)).toEqual({
      kind: "library",
      id: "lib-9vk2w",
    });
    expect(savedTarget("glossary.md", "")).toEqual({ kind: "glossary" });
    expect(savedTarget("issues/wf/web/x/goal.md", "---\nid: wf-3k9x2\n---\n")).toEqual({
      kind: "board",
    });
    expect(savedTarget("workflow.toml", "")).toEqual({ kind: "board" });
    expect(savedTarget("authors.md", "")).toEqual({ kind: "board" });
  });

  it("a library file without an id yet opens the Library", () => {
    expect(savedTarget("library/patterns/new.md", "")).toEqual({ kind: "library", id: undefined });
    // An `id:` outside the frontmatter is not the item's id.
    expect(savedTarget("library/patterns/new.md", "---\ntitle: T\n---\n\nid: lib-aaaaa\n")).toEqual(
      {
        kind: "library",
        id: undefined,
      },
    );
  });

  it("follows the workspace's library folder", () => {
    expect(savedTarget("lib/patterns/x.md", lib, "lib/").kind).toBe("library");
    expect(savedTarget("library/patterns/x.md", lib, "lib").kind).toBe("board");
  });

  it("words the toast for each target", () => {
    expect(savedCopy({ kind: "board" })).toEqual({
      reread: "the board re-read it",
      action: "Open Workflow",
    });
    expect(savedCopy({ kind: "library", id: "lib-9vk2w" })).toEqual({
      reread: "the library re-read it",
      action: "Open library item",
    });
    expect(savedCopy({ kind: "library" }).action).toBe("Open Library");
    expect(savedCopy({ kind: "glossary" })).toEqual({
      reread: "the glossary re-read it",
      action: "Open Glossary",
    });
  });
});

// ---------------------------------------------------------------- highlight

/** The tone of `needle` inside a highlighted line (tokens of equal tone are merged). */
function toneOf(line: HighlightedLine, needle: string): string | undefined {
  const text = line.tokens.map((t) => t.text).join("");
  const at = text.indexOf(needle);
  if (at === -1) return undefined;
  let offset = 0;
  for (const t of line.tokens) {
    if (at < offset + t.text.length) return t.tone;
    offset += t.text.length;
  }
  return undefined;
}

const kinds = (text: string, lang: "md" | "toml" = "md") =>
  highlightSource(text, lang).map((l) => l.kind);
const tones = (text: string) => inlineTokens(text).map((t) => [t.text, t.tone]);

describe("highlight", () => {
  it("numbers lines the way an editor does", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([""]);
    expect(splitLines("a\n\n")).toEqual(["a", ""]);
  });

  it("marks frontmatter fences and keys", () => {
    const text = "---\nid: wf-3k9x2\ntitle: Live\nlabels: [a, b]\n---\n\n## Context\n";
    expect(kinds(text)).toEqual([
      "frontmatter-fence",
      "frontmatter",
      "frontmatter",
      "frontmatter",
      "frontmatter-fence",
      "blank",
      "heading",
    ]);
    const id = highlightSource(text, "md")[1];
    expect(toneOf(id, "id:")).toBe("faint");
    expect(toneOf(id, "wf-3k9x2")).toBe("faint");
    const title = highlightSource(text, "md")[2];
    expect(toneOf(title, "title:")).toBe("faint");
    expect(toneOf(title, "Live")).toBe("plain");
  });

  it("does not treat a later --- as frontmatter", () => {
    expect(kinds("# T\n\n---\ntext\n")[2]).toBe("text");
  });

  it("styles an entry heading: timestamp and id faint, handle accent, title strong", () => {
    const [line] = highlightSource(
      "## 2026-10-22T14:05+05:30 @codex — Added the stream {#C-7k2q9}",
      "md",
    );
    expect(line.kind).toBe("heading");
    expect(toneOf(line, "##")).toBe("faint");
    expect(toneOf(line, "2026-10-22T14:05+05:30")).toBe("faint");
    expect(toneOf(line, "@codex")).toBe("accent");
    expect(toneOf(line, "{#C-7k2q9}")).toBe("faint");
    expect(toneOf(line, "Added the stream")).toBe("strong");
  });

  it("styles checkboxes, ids and meta keys", () => {
    const [done, open, meta] = highlightSource(
      "- [x] SC-2: shall show it\n- [ ] SC-3: shall hide it\n  - verify: `cargo test`",
      "md",
    );
    expect(toneOf(done, "[x]")).toBe("ok");
    expect(toneOf(open, "[ ]")).toBe("muted");
    expect(toneOf(done, "SC-2")).toBe("faint");
    expect(toneOf(done, "shall")).toBe("plain");
    expect(toneOf(meta, "verify:")).toBe("faint");
    expect(toneOf(meta, "cargo")).toBe("plain");
  });

  it("marks references and handles but not emails", () => {
    expect(tones("see [[wf-3k9x2#D-7f3k2]] by @shruti")).toEqual([
      ["see ", "plain"],
      ["[[wf-3k9x2#D-7f3k2]]", "accent"],
      [" by ", "plain"],
      ["@shruti", "accent"],
    ]);
    expect(tones("mail me@example.com")).toEqual([["mail me@example.com", "plain"]]);
    expect(tones("ends with @codex.")).toEqual([
      ["ends with ", "plain"],
      ["@codex", "accent"],
      [".", "plain"],
    ]);
  });

  it("marks archify fences and their bodies, and plain code fences", () => {
    const text = '```archify workflow id=x\n{ "a": 1 }\n```\n\n```ts\nconst x = 1;\n```\n';
    expect(kinds(text)).toEqual([
      "archify-fence",
      "archify-code",
      "archify-fence",
      "blank",
      "fence",
      "code",
      "fence",
    ]);
    const open = highlightSource(text, "md")[0];
    expect(toneOf(open, "archify workflow")).toBe("accent");
    expect(toneOf(open, "```")).toBe("faint");
  });

  it("keeps markdown out of code fences", () => {
    expect(kinds("```\n# not a heading\n- [ ] not a box\n```\n")).toEqual([
      "fence",
      "code",
      "code",
      "fence",
    ]);
  });

  it("highlights toml tables, keys and comments", () => {
    const text = 'wf_format = 1\n# note\n[workspace]\nname = "wf" # trailing\n';
    expect(kinds(text, "toml")).toEqual(["toml", "comment", "toml-table", "toml"]);
    const kv = highlightSource(text, "toml")[3];
    expect(toneOf(kv, "name")).toBe("faint");
    expect(toneOf(kv, '"wf"')).toBe("plain");
    expect(toneOf(kv, "# trailing")).toBe("faint");
  });

  it("does not take a # inside a toml string for a comment", () => {
    const [line] = highlightSource('title = "a # b"', "toml");
    expect(toneOf(line, "title")).toBe("faint");
    expect(toneOf(line, "# b")).toBe("plain");
  });
});

// ---------------------------------------------------------------- lines

describe("changedLines", () => {
  it("is empty when nothing changed", () => {
    expect(changedLines("a\nb\n", "a\nb\n")).toEqual([]);
  });

  it("marks the one line that was edited", () => {
    expect(changedLines("a\nstatus: backlog\nc\n", "a\nstatus: review\nc\n")).toEqual([2]);
  });

  it("marks inserted lines in the new text", () => {
    expect(changedLines("a\nb\n", "a\nx\ny\nb\n")).toEqual([2, 3]);
    expect(changedLines("a\n", "a\n\nnew entry\n")).toEqual([2, 3]);
  });

  it("marks the line where lines were removed", () => {
    expect(changedLines("a\nb\nc\n", "a\nc\n")).toEqual([2]);
    expect(changedLines("a\nb\n", "a\n")).toEqual([]);
  });

  it("finds the line of a character offset", () => {
    expect(lineAt("ab\ncd\nef", 0)).toBe(1);
    expect(lineAt("ab\ncd\nef", 3)).toBe(2);
    expect(lineAt("ab\ncd\nef", 6)).toBe(3);
  });
});

// ---------------------------------------------------------------- intent

describe("edit intent", () => {
  const intent = { path: "a.md", append: "x", at: 1_000 };
  it("matches the path and expires", () => {
    expect(pendingIntentFor(intent, "a.md", 2_000)?.append).toBe("x");
    expect(pendingIntentFor(intent, "b.md", 2_000)).toBeUndefined();
    expect(pendingIntentFor(intent, "a.md", 1_000 + 20_000)).toBeUndefined();
    expect(pendingIntentFor(null, "a.md")).toBeUndefined();
  });
});

// ---------------------------------------------------------------- tree

const info = (path: string, lint: [number, number, number] = [0, 0, 0]): WorkspaceFileInfo => ({
  path,
  kind: path.endsWith(".toml") ? "toml" : path.endsWith(".png") ? "image" : "md",
  bytes: 10,
  rev: "r1",
  errors: lint[0],
  warnings: lint[1],
  infos: lint[2],
});

const FILES: WorkspaceFileInfo[] = [
  info("glossary.md"),
  info("workflow.toml"),
  info("authors.md"),
  info("issues/wf/_group.md"),
  info("issues/wf/web/_group.md"),
  info("issues/wf/web/live-board/learnings.md"),
  info("issues/wf/web/live-board/goal.md", [0, 2, 1]),
  info("issues/wf/web/live-board/plan.md"),
  info("issues/wf/web/live-board/notes/research.md"),
  info("issues/wf/web/live-board/evidence/sc2.png"),
  info("issues/wf/web/fix-count/goal.md", [1, 0, 0]),
  info("issues/wf/build-v1/goal.md"),
  info("issues/docs/guide/goal.md"),
  info("library/patterns/b-pattern.md"),
  info("library/gotchas/a-gotcha.md"),
  info("library/playbooks/p.md"),
  info("library/decisions/d.md"),
];

const CTX: TreeContext = {
  issues: new Map([
    [
      "issues/wf/web/live-board",
      { id: "wf-3k9x2", title: "Live board updates", status: "in_progress" },
    ],
    [
      "issues/wf/web/fix-count",
      { id: "wf-7yq2m", title: "Fix tab-title count", status: "backlog" },
    ],
  ]),
  groups: new Map([
    ["issues", { id: "g-root", title: "Issues", color: 1, implicit: true, order: 0 }],
    ["issues/wf", { id: "g-wf001", title: "wf", color: 7, implicit: false, order: 0 }],
    ["issues/wf/web", { id: "g-web01", title: "web", color: 1, implicit: false, order: 1 }],
    ["issues/docs", { id: "g-docs", title: "docs", color: 3, implicit: true, order: 5 }],
  ]),
  issuesDir: "issues",
  libraryDir: "library",
};

const folder = (nodes: readonly unknown[], path: string): FolderNode => {
  const walk = (list: readonly unknown[]): FolderNode | undefined => {
    for (const n of list as FolderNode[]) {
      if (n.type !== "folder") continue;
      if (n.path === path) return n;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const hit = walk(nodes);
  if (!hit) throw new Error(`no folder ${path}`);
  return hit;
};

describe("buildTree", () => {
  const tree = buildTree(FILES, CTX);

  it("puts root files in a Workspace folder, then issues, then library", () => {
    expect(tree.map((f) => f.path)).toEqual([WORKSPACE_FOLDER, "issues", "library"]);
    expect(tree[0].role).toBe("workspace");
    expect(tree[0].children.map((c) => c.name)).toEqual([
      "workflow.toml",
      "authors.md",
      "glossary.md",
    ]);
    expect(tree[1].role).toBe("section");
    expect(tree[2].role).toBe("section");
  });

  it("gives folders the role the snapshot implies", () => {
    expect(folder(tree, "issues/wf").role).toBe("group");
    expect(folder(tree, "issues/wf").color).toBe(7);
    expect(folder(tree, "issues/wf/web").title).toBe("web");
    const live = folder(tree, "issues/wf/web/live-board");
    expect(live.role).toBe("issue");
    expect(live.title).toBe("Live board updates");
    expect(live.status).toBe("in_progress");
    expect(live.issueId).toBe("wf-3k9x2");
    expect(folder(tree, "issues/wf/web/live-board/notes").role).toBe("plain");
  });

  it("knows an issue folder by its goal.md when the snapshot does not list it yet", () => {
    const build = folder(tree, "issues/wf/build-v1");
    expect(build.role).toBe("issue");
    expect(build.title).toBeUndefined();
  });

  it("treats a folder of issues with no _group.md as an implicit group", () => {
    const docs = folder(tree, "issues/docs");
    expect(docs.role).toBe("group");
    expect(docs.implicit).toBe(true);
    const guide = folder(tree, "issues/docs/guide");
    expect(guide.role).toBe("issue");
  });

  it("orders an issue's files in reading order, then docs and folders", () => {
    const names = folder(tree, "issues/wf/web/live-board").children.map((c) => c.name);
    expect(names).toEqual(["goal.md", "plan.md", "learnings.md", "evidence", "notes"]);
  });

  it("orders a group: _group.md, sub-groups, then issues", () => {
    const names = folder(tree, "issues/wf").children.map((c) => c.name);
    expect(names).toEqual(["_group.md", "web", "build-v1"]);
  });

  it("lists library kinds in a fixed order", () => {
    expect(folder(tree, "library").children.map((c) => c.name)).toEqual([
      "patterns",
      "playbooks",
      "gotchas",
      "decisions",
    ]);
    expect(folder(tree, "library/patterns").role).toBe("library");
  });

  it("rolls findings and file counts up to every folder", () => {
    expect(folder(tree, "issues/wf/web/live-board").lint).toEqual({ error: 0, warn: 2, info: 1 });
    expect(folder(tree, "issues/wf/web").lint).toEqual({ error: 1, warn: 2, info: 1 });
    expect(folder(tree, "issues").lint).toEqual({ error: 1, warn: 2, info: 1 });
    expect(folder(tree, "issues/wf/web/live-board").fileCount).toBe(5);
    expect(findFile(tree, "issues/wf/web/live-board/goal.md")?.lint).toEqual({
      error: 0,
      warn: 2,
      info: 1,
    });
  });
});

describe("flattenTree", () => {
  const tree = buildTree(FILES, CTX);
  const rows = (open?: Set<string>) =>
    flattenTree(tree, (f, inside) => (open?.has(f.path) ? true : defaultOpen(f, inside)));

  it("shows groups open and issue folders folded by default", () => {
    const paths = rows().map((r) => r.node.path);
    expect(paths).toContain("issues/wf/web/live-board");
    expect(paths).not.toContain("issues/wf/web/live-board/goal.md");
    expect(paths).toContain("glossary.md");
    expect(paths).toContain("library/patterns/b-pattern.md");
  });

  it("opens an issue when asked and carries depth, parent and aria positions", () => {
    const all = rows(new Set(["issues/wf/web/live-board"]));
    const goal = all.find((r) => r.node.path === "issues/wf/web/live-board/goal.md");
    expect(goal?.depth).toBe(4);
    expect(goal?.parent).toBe("issues/wf/web/live-board");
    expect(goal?.posinset).toBe(1);
    expect(goal?.setsize).toBe(5);
    // Folders inside an issue stay folded until opened too.
    expect(all.some((r) => r.node.path.endsWith("notes/research.md"))).toBe(false);
  });

  it("reveals the folders above a file", () => {
    expect(revealPaths("issues/wf/web/live-board/goal.md")).toEqual([
      "issues",
      "issues/wf",
      "issues/wf/web",
      "issues/wf/web/live-board",
    ]);
    expect(revealPaths("glossary.md")).toEqual([WORKSPACE_FOLDER]);
  });
});

describe("filterTree", () => {
  const tree = buildTree(FILES, CTX);
  const paths = (nodes: ReturnType<typeof filterTree>): string[] =>
    nodes.flatMap((n) => (n.type === "file" ? [n.path] : paths(n.children)));

  it("returns everything for an empty query", () => {
    expect(filterTree(tree, "  ")).toHaveLength(tree.length);
  });

  it("matches file paths and keeps their folders", () => {
    const out = filterTree(tree, "plan.md");
    expect(paths(out)).toEqual(["issues/wf/web/live-board/plan.md"]);
    expect(out.map((f) => f.path)).toEqual(["issues"]);
  });

  it("matches an issue by title and keeps all of its files", () => {
    const byTitle = filterTree(tree, "board updates");
    expect(paths(byTitle)).toContain("issues/wf/web/live-board/goal.md");
    expect(paths(byTitle)).toContain("issues/wf/web/live-board/plan.md");
    expect(paths(byTitle)).not.toContain("issues/wf/web/fix-count/goal.md");
  });

  it("matches an issue by id", () => {
    expect(paths(filterTree(tree, "wf-7yq2m"))).toEqual(["issues/wf/web/fix-count/goal.md"]);
  });

  it("is case-insensitive and empty when nothing matches", () => {
    expect(paths(filterTree(tree, "GLOSSARY"))).toEqual(["glossary.md"]);
    expect(filterTree(tree, "zzzz")).toEqual([]);
  });
});
