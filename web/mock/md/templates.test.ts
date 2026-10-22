// Path kinds and new-file templates: what the Workdatabase · Files view needs to label a file and to
// start a new one. Every template must load without an error finding.
import { describe, expect, test } from "vitest";
import { toDate, toTs } from "../time";
import { loadWorkspace } from "./index";
import { RECORDED_AT } from "./recorded-at";
import { describePath, fileTemplate, type TemplateContext } from "./templates";
import { diskFiles } from "./test-support";

const RECORDED = Date.parse(RECORDED_AT);
const files = diskFiles();
const known = Object.keys(files);

const ctx: TemplateContext = {
  now: toTs(RECORDED),
  today: toDate(RECORDED),
  author: "shruti",
  newId: (prefix) => `${prefix}9qq${prefix === "g-" ? "ab" : "zz"}`,
};

describe("describePath", () => {
  const kind = (p: string) => describePath(p, known).kind;

  test("the single files", () => {
    expect(kind("workflow.toml")).toBe("workflow");
    expect(kind("authors.md")).toBe("authors");
    expect(kind("glossary.md")).toBe("glossary");
    expect(kind("issues/wf/_group.md")).toBe("group");
    expect(kind("library/patterns/suppress-watcher-echoes.md")).toBe("library");
  });

  test("the six issue files and the issue folder", () => {
    const dir = "issues/wf/web/live-board-updates";
    expect(describePath(`${dir}/goal.md`, known)).toEqual({ kind: "goal", issueDir: dir });
    expect(describePath(`${dir}/plan.md`, known).kind).toBe("plan");
    expect(describePath(`${dir}/current_state.md`, known).kind).toBe("state");
    expect(describePath(`${dir}/changes.md`, known).kind).toBe("changes");
    expect(describePath(`${dir}/decisions.md`, known).kind).toBe("decisions");
    expect(describePath(`${dir}/learnings.md`, known).kind).toBe("learnings");
  });

  test("docs and assets belong to the issue above them", () => {
    const dir = "issues/wf/web/live-board-updates";
    expect(describePath(`${dir}/notes/research.md`, known)).toEqual({ kind: "doc", issueDir: dir });
    expect(describePath(`${dir}/evidence/sc2.png`, known)).toEqual({
      kind: "asset",
      issueDir: dir,
    });
    // a file named goal.md deeper inside an issue is a doc
    expect(describePath(`${dir}/notes/goal.md`, known)).toEqual({ kind: "doc", issueDir: dir });
  });

  test("a new goal.md is a goal before the file exists; a lone plan.md is an orphan", () => {
    expect(describePath("issues/wf/web/new-thing/goal.md", known)).toEqual({
      kind: "goal",
      issueDir: "issues/wf/web/new-thing",
    });
    expect(describePath("issues/wf/web/new-thing/plan.md", known)).toEqual({
      kind: "plan",
      issueDir: "issues/wf/web/new-thing",
      orphan: true,
    });
  });

  test("ignored and unknown paths", () => {
    expect(kind("issues/a/.goal.md.swp")).toBe("ignored");
    expect(kind(".git/config")).toBe("ignored");
    expect(kind("README.md")).toBe("other");
    expect(kind("notes.txt")).toBe("other");
  });

  test("the folders come from the workspace config", () => {
    expect(describePath("work/x/goal.md", [], { issuesDir: "work" })).toMatchObject({
      kind: "goal",
    });
    expect(describePath("kb/patterns/x.md", [], { libraryDir: "kb" }).kind).toBe("library");
  });
});

describe("fileTemplate", () => {
  /** Load the template inside the seed workspace and return its findings. */
  function load(path: string, text: string) {
    const loaded = loadWorkspace({ ...files, [path]: text }, { now: RECORDED });
    return (loaded.diagnostics[path] ?? []).filter((d) => d.severity === "error");
  }

  test("a new issue folder starts with a goal.md that loads as a backlog issue", () => {
    const path = "issues/wf/web/retry-button/goal.md";
    const text = fileTemplate(path, ctx, known) as string;
    expect(text).toContain("id: wf-9qqzz");
    expect(text).toContain("title: Retry button");
    expect(text).toContain("status: backlog");
    expect(load(path, text)).toEqual([]);
    const loaded = loadWorkspace({ ...files, [path]: text }, { now: RECORDED });
    expect(loaded.world.issues.find((i) => i.goal.id === "wf-9qqzz")?.slug).toBe("retry-button");
  });

  test("plan.md, current_state.md and the logs load clean next to a goal.md", () => {
    const dir = "issues/wf/web/retry-button";
    const all: Record<string, string> = {
      ...files,
      [`${dir}/goal.md`]: fileTemplate(`${dir}/goal.md`, ctx, known) as string,
    };
    const k = Object.keys(all);
    for (const name of [
      "plan.md",
      "current_state.md",
      "changes.md",
      "decisions.md",
      "learnings.md",
    ]) {
      const text = fileTemplate(`${dir}/${name}`, ctx, k);
      expect(text, name).toBeTypeOf("string");
      all[`${dir}/${name}`] = text as string;
    }
    const loaded = loadWorkspace(all, { now: RECORDED });
    for (const name of [
      "goal.md",
      "plan.md",
      "current_state.md",
      "changes.md",
      "decisions.md",
      "learnings.md",
    ])
      expect(
        loaded.diagnostics[`${dir}/${name}`].filter((d) => d.severity === "error"),
        name,
      ).toEqual([]);
    const src = loaded.world.issues.find((i) => i.goal.id === "wf-9qqzz");
    expect(src?.plan?.phases[0].tasks[0]).toMatchObject({ id: "T-1", status: "todo" });
    expect(src?.state?.summary).toBe("Not started.");
  });

  test("a new group and a new library item load clean", () => {
    const g = "issues/wf/search/_group.md";
    const gt = fileTemplate(g, ctx, known) as string;
    expect(gt).toContain("id: g-9qqab");
    expect(load(g, gt)).toEqual([]);

    const l = "library/gotchas/stale-lock-files.md";
    const lt = fileTemplate(l, ctx, known) as string;
    expect(lt).toContain("kind: gotcha");
    expect(lt).toContain("## Symptom");
    const errors = load(l, lt);
    // the placeholder source list is empty on purpose: F002 is the author's to-do
    expect(errors.map((d) => d.rule)).toEqual(["F002"]);
  });

  test("a doc starts with a title, assets and unknown files start empty", () => {
    expect(fileTemplate("issues/wf/web/live-board-updates/notes/new-idea.md", ctx, known)).toBe(
      "# New idea\n\n",
    );
    expect(
      fileTemplate("issues/wf/web/live-board-updates/evidence/x.png", ctx, known),
    ).toBeUndefined();
    expect(fileTemplate("README.md", ctx, known)).toBeUndefined();
  });
});
